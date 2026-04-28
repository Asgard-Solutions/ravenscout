# Raven Scout — Features Overview

Raven Scout is an AI-assisted tactical hunting companion for iOS and Android. Point it at a map of your hunting area, give it a species and a wind, and it returns stands, travel corridors, access routes, and avoid zones overlaid directly on the image — along with a written tactical brief. Everything is engineered to help you make a better first sit on unfamiliar ground.

## Core Features

### 1. AI Hunt Analysis (GPT-5.2 Vision)
- Upload up to 4 map images per hunt — satellite, topo, onX / HuntWise exports, trail-cam screenshots, or the built-in interactive MapLibre viewer.
- The model reads the imagery alongside your selections (species, weapon, method, hunt date, time window, wind direction, GPS) and returns:
  - 3–6 placed **overlays**: stands, travel corridors, access routes, avoid zones, bedding, food, water, trails.
  - 1–3 ranked **top setups** with entry/exit strategy, wind risk, thermals risk, pressure risk, and a best window.
  - Written **summary, wind notes, best-time window, key assumptions, species-specific tips**.
- A unified overlay taxonomy guarantees the legend colors on screen match what the model emitted — no drift.

### 2. 8 Supported Species
Whitetail Deer · Mule Deer · Elk · Moose · Black Bear · Pronghorn Antelope · Wild Hog · Turkey · Coyote (predator).
Each species ships a custom gold/white icon and a tactical prompt pack tuned to that animal's behavior, bedding cover, and food.

### 3. Weapon + Method Context
Pick your **weapon** (archery / rifle / muzzleloader) and **method** (still hunt / spot & stalk / ambush) so the model adjusts effective range, access tolerance, and setup recommendations accordingly.

### 4. Interactive Tactical Map
- MapLibre + MapTiler satellite / topo / hybrid.
- Custom marker layer for every overlay type, with a locked legend.
- Pinch / pan, long-press to drop a custom waypoint, auto-fly to your analysis bounds.

### 5. Hunt History + Saved Hunts
- All analyses are saved locally first (offline-first) and synced to your account via MongoDB + AWS S3.
- Pro tier: full-resolution map images upload to a private S3 bucket under `hunts/{userId}/{huntId}/…` and stream via signed download URLs.
- Core / Trial: images live on the device only.

### 6. Weather + Wind Integration
Auto-fetches forecast data for the hunt date and GPS so wind / temperature / precipitation are already filled in. You can always override manually.

### 7. Overlay Editor
After analysis you can nudge, rename, hide, or add custom waypoints. Edits are stamped on the hunt record so your ground-truth tweaks follow you across devices.

### 8. Offline Support
Every saved hunt renders its map + overlays + written brief with no signal. Great for trucks in the dark before sunrise.

### 9. Privacy
No ads. No selling your location. Your GPS, imagery, and hunt notes are scoped to your account; Pro storage is a private AWS S3 bucket.

## Tier Differences

| Capability | Trial | Core | Pro |
|---|---|---|---|
| Hunts per month | 3 | 10 | Unlimited |
| Image count per hunt | 1 | 1 | Up to 4 |
| Cloud image backup (S3) | — | — | ✓ |
| Enhanced species prompt framework | — | — | Rollout-gated |
| Overlay editor | ✓ | ✓ | ✓ |
| Offline access | ✓ | ✓ | ✓ |
| Weather integration | ✓ | ✓ | ✓ |
| Interactive map | ✓ | ✓ | ✓ |

## Integrations Under the Hood
- **OpenAI GPT-5.2 Vision** — map analysis.
- **AWS S3 (us-east-2)** — private cloud image storage for Pro.
- **MapTiler** — base map tiles.
- **RevenueCat** — subscriptions on both iOS and Android.
- **Google OAuth / Email OTP** — sign-in.
- **Microsoft Graph** — transactional password-reset email.
