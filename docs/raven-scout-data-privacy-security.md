# Raven Scout — Data Privacy & Security

## What We Collect
- **Account**: email, optional display name, password hash (bcrypt) or Google OAuth subject id.
- **Hunt data**: species, weapon, method, date, time window, wind, GPS coordinates, uploaded map imagery, your overlay edits, and the AI analysis output.
- **Device telemetry**: platform (iOS / Android), OS version, app version, anonymous device id used for RevenueCat entitlements. We also log non-fatal client events (storage failures, upload retries) tied to your `user_id` for diagnostics.
- **Billing**: Apple / Google handle the payment instrument. We receive a subscription entitlement record from RevenueCat (tier + renewal date) — never a card number.

## What We Don't Collect
- Contacts, SMS, call logs, calendar.
- Background location — GPS is only read when you're actively creating a hunt.
- Advertising identifiers — there are no ads in Raven Scout.
- Your photo library beyond the specific images you pick for a hunt.

## Where Your Data Lives
- **Account + hunt metadata**: MongoDB.
- **Pro-tier map imagery**: a private, server-configured AWS S3 bucket. Delivery is via short-lived signed URLs — there is no public-internet access to the raw objects.
- **Core / Trial map imagery**: stays on your device only. Never uploaded.
- **Email for password reset**: sent via Microsoft Graph from `support@asgardsolution.io`.

## In Transit
- All API traffic is HTTPS (TLS).
- S3 PUT / GET use pre-signed URLs scoped to the exact `hunts/{userId}/{huntId}/…` key. Defaults: **upload presigns expire in 15 minutes, download presigns in 60 minutes** (configurable per environment).

## At Rest
- Passwords are salted + hashed with bcrypt — we never store plaintext.
- MongoDB and S3 storage encryption follow the providers' default at-rest encryption for the regions we deploy in.

## Access Controls
- Every API route that touches your data requires a valid session token.
- S3 keys are user-scoped — your tokens cannot generate a presign for another user's key.
- Cross-device sync is gated by `(user_id, hunt_id)` tuples.

## Orphan Cleanup
Any S3 object that was presigned but never committed to a saved hunt is cleaned up by an automated job + an in-app cleanup action. You don't pay for abandoned uploads.

## Account Deletion
Request via **Profile → Account → Delete account**. Deletion removes:
- Your MongoDB records.
- Your S3 objects under `hunts/{userId}/`.
- Your RevenueCat entitlement.

Active App Store / Play Store subscriptions must be cancelled separately in your store account.

## Third-Party Sub-Processors
- **OpenAI** — receives the compressed map imagery + your selections so it can produce the analysis output. See OpenAI's privacy policy.
- **RevenueCat** — subscription state.
- **MapTiler** — base map tiles (anonymous tile requests).
- **WeatherAPI.com** — weather / wind auto-fill (Core / Pro).
- **Microsoft Graph** — password-reset email delivery.
- **MongoDB** — database hosting.
- **AWS S3** — Pro image storage.

None of these see your password or your billing instrument.

## Contact
Questions, access requests, or deletion requests → **support@asgardsolution.io**.
