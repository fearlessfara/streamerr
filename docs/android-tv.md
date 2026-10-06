# Android TV / Google TV

Phase 8 is a React Native app in [`apps/tv`](../apps/tv) that shares [`@streamerr/client`](../packages/client) with the website. Playback uses ExoPlayer through `react-native-video`.

```text
apps/web (React DOM)
apps/tv  (React Native + Expo TV)
        │
        └── @streamerr/client → Streamerr API
```

The website stays Vite + CSS. TV screens are written for the remote.

## Features

| Feature | Notes |
|---------|-------|
| Launcher | Leanback banner, `LEANBACK_LAUNCHER` via `@react-native-tvos/config-tv` |
| Server URL | First-run screen; Change server from the profile control |
| Auth | Jellyfin login; session id stored on device and sent as `Cookie` |
| D-pad | React Native TV focus |
| Back | Stack pop; player exits first |
| Playback | HLS, progressive, live MPEG-TS; seek cap; sideloaded subtitles |
| Media keys | Play/pause, skip, live channel up/down |
| Live TV | Channels, favourites, zap |

Deep links and Play Store are out of this pass.

## Develop

From the repo root:

```bash
npm install
npm run build -w @streamerr/shared && npm run build -w @streamerr/client
cd apps/tv
EXPO_TV=1 npx expo prebuild --clean
EXPO_TV=1 npx expo run:android
```

Needs Android Studio with an Android TV system image, or a Google TV with network debugging.

## Sideload

1. Build a release APK: `cd apps/tv && EXPO_TV=1 npx expo run:android --variant release` (or assemble after prebuild).
2. On the TV: Settings → About → select the Android build row until developer options appear. Enable Network debugging.
3. On the same LAN:

```bash
adb connect <tv-ip>:5555
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Without a computer: install Downloader from the Play Store, allow unknown apps for Downloader, and open an `https` URL that serves the APK.

On first launch, enter the Streamerr origin (for example `http://192.168.1.10:8787`) and sign in with Jellyfin.
