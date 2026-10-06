# iOS / Android (phones & tablets)

Phase 9 is a React Native app in [`apps/mobile`](../apps/mobile) that shares [`@streamerr/client`](../packages/client) with the website and Android TV app. Screens are touch-first (bottom tabs). Playback uses `react-native-video` (ExoPlayer on Android, AVPlayer on iOS).

```text
apps/web    (React DOM)
apps/tv     (React Native + Expo TV / Leanback)
apps/mobile (React Native + Expo / phones & tablets)
        │
        └── @streamerr/client → Streamerr API
```

The website stays Vite + CSS. The TV app stays D-pad / landscape Leanback. Mobile does **not** import TV components and does **not** set `EXPO_TV`.

## Runtime

The monorepo pins `react-native` to `react-native-tvos` (same as Android TV). That fork builds phone and tablet binaries. Mobile omits `@react-native-tvos/config-tv`, so prebuild produces a normal launcher (`app.streamerr.mobile`), not Leanback.

If phone targets fail on the tvOS fork, scope the npm override to `@streamerr/tv` and give mobile stock React Native.

## Features

| Feature | Notes |
|---------|-------|
| Server URL | First-run screen; Change server from Profile |
| Auth | Jellyfin login; session id on device as `Cookie` / header |
| Tabs | Home, Movies, Series, Live TV, Search |
| Profile | Downloads, Requests, Change server, Sign out |
| Playback | HLS, progressive; seek cap; sideloaded subtitles |
| Live TV | Android: MPEG-TS via ExoPlayer. iOS: unavailable until API live HLS remux |

Deep links, App Store / Play Store, PiP, and offline downloads are out of this pass.

## Develop

From the repo root:

```bash
npm install
npm run build -w @streamerr/shared && npm run build -w @streamerr/client
cd apps/mobile
npx expo prebuild --clean
npx expo run:ios
# or
npx expo run:android
```

Do **not** set `EXPO_TV`. Needs Xcode (iOS Simulator or device) and/or Android Studio with `ANDROID_HOME` set (Homebrew command-line tools: `/opt/homebrew/share/android-commandlinetools`). iOS deployment target is **16.4** (Expo 57).

## Sideload (Android)

```bash
cd apps/mobile
npx expo run:android --variant release
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## Live MPEG-TS on iOS

[`GET /api/playback/dispatcharr/live/:uuid`](../apps/api/src/routes/playback.ts) returns raw `video/mp2t`. ExoPlayer plays that; AVPlayer does not. Until Streamerr exposes a live HLS remux (one IPTV lease), the Live tab on iOS shows an unavailable state and the player refuses MPEG-TS live.

On first launch, enter the Streamerr origin (for example `http://192.168.1.10:8787`) and sign in with Jellyfin. Private LAN hosts may use `http`; public hosts are forced to `https`.
