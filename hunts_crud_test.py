"""
Backend test for /api/hunts CRUD endpoints + auth/ownership + regression.

Run:   python3 /app/hunts_crud_test.py
Tested against EXPO_PUBLIC_BACKEND_URL (preview URL). Uses the seeded
Pro session tokens documented in /app/memory/test_credentials.md plus
a second Pro user (test-user-002 / test_session_rs_002) seeded by the
testing harness via Mongo.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import uuid
from typing import Any, Dict, Optional

import requests


# Preview URL must come from frontend/.env EXPO_PUBLIC_BACKEND_URL.
BASE = "https://panorama-memory-fix.preview.emergentagent.com/api"

USER1_TOKEN = "test_session_rs_001"     # test-user-001, pro
USER2_TOKEN = "test_session_rs_002"     # test-user-002, pro
TRIAL_TOKEN = "test_session_trial_001"  # test-user-trial, trial (for regression)
BAD_TOKEN = "definitely-not-a-session"

# A tiny valid 10x10 PNG (red) as a data URI, used for the analyze-hunt
# regression smoke test.
_TINY_PNG_DATA_URI = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAHElEQVQoz2P8z8AARMQAxlHN"
    "o5pHNY9qHtUMAAArEwH/A51vjQAAAABJRU5ErkJggg=="
)


PASSED = 0
FAILED = 0
FAILURES: list[str] = []


def _hdrs(token: Optional[str]) -> Dict[str, str]:
    h: Dict[str, str] = {"Content-Type": "application/json"}
    if token is not None:
        h["Authorization"] = f"Bearer {token}"
    return h


def _log(label: str, resp: requests.Response) -> None:
    try:
        body = resp.json()
    except Exception:
        body = resp.text
    snippet = json.dumps(body, default=str)[:600] if isinstance(body, (dict, list)) else str(body)[:600]
    print(f"  → {label}: {resp.status_code} {snippet}")


def assert_eq(label: str, got: Any, expected: Any) -> None:
    global PASSED, FAILED
    if got == expected:
        PASSED += 1
        print(f"  PASS {label}  (== {expected!r})")
    else:
        FAILED += 1
        FAILURES.append(f"{label}: expected {expected!r}, got {got!r}")
        print(f"  FAIL {label}: expected {expected!r}, got {got!r}")


def assert_true(label: str, cond: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  PASS {label}")
    else:
        FAILED += 1
        FAILURES.append(f"{label}: {detail}")
        print(f"  FAIL {label}: {detail}")


def sec(title: str) -> None:
    print("\n" + "=" * 8 + " " + title + " " + "=" * 8)


# ------------------------------------------------------------------
# 1) AUTH GATING
# ------------------------------------------------------------------
def test_auth_gating() -> None:
    sec("AUTH GATING — all 5 hunt routes must 401 without valid bearer")
    body = {"hunt_id": "auth-test-001", "metadata": {}}

    r = requests.post(f"{BASE}/hunts", json=body, headers={"Content-Type": "application/json"})
    _log("POST /hunts no-auth", r)
    assert_eq("POST /hunts no-auth", r.status_code, 401)

    r = requests.post(f"{BASE}/hunts", json=body, headers=_hdrs(BAD_TOKEN))
    _log("POST /hunts invalid token", r)
    assert_eq("POST /hunts invalid token", r.status_code, 401)

    r = requests.get(f"{BASE}/hunts", headers={"Content-Type": "application/json"})
    _log("GET /hunts no-auth", r)
    assert_eq("GET /hunts no-auth", r.status_code, 401)

    r = requests.get(f"{BASE}/hunts/xyz", headers={"Content-Type": "application/json"})
    _log("GET /hunts/{id} no-auth", r)
    assert_eq("GET /hunts/{id} no-auth", r.status_code, 401)

    r = requests.put(f"{BASE}/hunts/xyz", json={}, headers={"Content-Type": "application/json"})
    _log("PUT /hunts/{id} no-auth", r)
    assert_eq("PUT /hunts/{id} no-auth", r.status_code, 401)

    r = requests.delete(f"{BASE}/hunts/xyz", headers={"Content-Type": "application/json"})
    _log("DELETE /hunts/{id} no-auth", r)
    assert_eq("DELETE /hunts/{id} no-auth", r.status_code, 401)


# ------------------------------------------------------------------
# 2) POST upsert — create, read back, verify shape
# ------------------------------------------------------------------
def test_post_and_upsert_behavior() -> str:
    sec("POST /api/hunts — create + upsert idempotency")
    hunt_id = f"rs-test-{uuid.uuid4().hex[:10]}"

    payload_v1 = {
        "hunt_id": hunt_id,
        "metadata": {
            "species": "deer",
            "speciesName": "Whitetail Deer",
            "date": "2026-02-15",
            "timeWindow": "morning",
            "windDirection": "NW",
            "temperature": "38F",
            "propertyType": "private",
            "region": "East Texas",
            "huntStyle": "archery",
            "weatherData": {"wind_speed_mph": 6, "condition": "Clear"},
            "locationCoords": {"latitude": 31.2956, "longitude": -95.9778},
        },
        "analysis": {
            "summary": "Focus on the creek bottom funnel at first light.",
            "overlays": [
                {"type": "stand", "label": "Oak funnel", "x_percent": 42.3, "y_percent": 55.1,
                 "confidence": "high", "reasoning": "Pinch between bedding and soybean"},
            ],
            "top_setups": ["Hang-and-hunt the saddle NW of the creek."],
        },
        "analysis_context": {"prompt_version": "v2", "modelUsed": "gpt-5.2"},
        "media_refs": ["mem://local/hunt/img1.jpg"],
        "primary_media_ref": "mem://local/hunt/img1.jpg",
        "image_s3_keys": [],
        "storage_strategy": "local-first",
        "extra": {"clientBuild": "ios-1.2.0"},
    }

    print(f"  example POST body keys: {sorted(payload_v1.keys())}")
    r1 = requests.post(f"{BASE}/hunts", json=payload_v1, headers=_hdrs(USER1_TOKEN))
    _log("POST /hunts initial create", r1)
    assert_eq("POST create status", r1.status_code, 200)
    data1 = r1.json() if r1.status_code == 200 else {}
    assert_true("POST ok=true", data1.get("ok") is True, repr(data1))
    hunt1 = data1.get("hunt") or {}
    assert_eq("hunt.user_id == caller", hunt1.get("user_id"), "test-user-001")
    assert_eq("hunt.hunt_id echoed", hunt1.get("hunt_id"), hunt_id)
    assert_true("hunt.created_at ISO string", isinstance(hunt1.get("created_at"), str), repr(hunt1.get("created_at")))
    assert_true("hunt.updated_at ISO string", isinstance(hunt1.get("updated_at"), str), repr(hunt1.get("updated_at")))
    assert_eq("metadata.species preserved", (hunt1.get("metadata") or {}).get("species"), "deer")
    assert_true(
        "analysis.overlays preserved",
        ((hunt1.get("analysis") or {}).get("overlays") or [{}])[0].get("label") == "Oak funnel",
        repr(hunt1.get("analysis")),
    )

    created_at_v1 = hunt1.get("created_at")
    updated_at_v1 = hunt1.get("updated_at")

    # Idempotency: re-POST same hunt_id should KEEP created_at and BUMP updated_at
    time.sleep(1.1)  # ensure timestamp can differ
    payload_v2 = dict(payload_v1)
    payload_v2["analysis"] = {"summary": "Revised — focus on afternoon exit.", "overlays": []}
    payload_v2["metadata"] = {**payload_v1["metadata"], "timeWindow": "evening"}

    r2 = requests.post(f"{BASE}/hunts", json=payload_v2, headers=_hdrs(USER1_TOKEN))
    _log("POST /hunts re-upsert", r2)
    assert_eq("POST upsert status", r2.status_code, 200)
    hunt2 = (r2.json() or {}).get("hunt") or {}
    assert_eq("created_at stable across upsert", hunt2.get("created_at"), created_at_v1)
    assert_true(
        "updated_at bumped across upsert",
        hunt2.get("updated_at") and hunt2.get("updated_at") != updated_at_v1,
        f"was={updated_at_v1} now={hunt2.get('updated_at')}",
    )
    assert_eq(
        "upsert replaced analysis.summary",
        (hunt2.get("analysis") or {}).get("summary"),
        "Revised — focus on afternoon exit.",
    )
    assert_eq(
        "upsert replaced metadata.timeWindow",
        (hunt2.get("metadata") or {}).get("timeWindow"),
        "evening",
    )
    return hunt_id


# ------------------------------------------------------------------
# 3) POST validation (hunt_id length etc)
# ------------------------------------------------------------------
def test_post_validation() -> None:
    sec("POST /api/hunts validation")
    # hunt_id too short (<4)
    r = requests.post(f"{BASE}/hunts", json={"hunt_id": "abc", "metadata": {}}, headers=_hdrs(USER1_TOKEN))
    _log("POST hunt_id too short", r)
    assert_true("hunt_id<4 -> 4xx", 400 <= r.status_code < 500, f"got {r.status_code}")

    # hunt_id too long (>64)
    long_id = "x" * 65
    r = requests.post(f"{BASE}/hunts", json={"hunt_id": long_id, "metadata": {}}, headers=_hdrs(USER1_TOKEN))
    _log("POST hunt_id too long", r)
    assert_true("hunt_id>64 -> 4xx", 400 <= r.status_code < 500, f"got {r.status_code}")

    # metadata missing
    r = requests.post(f"{BASE}/hunts", json={"hunt_id": "ok-id-xyz"}, headers=_hdrs(USER1_TOKEN))
    _log("POST missing metadata", r)
    assert_true("missing metadata -> 4xx", 400 <= r.status_code < 500, f"got {r.status_code}")


# ------------------------------------------------------------------
# 4) GET list — pagination, sort, clamp
# ------------------------------------------------------------------
def test_list() -> None:
    sec("GET /api/hunts — list, pagination, clamp")
    r = requests.get(f"{BASE}/hunts", headers=_hdrs(USER1_TOKEN))
    _log("GET /hunts default", r)
    assert_eq("list status", r.status_code, 200)
    data = r.json() or {}
    assert_true("list ok=true", data.get("ok") is True, repr(data))
    assert_true("list.total is int", isinstance(data.get("total"), int), repr(data.get("total")))
    assert_eq("default limit", data.get("limit"), 50)
    assert_eq("default skip", data.get("skip"), 0)
    assert_true("hunts is list", isinstance(data.get("hunts"), list), repr(type(data.get("hunts"))))

    # Verify newest-first sort (if >=2 entries)
    hunts = data.get("hunts") or []
    if len(hunts) >= 2:
        ca = [h.get("created_at") for h in hunts if h.get("created_at")]
        assert_true("newest-first sort", all(ca[i] >= ca[i + 1] for i in range(len(ca) - 1)), repr(ca[:5]))

    # Invalid limits should clamp, not 400
    r = requests.get(f"{BASE}/hunts?limit=9999&skip=-5", headers=_hdrs(USER1_TOKEN))
    _log("GET /hunts clamp-extreme", r)
    assert_eq("clamp huge limit -> 200", r.status_code, 200)
    d = r.json() or {}
    assert_eq("clamp limit -> 200", d.get("limit"), 200)
    assert_eq("clamp skip -> 0", d.get("skip"), 0)

    r = requests.get(f"{BASE}/hunts?limit=0", headers=_hdrs(USER1_TOKEN))
    _log("GET /hunts limit=0", r)
    assert_eq("limit=0 clamps (200)", r.status_code, 200)
    assert_eq("limit=0 -> 1", (r.json() or {}).get("limit"), 1)


# ------------------------------------------------------------------
# 5) GET single — 200 for owner, 404 for others
# ------------------------------------------------------------------
def test_get_single_and_cross_user(hunt_id: str) -> None:
    sec("GET /api/hunts/{id} — owner vs cross-user")
    r = requests.get(f"{BASE}/hunts/{hunt_id}", headers=_hdrs(USER1_TOKEN))
    _log("GET own hunt", r)
    assert_eq("GET own -> 200", r.status_code, 200)
    d = r.json() or {}
    assert_true("GET ok=true", d.get("ok") is True, repr(d))
    assert_eq("GET hunt_id echoes", (d.get("hunt") or {}).get("hunt_id"), hunt_id)

    # Missing id
    r = requests.get(f"{BASE}/hunts/does-not-exist-xxxxx", headers=_hdrs(USER1_TOKEN))
    _log("GET missing id", r)
    assert_eq("missing -> 404", r.status_code, 404)

    # Cross-user access must look like "not found"
    r = requests.get(f"{BASE}/hunts/{hunt_id}", headers=_hdrs(USER2_TOKEN))
    _log("GET other-user hunt as user2", r)
    assert_eq("cross-user GET -> 404", r.status_code, 404)


# ------------------------------------------------------------------
# 6) Compound uniqueness — two users can share hunt_id
# ------------------------------------------------------------------
def test_compound_uniqueness() -> None:
    sec("Compound uniqueness — (user_id, hunt_id) must be independent")
    shared_id = f"shared-{uuid.uuid4().hex[:8]}"
    body1 = {"hunt_id": shared_id, "metadata": {"speciesName": "User1 deer"}}
    body2 = {"hunt_id": shared_id, "metadata": {"speciesName": "User2 turkey"}}

    r1 = requests.post(f"{BASE}/hunts", json=body1, headers=_hdrs(USER1_TOKEN))
    _log("POST shared id as user1", r1)
    assert_eq("user1 POST -> 200", r1.status_code, 200)

    r2 = requests.post(f"{BASE}/hunts", json=body2, headers=_hdrs(USER2_TOKEN))
    _log("POST shared id as user2", r2)
    assert_eq("user2 POST same id -> 200", r2.status_code, 200)

    # Confirm each user sees their own content under that id.
    r1g = requests.get(f"{BASE}/hunts/{shared_id}", headers=_hdrs(USER1_TOKEN))
    r2g = requests.get(f"{BASE}/hunts/{shared_id}", headers=_hdrs(USER2_TOKEN))
    assert_eq("user1 reads own shared id", r1g.status_code, 200)
    assert_eq("user2 reads own shared id", r2g.status_code, 200)
    m1 = ((r1g.json() or {}).get("hunt") or {}).get("metadata") or {}
    m2 = ((r2g.json() or {}).get("hunt") or {}).get("metadata") or {}
    assert_eq("user1 sees own speciesName", m1.get("speciesName"), "User1 deer")
    assert_eq("user2 sees own speciesName", m2.get("speciesName"), "User2 turkey")

    # Cleanup for test user2 so the DB doesn't accumulate
    requests.delete(f"{BASE}/hunts/{shared_id}", headers=_hdrs(USER2_TOKEN))
    requests.delete(f"{BASE}/hunts/{shared_id}", headers=_hdrs(USER1_TOKEN))


# ------------------------------------------------------------------
# 7) PUT partial patch
# ------------------------------------------------------------------
def test_put_patch(hunt_id: str) -> None:
    sec("PUT /api/hunts/{id} — partial patch, updated_at bump, created_at stable")
    # Fetch current
    r = requests.get(f"{BASE}/hunts/{hunt_id}", headers=_hdrs(USER1_TOKEN))
    before = (r.json() or {}).get("hunt") or {}
    created_before = before.get("created_at")
    updated_before = before.get("updated_at")
    meta_before = before.get("metadata")

    time.sleep(1.1)
    patch = {"analysis": {"summary": "Patched only analysis", "overlays": [{"label": "Edited"}]}}
    r = requests.put(f"{BASE}/hunts/{hunt_id}", json=patch, headers=_hdrs(USER1_TOKEN))
    _log("PUT partial analysis", r)
    assert_eq("PUT -> 200", r.status_code, 200)
    d = (r.json() or {}).get("hunt") or {}
    assert_eq("PUT created_at stable", d.get("created_at"), created_before)
    assert_true("PUT updated_at bumped", d.get("updated_at") != updated_before,
                f"was={updated_before} now={d.get('updated_at')}")
    assert_eq("PUT analysis.summary applied", (d.get("analysis") or {}).get("summary"), "Patched only analysis")
    # metadata was NOT in the patch body, so it must remain untouched
    assert_eq("PUT metadata untouched", d.get("metadata"), meta_before)

    # PUT on non-existent hunt
    r = requests.put(f"{BASE}/hunts/no-such-hunt-xxx", json={"analysis": {}}, headers=_hdrs(USER1_TOKEN))
    _log("PUT nonexistent", r)
    assert_eq("PUT nonexistent -> 404", r.status_code, 404)

    # Cross-user PUT must appear as 404 (no data leak)
    r = requests.put(f"{BASE}/hunts/{hunt_id}", json={"analysis": {"summary": "evil"}}, headers=_hdrs(USER2_TOKEN))
    _log("PUT cross-user", r)
    assert_eq("cross-user PUT -> 404", r.status_code, 404)


# ------------------------------------------------------------------
# 8) DELETE
# ------------------------------------------------------------------
def test_delete(hunt_id: str) -> None:
    sec("DELETE /api/hunts/{id}")
    # Cross-user delete first (should NOT delete and MUST return 404)
    r = requests.delete(f"{BASE}/hunts/{hunt_id}", headers=_hdrs(USER2_TOKEN))
    _log("DELETE cross-user", r)
    assert_eq("cross-user DELETE -> 404", r.status_code, 404)

    # Confirm hunt still exists (no data leak / no cross-user mutation)
    r = requests.get(f"{BASE}/hunts/{hunt_id}", headers=_hdrs(USER1_TOKEN))
    assert_eq("owner still sees hunt after cross-user delete attempt", r.status_code, 200)

    # Owner delete
    r = requests.delete(f"{BASE}/hunts/{hunt_id}", headers=_hdrs(USER1_TOKEN))
    _log("DELETE owner", r)
    assert_eq("owner DELETE -> 200", r.status_code, 200)
    d = r.json() or {}
    assert_true("delete ok=true", d.get("ok") is True, repr(d))
    assert_eq("deleted == 1", d.get("deleted"), 1)

    # 404 after already-deleted
    r = requests.delete(f"{BASE}/hunts/{hunt_id}", headers=_hdrs(USER1_TOKEN))
    _log("DELETE again", r)
    assert_eq("second DELETE -> 404", r.status_code, 404)

    # And GET after delete
    r = requests.get(f"{BASE}/hunts/{hunt_id}", headers=_hdrs(USER1_TOKEN))
    assert_eq("GET after delete -> 404", r.status_code, 404)


# ------------------------------------------------------------------
# 9) Regression — existing endpoints still work
# ------------------------------------------------------------------
def test_regression() -> None:
    sec("REGRESSION — existing endpoints must still pass")

    r = requests.get(f"{BASE}/auth/me", headers=_hdrs(USER1_TOKEN))
    _log("GET /auth/me", r)
    assert_eq("/auth/me -> 200", r.status_code, 200)
    body = r.json() or {}
    assert_eq("/auth/me user_id", body.get("user_id"), "test-user-001")
    assert_eq("/auth/me tier", body.get("tier"), "pro")

    r = requests.get(f"{BASE}/subscription/tiers")
    _log("GET /subscription/tiers", r)
    assert_eq("/subscription/tiers -> 200", r.status_code, 200)
    tiers = (r.json() or {}).get("tiers") or {}
    assert_true(
        "tiers contains trial/core/pro",
        all(k in tiers for k in ("trial", "core", "pro")),
        repr(list(tiers.keys())),
    )

    r = requests.get(f"{BASE}/subscription/status", headers=_hdrs(USER1_TOKEN))
    _log("GET /subscription/status", r)
    assert_eq("/subscription/status -> 200", r.status_code, 200)
    body = r.json() or {}
    assert_eq("/subscription/status tier", body.get("tier"), "pro")

    # /api/analyze-hunt is the main product API — must not regress.
    print("\n  → calling /analyze-hunt with minimal body + 10x10 PNG (this may take a while)...")
    payload = {
        "conditions": {
            "animal": "deer",
            "hunt_date": "2026-02-15",
            "time_window": "morning",
            "wind_direction": "NW",
            "temperature": "38F",
            "property_type": "private",
            "latitude": 31.2956,
            "longitude": -95.9778,
        },
        "map_image_base64": _TINY_PNG_DATA_URI,
    }
    try:
        r = requests.post(f"{BASE}/analyze-hunt", json=payload, headers=_hdrs(USER1_TOKEN), timeout=180)
        print(f"  analyze-hunt HTTP status: {r.status_code}")
        body = r.json()
        # Contract check: FastAPI JSON with 'success' boolean at top level.
        assert_eq("/analyze-hunt HTTP 200", r.status_code, 200)
        assert_true("/analyze-hunt body.success=True", body.get("success") is True, str(body)[:400])
        result = body.get("result") or {}
        assert_true("/analyze-hunt result.id present", bool(result.get("id")), repr(result)[:200])
        assert_true(
            "/analyze-hunt region_resolution present",
            body.get("region_resolution") is not None,
            "no region_resolution",
        )
        assert_true(
            "/analyze-hunt hunt_style_resolution present",
            body.get("hunt_style_resolution") is not None,
            "no hunt_style_resolution",
        )
    except requests.Timeout:
        print("  WARN /analyze-hunt timed out — cannot fully verify")
        global FAILED, FAILURES
        FAILED += 1
        FAILURES.append("/analyze-hunt regression: timeout after 180s")


def main() -> int:
    print(f"Target backend: {BASE}")
    test_auth_gating()
    hunt_id = test_post_and_upsert_behavior()
    test_post_validation()
    test_list()
    test_get_single_and_cross_user(hunt_id)
    test_compound_uniqueness()
    test_put_patch(hunt_id)
    test_delete(hunt_id)
    test_regression()

    print("\n" + "=" * 60)
    print(f"RESULTS: {PASSED} passed, {FAILED} failed")
    if FAILURES:
        print("\nFAILURES:")
        for f in FAILURES:
            print("  - " + f)
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
