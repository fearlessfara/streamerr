# Build from repository root (required for `docker build <git-url>`).
#   docker build -t streamerr https://github.com/fearlessfara/streamerr.git
#   docker compose -f docker/docker-compose.yml up -d --build

FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
RUN npm install
RUN npm run build -w @streamerr/shared
RUN npm run build -w @streamerr/providers
RUN npm run build -w @streamerr/ui
RUN npm run build -w @streamerr/api
RUN npm run build -w @streamerr/web

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# nginx (media plane) + ffmpeg/ffprobe (HLS packager) + gettext (envsubst)
RUN apk add --no-cache nginx ffmpeg gettext curl \
  && mkdir -p /run/nginx /var/log/nginx /var/lib/nginx/tmp \
  && rm -f /etc/nginx/http.d/default.conf /etc/nginx/conf.d/default.conf 2>/dev/null || true

COPY package.json package-lock.json* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY docker/nginx/nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data/hls

ENV STREAMERR_DATA_DIR=/data
ENV STREAMERR_PORT=8787
ENV STREAMERR_API_PORT=8788
ENV STREAMERR_MEDIA_PLANE=nginx
ENV STREAMERR_EMBED_PACKAGER=false
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe
EXPOSE 8787
CMD ["/entrypoint.sh"]
