# Android TV / Google TV Strategy

Phase 1–2 ship a **web** TV-first UI. Native Android TV packaging is Phase 8.

## Goals

Eventually package the Streamerr React UI as an Android TV / Google TV application:

```text
Streamerr React UI
      │
      ├── Web / PWA
      └── Android TV shell → Google TV
```

## Design constraints (from day one)

- Spatial / D-pad navigation (UP/DOWN/LEFT/RIGHT/ENTER/BACK/PLAY-PAUSE)
- Large focus indicators; no hover-only interactions
- Platform-specific APIs isolated behind adapters
- Fullscreen playback with clear back-stack behaviour

## Phase 8 scope

| Feature | Notes |
|---------|-------|
| Launcher integration | Leanback / TV banner, leanback launcher intent |
| D-pad | Same focus primitives as web; QA on real remotes |
| Back | Map Android Back to React Router / player exit |
| Play/Pause | Hardware media keys → player |
| MediaSession | Now playing metadata, transport controls |
| Deep links | `streamerr://media/...` into details/player |
| TV authentication | Device-friendly Jellyfin login (username list + PIN/password) |
| Live TV | Channel zapping, favourites, EPG grid remote navigation |
| Channel switching | Instant or near-instant tune via Dispatcharr live proxy |
| EPG navigation | Grid focus model: channels × time; OK to tune |
| Playback controls | Scrub, audio/subtitle if available, exit fullscreen |

## Packaging candidates (evaluate in Phase 8)

1. **Trusted Web Activity / Capitor-style WebView shell** wrapping the existing UI
2. **React Native / Expo for TV** if web playback is insufficient
3. Hybrid: web UI + native ExoPlayer for Dispatcharr/Jellyfin streams

Prefer reusing the web focus system unless MediaSession / ExoPlayer requires a native player bridge.

## Non-goals until Phase 8

- Publishing to Google Play
- Native Kotlin rewrite of the entire UI
- Assuming a specific packaging framework before player requirements are known
