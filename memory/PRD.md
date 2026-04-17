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
