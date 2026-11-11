#!/bin/sh
# Container entrypoint: apply DB migrations, optionally seed the demo, start the server.
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

if [ "$SEED_DEMO" = "true" ]; then
  echo "Seeding demo account and board (SEED_DEMO=true)..."
  npx tsx prisma/seed.ts || echo "Seed skipped/failed (non-fatal)"
fi

exec node dist/server.js
