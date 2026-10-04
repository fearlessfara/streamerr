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
# ffmpeg: IPTV VOD / cache remux (video copy + AAC) for browser playback
RUN apk add --no-cache ffmpeg
COPY package.json package-lock.json* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
RUN mkdir -p /data
ENV STREAMERR_DATA_DIR=/data
ENV STREAMERR_PORT=8787
ENV FFMPEG_PATH=/usr/bin/ffmpeg
EXPOSE 8787
CMD ["node", "apps/api/dist/server.js"]
