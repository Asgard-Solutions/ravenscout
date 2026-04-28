# Raven Scout — Data Privacy & Security

## What We Collect
- **Account**: email, optional display name, password hash (bcrypt) or Google OAuth subject id.
- **Hunt data**: species, weapon, method, date, time window, wind, GPS coordinates, uploaded map imagery, your overlay edits, and the AI analysis output.
- **Device telemetry**: platform (iOS / Android), OS version, app version, anonymous device id used for RevenueCat entitlements. We also log non-fatal client events (storage failures, upload retries) — these contain no PII beyond `user_id`.
- **Billing**: Apple / Google handle the card. We receive a subscription entitlement record from RevenueCat (tier + renewal date) — never a card number.

## What We Don't Collect
- Contacts, SMS, call logs, calendar.
- Background location — GPS is only read when you're actively creating a hunt.
- Advertising identifiers — there are no ads in Raven Scout.
- Your photo library beyond the specific images you pick for a hunt.

## Where Your Data Lives
- **Account + hunt metadata**: MongoDB Atlas (US region).
- **Pro-tier map imagery**: Private AWS S3 bucket `ravenscout-media-prod` in `us-east-2`. Delivery is via short-lived signed URLs — there is no public-internet access to the raw objects.
- **Core / Trial map imagery**: stays on your device only. Never uploaded.
- **Email for password reset**: sent via Microsoft Graph (Azure AD) from `support@asgardsolution.io`.

## In Transit
- All API traffic is HTTPS (TLS 1.2+).
- S3 PUT / GET uses pre-signed URLs; the signature is scoped to the exact `hunts/{userId}/{huntId}/…` key and expires in 15 minutes (upload) or 60 minutes (download).

## At Rest
- MongoDB Atlas — encrypted with AES-256 at the storage layer.
- AWS S3 — SSE-S3 (AES-256) on the bucket.
- Passwords are salted + hashed with bcrypt; we never store plaintext.

## Access Controls
- Every API route that touches your data requires a valid session token.
- Each S3 key is user-scoped — your tokens can never generate a presign for another user's key.
- Cross-device sync is read/write gated by `(user_id, hunt_id)` tuples in MongoDB.

## Orphan Cleanup
Any S3 object that was presigned but never committed to a saved hunt is automatically deleted 24 hours later (or sooner on-demand via the app's cloud-cleanup action). You never pay for abandoned uploads.

## Account Deletion
Request via **Profile → Account → Delete account**. Within 30 days:
- Your MongoDB records are purged.
- All S3 objects under `hunts/{userId}/` are deleted.
- RevenueCat entitlement is revoked.
- Audit logs are retained for 90 days for fraud / abuse investigations, then fully deleted.

## Third-Party Sub-Processors
- **OpenAI** — sends the compressed map imagery + your selections; used only to produce the analysis output. See [OpenAI's privacy policy](https://openai.com/policies/privacy-policy).
- **RevenueCat** — subscription state.
- **MapTiler** — base map tiles (anonymous tile requests).
- **Microsoft Graph** — password-reset email delivery.
- **MongoDB Atlas** — database hosting.
- **AWS S3** — Pro image storage.

None of these see your password or your billing instrument.

## Contact
Questions, access requests, or deletion requests → **support@asgardsolution.io**.
