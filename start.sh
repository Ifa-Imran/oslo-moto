#!/bin/sh
# Oslo Moto - Container startup script v30
# Uses nginx as reverse proxy for reliable static file serving.
# nginx serves /_next/static/ from filesystem, proxies everything else to server.js on port 3001.

set -e

# Install tar and nginx
apk add --no-cache tar nginx

# Extract standalone build (only on first run)
if [ ! -f /app/.deployed-v30 ]; then
  echo "[start] First-time setup: extracting build..."
  rm -rf /app/standalone /app/.deployed-*
  tar xzf /app/standalone-build.tar.gz -C /app
  touch /app/.deployed-v30
  echo "[start] Extraction complete."
else
  echo "[start] Already deployed, skipping extraction."
fi

# Create symlink _next -> .next (so nginx root + try_files works correctly)
ln -sf /app/standalone/.next /app/standalone/_next

# Copy nginx config
cp /app/nginx.conf /etc/nginx/nginx.conf
mkdir -p /run

# Debug: verify files exist
echo "[start] Checking for CSS files..."
ls -la /app/standalone/.next/static/chunks/*.css 2>/dev/null || echo "[start] WARNING: No CSS files found!"
echo "[start] Checking symlink..."
ls -la /app/standalone/_next 2>/dev/null
echo "[start] Checking symlink CSS access..."
ls -la /app/standalone/_next/static/chunks/*.css 2>/dev/null || echo "[start] WARNING: Symlink CSS access failed!"

# Start Next.js standalone server on port 3001 (internal, background)
# PORT=3001 is set in Docker environment, so server.js reads it directly
echo "[start] Starting Next.js server (PORT=$PORT HOSTNAME=$HOSTNAME)..."
node /app/standalone/server.js &

# Wait for server to be ready
sleep 3
echo "[start] Next.js server should be running on port 3001"

# Start nginx on port 3000 (external, replaces shell process)
echo "[start] Starting nginx on port 3000..."
exec nginx -g 'daemon off;'
