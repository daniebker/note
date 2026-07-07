#!/bin/sh
set -e

echo "Applying database migrations..."
./prisma-cli/node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma

echo "Starting server..."
exec node apps/web/server.js
