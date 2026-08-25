#!/bin/sh
# Oslo Moto - Container startup script
# This script is copied from the GitHub repo to /app/start.sh by docker-compose.
# It handles: tar install, build extraction, and process startup.

set -e

# Install tar (git already installed by docker-compose)
apk add --no-cache tar

# Extract standalone build (only on first run)
if [ ! -f /app/.deployed-v29 ]; then
  echo "[start] First-time setup: extracting build..."
  rm -rf /app/standalone /app/.deployed-*
  tar xzf /app/standalone-build.tar.gz -C /app
  touch /app/.deployed-v29
  echo "[start] Extraction complete."
else
  echo "[start] Already deployed, skipping extraction."
fi

# Start Next.js standalone server on port 3001 (internal, background)
echo "[start] Starting Next.js server on port 3001..."
PORT=3001 HOSTNAME=127.0.0.1 node /app/standalone/server.js &

# Start static proxy on port 3000 (external, replaces shell process)
echo "[start] Starting static proxy on port 3000..."
exec NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 node /app/standalone/static-proxy.js
