# Raven Scout — v1.0.0 Release Notes

**Release date:** TBD
**Platform:** iOS (App Store) · Android (Google Play)
**Tagline:** *Forged in Asgard, Scouted in the Field.*

This is the first public release of Raven Scout — an AI-assisted tactical hunting companion that takes a map of your hunting area, your conditions, and your hunt style, and returns specific, code-of-conduct-aware recommendations: where to set up, how to walk in, where the wind is going to bite you, and what to avoid.

Everything below is shipping in v1.0.0. Future releases will be additive.

---

## 🦌 What's in the box

### 1. AI Hunt Analysis (GPT-5.2 Vision)
Upload one or more map images, set your conditions, hit ANALYZE.

- **Per analysis you get**:
  - **6–12 placed overlays** spanning up to 8 tactical categories (stands, travel corridors, access routes, avoid zones, bedding cover, food sources / feeders, water sources, animal trails). The variety rule forces the model to span at least 4 distinct types when the imagery supports it — no more sparse outputs that only show stands and avoids.
  - **1–3 ranked top setups**, each with entry strategy, exit strategy, wind risk, thermals risk, pressure risk, and a best-time window.
  - **Map observations** identifying the terrain features the analysis is built on (bedding cover, ridges, saddles, benches, draws, funnels, edges, crossings, open areas, roads, trails, access points, pressure zones).
  - **Tactical brief**: Summary, Wind Notes (prevailing wind impact, danger zones, best downwind sides), Best Time (primary + secondary windows), Key Assumptions (what the model couldn't see and had to infer), and Species Tips tuned to the animal you selected.
- **Anti-hallucination guarantees in the prompt**:
  - Coordinates always reference the primary image only.
  - Confidence is lowered for inferred bedding, food, funnels, pressure, and travel routes.
  - Categories that aren't supported by the imagery are *omitted* and noted in `key_assumptions` rather than padded with low-confidence guesses.
  - User-supplied GPS assets are treated as ground truth — the AI is forbidden from re-positioning them.

### 2. Eight Species, Each With a Custom Tactical Prompt Pack

| Species | Available on |
|---|---|
| Whitetail Deer | Trial · Core · Pro |
| Wild Hog | Trial · Core · Pro |
| Wild Turkey | Trial · Core · Pro |
| Elk | Core · Pro |
| Black Bear | Core · Pro |
| Moose | Core · Pro |
| Pronghorn Antelope | Core · Pro |
| Coyote (predator) | Core · Pro |

Each species has its own gold-on-dark icon, behavioral framing in the AI prompt, and species-specific dynamic fields on the Conditions step (e.g. moose gets pond-vs-willow-bottom prompts; coyote gets pair-bonded calling prompts; turkey gets roost-to-strut prompts).

### 3. Map Sources (Up to 5 Images per Hunt)
- **Upload** — pick from your device library or take a photo. Anything that visually shows terrain works: satellite, topo, onX/HuntWise screenshots, hand-drawn property maps, even an angled photo of a printed map. The app resizes large images before upload.
- **Interactive in-app map** — MapLibre + MapTiler, with Satellite / Hybrid / Topo styles. Pan, pinch, save the current viewport. Captured maps automatically store their **GPS bounds**, which means markers placed on them later get real lat/lng coordinates instead of just on-image pixel positions.
- **Pro tier** correlates ALL provided images during analysis — give it both a satellite and a topo of the same area for the strongest read. Trial / Core analyze the primary image only.

### 4. The 4-Step New-Hunt Wizard
1. **Species** — pick your target.
2. **Maps** — add up to 5 images.
3. **Conditions** — date, time window, GPS, wind, weather, weapon, method, plus species-specific dynamic fields (Sign Observed, Calling Activity, Vocalization Activity, Group Size, Travel Pattern, Aggression Indicators, Season Phase Hint).
4. **Review & Analyze** — everything visible at a glance before you spend a credit.

A new sub-section under Conditions, **Known Hunt Locations**, lets you pre-drop your existing stands, blinds, cameras, feeders, parking spots, and access points by GPS. The AI ingests them as fixed reference points and routes corridors / access lines around them — without ever changing their stored coordinates.

### 5. Saved Markers — A Real Marker Editor on Saved Images
Every analysis creates a **SAVED MARKERS** layer on the saved image. You can:

- **View** — tap any marker to see its type, GPS (when the source image is georeferenced), coordinate source ("User provided" / "AI estimated from image" / "Derived from saved map bounds" / "Pixel-only image placement"), the linked Known Hunt Location asset name (when applicable), and confidence.
- **Add** — tap **+ Add Marker**, pick a point on the image, fill in Type / Name / Notes. The form supports 12 user marker types (stand, blind, camera, feeder, scrape, rub, trail, bedding, water, parking, access_point, custom).
- **Edit** — tap a marker → Edit → adjust type / name / notes.
- **Delete** — tap → Delete (with confirm).
- **Drag-to-reposition** — long-press any marker (~220ms) until it highlights, then drag it to a new position. New x/y (and lat/lng for georeferenced images) is recomputed and persisted automatically.

**Coordinate-source guarantees, baked into the contract:**
- Geo-capable images (saved from the in-app interactive map) → real lat/lng on every tap or drag.
- Pixel-only images (uploaded screenshots) → on-image x/y only. **Raven Scout never fabricates GPS for these.**
- User-provided markers (linked to a Known Hunt Location) preserve the asset's stored GPS verbatim — the AI is locked out from changing them. If you drag a user-provided marker yourself, the source tag automatically updates so it never lies about its origin.

AI-returned overlays are auto-persisted into the same Saved Markers layer the first time a hunt is opened — server-side idempotency on the `analysis_id` keeps reloads from double-persisting.

### 6. Weather + Wind Auto-Fill (Core, Pro)
Auto-fetches forecast data (wind direction, temperature, precipitation, cloud cover) for the hunt date and GPS, so Conditions is mostly pre-filled. You can override anything. Trial users enter wind / weather manually.

### 7. Offline Mode
- Saved hunts render their map + overlays + markers + written brief with **no signal**.
- The Saved Hunts list shows a clear OFFLINE banner when there's no network.
- Re-opening a saved hunt does NOT consume an analysis credit — only running a NEW analysis does.

### 8. Cross-Device Sync (Pro)
- Pro analyses upload full-resolution map imagery to a private AWS S3 bucket under user-scoped keys (`hunts/{userId}/{huntId}/{imageId}`).
- Delivery is via short-lived signed URLs (default 60-minute downloads, 15-minute uploads). There is no public URL.
- Sign in on a second device → Pro hunts auto-sync.
- Trial / Core hunts stay on the originating device by design.

### 9. Profile + Account
- **Edit display name** inline.
- **Change Password** for email accounts; **Set Password** for Google-only or Apple-only accounts so all sign-in methods work.
- **Forgot / Reset Password** via email OTP (15-minute codes, sent from `support@asgardsolution.io` via Microsoft Graph).
- **Biometric app lock** — Face ID / Touch ID / Fingerprint, prompted on cold launch.
- **Local Storage** card — image count, total bytes, oldest item, configurable cleanup interval, **Run Cleanup Now**, and a destructive **Clear All Local Images**.
- **Cloud Storage** (Pro only) — orphan-image cleanup with help text.
- **Privacy Policy**, **Terms of Service**, and **Request Data Deletion** links.
- **Sign Out**, **Restore Purchases**, **Delete Account**.
- **About** with app + build version and a **Check for Updates** button (Expo OTA, production builds only).

### 10. Subscriptions (RevenueCat through App Store + Google Play)
| Tier | Price | Analyses | Rollover | Multi-image | Cloud backup | Weather |
|---|---|---|---|---|---|---|
| Trial | Free | 3 lifetime | — | Primary only | — | — |
| Core | $7.99/mo · $79.99/yr | 10 / month | 1 cycle | Primary only | — | ✓ |
| Pro | $14.99/mo · $149.99/yr | 40 / month | 12 cycles | Up to 5 images | ✓ | ✓ |

**Extra Hunt Analytics packs** (one-time, non-expiring, stack on top of any tier):
- 5 Extra Hunt Analytics — $5.99
- 10 Extra Hunt Analytics — $10.99
- 15 Extra Hunt Analytics — $14.99

Subscription credits drain first; pack credits drain afterward.

---

## 🛡️ Security & Privacy

- **bcrypt-hashed passwords** (we never store plaintext).
- **7-day session tokens**, refreshed by active use; expired sessions force re-sign-in.
- **HTTPS everywhere** (TLS).
- **15-minute OTP codes** for password reset; 5 wrong attempts burns the code.
- **Private S3 storage** for Pro imagery, with user-scoped object keys and short-lived signed URLs.
- **No ads, no advertising IDs, no selling your data.**
- **Account deletion** removes your account, hunts, and Pro cloud imagery (App Store / Play Store subs must be cancelled separately in the store).
- **GDPR / CCPA-style** data-deletion requests are accepted via `support@asgardsolution.io`.

---

## ⚙️ Technical Details (For The Curious)

- **Frontend**: Expo / React Native, expo-router file-based routing.
- **Backend**: FastAPI on a managed Linux container.
- **Database**: MongoDB.
- **AI**: OpenAI GPT-5.2 Vision via the official chat-completions API. Server-side prompt builder embeds an immutable Overlay Taxonomy table into every system prompt so the model's emitted types, labels, and hex colors stay in lockstep with the frontend legend.
- **Coordinate math**: a Python / TypeScript symmetric pair (`overlay_projection.py` ↔ `geoProjection.ts`) for GPS ↔ pixel conversion against saved-image bounds. North-up only, antimeridian-crossing rectangles rejected.
- **Storage**: AWS S3 (server-configured bucket and region). Pre-signed URLs for both upload (15 min) and download (60 min).
- **Subscriptions**: RevenueCat on iOS + Android.
- **Maps**: MapLibre + MapTiler tiles.
- **Weather**: WeatherAPI.com.
- **Auth**: **Sign in with Apple** (iOS, verified server-side against Apple's JWKS — supports Hide My Email), **Google OAuth** (one-tap), and **email + password** with OTP password reset (Microsoft Graph for transactional email).
- **Push notifications**: not in v1.0.0.

---

## ❌ What's NOT in v1.0.0 (Honest Roadmap Pointers)

We deliberately did NOT ship these in 1.0 so the experience could stay tight:
- **Trail-cam integrations** (Spypoint, Reconyx, Stealth Cam) — out of scope.
- **Public GIS / county-parcel overlays** — out of scope.
- **Hunt sharing** between users (links / read-only invites) — not in 1.0.
- **A built-in route planner** (turn-by-turn from your truck to the stand) — not in 1.0.
- **Marker calibration** (tying a pixel-only image to GPS via 3 reference points) — not in 1.0.
- **Live wind-thermal modeling** during the hunt — not in 1.0; wind notes are forecast-driven.
- **Background location tracking** — never.

Most of these will be evaluated for follow-on releases based on what users actually ask for.

---

## 🐛 Known Limitations
- Analysis requires a network round-trip; airplane-mode users can view saved hunts but cannot run new analyses.
- Pixel-only uploaded images cannot be retrofitted with GPS in 1.0 (calibration is a future feature).
- Weather auto-fill is gated to Core / Pro; Trial users enter conditions manually.
- The interactive in-app map needs MapTiler tiles (network), but the analysis result and saved markers stay fully usable offline once captured.
- Re-running an analysis on the same hunt creates a fresh analysis record; we don't yet diff old-vs-new analyses.

---

## 📦 Migration Notes
This is the initial public release — no migration is required.

For testers who used pre-release builds: existing accounts and hunts carry forward. The first time you open a hunt that was analyzed before the auto-persist hook landed, the AI overlays are automatically converted into Saved Markers for that hunt; no action required.

---

## 🙏 Credits & Sub-Processors

Raven Scout is built and operated by **Asgard Solutions LLC**. We rely on these third-party services to make it work:

- **OpenAI** — model inference (GPT-5.2 Vision).
- **RevenueCat** — subscription state on both iOS and Android.
- **MapTiler** — base map tiles.
- **WeatherAPI.com** — weather / wind auto-fill.
- **AWS S3** — Pro image storage.
- **MongoDB** — primary datastore.
- **Microsoft Graph** — transactional email delivery.

Full Privacy Policy and Terms of Service: **https://asgardsolution.io/raven-scout/privacy** · **https://asgardsolution.io/raven-scout/terms**.

User manual: **https://asgardsolution.io/raven-scout/user-manual**
Release notes: **https://asgardsolution.io/raven-scout/release-notes**
Support: **https://asgardsolution.io/raven-scout/support**
Data deletion: **https://asgardsolution.io/raven-scout/data-deletion**

---

## 📨 Feedback / Support
- App-side: **Profile → Request Data Deletion** opens an email to support.
- Direct: **support@asgardsolution.io** with device model, OS version, app version (Profile → About), and a description of what you tapped right before the issue.

---

## ⚠️ Decision-Support Disclaimer

Raven Scout is a **decision-support tool**, not a substitute for ground scouting, knowledge of local hunting law, or common sense. Every overlay and recommended setup is a *starting point* — verify legality, land ownership, posted boundaries, regulatory rules, and physical safety on your own before acting on any analysis. Raven Scout is not liable for missed shots, unrecovered game, trespass, regulatory enforcement, or injuries arising from any recommendation it produces.

---

*Forged in Asgard, Scouted in the Field.*
*© 2026 Asgard Solutions LLC*
