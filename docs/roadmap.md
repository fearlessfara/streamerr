# Streamerr Roadmap

## Phase 1 — Foundation

- Monorepo, docs, shared domain
- Provider capabilities and interfaces
- JellyfinProvider (real)
- SeerrProvider / DispatcharrProvider skeletons + health
- Mocks and resolver contract tests
- Auth/session, health, UI shell

**STOP** when shell/foundation works.

## Phase 2 — Jellyfin

Vertical slice:

```text
Login → Home → Continue Watching → Details → Play
```

- D-pad / TV-first navigation
- Jellyfin progress
- Playback resolution (`PlaybackDelivery`)
- TMDb-optional navigation via `jellyfinItemId`

**STOP** when Streamerr is a usable Jellyfin client.

## Phase 3 — Seerr

- Discovery, trending, Movies, Series
- Unified search, media details, requests

Resolution: Jellyfin? → PLAY; else requestable? → REQUEST

**STOP** when discovery/search/request works.

## Phase 4 — Dispatcharr VOD

- Movie/series VOD catalogue
- TMDb/IMDB matching where available
- Availability, stream resolution, source ranking

Resolution: Jellyfin → Cache → Dispatcharr IPTV → Request

**STOP** when IPTV VOD can be discovered/resolved/played safely.

## Phase 5 — Streamerr Acquisition

- AcquisitionManager + DownloadTransport
- Cache vs library modes
- Progress, cancel, resume, range
- Connection release after acquisition
- **Atomic cache→library promotion** and in-flight mode upgrade
- Add to Library + Jellyfin import/scan
- Explore progressive play-while-downloading later

**STOP** when IPTV → download → release connection → local play works; promote without re-download.

## Phase 6 — Live TV

- Channels, groups, EPG, now/next
- Guide grid, live playback, favourites
- Connection-aware live playback

**STOP** when Streamerr can replace a normal IPTV Live TV frontend.

## Phase 7 — Unified TV / Episodes

- Episode-level availability across Jellyfin + Dispatcharr
- IPTV watch progress, merged Continue Watching / Next Up
- Source transitions and ranking

**STOP** when Movies + Series + Live TV feel like one application.

## Phase 8 — Android TV / Google TV

- TV shell, launcher, D-pad, Back, MediaSession
- Native playback where required, deep links, TV auth
- Live TV remote / EPG QA

See [android-tv.md](./android-tv.md).
