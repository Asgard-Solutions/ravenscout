# Raven Scout — Data Sources & Connections

A quick map of every external service Raven Scout talks to, what it sends, and why.

## Core AI Analysis
- **OpenAI (GPT-5.2 Vision)** — the AI analyst.
  - Sent: your compressed map imagery (JPEG), the species / weapon / method / GPS / hunt-date / wind selections, and a constrained JSON response schema.
  - Received: overlays, top setups, written tactical brief.
  - Purpose: produce the analysis.

## Maps
- **MapTiler** — base map tiles for the interactive map.
  - Sent: anonymous tile requests (z/x/y + API key).
  - Received: map tiles.
  - Purpose: rendering your location and your drawn waypoints.

## Weather
- **WeatherAPI.com** — forecast snapshot at your hunt's GPS and date.
  - Sent: latitude, longitude, date.
  - Received: wind direction + speed, temperature, precipitation, cloud cover.
  - Purpose: auto-fill the hunt's wind / weather fields. You can override any field manually.

## Cloud Storage (Pro tier only)
- **AWS S3 (us-east-2, bucket `ravenscout-media-prod`, private)** — your full-resolution map images.
  - Sent: pre-signed PUT upload (from device to S3 directly; the server never holds the bytes).
  - Received: pre-signed GET on demand when you open a saved hunt.
  - Purpose: cross-device hunt backup and fresh-signed streaming on resume.

## Account Database
- **MongoDB Atlas** — account, hunt metadata, overlay edits, entitlement state.
  - Purpose: source of truth for the read API (`GET /api/hunts`) and cross-device sync.

## Auth
- **Google OAuth (Sign in with Google)** — optional sign-in method.
  - Sent: ID token (exchanged server-side for profile email + subject).
  - Purpose: one-tap sign-in.
- **Microsoft Graph (Azure AD)** — password reset email delivery.
  - Sent: recipient email and the 6-digit OTP body.
  - Purpose: transactional emails only (no marketing).

## Subscriptions
- **RevenueCat** — wraps App Store + Google Play subscription state.
  - Sent: anonymous device id, store receipt.
  - Received: entitlement = `trial | core | pro`, renewal date.
  - Purpose: unlock the right tier across iOS and Android from a single source of truth.

## Diagnostics
- **Raven Scout client-event sink** (our own backend) — best-effort telemetry for storage failures and cloud-upload retries.
  - Sent: event name, hunt id, error code, platform, app version.
  - Never sent: any map image bytes, your GPS, your subscription info, or any PII.
  - Purpose: detect app-level regressions.

## What Is NOT Used
Raven Scout does NOT integrate with: Facebook / Meta SDK, Firebase Analytics, Google Analytics, Mixpanel, AppsFlyer, Adjust, or any ad network. No third party sees your hunt data.
