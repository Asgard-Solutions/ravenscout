# Raven Scout — Pro Cloud Media Storage (AWS S3)

Status: **Implemented** (replaces the prior CloudMediaStore stub).

## Overview

Pro users' map images are uploaded **directly from device to AWS S3**
using a short-lived pre-signed PUT URL minted by the backend. The
mobile app never sees AWS credentials; the backend never proxies
image bytes.

Core / Free users continue to store everything on device via
`FileSystemMediaStore`. That path was not modified.

## Upload flow (mobile → backend → S3)

```
  ┌──────────────┐   1) POST /api/media/presign-upload    ┌───────────┐
  │  CloudMedia  │──────────────────────────────────────▶│  Backend  │
  │   Store      │◀──── { uploadUrl, assetUrl, key } ────│  (s3_svc) │
  └──────┬───────┘                                       └───────────┘
         │                                                      │
         │ 2) FileSystem.writeAsStringAsync (temp file)          │
         │                                                      │
         │ 3) FileSystem.uploadAsync  PUT to uploadUrl  ────────▶│ AWS S3 │
         │                                                      │
         │ 4) delete temp file; return MediaAsset               │
         │    { storageType:'cloud', uri:assetUrl, storageKey } │
```

Mobile code: `src/media/adapters/CloudMediaStore.ts`.
Backend presign: `backend/s3_service.py` + `backend/server.py`
endpoints under `/api/media/*`.

## Storage key format

```
hunts/{userId}/{huntId}/{role}/{imageId}.{ext}
```

Examples:

```
hunts/user_868e51d0eb87/hunt_20260219T1204Z/primary/cloud_1708357456123_ab31ef20.jpg
hunts/user_868e51d0eb87/hunt_20260219T1204Z/thumbnail/cloud_1708357456345_8c02ff99.jpg
```

- All key components are sanitized server-side (`_safe(...)` strips
  anything outside `[A-Za-z0-9._-]`).
- Ownership is enforced on both `presign-download` and `delete` — the
  caller's `user_id` must match the first `hunts/{userId}/` segment.

## Backend endpoints

### `POST /api/media/presign-upload`

**Auth**: Bearer session token. **Tier**: Pro only (403 for others).

Request body:
```json
{
  "imageId": "cloud_1708_ab31",
  "huntId": "hunt_20260219T1204Z",
  "role": "primary" | "context" | "thumbnail",
  "mime": "image/jpeg",
  "extension": "jpg"
}
```

Response:
```json
{
  "uploadUrl": "https://{bucket}.s3.{region}.amazonaws.com/...?X-Amz-Signature=...",
  "assetUrl":  "https://{bucket}.s3.{region}.amazonaws.com/hunts/.../img.jpg",
  "storageKey": "hunts/{userId}/{huntId}/primary/cloud_1708_ab31.jpg",
  "expiresIn": 900,
  "privateDelivery": true,
  "mime": "image/jpeg"
}
```

Returns `503` if S3 env vars aren't configured — the mobile adapter
treats that as a cloud-unavailable error and falls back to local.

### `POST /api/media/presign-download`

Mints a short-lived signed GET URL for a private-bucket asset.
Returns `{ downloadUrl, expiresIn }`. Caller's `user_id` must match
the first segment of the storage key.

### `POST /api/media/delete`

Best-effort cloud delete of a single object. Returns
`{ success: true }` on 2xx/absent. Same ownership check.

## Environment variables (backend)

Add to `backend/.env` (already scaffolded with blank values):

| Var | Required | Purpose |
|---|---|---|
| `AWS_REGION` | yes | e.g. `us-east-1` |
| `S3_BUCKET_NAME` | yes | bucket where Pro media lands |
| `AWS_ACCESS_KEY_ID` | yes (unless IAM role) | IAM user with `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` |
| `AWS_SECRET_ACCESS_KEY` | yes (unless IAM role) | — |
| `S3_PUBLIC_BASE_URL` | optional | e.g. `https://cdn.example.com` — when set, delivery is treated as public |
| `CLOUDFRONT_BASE_URL` | optional | wins over `S3_PUBLIC_BASE_URL` when set |
| `S3_PRESIGN_UPLOAD_TTL` | optional | upload URL lifetime (default `900`) |
| `S3_PRESIGN_DOWNLOAD_TTL` | optional | download URL lifetime (default `3600`) |

When `AWS_REGION` / `S3_BUCKET_NAME` are missing the presign endpoint
returns `503` and the mobile client transparently falls back to local
storage with `pendingCloudSync: true`.

### Bucket expectations

- **Private bucket by default.** No public-read ACL required.
- CORS must allow the mobile app's origin for PUT (or use `*`):
  ```json
  [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["PUT", "GET"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": []
    }
  ]
  ```
- Recommended lifecycle rule: expire `hunts/*/thumbnail/*` after 180
  days to cap storage cost.

## Fallback behavior (Strategy B)

Implemented: **Temporary local fallback for Pro**.

When the upload pipeline fails at any step (presign non-200, S3 PUT
non-2xx, network offline, missing env config), the CloudMediaStore:

1. Leaves the temp file bytes in place on device.
2. Returns a `MediaAsset` stamped with:
   - `storageType: 'local-file'`
   - `uri:       <tempFileUri>`
   - `storageKey: <tempFileUri>`
   - `pendingCloudSync: true`
3. Emits a `persist_degraded` telemetry event with
   `reason: cloud_upload_failed | cloud_unavailable`.

The UI renders the asset normally — no session breakage, no crash.
A future background sync pass can iterate `pendingCloudSync` assets
and retry the upload. (That sync pass is NOT implemented in this
change; tracked as a P2 backlog item.)

## Mobile wiring

Nothing further is required in UI code — the existing
`saveMedia(...)` facade already consults the tier-aware storage
strategy resolver and now writes `CloudMediaStore` for Pro users
automatically.

Token plumbing: `CloudMediaStore` consults `cloudConfig.ts`, whose
default token provider reads `session_token` from AsyncStorage. No
additional initialization required on login.

## Testing

- Backend: hit `/api/media/presign-upload` with a real Pro session
  token; verify `503` is returned when S3 env vars are unset, and
  a valid pre-signed URL otherwise.
- Frontend unit tests: `yarn test:unit` — covers presign contract,
  auth wiring, fallback error paths. 73/73 passing.
- End-to-end on a real device: sign in as a Pro test user
  (`pjacobsen@asgardsolution.io` / `user_868e51d0eb87`), run an
  analysis with a map screenshot; `MediaAsset.storageType` should be
  `'cloud'` and the storage key visible in the bucket after save.

## Deferred / backlog

- Background retry pass for `pendingCloudSync` assets.
- Orphan cleanup (device-local leftovers whose hunt was deleted
  before upload succeeded).
- Multipart upload for >5 MB (the Pro compression profile caps at
  2048px / ~500-900 KB so this is not currently needed).
