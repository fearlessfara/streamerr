#!/bin/sh
set -eu

export STREAMERR_PORT="${STREAMERR_PORT:-8787}"
export STREAMERR_API_PORT="${STREAMERR_API_PORT:-8788}"
export STREAMERR_DATA_DIR="${STREAMERR_DATA_DIR:-/data}"
export STREAMERR_MEDIA_PLANE=nginx
export STREAMERR_EMBED_PACKAGER=false
export STREAMERR_PORT_INTERNAL="$STREAMERR_API_PORT"

# Derive nginx upstreams from provider URLs (host:port only).
jellyfin_url="${JELLYFIN_URL:-http://127.0.0.1:8096}"
dispatcharr_url="${DISPATCHARR_URL:-http://127.0.0.1:9191}"

export JELLYFIN_UPSTREAM="$(printf '%s' "$jellyfin_url" | sed -E 's#/*$##')"
export DISPATCHARR_UPSTREAM="$(printf '%s' "$dispatcharr_url" | sed -E 's#/*$##')"
export JELLYFIN_HOST="$(printf '%s' "$JELLYFIN_UPSTREAM" | sed -E 's#^https?://##' | cut -d/ -f1)"
export DISPATCHARR_HOST="$(printf '%s' "$DISPATCHARR_UPSTREAM" | sed -E 's#^https?://##' | cut -d/ -f1)"
export DISPATCHARR_CF_ACCESS_CLIENT_ID="${DISPATCHARR_CF_ACCESS_CLIENT_ID:-}"
export DISPATCHARR_CF_ACCESS_CLIENT_SECRET="${DISPATCHARR_CF_ACCESS_CLIENT_SECRET:-}"

# empty CF headers must not break nginx — use a placeholder space
if [ -z "${DISPATCHARR_CF_ACCESS_CLIENT_ID}" ]; then
  export DISPATCHARR_CF_ACCESS_CLIENT_ID=""
fi

envsubst '${STREAMERR_PORT} ${STREAMERR_API_PORT} ${STREAMERR_DATA_DIR} ${JELLYFIN_UPSTREAM} ${JELLYFIN_HOST} ${DISPATCHARR_UPSTREAM} ${DISPATCHARR_HOST} ${DISPATCHARR_CF_ACCESS_CLIENT_ID} ${DISPATCHARR_CF_ACCESS_CLIENT_SECRET}' \
  < /etc/nginx/nginx.conf.template \
  > /etc/nginx/nginx.conf

mkdir -p "$STREAMERR_DATA_DIR/hls" /var/log/nginx /tmp

# API on loopback; nginx publishes STREAMERR_PORT.
STREAMERR_PORT="$STREAMERR_API_PORT" \
STREAMERR_MEDIA_PLANE=nginx \
STREAMERR_EMBED_PACKAGER=false \
  node /app/apps/api/dist/server.js &
API_PID=$!

STREAMERR_EMBED_PACKAGER=false \
  node /app/apps/api/dist/packager.js &
PACK_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

term() {
  kill -TERM "$API_PID" "$PACK_PID" "$NGINX_PID" 2>/dev/null || true
  wait || true
  exit 0
}
trap term INT TERM

# Exit if any child dies.
while kill -0 "$API_PID" 2>/dev/null \
  && kill -0 "$PACK_PID" 2>/dev/null \
  && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2
done

echo "[entrypoint] a process exited; shutting down" >&2
term
