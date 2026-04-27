# EAS Production Android Build — Cheatsheet

Configuration is complete. To trigger the actual build, run from
`/app/frontend` on a workstation that has been `eas login`-ed:

```bash
cd /app/frontend

# One-time: make sure the EAS CLI is current.
npm install -g eas-cli

# Authenticate (interactive, opens browser).
eas login

# Trigger the production Android App Bundle build. All required
# `EXPO_PUBLIC_*` env vars (MapTiler key, RevenueCat key, backend URL,
# Google client id) are baked in via the `production` profile in
# /app/frontend/eas.json — no `--env` flags needed.
eas build --platform android --profile production
```

The `production` profile ships:

| key                            | value (from `eas.json`)                                  |
| ------------------------------ | -------------------------------------------------------- |
| `EXPO_PUBLIC_BACKEND_URL`      | `https://ravenscout-production.up.railway.app`           |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | `606163577844-…apps.googleusercontent.com`               |
| `EXPO_PUBLIC_MAPTILER_KEY`     | `NMVrJx7BZ7tb2WOy32d8`  ✅ baked in                       |
| `EXPO_PUBLIC_REVENUECAT_KEY`   | `test_…` ⚠ swap to live `appl_…` / `goog_…` before ship |

`buildType` is `app-bundle`, ready for Play Store submission via
`eas submit --platform android --profile production`.

## Pre-ship checklist for RevenueCat
Before flipping the live RC public key:

1. Create products in **Play Console → Monetize → Products**:
   - `core_monthly`, `core_annual`, `pro_monthly`, `pro_annual`
   - `ravenscout_extra_analytics_5`, `_10`, `_15` (managed products)
2. Mirror them in **App Store Connect → Subscriptions / In-App Purchases**.
3. In the **RevenueCat dashboard** wire each product to its
   entitlement (`core` / `pro`) and group them under an Offering
   identifier (e.g. `default`).
4. Replace `EXPO_PUBLIC_REVENUECAT_KEY` in the `production` profile of
   `eas.json` with the live public SDK key. Keep test keys for
   `preview` / `development` profiles.
5. Configure the RC server-to-server webhook to point to
   `POST /api/subscription/webhook` and
   `POST /api/purchases/revenuecat-webhook` (already implemented).
