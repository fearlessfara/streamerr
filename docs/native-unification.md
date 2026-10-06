# Native UI unification (and RN-web)

Streamerr already shares **domain + API** via `@streamerr/client` / `@streamerr/shared`. Visual trees were triplicated: Vite DOM web, Expo mobile, Expo TV.

## Goal

Maximize code share without a risky big-bang rewrite of the production website.

```text
                    @streamerr/client  (API / playback helpers)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   apps/web              packages/native-ui      (future RN-web)
   Vite + CSS            mobile + TV StyleSheet   optional Expo web
   @streamerr/ui              │
                        apps/mobile  apps/tv
```

## Phases

### A — Shared native primitives (started)

- `@streamerr/native-ui`: theme tokens + Netflix-style skeleton layouts
- Mobile/TV pass layout metrics (`NativeLayout`) so phone vs Leanback sizing stay local
- Website stays Vite + `@streamerr/ui` CSS (no RN-web yet)

### B — Dedupe mobile ↔ TV screens

- Extract shared hooks (home/catalog/details query keys + play mutations)
- Share `PosterCard` / session helpers where identical
- Keep separate chrome: bottom tabs (mobile) vs D-pad `Chrome` (TV)

### C — Player adapter

- Interface: resolve → attach(url, kind) → seek / progress / subs
- Implementations: web `hls.js`/`mpegts.js`, native `react-native-video`
- Do **not** assume one player binary works on web

### D — Optional RN-web shell

- Add Expo `web` **beside** Vite once browse screens are shared
- First candidates: Login, Home, Catalog, Search, Details
- Defer: full player chrome, EPG guide, spatial focus parity with DOM

## Why not “port web to RN” in one shot

| Risk | Why |
|------|-----|
| `PlayerPage.tsx` (~2k LOC) | MSE + live MPEG-TS + IPTV cache HLS — not ExoPlayer |
| `app.css` (~2.5k LOC) | Netflix hover/focus chrome is DOM-specific |
| Focus models | Web spatial focus ≠ TV Pressable ≠ phone touch |
| Live EPG | Web-only guide grid today |

## Netflix-style loading UX (checklist)

- Skeleton geometry matches real billboard / 16:9 rails / details hero
- Prefer skeletons over spinners for content areas
- Keep nav chrome mounted while rails load
- Respect `prefers-reduced-motion` / `AccessibilityInfo`
- Avoid layout jump when data arrives (same shell heights)

## Status

Phase A is in progress with `@streamerr/native-ui` skeletons. Web skeletons live in `apps/web/src/components/skeletons.tsx` and mirror the same Netflix geometry in CSS.
