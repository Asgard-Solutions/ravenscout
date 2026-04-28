"""Backend test for Task 8 — /api/hunts/{hunt_id}/overlay-items:bulk-normalize.

Runs against the preview URL (EXPO_PUBLIC_BACKEND_URL). Uses seeded
test users from /app/memory/test_credentials.md.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from typing import Any

import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://hunt-geo-overlay.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

USER_A_TOKEN = "test_session_rs_001"
USER_B_TOKEN = "test_session_rs_002"


def hdr(tok: str | None = None) -> dict:
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    return h


_results: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    _results.append((name, bool(cond), detail))
    marker = "PASS" if cond else "FAIL"
    msg = f"[{marker}] {name}"
    if detail:
        msg += f"  :: {detail}"
    print(msg)


def create_hunt(tok: str, hunt_id: str | None = None) -> str:
    hunt_id = hunt_id or f"rs-task8-{uuid.uuid4().hex[:10]}"
    body = {
        "hunt_id": hunt_id,
        "metadata": {
            "species": "deer",
            "speciesName": "Whitetail Deer",
            "date": "2026-04-28",
            "timeWindow": "morning",
            "windDirection": "NW",
            "temperature": "42F",
            "propertyType": "private",
            "region": "upper_midwest",
        },
        "analysis": {"summary": "Task 8 fixture hunt"},
        "analysis_context": {"prompt_version": "v2"},
        "media_refs": [],
        "image_s3_keys": [],
        "storage_strategy": "local-first",
    }
    r = requests.post(f"{API}/hunts", headers=hdr(tok), data=json.dumps(body), timeout=30)
    assert r.status_code == 200, f"create hunt failed: {r.status_code} {r.text[:300]}"
    return r.json()["hunt"]["hunt_id"]


def create_asset(tok: str, hunt_id: str, lat: float, lng: float) -> str:
    body = {
        "type": "stand",
        "name": "North Ridge Stand",
        "latitude": lat,
        "longitude": lng,
        "notes": "fixture",
    }
    r = requests.post(
        f"{API}/hunts/{hunt_id}/assets",
        headers=hdr(tok),
        data=json.dumps(body),
        timeout=30,
    )
    assert r.status_code == 200, f"create asset failed: {r.status_code} {r.text[:300]}"
    return r.json()["asset"]["asset_id"]


def create_saved_map_image(tok: str, hunt_id: str, *, geo: bool) -> str:
    image_id = f"img_{uuid.uuid4().hex[:10]}"
    if geo:
        body = {
            "image_id": image_id,
            "hunt_id": hunt_id,
            "supports_geo_placement": True,
            "original_width": 1000,
            "original_height": 800,
            "north_lat": 45.0,
            "south_lat": 44.0,
            "west_lng": -93.5,
            "east_lng": -92.5,
            "source": "maptiler",
        }
    else:
        body = {
            "image_id": image_id,
            "hunt_id": hunt_id,
            "supports_geo_placement": False,
            "original_width": 1200,
            "original_height": 900,
            "source": "upload",
        }
    r = requests.post(
        f"{API}/saved-map-images", headers=hdr(tok), data=json.dumps(body), timeout=30
    )
    assert r.status_code == 200, f"create saved image failed: {r.status_code} {r.text[:300]}"
    return r.json()["saved_map_image"]["image_id"]


def delete_hunt(tok: str, hunt_id: str) -> None:
    try:
        requests.delete(f"{API}/hunts/{hunt_id}", headers=hdr(tok), timeout=30)
    except Exception:
        pass


def bulk_normalize(tok: str | None, hunt_id: str, body: Any) -> requests.Response:
    url = f"{API}/hunts/{hunt_id}/overlay-items:bulk-normalize"
    if isinstance(body, (dict, list)):
        return requests.post(url, headers=hdr(tok), data=json.dumps(body), timeout=30)
    return requests.post(url, headers=hdr(tok), data=body, timeout=30)


def approx(a: Any, b: float, tol: float = 0.5) -> bool:
    try:
        return abs(float(a) - float(b)) <= tol
    except Exception:
        return False


def scenario_a_auth(hunt_id: str) -> None:
    print("\n=== (a) Auth missing/invalid -> 401 ===")
    r = bulk_normalize(None, hunt_id, {"items": []})
    check("no-auth returns 401", r.status_code == 401, f"status={r.status_code} body={r.text[:200]}")
    r = bulk_normalize("totally_bogus_token", hunt_id, {"items": []})
    check("invalid bearer returns 401", r.status_code == 401, f"status={r.status_code} body={r.text[:200]}")


def scenario_b_not_owned(other_hunt_id: str) -> None:
    print("\n=== (b) Hunt not owned -> 404 ===")
    r = bulk_normalize(USER_B_TOKEN, other_hunt_id, {"items": []})
    check("user B can't see user A's hunt (404)", r.status_code == 404, f"status={r.status_code} body={r.text[:200]}")


def scenario_c_body_shapes(hunt_id: str) -> None:
    print("\n=== (c) Body shape validation -> 422 ===")
    r = bulk_normalize(USER_A_TOKEN, hunt_id, [])
    check("non-object body returns 422", r.status_code == 422, f"status={r.status_code} body={r.text[:200]}")
    r = bulk_normalize(USER_A_TOKEN, hunt_id, {"items": {"bad": "not-a-list"}})
    check("non-list items returns 422", r.status_code == 422, f"status={r.status_code} body={r.text[:200]}")


def scenario_d_user_provided(hunt_id: str, image_id: str, asset_id: str) -> None:
    print("\n=== (d) user_provided override — lat/lng forced from asset ===")
    body = {
        "saved_map_image_id": image_id,
        "analysis_id": "analysis-d-" + uuid.uuid4().hex[:6],
        "items": [{
            "type": "stand",
            "label": "X",
            "coordinateSource": "user_provided",
            "sourceAssetId": asset_id,
            "latitude": 99.999,
            "longitude": -1.234,
        }],
    }
    r = bulk_normalize(USER_A_TOKEN, hunt_id, body)
    ok = r.status_code == 200
    check("status 200", ok, f"status={r.status_code} body={r.text[:400]}")
    if not ok:
        return
    data = r.json()
    check("created_count == 1", data.get("created_count") == 1, f"data={data}")
    check("skipped_count == 0", data.get("skipped_count") == 0, f"skipped={data.get('skipped')}")
    if data.get("created_count") != 1:
        return
    c = data["created"][0]
    check("latitude forced to asset 44.5 (not 99.999)", approx(c.get("latitude"), 44.5, 0.0001), f"lat={c.get('latitude')}")
    check("longitude forced to asset -93.0 (not -1.234)", approx(c.get("longitude"), -93.0, 0.0001), f"lng={c.get('longitude')}")
    check("x ≈ 500", approx(c.get("x"), 500, 1), f"x={c.get('x')}")
    check("y ≈ 400", approx(c.get("y"), 400, 1), f"y={c.get('y')}")
    check("coordinate_source == 'user_provided'", c.get("coordinate_source") == "user_provided", f"coord_src={c.get('coordinate_source')}")
    check("source_asset_id preserved", c.get("source_asset_id") == asset_id, f"saved={c.get('source_asset_id')}")


def scenario_e_unknown_asset(hunt_id: str, image_id: str) -> None:
    print("\n=== (e) Unknown sourceAssetId -> skipped 'unknown_source_asset' ===")
    body = {
        "saved_map_image_id": image_id,
        "items": [{
            "type": "stand", "label": "X",
            "coordinateSource": "user_provided", "sourceAssetId": "bogus",
            "latitude": 44.5, "longitude": -93.0,
        }],
    }
    r = bulk_normalize(USER_A_TOKEN, hunt_id, body)
    check("status 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code != 200:
        return
    data = r.json()
    check("created_count == 0", data.get("created_count") == 0, f"data={data}")
    check("skipped_count == 1", data.get("skipped_count") == 1, f"skipped={data.get('skipped')}")
    sk = (data.get("skipped") or [{}])[0]
    check(
        "skipped reason starts with 'unknown_source_asset'",
        isinstance(sk.get("reason"), str) and sk["reason"].startswith("unknown_source_asset"),
        f"reason={sk.get('reason')}",
    )
    check("skipped entry has index=0", sk.get("index") == 0, f"index={sk.get('index')}")


def scenario_f_gps_only(hunt_id: str, image_id: str) -> None:
    print("\n=== (f) GPS only on geo image -> derived_from_saved_map_bounds ===")
    body = {
        "saved_map_image_id": image_id,
        "items": [{"type": "funnel", "label": "Saddle", "latitude": 44.5, "longitude": -93.0}],
    }
    r = bulk_normalize(USER_A_TOKEN, hunt_id, body)
    check("status 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code != 200:
        return
    data = r.json()
    check("created_count == 1", data.get("created_count") == 1, f"data={data}")
    if data.get("created_count") != 1:
        return
    c = data["created"][0]
    check("x ≈ 500", approx(c.get("x"), 500, 1), f"x={c.get('x')}")
    check("y ≈ 400", approx(c.get("y"), 400, 1), f"y={c.get('y')}")
    check("coordinate_source == 'derived_from_saved_map_bounds'", c.get("coordinate_source") == "derived_from_saved_map_bounds", f"coord_src={c.get('coordinate_source')}")


def scenario_g_pixel_on_geo(hunt_id: str, image_id: str) -> None:
    print("\n=== (g) Pixel only on geo image -> derived_from_saved_map_bounds ===")
    body = {
        "saved_map_image_id": image_id,
        "items": [{"type": "funnel", "label": "Saddle", "x": 500, "y": 400}],
    }
    r = bulk_normalize(USER_A_TOKEN, hunt_id, body)
    check("status 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code != 200:
        return
    data = r.json()
    check("created_count == 1", data.get("created_count") == 1, f"data={data}")
    if data.get("created_count") != 1:
        return
    c = data["created"][0]
    check("latitude ≈ 44.5", approx(c.get("latitude"), 44.5, 0.001), f"lat={c.get('latitude')}")
    check("longitude ≈ -93.0", approx(c.get("longitude"), -93.0, 0.001), f"lng={c.get('longitude')}")
    check("coordinate_source == 'derived_from_saved_map_bounds'", c.get("coordinate_source") == "derived_from_saved_map_bounds", f"coord_src={c.get('coordinate_source')}")


def scenario_h_pixel_only_image(hunt_id: str, pixel_image_id: str) -> None:
    print("\n=== (h) Pixel-only image -> lat/lng None, coordinate_source='pixel_only' ===")
    body = {
        "saved_map_image_id": pixel_image_id,
        "items": [{
            "type": "stand", "label": "X",
            "latitude": 30, "longitude": -97,
            "x": 100, "y": 200,
            "coordinateSource": "ai_estimated_from_image",
        }],
    }
    r = bulk_normalize(USER_A_TOKEN, hunt_id, body)
    check("status 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code != 200:
        return
    data = r.json()
    check("created_count == 1", data.get("created_count") == 1, f"data={data}")
    if data.get("created_count") != 1:
        return
    c = data["created"][0]
    check("latitude is None (not fabricated)", c.get("latitude") is None, f"lat={c.get('latitude')}")
    check("longitude is None (not fabricated)", c.get("longitude") is None, f"lng={c.get('longitude')}")
    check("x == 100", approx(c.get("x"), 100, 0.001), f"x={c.get('x')}")
    check("y == 200", approx(c.get("y"), 200, 0.001), f"y={c.get('y')}")
    check("coordinate_source coerced to 'pixel_only'", c.get("coordinate_source") == "pixel_only", f"coord_src={c.get('coordinate_source')}")


def scenario_i_surface_failures(hunt_id: str, image_id: str) -> None:
    print("\n=== (i) Surface failures: invalid_type / missing_label + index bookkeeping ===")
    body = {
        "saved_map_image_id": image_id,
        "items": [
            {"type": "rocketship", "label": "Lift-off", "x": 10, "y": 10},  # idx 0
            {"type": "stand", "x": 10, "y": 10},                             # idx 1 missing label
            {"type": "funnel", "label": "GoodOne", "latitude": 44.5, "longitude": -93.0},  # idx 2
        ],
    }
    r = bulk_normalize(USER_A_TOKEN, hunt_id, body)
    check("status 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code != 200:
        return
    data = r.json()
    check("created_count == 1", data.get("created_count") == 1, f"data={data}")
    check("skipped_count == 2", data.get("skipped_count") == 2, f"skipped={data.get('skipped')}")
    sk_by_idx = {s.get("index"): s for s in (data.get("skipped") or [])}
    sk0 = sk_by_idx.get(0, {})
    sk1 = sk_by_idx.get(1, {})
    check(
        "idx 0 reason starts 'invalid_type'",
        isinstance(sk0.get("reason"), str) and sk0["reason"].startswith("invalid_type"),
        f"reason={sk0.get('reason')}",
    )
    check(
        "idx 1 reason == 'missing_label'",
        sk1.get("reason") == "missing_label",
        f"reason={sk1.get('reason')}",
    )


def scenario_jk_cross_user_persistence(hunt_id_A: str, hunt_id_B: str) -> None:
    print("\n=== (j) Cross-user isolation + (k) Persistence ===")
    r = requests.get(f"{API}/hunts/{hunt_id_A}/overlay-items", headers=hdr(USER_A_TOKEN), timeout=30)
    check("GET /overlay-items (owner) status 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        lst = (r.json() or {}).get("overlay_items") or []
        check("GET returns >0 items for owner (persistence)", len(lst) > 0, f"count={len(lst)}")

    r2 = requests.get(f"{API}/hunts/{hunt_id_A}/overlay-items", headers=hdr(USER_B_TOKEN), timeout=30)
    check("GET /overlay-items (cross-user) returns 404", r2.status_code == 404, f"status={r2.status_code} body={r2.text[:200]}")

    r3 = requests.get(f"{API}/hunts/{hunt_id_B}/overlay-items", headers=hdr(USER_B_TOKEN), timeout=30)
    check("GET /overlay-items (user B own hunt) 200", r3.status_code == 200, f"status={r3.status_code}")
    if r3.status_code == 200:
        lst = (r3.json() or {}).get("overlay_items") or []
        check("user B own hunt has no overlay items", len(lst) == 0, f"count={len(lst)}")


def main() -> int:
    print(f"BASE_URL = {BASE_URL}")
    t0 = time.time()

    # Auth smoke
    r = requests.get(f"{API}/auth/me", headers=hdr(USER_A_TOKEN), timeout=30)
    assert r.status_code == 200, f"auth smoke failed for user A: {r.status_code} {r.text}"
    r = requests.get(f"{API}/auth/me", headers=hdr(USER_B_TOKEN), timeout=30)
    assert r.status_code == 200, f"auth smoke failed for user B: {r.status_code} {r.text}"

    hunt_A = None
    hunt_B = None
    try:
        hunt_A = create_hunt(USER_A_TOKEN)
        print(f"hunt_A = {hunt_A}")
        asset_id = create_asset(USER_A_TOKEN, hunt_A, 44.5, -93.0)
        print(f"asset_id = {asset_id}")
        geo_image_id = create_saved_map_image(USER_A_TOKEN, hunt_A, geo=True)
        pixel_image_id = create_saved_map_image(USER_A_TOKEN, hunt_A, geo=False)
        print(f"geo_image_id = {geo_image_id}  pixel_image_id = {pixel_image_id}")

        hunt_B = create_hunt(USER_B_TOKEN)
        print(f"hunt_B = {hunt_B}")

        scenario_a_auth(hunt_A)
        scenario_b_not_owned(hunt_A)
        scenario_c_body_shapes(hunt_A)
        scenario_d_user_provided(hunt_A, geo_image_id, asset_id)
        scenario_e_unknown_asset(hunt_A, geo_image_id)
        scenario_f_gps_only(hunt_A, geo_image_id)
        scenario_g_pixel_on_geo(hunt_A, geo_image_id)
        scenario_h_pixel_only_image(hunt_A, pixel_image_id)
        scenario_i_surface_failures(hunt_A, geo_image_id)
        scenario_jk_cross_user_persistence(hunt_A, hunt_B)
    finally:
        if hunt_A:
            delete_hunt(USER_A_TOKEN, hunt_A)
        if hunt_B:
            delete_hunt(USER_B_TOKEN, hunt_B)

    total = len(_results)
    passed = sum(1 for _, ok, _ in _results if ok)
    failed = total - passed
    print("\n" + "=" * 72)
    print(f"RESULTS: {passed}/{total} PASS  ({failed} fail)   elapsed={time.time()-t0:.2f}s")
    if failed:
        print("\nFAILURES:")
        for name, ok, det in _results:
            if not ok:
                print(f"  - {name}  :: {det}")
    print("=" * 72)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
