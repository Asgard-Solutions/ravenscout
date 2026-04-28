# Raven Scout — Features Overview

Raven Scout is an AI-assisted tactical hunting companion for iOS and Android. Point it at a map of your hunting area, give it a species and a wind, and it returns stands, travel corridors, access routes, and avoid zones overlaid directly on the image — along with a written tactical brief. Everything is engineered to help you make a better first sit on unfamiliar ground.

## Core Features

### 1. AI Hunt Analysis (GPT-5.2 Vision)
- Upload up to 5 map images per hunt — satellite, topo, onX / HuntWise exports, trail-cam screenshots, or the built-in interactive MapLibre viewer.
- On Pro, the model reads ALL provided images alongside your selections (species, weapon, method, hunt date, time window, wind direction, GPS) and cross-references them. On Core / Trial only the primary map image is sent to the model.
- The analysis returns:
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
- All analyses are saved locally first (offline-first) and synced to your account via MongoDB.
- **Pro** tier additionally backs up full-resolution map images to a private AWS S3 bucket under `hunts/{userId}/{huntId}/…` and streams them via signed download URLs.
- **Core / Trial**: images live on the device only.

### 6. Weather + Wind Integration (Core / Pro only)
Auto-fetches forecast data for the hunt date and GPS so wind / temperature / precipitation are already filled in. Trial users enter wind / weather manually. You can always override the auto-filled values.

### 7. Saved Marker Editor
After analysis you can:
- Tap any marker to view its details and GPS coordinates (when the source image is georeferenced).
- Long-press and drag to reposition.
- Edit name / type / notes, or delete.
- Add brand-new markers by tapping the image — geo-capable images store GPS automatically; pixel-only uploads store on-image x/y only (no fabricated GPS).

### 8. Offline Support
Every saved hunt renders its map + overlays + written brief with no signal. Great for trucks in the dark before sunrise.

### 9. Privacy
No ads. No selling your location. Your GPS, imagery, and hunt notes are scoped to your account; Pro storage is a private AWS S3 bucket with user-scoped, short-lived signed URLs.

## Tier Differences

| Capability | Trial | Core | Pro |
|---|---|---|---|
| AI hunt analyses | 3 lifetime | 10 / month | 40 / month |
| Rollover of unused analyses | — | 1 cycle | 12 cycles |
| Multi-image correlation per hunt | Primary only | Primary only | Up to 5 images |
| Cloud image backup (S3) | — | — | ✓ |
| Enhanced species prompt framework | — | — | Rollout-gated |
| Weather / wind auto-fill | — | ✓ | ✓ |
| Saved-marker editor | ✓ | ✓ | ✓ |
| Offline access to saved hunts | ✓ | ✓ | ✓ |
| Interactive map | ✓ | ✓ | ✓ |

## Integrations Under the Hood
- **OpenAI GPT-5.2 Vision** — map analysis.
- **AWS S3** — private cloud image storage for Pro.
- **MapTiler** — base map tiles.
- **WeatherAPI.com** — weather / wind auto-fill (Core, Pro).
- **RevenueCat** — subscriptions on both iOS and Android.
- **Google OAuth / Email + Password (with email OTP reset)** — sign-in.
- **Microsoft Graph** — transactional password-reset email.
