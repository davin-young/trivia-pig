# syntax=docker/dockerfile:1.7
# Multi-stage build: one image runs Next.js + Socket.IO (server.ts) on port 3000.

# The Node image is pinned by digest so a re-pushed tag cannot change what ships.
# To update: docker buildx imagetools inspect node:22-bookworm-slim, then replace both digests.
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- dependencies --------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci --include=dev && npx prisma generate

# ---- build ---------------------------------------------------------------
FROM base AS build
ARG NEXT_PUBLIC_APP_NAME="Trivia Pig"
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prune can drop the generated Prisma client, so generate it again afterwards.
# sharp (and its prebuilt libvips) is an optional dependency of Next's image optimizer, which
# this app turns off (images.unoptimized in next.config.ts), so it is left out of the image.
RUN npm run build && npm prune --omit=dev --ignore-scripts && npx prisma generate \
  && rm -rf node_modules/sharp node_modules/@img

# ---- runtime -------------------------------------------------------------
# Starts from the pinned image itself (not the "base" stage) so the runtime contains only
# what it needs and scanners can see exactly which image ships.
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS runner
# npm, npx, corepack and yarn ship with the Node image but nothing runs them at runtime (the
# entrypoint calls node directly), so they are removed: less to patch, less for an attacker to use.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
       /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
       /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="Trivia Pig (jeppidy)" \
      org.opencontainers.image.description="Self-hosted real-time quiz show: display, host controls, phone buzzers" \
      org.opencontainers.image.version=$APP_VERSION
ENV NODE_ENV=production \
    APP_VERSION=$APP_VERSION \
    NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    HOME=/tmp \
    PORT=3000 \
    HOST=0.0.0.0 \
    UPLOAD_DIR=/data/uploads
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --home /app app \
  && mkdir -p /data/uploads && chown -R app:app /data
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/next.config.ts /app/tsconfig.json ./
COPY --chown=app:app scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
# The container never runs as root. A named volume mounted at /data/uploads inherits this
# ownership; a bind mount must be owned by uid 10001 on the host (the homelab compose file
# does that with a one-shot init service).
USER app
EXPOSE 3000
VOLUME ["/data"]
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=4s --start-period=90s --start-interval=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "sh", "scripts/docker-entrypoint.sh"]
