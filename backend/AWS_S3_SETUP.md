# Raven Scout — AWS S3 Image Upload Setup

This document describes the cloud media architecture and the
configuration the backend expects to find in its environment so
images uploaded by Pro users land in the production S3 bucket
**`ravenscout-media-prod`** (region **`us-east-2`**).

## Architecture (single-line)

```
Mobile app  ──[POST /api/media/presign-upload]──>  Backend
Backend     ──[boto3.generate_presigned_url]────>  AWS STS / S3
Mobile app  ──[HTTP PUT with presigned URL]─────>  S3 (direct)
Mobile app  ──[POST hunt with image_s3_keys]────>  Backend (Mongo)
Backend     ──[GET /api/media/presign-download]──>  Mobile app (private bucket)
```

Notes:

- AWS credentials never leave the backend.
- The bucket is private (`Block Public Access` enabled). Reads use
  short-lived presigned GET URLs.
- All uploads go directly client→S3 — no bytes proxied through
  FastAPI. The backend only mints URLs and stores keys.

## Required backend env vars

```
AWS_REGION=us-east-2
S3_BUCKET_NAME=ravenscout-media-prod
AWS_ACCESS_KEY_ID=AKIA...........        # 20 chars, starts with AKIA
AWS_SECRET_ACCESS_KEY=................    # 40 chars

# Optional — controls the *delivery* path
S3_PUBLIC_BASE_URL=                       # set ONLY if you proxy via a public origin
CLOUDFRONT_BASE_URL=                      # wins over S3_PUBLIC_BASE_URL when set
S3_PRESIGN_UPLOAD_TTL=900                 # default 15 min
S3_PRESIGN_DOWNLOAD_TTL=3600              # default 1 h
```

> **CRITICAL**: It is easy to accidentally swap `AWS_ACCESS_KEY_ID`
> and `AWS_SECRET_ACCESS_KEY`. The Access Key ID is **20 characters**
> and starts with `AKIA`; the Secret Access Key is **40 characters**.
> A swap silently makes presigned URLs return
> `InvalidAccessKeyId` from S3 even though `head_bucket` may appear
> to succeed (boto returns 403 instead of surfacing the real error).
> Always verify lengths before deploying.

## Required IAM policy

The backend's IAM user/role only needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RavenScoutObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::ravenscout-media-prod/*"
    }
  ]
}
```

We deliberately do NOT grant bucket-level actions
(`s3:ListBucket`, `s3:GetBucketCors`, `s3:GetBucketPublicAccessBlock`)
to keep the blast radius small. `head_bucket` will return 403 — that
is expected and not an error.

## Bucket configuration

- **Block Public Access**: ALL FOUR options enabled.
- **Default encryption**: SSE-S3 (or SSE-KMS if you prefer).
- **Versioning**: optional but recommended.
- **CORS** (so the mobile app's PUT can succeed):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

If you can pin AllowedOrigins to your real app domain(s) (web-only —
React Native HTTP doesn't enforce CORS), do so.

## Object key structure

```
hunts/{userId}/{huntId}/{role}/{imageId}.{ext}
```

Examples:

```
hunts/aff9dcecd3/2026-04-25_turkey-dawn/primary/img-001.jpg
hunts/aff9dcecd3/_unassigned/context/img-002.png
```

- All segments are sanitized: only `[A-Za-z0-9._-]`. Anything else
  is replaced with `_`.
- `huntId` falls back to `_unassigned` when the upload happens
  before a hunt id is assigned (e.g., the user is still on the
  upload screen).
- `role` is one of `primary`, `context`, `thumbnail`.
- Extension is always one of `jpg`, `png`, `webp`, `heic`, `heif`.

The owner guard `_guard_storage_key_owner` enforces the
`hunts/{userId}/...` shape on every read/delete so cross-user
access is impossible even if a stale key is replayed.

## Allowed MIME types

```
image/jpeg
image/png
image/webp
image/heic
image/heif
```

Anything else returns 400. The check is a strict allowlist (not a
prefix match) — `image/svg+xml`, `image/gif`, `image/tiff` are all
rejected.

## API surface

### `POST /api/media/presign-upload`

Auth: required (Pro tier).

Request:

```json
{
  "imageId": "img-001",
  "huntId": "h-2026-04-25-turkey-dawn",
  "role": "primary",
  "mime": "image/jpeg",
  "extension": "jpg"
}
```

Response:

```json
{
  "uploadUrl": "https://ravenscout-media-prod.s3.us-east-2.amazonaws.com/hunts/...?X-Amz-Algorithm=...",
  "assetUrl": "https://ravenscout-media-prod.s3.us-east-2.amazonaws.com/hunts/...",
  "storageKey": "hunts/.../primary/img-001.jpg",
  "expiresIn": 900,
  "privateDelivery": true,
  "mime": "image/jpeg"
}
```

Errors:

| Code | When |
|------|------|
| 401  | No / invalid bearer token |
| 403  | User is not Pro |
| 400  | Bad role / extension / mime |
| 503  | AWS env vars missing on the server |
| 500  | boto3 raised an unexpected error during signing |

### `POST /api/media/presign-download`

Auth: required (Pro tier). Body: `{ "storageKey": "hunts/{me}/..." }`.
Returns `{ "downloadUrl", "expiresIn" }`. The owner guard rejects keys
that don't belong to the caller.

### `POST /api/media/delete`

Auth: required (Pro tier). Body: `{ "storageKey": "hunts/{me}/..." }`.
Returns `{ "success": true|false }`. Idempotent.

### `DELETE /api/hunts/{hunt_id}` (cascade)

Reads `image_s3_keys` from the hunt doc, deletes each S3 object
(best-effort, owner-guarded), then deletes the Mongo doc. Response:

```json
{
  "ok": true,
  "deleted": 1,
  "s3": { "requested": 2, "deleted": 2, "failed": [] }
}
```

## Mobile-side flow (CloudMediaStore)

1. Client compresses the image (`imageProcessor.ts`) → base64.
2. Writes a temp file to `cacheDirectory/raven-media-upload/`.
3. Calls `requestPresignUpload(...)` (cloudPresignClient).
4. `FileSystem.uploadAsync(uploadUrl, tempFile, {httpMethod: PUT, headers: {Content-Type: mime}})`.
5. Deletes the temp file. Returns a `MediaAsset` stamped with
   `storageType='cloud'`, `storageKey`, and (private) `assetUrl`.
6. **Fallback**: any failure in step 3–4 falls back to local-file
   storage with `pendingCloudSync=true` so the asset still works
   offline and the upload can be retried later.

When a hunt is saved, the `image_s3_keys` are passed to the backend
in the hunt POST so the server-side cascade can clean them up on
delete.

## Image analysis compatibility

The analysis pipeline reads images from one of:

1. The local file URI when present (offline / pending-cloud-sync).
2. A presigned GET URL when only a cloud key is available.

The bucket never needs to be public for analysis to work.

## Manual verification

```bash
# Inside the backend container:
cd /app/backend && python3 -c "
import os, base64, requests
from dotenv import load_dotenv; load_dotenv()
import s3_service

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
key = s3_service.build_storage_key('test-user-001', 'verify', 'primary', 'check', 'png')
upload, asset, ttl = s3_service.presign_upload(key, 'image/png')
r = requests.put(upload, data=PNG, headers={'Content-Type': 'image/png'})
assert r.status_code == 200, r.text
dl, _ = s3_service.presign_download(key)
assert requests.get(dl).content == PNG
assert s3_service.delete_object(key)
print('S3 round-trip OK against', os.environ['S3_BUCKET_NAME'])
"
```

You should see `S3 round-trip OK against ravenscout-media-prod`.
