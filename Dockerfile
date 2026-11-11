# syntax=docker/dockerfile:1.7
# Multi-stage build: one image runs Next.js + Socket.IO (server.ts) on port 3000.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
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
# prune can drop the generated Prisma client, so generate it again afterwards
RUN npm run build && npm prune --omit=dev --ignore-scripts && npx prisma generate

# ---- runtime -------------------------------------------------------------
FROM base AS runner
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
# No USER here on purpose: the entrypoint starts as root only to fix ownership of the
# mounted /data volume, then drops to the unprivileged "app" user (uid 10001) with setpriv
# before running migrations or the server.
EXPOSE 3000
VOLUME ["/data"]
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=4s --start-period=90s --start-interval=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "sh", "scripts/docker-entrypoint.sh"]
