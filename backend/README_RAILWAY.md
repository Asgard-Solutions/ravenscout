# Railway Deployment — Raven Scout Backend

This FastAPI service is deploy-ready for [Railway](https://railway.app).
Everything Emergent-specific has been abstracted away: LLM uses direct
OpenAI, auth uses direct Google OAuth, S3 uses your AWS creds.

## One-time setup

1. **Push this repo to GitHub** (use the "Save to GitHub" button in the
   Emergent chat interface).

2. **Create a Railway project** → "Deploy from GitHub repo" → select the
   repo.

3. **Set the service root directory** to `backend/` in Railway settings
   (so it picks up `backend/Procfile` / `backend/railway.json`).

4. **Copy environment variables** from `.env.railway.example` into
   Railway's **Variables** tab. The minimum required set to boot:
   - `MONGODB_URI`
   - `DB_NAME`
   - `OPENAI_API_KEY`
   - `GOOGLE_CLIENT_ID`

   Add the rest (S3, Weather, RevenueCat) as you need those features.

5. **Deploy.** Railway will:
   - Install from `requirements.txt`
   - Read the start command from `railway.json` (`uvicorn server:app --host 0.0.0.0 --port $PORT`)
   - Hit `GET /api/health` as the healthcheck

6. **Grab your public URL** from Railway → Settings → Domains. It
   looks like `https://raven-scout-api-production.up.railway.app`.

7. **Point your Expo EAS build at it** — set this as `EXPO_PUBLIC_BACKEND_URL`
   in your EAS env vars:
   ```bash
   eas secret:create --scope project --name EXPO_PUBLIC_BACKEND_URL \
     --value https://raven-scout-api-production.up.railway.app
   ```

## Google OAuth — what to configure in Google Cloud Console

The Expo app uses `@react-native-google-signin/google-signin` which does
native Google Sign-In and gets back an ID token signed for your
`GOOGLE_CLIENT_ID`. The backend verifies the token signature against
Google's JWKS and matches `aud == GOOGLE_CLIENT_ID`.

You need **three** OAuth clients in
[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials):

| Client Type | Used for | Package / Bundle |
| --- | --- | --- |
| **Web** | ID-token audience (what the backend verifies) | n/a |
| **iOS** | iOS native URL-scheme redirect | `com.asgardsolution.ravenscout` |
| **Android** | Android native flow (needs SHA-1 from EAS) | `com.asgardsolution.ravenscout` |

The **Web Client ID** is the `GOOGLE_CLIENT_ID` you set in Railway.

For the iOS/Android clients: once created, copy their client IDs into
`app.json` under the `@react-native-google-signin/google-signin` plugin
config (see `/app/frontend/app.json`). The Android client needs your
EAS build's SHA-1 fingerprint — run `eas credentials` and choose the
Android keystore to see it.

## Health check

```bash
curl https://YOUR-RAILWAY-URL/api/health
# {"status":"ok"}
```

## Verify Google OAuth is reachable

```bash
curl -X POST https://YOUR-RAILWAY-URL/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{"id_token":"bogus"}'
# Should return 401 {"detail":"Invalid Google credential"}
# (NOT 500. 500 means GOOGLE_CLIENT_ID isn't set.)
```

## Local dev remains unchanged

Your local Emergent preview keeps working because the service reads
`OPENAI_API_KEY` **or** `EMERGENT_LLM_KEY` — whichever is present.
Just don't set both on Railway; `OPENAI_API_KEY` is the only one that
works off-Emergent.
