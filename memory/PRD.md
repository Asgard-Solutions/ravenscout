# Raven Scout - Product Requirements Document

## Overview
Raven Scout is a mobile hunting planning application that uses GPT-5.2 Vision AI to analyze map screenshots and provide tactical hunting setup recommendations. It helps hunters with stand/blind placement, access routes, and movement corridor identification.

## Architecture
- **Frontend**: Expo React Native (SDK 54) with file-based routing
- **Backend**: FastAPI (Python) with GPT-5.2 Vision integration
- **AI**: OpenAI GPT-5.2 via emergentintegrations library (Emergent LLM Key)
- **Storage**: Local device storage via AsyncStorage (no cloud storage for MVP)
- **Database**: MongoDB (for future expansion, not used in MVP)

## Design System: Asgard Tactical
- **Primary**: Midnight Blue `#0B1F2A` (base background)
- **Secondary**: Steel Gray `#3A4A52` (panels, cards)
- **Accent**: Burnt Gold `#C89B3C` (CTAs, highlights)
- **Overlays**: Green `#2E7D32` (stands), Orange `#F57C00` (corridors), Blue `#42A5F5` (routes), Red `#C62828` (avoid)
- Dark-first design, glove-friendly (48px+ touch targets), map-first UI

## Screens
1. **Home** (`/`) - Branding, New Hunt CTA, Saved Hunts, Capabilities grid
2. **Setup** (`/setup`) - 4-step wizard: Species → Map Upload → Conditions → Review
3. **Results** (`/results`) - Map with overlay markers, summary, top setups, wind notes
4. **History** (`/history`) - Saved hunt plans with delete/clear functionality

## API Endpoints
- `GET /api/` - API info
- `GET /api/health` - Health check
- `GET /api/species` - Species data (deer, turkey, hog)
- `POST /api/analyze-hunt` - AI map analysis (accepts base64 image + conditions)

## Species Support
- **Whitetail Deer**: Bedding-to-feeding transitions, funnels, saddles, edges
- **Wild Turkey**: Roost-to-strut zones, open areas near cover
- **Wild Hog**: Water, thick cover, trails, dusk/dawn ambush points

## MVP Status
- [x] Home screen with tactical branding
- [x] Hunt setup wizard (4 steps)
- [x] Species selection (deer, turkey, hog)
- [x] Map image upload via device gallery
- [x] Conditions input (wind, time, temperature, precipitation, property type)
- [x] AI analysis via GPT-5.2 Vision
- [x] Overlay results on map (stands, corridors, routes, avoid zones)
- [x] Results summary with top setups, wind notes, species tips
- [x] Local device storage for hunt plans
- [x] Hunt history with delete functionality
- [x] Asgard Tactical design system implemented

## Phase 2 Features (Implemented)
- [x] Editable Overlays: drag/reposition markers, add custom markers (8 types: stand, corridor, access_route, avoid, bedding, food, water, trail), delete overlays, save changes
- [x] Multi-Map Uploads: up to 5 maps per hunt, swipeable viewer with map tabs, overlays shown on all maps
- [x] Offline Scouting Mode: network detection (expo-network), offline banners, disabled analyze when offline, SAVED badge on history cards, all data viewable offline via AsyncStorage

## Phase 3 Features (Implemented)
- [x] Real-Time Weather Sync: WeatherAPI.com integration via backend POST /api/weather
  - GPS location detection (expo-location) or manual pin
  - Time-aware hourly forecast averaging (morning 5-12, evening 12-20, all-day 5-20)
  - Auto-fill fields with "Auto" labels: wind direction, wind speed, temperature, precipitation, cloud cover
  - Manual override: editing any field switches to "Manual" label
  - Refresh Weather button, offline fallback with cached data
  - Weather card with condition, sunrise/sunset, humidity
  - Location stored with hunt record

## Phase 4: MapLibre + OSM (Implemented)
- [x] MapLibre GL JS base map via WebView (CartoDB Dark Matter tiles, free, no API key)
- [x] Provider-agnostic architecture (`src/map/MapProvider.ts`) — swap to Mapbox later
- [x] 3-layer separation: base map (MapLibre), overlay rendering (React Native), image analysis (percentage-based)
- [x] Results screen dual-tab: MAP (interactive MapLibre base map) | ANALYSIS (uploaded image + AI overlays)
- [x] Dark tactical styling, pan/zoom, compass control
- [x] No Google Maps, no Mapbox, no routing, no recurring API cost
- [x] Limitations: WebView rendering (not native), no satellite imagery in MVP, no lat/lon conversion for AI overlays
- [x] Future Mapbox support: update ACTIVE_PROVIDER in MapProvider.ts, add access token, use Mapbox style URL

## Phase 5: Auth + Subscriptions (Implemented)
- [x] Emergent-managed Google Auth (OAuth) with session tokens (7-day expiry)
- [x] User model in MongoDB: user_id, email, tier, analysis_count, billing_cycle_start, rollover
- [x] 3 subscription tiers: Trial (free, 3 lifetime), Core ($7.99/mo, 10/month), Pro ($14.99/mo, 100/month)
- [x] Server-side usage enforcement (never trust client)
- [x] Weather API gated to Core+ tiers (trial users get manual-only)
- [x] Rollover support (unused analyses carry over 1 month, capped at tier limit)
- [x] RevenueCat integration ready (preview mode in Expo Go, real purchases in production build)
- [x] RevenueCat real SDK wiring — `Purchases.purchaseProduct()` for tier upgrades and extra-credit packs, `Purchases.restorePurchases()` driving real entitlement sync via `/api/subscription/sync-revenuecat`. Defensive wrapper in `src/lib/purchases.ts` degrades gracefully on Expo Go / web.
- [x] RevenueCat webhook endpoint for server-to-server subscription events
- [x] Enhanced species prompt framework — additive sub-package `species_prompts/enhanced/` shipping behavior (PressureLevel/TerrainType/EnvironmentalTrigger/EnhancedBehaviorPattern), access analysis (stealth ranking, terrain alternatives), enhanced regional modifiers (South Texas / Colorado High Country / Midwest Agricultural / Pacific NW), and a master prompt builder with cross-module reasoning. Wired into `prompt_builder.assemble_system_prompt` via `use_enhanced_*` kwargs (OFF by default; legacy prompt unchanged when disabled). Whitetail integration example + Turkey light pass + 25 passing pytest cases.
- [x] Enhanced species prompt rollout layer — `/app/backend/enhanced_rollout.py` provides centralized control plane (kill switch via `ENHANCED_ROLLOUT_KILL_SWITCH=off`, allowlist-based species/region/tier gating, per-tier module selection). Default posture: Pro full-stack + Core behaviour-only, whitetail-only, midwest_agricultural-only. Wired into `/api/analyze-hunt` so the rollout decision is automatic per request, structured-logged for analytics, and exposed on the response under `result.meta.enhanced_analysis`. Live validated end-to-end with Iowa GPS Pro user receiving all three modules. 37 passing pytest cases.
- [x] Orphan S3 media cleanup wired end-to-end — `POST /api/media/cleanup-orphans` now triggered by both (a) silent fire-and-forget on app launch for Pro users (6h floor, AsyncStorage-backed, never alerts) and (b) a manual "Clean Up Orphaned Uploads" button in a Pro-tier-only CLOUD STORAGE card on Profile.
- [x] Login screen with Google sign-in, auth-gated home screen
- [x] Usage bar on home screen showing remaining analyses
- [x] Subscription/paywall screen with tier cards, billing toggle (monthly/annual), savings display
- [x] Logout, session management, auto-redirect to login when unauthenticated
