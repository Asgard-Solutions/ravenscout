"""
Test DELETE /api/hunts/{hunt_id} cascade behavior.
Validates: auth, authorization, S3+Mongo cascade, idempotency, cross-user safety.
"""
import os
import sys
import json
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env", override=False)

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tactical-gps-picker.preview.emergentagent.com")
API = f"{BASE_URL}/api"

PRO_TOKEN = "test_session_rs_001"
PRO_UID = "test-user-001"
TRIAL_TOKEN = "test_session_trial_001"
TRIAL_UID = "test-user-trial"

PASS = []
FAIL = []


def assert_eq(label, actual, expected):
    ok = actual == expected
    msg = f"{'PASS' if ok else 'FAIL'} {label}: got={actual!r} expected={expected!r}"
    print(msg)
    (PASS if ok else FAIL).append(msg)
    return ok


def assert_true(label, cond, info=""):
    msg = f"{'PASS' if cond else 'FAIL'} {label} {info}"
    print(msg)
    (PASS if cond else FAIL).append(msg)
    return cond


def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# -------- DB helpers (seed hunts directly in Mongo) ---------
async def seed_hunt(user_id: str, hunt_id: str, image_s3_keys):
    client = AsyncIOMotorClient(os.environ["MONGODB_URI"])
    db = client[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_id,
        "hunt_id": hunt_id,
        "metadata": {"species": "deer", "speciesName": "Whitetail Deer", "date": "2026-02-15"},
        "analysis": {"summary": "test", "overlays": []},
        "analysis_context": {"prompt_version": "v2"},
        "media_refs": [],
        "primary_media_ref": None,
        "image_s3_keys": image_s3_keys,
        "storage_strategy": "local-first",
        "extra": {},
        "created_at": now,
        "updated_at": now,
    }
    await db.hunts.replace_one({"user_id": user_id, "hunt_id": hunt_id}, doc, upsert=True)
    client.close()


async def get_hunt_doc(user_id: str, hunt_id: str):
    client = AsyncIOMotorClient(os.environ["MONGODB_URI"])
    db = client[os.environ["DB_NAME"]]
    doc = await db.hunts.find_one({"user_id": user_id, "hunt_id": hunt_id}, {"_id": 0})
    client.close()
    return doc


async def cleanup_hunt(user_id: str, hunt_id: str):
    client = AsyncIOMotorClient(os.environ["MONGODB_URI"])
    db = client[os.environ["DB_NAME"]]
    await db.hunts.delete_one({"user_id": user_id, "hunt_id": hunt_id})
    client.close()


def new_hid(prefix="rs-del"):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def section(title):
    print(f"\n{'='*70}\n{title}\n{'='*70}")


# ============================================================
# TEST 1 — Auth: 401 without bearer
# ============================================================
def test_no_auth():
    section("TEST 1 — Auth (401 without Bearer)")
    hid = new_hid()
    r = requests.delete(f"{API}/hunts/{hid}")
    assert_eq("DELETE without auth -> 401", r.status_code, 401)


# ============================================================
# TEST 2 — Cross-user authorization: 404 not 200
# ============================================================
async def test_cross_user_unauthorized():
    section("TEST 2 — Cross-user delete -> 404 (not 200)")
    hid = new_hid("rs-trial")
    await seed_hunt(TRIAL_UID, hid, [])
    # Pro user tries to delete trial user's hunt
    r = requests.delete(f"{API}/hunts/{hid}", headers=auth(PRO_TOKEN))
    assert_eq("Pro deleting trial user's hunt -> 404", r.status_code, 404)
    if r.status_code == 404:
        try:
            assert_eq("404 detail", r.json().get("detail"), "Hunt not found")
        except Exception:
            pass
    # Verify trial user's hunt is still intact
    doc = await get_hunt_doc(TRIAL_UID, hid)
    assert_true("Trial user's hunt still intact after cross-user attempt", doc is not None)
    await cleanup_hunt(TRIAL_UID, hid)


# ============================================================
# TEST 3 — Happy path with no S3 keys
# ============================================================
async def test_no_s3_keys():
    section("TEST 3 — Happy path (no S3 keys)")
    hid = new_hid()
    await seed_hunt(PRO_UID, hid, [])
    r = requests.delete(f"{API}/hunts/{hid}", headers=auth(PRO_TOKEN))
    assert_eq("DELETE -> 200", r.status_code, 200)
    if r.status_code == 200:
        body = r.json()
        print(f"   body: {json.dumps(body, indent=2)}")
        assert_eq("ok=true", body.get("ok"), True)
        assert_eq("deleted=1", body.get("deleted"), 1)
        s3 = body.get("s3", {})
        assert_eq("s3.requested=0", s3.get("requested"), 0)
        assert_eq("s3.deleted=0", s3.get("deleted"), 0)
        assert_eq("s3.failed=[]", s3.get("failed"), [])
    # Verify Mongo doc is gone
    doc = await get_hunt_doc(PRO_UID, hid)
    assert_true("Mongo hunt doc is gone after DELETE", doc is None)


# ============================================================
# TEST 4 — Happy path with S3 keys (best-effort)
# ============================================================
async def test_with_s3_keys():
    section("TEST 4 — Happy path with S3 keys (best-effort)")
    hid = new_hid()
    keys = [
        f"users/{PRO_UID}/hunts/{hid}/img1.jpg",
        f"users/{PRO_UID}/hunts/{hid}/img2.jpg",
    ]
    await seed_hunt(PRO_UID, hid, keys)
    r = requests.delete(f"{API}/hunts/{hid}", headers=auth(PRO_TOKEN))
    assert_eq("DELETE -> 200", r.status_code, 200)
    if r.status_code == 200:
        body = r.json()
        print(f"   body: {json.dumps(body, indent=2)}")
        assert_eq("ok=true", body.get("ok"), True)
        assert_eq("Mongo deleted=1", body.get("deleted"), 1)
        s3 = body.get("s3", {})
        assert_eq("s3.requested=2", s3.get("requested"), 2)
        deleted = s3.get("deleted", -1)
        assert_true("s3.deleted is in [0,2]", isinstance(deleted, int) and 0 <= deleted <= 2,
                    f"got {deleted}")
        assert_true("s3.failed is a list", isinstance(s3.get("failed"), list),
                    f"got {type(s3.get('failed'))}")
        # invariant: requested == deleted + failed
        failed_n = len(s3.get("failed", []))
        assert_eq("requested == deleted + len(failed)",
                  s3.get("requested"), deleted + failed_n)
    # Verify Mongo doc is gone (cascade still happened)
    doc = await get_hunt_doc(PRO_UID, hid)
    assert_true("Mongo hunt doc is gone (cascade happened despite S3 outcome)", doc is None)


# ============================================================
# TEST 5 — Idempotency: second DELETE returns 404
# ============================================================
async def test_idempotency():
    section("TEST 5 — Idempotency (second DELETE -> 404)")
    hid = new_hid()
    await seed_hunt(PRO_UID, hid, [])
    r1 = requests.delete(f"{API}/hunts/{hid}", headers=auth(PRO_TOKEN))
    assert_eq("First DELETE -> 200", r1.status_code, 200)
    r2 = requests.delete(f"{API}/hunts/{hid}", headers=auth(PRO_TOKEN))
    assert_eq("Second DELETE -> 404", r2.status_code, 404)
    if r2.status_code == 404:
        try:
            assert_eq("404 detail = 'Hunt not found'", r2.json().get("detail"), "Hunt not found")
        except Exception:
            pass


# ============================================================
# TEST 6 — Cross-user safety with S3 keys
# ============================================================
async def test_cross_user_with_s3_keys():
    section("TEST 6 — Cross-user safety (foreign hunt + foreign keys preserved)")
    hid = new_hid("rs-trial")
    foreign_key = f"users/{TRIAL_UID}/hunts/abc/img.jpg"
    await seed_hunt(TRIAL_UID, hid, [foreign_key])
    # Pro user tries to delete trial user's hunt
    r = requests.delete(f"{API}/hunts/{hid}", headers=auth(PRO_TOKEN))
    assert_eq("Pro deleting trial's hunt -> 404", r.status_code, 404)
    # Trial user's hunt + key still intact
    doc = await get_hunt_doc(TRIAL_UID, hid)
    assert_true("Trial user's hunt doc still intact", doc is not None)
    if doc:
        assert_eq("Foreign s3 key still in image_s3_keys",
                  doc.get("image_s3_keys"), [foreign_key])
    await cleanup_hunt(TRIAL_UID, hid)


# ============================================================
# TEST 7 — Foreign S3 key inside an OWNED hunt
# ============================================================
async def test_foreign_key_in_owned_hunt():
    section("TEST 7 — Foreign S3 key inside owned hunt (skipped + reported)")
    hid = new_hid()
    foreign_key = f"users/{TRIAL_UID}/hunts/x/img.jpg"
    await seed_hunt(PRO_UID, hid, [foreign_key])
    r = requests.delete(f"{API}/hunts/{hid}", headers=auth(PRO_TOKEN))
    assert_eq("DELETE owned hunt -> 200", r.status_code, 200)
    if r.status_code == 200:
        body = r.json()
        print(f"   body: {json.dumps(body, indent=2)}")
        assert_eq("Mongo deleted=1", body.get("deleted"), 1)
        s3 = body.get("s3", {})
        assert_eq("s3.requested=1", s3.get("requested"), 1)
        assert_eq("s3.deleted=0 (foreign key skipped)", s3.get("deleted"), 0)
        failed = s3.get("failed", [])
        assert_true("foreign key reported in s3.failed",
                    foreign_key in failed, f"failed={failed}")
    # Mongo doc should still be gone
    doc = await get_hunt_doc(PRO_UID, hid)
    assert_true("Owned hunt's Mongo doc is gone", doc is None)


# ============================================================
async def main():
    test_no_auth()
    await test_cross_user_unauthorized()
    await test_no_s3_keys()
    await test_with_s3_keys()
    await test_idempotency()
    await test_cross_user_with_s3_keys()
    await test_foreign_key_in_owned_hunt()

    print(f"\n{'='*70}\nSUMMARY: {len(PASS)} pass, {len(FAIL)} fail\n{'='*70}")
    if FAIL:
        for f in FAIL:
            print("  ", f)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
