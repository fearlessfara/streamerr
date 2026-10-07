# Native UI unification (React Native + RN Web)

Streamerr shares **domain + API** via `@streamerr/client` / `@streamerr/shared` and **UI** via `@streamerr/native-ui` across mobile, Android TV, and web (Expo + `react-native-web`).

```text
                    @streamerr/client  (API / playback helpers)
                              │
                    @streamerr/native-ui  (screens + PosterCard + player chrome)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   apps/mobile            apps/tv               apps/web
   tabs + touch           Leanback Chrome       Expo RN Web
   react-native-video     react-native-video    @streamerr/player-web
                                                (hls.js / mpegts.js)
```

## Package roles

| Package | Role |
|---------|------|
| `@streamerr/native-ui` | Theme, skeletons, PosterCard, Artwork, shared screens, shared `PlayerScreen` chrome |
| `@streamerr/player-web` | Browser MSE attach (`hls.js` / `mpegts.js`) + `WebVideoSurface` |
| `apps/mobile` / `apps/tv` | Thin shells: chrome, layout metrics, `NativeVideoSurface` |
| `apps/web` | Expo web shell; static export to `apps/web/dist` for API/`fastifyStatic` |

## Player adapter

`VideoSurfaceProps` + shared `PlayerScreen` chrome live in `@streamerr/native-ui`.
Platform surfaces implement seek/progress/load/error:

- Native: `react-native-video` (`NativeVideoSurface`)
- Web: `attachWebPlayback` in `@streamerr/player-web`

## Netflix-style loading UX

- Skeleton geometry matches billboard / 16:9 rails / details hero
- Prefer skeletons over spinners for content areas
- Keep nav chrome mounted while rails load
- Respect `AccessibilityInfo` reduce-motion
