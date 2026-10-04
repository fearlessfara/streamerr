# Streamerr Architecture

**Streamerr — Your media. One stream.**

Streamerr is a self-hosted consumer media orchestration layer. It unifies movies, TV series, Live TV, discovery, requests, IPTV VOD/series, temporary caching, and permanent acquisition into one application.

It is **not** another Jellyfin, Seerr, Radarr/Sonarr, or Dispatcharr.

## Product boundary

```text
                     STREAMERR
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    Jellyfin           Seerr          Dispatcharr
        │                │                │
   Local media        Discovery       IPTV sources
   Playback           Requests        VOD / Series
   Progress               │           Live TV / EPG
   Transcoding            │                │
                          ▼                ▼
                   Radarr/Sonarr   AcquisitionManager
                                         │
                                ┌────────┴────────┐
                                │                 │
                              CACHE            LIBRARY
```

| Service | Owns |
|---------|------|
| **Jellyfin** | Permanent library, playback, progress, transcoding, user identity (MVP) |
| **Seerr** | Discovery, TMDb metadata, requests; only path to Radarr/Sonarr |
| **Dispatcharr** | IPTV aggregation, VOD/series catalogue, live channels, EPG, safe stream proxy |
| **Streamerr** | Unified UX, AvailabilityResolver, PlaybackResolver, AcquisitionManager, DownloadTransport, cache |

`seerr-stream-bridge` (sibling project) is independent and not part of this architecture.

## Navigation (target)

`HOME | MOVIES | SERIES | LIVE TV | SEARCH`

## Domain model

### MediaIdentity

TMDb is preferred for cross-provider joins but **not** mandatory. Jellyfin-only items (home video, unidentified media) use `jellyfinItemId`.

```ts
type MediaType = "movie" | "tv" | "episode" | "other";

interface MediaIdentity {
  jellyfinItemId?: string;
  tmdbId?: number;
  tvdbId?: number;
  mediaType: MediaType;
  seasonNumber?: number;
  episodeNumber?: number;
}
```

### Media vs Availability

```ts
interface Media {
  identity: MediaIdentity;
  metadata: MediaMetadata;
  availability: Availability[];
}

type Availability =
  | JellyfinAvailability
  | CacheAvailability
  | DispatcharrAvailability
  | RequestAvailability;
```

Playable priority:

**Jellyfin → Streamerr Cache → Dispatcharr IPTV → Seerr Request**

`CacheAvailability` is a local Streamerr acquired file (partial or complete). Prefer it over opening a new IPTV connection.

### Preferred actions

```ts
type PreferredAction =
  | "PLAY_JELLYFIN"
  | "PLAY_CACHE"
  | "PLAY_IPTV"
  | "REQUEST"
  | "NONE";
```

UI verbs for consumers: **PLAY | CONTINUE | REQUEST | ADD TO LIBRARY** (never “Play Dispatcharr”).

## Providers and capabilities

```ts
interface ProviderCapabilities {
  library: boolean;
  playback: boolean;
  progress: boolean;
  transcoding: boolean;
  discovery: boolean;
  request: boolean;
  vod: boolean;
  liveTv: boolean;
  epg: boolean;
  acquisitionSource: boolean;
}
```

Capability-specific interfaces (`LibraryProvider`, `PlaybackProvider`, `DiscoveryProvider`, `RequestProvider`, `VodProvider`, `LiveTvProvider`, `AcquisitionSourceProvider`) keep adapters focused. Resolvers prefer capabilities over hard-coded provider names.

| Provider | Capabilities |
|----------|--------------|
| Jellyfin | library, playback, progress, transcoding |
| Seerr | discovery, request |
| Dispatcharr | vod, liveTv, epg, playback/stream resolution, acquisitionSource |

### Dispatcharr auth

```ts
type DispatcharrAuth =
  | { type: "apiKey"; apiKey: string }
  | { type: "credentials"; username: string; password: string };
```

API key is preferred for BFF automation; credentials produce/refresh JWTs. Never send Dispatcharr credentials to the browser.

## Resolvers

```text
MediaIdentity → AvailabilityResolver → [Jellyfin | Cache | Dispatcharr | Request]
                                    → PlaybackResolver → PLAY
```

Frontend only calls `POST /api/playback/resolve`. It must not implement provider priority.

### Playback delivery

```ts
type PlaybackDelivery =
  | { mode: "direct"; url: string; headers?: Record<string, string> }
  | { mode: "proxy"; url: string };
```

- Jellyfin: MVP proxy acceptable; architecture must allow later direct/tokenized delivery (Node is not a permanent media relay).
- Dispatcharr: never expose raw IPTV credentials; use Dispatcharr’s proxy and/or Streamerr-owned authenticated routes.

## Acquisition

Dispatcharr identifies a trusted source. Streamerr owns what happens next.

```text
DispatcharrProvider → AcquisitionSource → AcquisitionManager → DownloadTransport
```

| Mode | Behaviour |
|------|-----------|
| **CACHE** | Temporary acquire → release IPTV connection → local play → TTL/eviction |
| **LIBRARY** | Permanent download → organise → Jellyfin path → scan |

`DownloadTransport` owns HTTP range, resume, cancel, progress, and connection lifecycle. It must not live inside `DispatcharrProvider`.

### IPTV Play = auto-cache (connection limit 1)

With a single IPTV upstream slot, Play must not open a remux stream and a download at once.

1. `PlaybackResolver` starts (or resumes) a CACHE acquisition for the Dispatcharr title.
2. Resolve returns `buffering` until ~2MB is on disk, then `ready` with `/api/playback/cache/:id`.
3. The player remuxes the local file while the same acquisition connection finishes downloading.
4. UI shows cache TTL (“Cached · N days left”) and **Add to Library** next to Play (promote); no separate “download icons”.

### Atomic promotion (Phase 5)

Cache → Library must not re-download:

1. Cache acquisition completes (or is in flight).
2. User chooses Add to Library.
3. Atomic move/rename into library layout, **or** upgrade in-flight acquisition mode from `cache` → `library`.
4. Jellyfin library refresh/scan.

Never start a second IPTV transfer for the same identity.

### Managers

- **CacheManager** (`apps/api/src/services/cache-manager.ts`) — TTL + max size LRU for CACHE-mode files; protects in-flight downloads and recently played files (`STREAMERR_CACHE_*` env).
- **IptvConnectionManager** (`apps/api/src/services/iptv-connection-manager.ts`) — soft cap on concurrent IPTV upstreams; priority Live → VOD playback → acquisition; live can preempt downloads (`STREAMERR_IPTV_MAX_CONNECTIONS`).

## Security

- Authenticated Streamerr API; opaque sessions; Jellyfin tokens stay server-side.
- No provider secrets in the browser.
- Redact IPTV/Dispatcharr URLs and tokens in logs.
- Acquisition sources only from trusted adapters — never arbitrary client URLs (SSRF).
- Validate library destination paths.

## Resilience

Provider failures degrade functionality; they must not crash Streamerr. Timeouts, typed errors, health checks (`/api/health`), and sensible retries are required.

## Caching

In-memory cache with TTLs for discovery and availability. Abstraction allows Redis later. No Redis in Phase 1/2.

## Browser playback notes

- Jellyfin: DeviceProfile rejects AC3/DTS DirectPlay; DirectStream/Transcode force AAC.
- Dispatcharr VOD Play: auto-cache then local remux (see above). Cache remux scrubbing uses `?start=` + file `-ss`. Direct IPTV remux remains for debug/`raw` only.
- Live TV: MPEG-TS via mpegts.js MSE.

## Implementation stop

Phases 1–7 (web) are implemented. Phase 8 (Android TV packaging) remains optional. See [roadmap.md](./roadmap.md) and [android-tv.md](./android-tv.md).
