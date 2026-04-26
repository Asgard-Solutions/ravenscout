"""
Live end-to-end verification of the orphan-S3 cleanup pipeline.

This test makes real HTTP calls against the running backend (uses
EXPO_PUBLIC_BACKEND_URL the same way the other Raven Scout API
tests do) and exercises the full presign → upload → commit/skip →
sweep flow against the real S3 bucket. It does NOT mock anything.

Skips when:
  - EXPO_PUBLIC_BACKEND_URL is not set (no live server)
  - The /media/health endpoint reports the bucket is unreachable
"""
import os
import time
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not set", allow_module_level=True)

AUTH = {"Authorization": "Bearer test_session_rs_001"}
TEST_UID = "test-user-001"


def _bucket_reachable() -> bool:
    try:
        r = requests.get(f"{BASE_URL}/api/media/health", headers=AUTH, timeout=5)
        return r.status_code == 200 and bool(r.json().get("ok"))
    except Exception:
        return False


if not _bucket_reachable():
    pytest.skip("S3 bucket not reachable from backend", allow_module_level=True)


def _mongo_db():
    """Direct Mongo handle — used to backdate pending rows since the
    sweep filters on a 15-minute floor."""
    from dotenv import load_dotenv
    from pymongo import MongoClient

    load_dotenv("/app/backend/.env")
    uri = os.environ.get("MONGO_URL") or os.environ["MONGODB_URI"]
    return MongoClient(uri)[os.environ.get("DB_NAME", "raven_scout")]


@pytest.fixture
def tiny_jpeg_bytes():
    """Smallest plausible JPEG payload — sufficient for HEAD/PUT."""
    from PIL import Image
    import io

    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color="red").save(buf, "JPEG")
    return buf.getvalue()


def _presign_and_put(image_id: str, hunt_id: str, body: bytes) -> str:
    """Round-trip the presign + PUT flow, return the storage key."""
    r = requests.post(
        f"{BASE_URL}/api/media/presign-upload",
        headers={**AUTH, "Content-Type": "application/json"},
        json={
            "imageId": image_id,
            "huntId": hunt_id,
            "role": "primary",
            "mime": "image/jpeg",
            "extension": "jpg",
        },
        timeout=10,
    )
    r.raise_for_status()
    j = r.json()
    put = requests.put(j["uploadUrl"], data=body, headers={"Content-Type": "image/jpeg"}, timeout=10)
    put.raise_for_status()
    return j["storageKey"]


def _save_hunt(hunt_id: str, keys: list[str]) -> None:
    r = requests.post(
        f"{BASE_URL}/api/hunts",
        headers={**AUTH, "Content-Type": "application/json"},
        json={"hunt_id": hunt_id, "metadata": {}, "image_s3_keys": keys},
        timeout=10,
    )
    r.raise_for_status()


def _delete_hunt(hunt_id: str) -> None:
    requests.delete(f"{BASE_URL}/api/hunts/{hunt_id}", headers=AUTH, timeout=10)


def _backdate_pending(uid: str, hours: int) -> int:
    db = _mongo_db()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    return db.pending_uploads.update_many(
        {"user_id": uid}, {"$set": {"created_at": cutoff}}
    ).modified_count


def _s3_head(key: str) -> bool:
    """Return True if the S3 object exists. Uses backend bucket via
    boto3 with backend's loaded credentials."""
    import boto3
    from dotenv import load_dotenv

    load_dotenv("/app/backend/.env")
    s3 = boto3.client("s3", region_name=os.environ["AWS_REGION"])
    try:
        s3.head_object(Bucket=os.environ["S3_BUCKET_NAME"], Key=key)
        return True
    except Exception:
        return False


def test_orphan_cleanup_sweeps_uncommitted_keys(tiny_jpeg_bytes):
    """
    1. Upload an orphan (no hunt save) and a committed key (with hunt save)
    2. Backdate pending rows >24h
    3. Run sweep
    4. Orphan must be gone from S3; committed key must remain
    """
    # Reset prior pending rows to keep counts predictable.
    db = _mongo_db()
    db.pending_uploads.delete_many({"user_id": TEST_UID})

    orphan_key = _presign_and_put("img_orphan_test", "hunt_orphan_neverSaved", tiny_jpeg_bytes)
    committed_hunt = f"hunt_orph_committed_{int(time.time())}"
    committed_key = _presign_and_put("img_committed_test", committed_hunt, tiny_jpeg_bytes)
    _save_hunt(committed_hunt, [committed_key])
    try:
        # Sanity: pending should now contain only the orphan (the
        # committed key was cleared by /api/hunts).
        rows = list(db.pending_uploads.find({"user_id": TEST_UID}))
        assert len(rows) == 1, f"expected 1 pending row, got {[r['s3_key'] for r in rows]}"
        assert rows[0]["s3_key"] == orphan_key

        # Default sweep (24h threshold) should NOT touch our fresh row.
        r = requests.post(
            f"{BASE_URL}/api/media/cleanup-orphans", headers=AUTH, timeout=10,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["scanned"] == 0
        assert body["deleted"] == 0

        # Backdate, then sweep — the orphan should now be deleted.
        backdated = _backdate_pending(TEST_UID, hours=25)
        assert backdated == 1
        r2 = requests.post(
            f"{BASE_URL}/api/media/cleanup-orphans", headers=AUTH, timeout=20,
        )
        assert r2.status_code == 200
        b = r2.json()
        assert b["scanned"] == 1
        assert b["deleted"] == 1
        assert b["failed"] == []

        # Verify final state in S3.
        assert _s3_head(orphan_key) is False, "orphan was NOT removed from S3"
        assert _s3_head(committed_key) is True, "committed object was wrongly removed"
    finally:
        # Cleanup the committed hunt (cascade also deletes its S3 object)
        _delete_hunt(committed_hunt)


def test_cleanup_endpoint_rejects_invalid_threshold():
    """`older_than_seconds` must be a parseable integer; floor is enforced server-side."""
    r = requests.post(
        f"{BASE_URL}/api/media/cleanup-orphans?older_than_seconds=notanumber",
        headers=AUTH, timeout=10,
    )
    assert r.status_code == 400


def test_cleanup_endpoint_floors_too_small_threshold():
    """A threshold under the 15-minute presign TTL must be floored, not rejected."""
    r = requests.post(
        f"{BASE_URL}/api/media/cleanup-orphans?older_than_seconds=10",
        headers=AUTH, timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    # Floor is 15 minutes (900s) — server should report exactly that.
    assert body["older_than_seconds"] == 900


def test_cleanup_endpoint_requires_pro():
    """Anonymous / non-Pro requests must be rejected. Hits /media/cleanup-orphans
    with no auth — should be 401."""
    r = requests.post(f"{BASE_URL}/api/media/cleanup-orphans", timeout=5)
    assert r.status_code in (401, 403)
