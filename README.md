# Streamerr

**Your media. One stream.**

A unified self-hosted streaming application for your movies, series and live TV.

Streamerr sits on top of **Jellyfin**, **Seerr**, and **Dispatcharr**. It does not replace them. Normal users see one app — not three backends.

```text
                     STREAMERR
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    Jellyfin           Seerr          Dispatcharr
   Library/Play     Discovery/Req      IPTV/Live/VOD
                          │                │
                   Radarr/Sonarr   Streamerr Acquisition
                                      CACHE / LIBRARY
```

## Current status

**Phases 1–9 are implemented** on a shared React Native UI (`@streamerr/native-ui`) with Expo web, Android TV, and iOS/Android shells:

| Phase | Status |
|-------|--------|
| 1–7 Product (API + clients) | Done — auth, Jellyfin, Seerr, Dispatcharr, acquisition, live, episodes |
| 8 Android TV | Done — `apps/tv` |
| 9 iOS / Android | Done — `apps/mobile` |
| Web (RN Web) | Done — `apps/web` Expo + `react-native-web` |

See [docs/roadmap.md](./docs/roadmap.md) and [docs/native-unification.md](./docs/native-unification.md).

## Requirements

- Node.js ≥ 24
- **ffmpeg** / **ffprobe** on `PATH` (or `FFMPEG_PATH`) for the IPTV cache HLS packager
- Docker (optional, for deployment)
- Reachable Jellyfin, Seerr, and Dispatcharr (or `STREAMERR_USE_MOCKS=true`)

## Quick start (development)

```bash
cp .env.example .env
# set JELLYFIN_URL, SEERR_*, DISPATCHARR_*, STREAMERR_SESSION_SECRET

npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:8787

## Docker

From a local checkout:

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d --build
```

Build the image straight from GitHub (Dockerfile at repo root):

```bash
docker build -t streamerr https://github.com/fearlessfara/streamerr.git
docker run --env-file .env -p 8787:8787 streamerr
```

Or compose with a Git build context (still needs a local `.env` for secrets):

```bash
cp .env.example .env
docker compose -f docker/docker-compose.git.yml up -d --build
```

Compose runs **Streamerr only**. Point env vars at your existing Jellyfin / Seerr / Dispatcharr instances. The Docker image includes **nginx** (media plane), **ffmpeg** (HLS packager), and the API in one container.

Mount `/data/library` (or the `streamerr-data` volume’s `library/` folder) into Jellyfin as a media library root so **Add to Library** promotions are scanned.

## Configuration

See [`.env.example`](./.env.example).

| Variable | Purpose |
|----------|---------|
| `STREAMERR_PORT` | API listen port |
| `STREAMERR_CACHE_MAX_BYTES` | Max size of CACHE acquisitions (default 50 GiB) |
| `STREAMERR_CACHE_TTL_MS` | Idle CACHE TTL (default 7 days) |
| `STREAMERR_IPTV_MAX_CONNECTIONS` | Concurrent IPTV upstreams (default 3) |
| `FFMPEG_PATH` | Optional path to ffmpeg (HLS packager) |
| `STREAMERR_MEDIA_PLANE` | `node` (local) or `nginx` (Docker) |
| `JELLYFIN_URL` | Jellyfin base URL |
| `SEERR_URL` / `SEERR_API_KEY` | Seerr |
| `DISPATCHARR_URL` / `DISPATCHARR_API_KEY` | Dispatcharr |

## Integrations

| Backend | Role |
|---------|------|
| [Jellyfin](./docs/upstream/jellyfin.md) | Library, playback, progress, login |
| [Seerr](./docs/upstream/seerr.md) | Discovery & requests |
| [Dispatcharr](./docs/upstream/dispatcharr.md) | IPTV VOD / Live TV |

Architecture: [docs/architecture.md](./docs/architecture.md).

## Development

```bash
npm run build
npm test
npm run typecheck
npm run lint
```

Monorepo workspaces: `apps/web`, `apps/tv`, `apps/mobile`, `apps/api`, `packages/shared`, `packages/client`, `packages/providers`, `packages/native-ui`, `packages/player-web`.

## License

MIT
