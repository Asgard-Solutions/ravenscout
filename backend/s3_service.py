"""Raven Scout — AWS S3 helper for Pro cloud media storage.

Generates pre-signed PUT / GET URLs so the mobile client can upload
compressed image bytes directly to S3 without proxying through the API.

Environment variables (all optional — cloud media is disabled when
core values are missing, and Pro saves transparently fall back to
device-local storage in that case):
    AWS_REGION
    AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY
    S3_BUCKET_NAME
    S3_PUBLIC_BASE_URL      # optional public origin (e.g. https://cdn.example.com)
    CLOUDFRONT_BASE_URL     # optional — wins over S3_PUBLIC_BASE_URL when set
    S3_PRESIGN_UPLOAD_TTL   # optional override in seconds (default 900)
    S3_PRESIGN_DOWNLOAD_TTL # optional override in seconds (default 3600)
"""

import os
import re
from typing import Optional, Tuple

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

_client = None
_loaded = False
_ready = False

# ----- key sanitization ---------------------------------------------------

_SAFE_SEG = re.compile(r"[^A-Za-z0-9._-]+")


def _safe(segment: str, fallback: str = "_") -> str:
    if not segment:
        return fallback
    cleaned = _SAFE_SEG.sub("_", segment).strip("._-")
    return cleaned or fallback


def build_storage_key(
    user_id: str,
    hunt_id: Optional[str],
    role: str,
    image_id: str,
    extension: str,
) -> str:
    """Deterministic, debuggable S3 object key.

    Pattern: hunts/{userId}/{huntId}/{role}/{imageId}.{ext}
    """
    ext = (extension or "jpg").lstrip(".").lower()
    ext = _safe(ext, "jpg")
    u = _safe(user_id, "anon")
    # `_unassigned` is a literal sentinel for hunts that don't have an
    # id yet (the user is still on the upload screen). _safe() would
    # otherwise strip the leading underscore — short-circuit so the
    # path matches what's documented in AWS_S3_SETUP.md.
    h = "_unassigned" if not hunt_id else _safe(hunt_id)
    r = _safe(role or "primary", "primary")
    i = _safe(image_id, "img")
    return f"hunts/{u}/{h}/{r}/{i}.{ext}"


# ----- configuration ------------------------------------------------------


def _ensure_loaded() -> None:
    global _client, _loaded, _ready
    if _loaded:
        return
    _loaded = True

    region = os.environ.get("AWS_REGION")
    bucket = os.environ.get("S3_BUCKET_NAME")
    if not (region and bucket):
        return  # stays not-ready

    kwargs = {
        "region_name": region,
        "config": Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    }
    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
    if access_key and secret_key:
        kwargs["aws_access_key_id"] = access_key
        kwargs["aws_secret_access_key"] = secret_key

    _client = boto3.client("s3", **kwargs)
    _ready = True


def is_configured() -> bool:
    _ensure_loaded()
    return _ready


def get_bucket() -> Optional[str]:
    return os.environ.get("S3_BUCKET_NAME")


def get_region() -> Optional[str]:
    return os.environ.get("AWS_REGION")


def _public_base_url() -> Optional[str]:
    base = os.environ.get("CLOUDFRONT_BASE_URL") or os.environ.get("S3_PUBLIC_BASE_URL")
    return base.rstrip("/") if base else None


def is_private_delivery() -> bool:
    """True when assets are NOT directly addressable over the internet.

    If a public base URL is configured (CloudFront or S3 website/public
    bucket) we treat delivery as public and the mobile client can use
    the asset URL directly. Otherwise delivery is private and the
    client must request a signed GET URL via `/api/media/presign-download`.
    """
    return _public_base_url() is None


def build_asset_url(key: str) -> str:
    """Returns the URL used for direct asset access.

    For private buckets the caller must prefer signed-download URLs for
    actual fetches; this value is persisted primarily for debugging
    and for public/CDN deployments.
    """
    base = _public_base_url()
    if base:
        return f"{base}/{key}"
    region = get_region() or "us-east-1"
    bucket = get_bucket()
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


def _upload_ttl() -> int:
    try:
        return int(os.environ.get("S3_PRESIGN_UPLOAD_TTL", "900"))
    except Exception:
        return 900


def _download_ttl() -> int:
    try:
        return int(os.environ.get("S3_PRESIGN_DOWNLOAD_TTL", "3600"))
    except Exception:
        return 3600


# ----- presigned operations ----------------------------------------------


def presign_upload(key: str, mime: str) -> Tuple[str, str, int]:
    """Return (uploadUrl, assetUrl, expiresIn)."""
    _ensure_loaded()
    if not _ready:
        raise RuntimeError("S3 not configured")
    ttl = _upload_ttl()
    upload_url = _client.generate_presigned_url(  # type: ignore[union-attr]
        ClientMethod="put_object",
        Params={
            "Bucket": get_bucket(),
            "Key": key,
            "ContentType": mime or "image/jpeg",
        },
        ExpiresIn=ttl,
        HttpMethod="PUT",
    )
    return upload_url, build_asset_url(key), ttl


def presign_download(key: str) -> Tuple[str, int]:
    _ensure_loaded()
    if not _ready:
        raise RuntimeError("S3 not configured")
    ttl = _download_ttl()
    download_url = _client.generate_presigned_url(  # type: ignore[union-attr]
        ClientMethod="get_object",
        Params={"Bucket": get_bucket(), "Key": key},
        ExpiresIn=ttl,
        HttpMethod="GET",
    )
    return download_url, ttl


def delete_object(key: str) -> bool:
    """Attempt to delete a single object. Returns True on 2xx/absent."""
    _ensure_loaded()
    if not _ready:
        return False
    try:
        _client.delete_object(Bucket=get_bucket(), Key=key)  # type: ignore[union-attr]
        return True
    except (BotoCoreError, ClientError):
        return False
