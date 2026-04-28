"""Task 11 spot-check: replay 4 critical contracts via direct HTTP.

Covers:
  (a) user_provided override — asset GPS wins over AI's
  (b) geo-capable image — derive both ways
  (c) pixel-only no-fabrication — lat/lng null even when supplied
  (d) cross-user isolation — user B cannot read user A's items

Run: python /app/backend_test.py
"""
from __future__ import annotations

import json
import sys
import time
import uuid

import requests

BASE = "http://localhost:8001/api"
PRO_A = {"Authorization": "Bearer test_session_rs_001"}
PRO_B = {"Authorization": "Bearer test_session_rs_002"}

fails = []
passes = []


def _ok(tag):
    passes.append(tag)
    print(f"  PASS  {tag}")


def _bad(tag, detail):
    fails.append((tag, detail))
    print(f"  FAIL  {tag}: {detail}")


def _post(path, body, headers=PRO_A, expect=200):
    r = requests.post(
        f"{BASE}{path}",
        headers={**headers, "Content-Type": "application/json"},
        json=body,
        timeout=15,
    )
    return r


def _get(path, headers=PRO_A):
    r = requests.get(f"{BASE}{path}", headers=headers, timeout=15)
    return r


def _delete(path, headers=PRO_A):
    r = requests.delete(f"{BASE}{path}", headers=headers, timeout=15)
    return r


def _create_hunt(headers=PRO_A):
    hid = f"hunt_spot_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    r = _post(
        "/hunts",
        {
            "hunt_id": hid,
            "metadata": {
                "species": "whitetail",
                "speciesName": "Whitetail Deer",
                "date": "2026-02-01",
                "timeWindow": "AM",
                "windDirection": "N",
            },
        },
        headers=headers,
    )
    assert r.status_code == 200, f"create hunt -> {r.status_code}: {r.text}"
    return hid


# -------------------------------------------------------------------
# (a) user_provided override
# -------------------------------------------------------------------
def scenario_a():
    print("\n[A] user_provided override — asset GPS wins over AI's")
    hid = _create_hunt()
    try:
        asset_r = _post(
            f"/hunts/{hid}/assets",
            {
                "type": "stand",
                "name": "Oak Ridge Ladder",
                "latitude": 44.5,
                "longitude": -93.0,
            },
        )
        if asset_r.status_code != 200:
            _bad("A.create_asset", f"{asset_r.status_code} {asset_r.text}")
            return
        asset_id = asset_r.json()["asset"]["asset_id"]

        img_r = _post(
            "/saved-map-images",
            {
                "hunt_id": hid,
                "image_id": f"img_{uuid.uuid4().hex[:8]}",
                "image_url": "https://example.invalid/map.png",
                "original_width": 1000,
                "original_height": 800,
                "north_lat": 45.0,
                "south_lat": 44.0,
                "west_lng": -93.5,
                "east_lng": -92.5,
                "supports_geo_placement": True,
                "source": "maptiler",
            },
        )
        if img_r.status_code != 200:
            _bad("A.create_img", f"{img_r.status_code} {img_r.text}")
            return
        image_id = img_r.json()["saved_map_image"]["image_id"]

        norm_r = _post(
            f"/hunts/{hid}/overlay-items:bulk-normalize",
            {
                "saved_map_image_id": image_id,
                "items": [
                    {
                        "type": "stand",
                        "label": "Oak Ridge Ladder",
                        "coordinateSource": "user_provided",
                        "sourceAssetId": asset_id,
                        "latitude": 99.999,  # AI lie
                        "longitude": -1.234,  # AI lie
                    }
                ],
            },
        )
        if norm_r.status_code != 200:
            _bad("A.bulk_normalize", f"{norm_r.status_code} {norm_r.text}")
            return
        body = norm_r.json()
        if body.get("created_count") != 1:
            _bad("A.created_count", f"expected 1 got {body.get('created_count')}")
            return
        created = body["created"][0]
        print(f"  created.latitude={created.get('latitude')} longitude={created.get('longitude')} src={created.get('coordinate_source')}")
        if created.get("coordinate_source") != "user_provided":
            _bad("A.coord_source", f"got {created.get('coordinate_source')}")
        else:
            _ok("A.coord_source=user_provided")
        lat = created.get("latitude")
        lng = created.get("longitude")
        if lat is None or abs(lat - 44.5) > 1e-6:
            _bad("A.latitude_matches_asset", f"got {lat}, expected 44.5")
        else:
            _ok("A.latitude_matches_asset (44.5, not AI's 99.999)")
        if lng is None or abs(lng - -93.0) > 1e-6:
            _bad("A.longitude_matches_asset", f"got {lng}, expected -93.0")
        else:
            _ok("A.longitude_matches_asset (-93.0, not AI's -1.234)")
    finally:
        _delete(f"/hunts/{hid}")


# -------------------------------------------------------------------
# (b) geo-capable derive both ways
# -------------------------------------------------------------------
def scenario_b():
    print("\n[B] Geo-capable derive both ways — GPS-only & xy-only")
    hid = _create_hunt()
    try:
        img_r = _post(
            "/saved-map-images",
            {
                "hunt_id": hid,
                "image_id": f"img_{uuid.uuid4().hex[:8]}",
                "image_url": "https://example.invalid/m.png",
                "original_width": 1000,
                "original_height": 800,
                "north_lat": 45.0,
                "south_lat": 44.0,
                "west_lng": -93.5,
                "east_lng": -92.5,
                "supports_geo_placement": True,
                "source": "maptiler",
            },
        )
        image_id = img_r.json()["saved_map_image"]["image_id"]
        norm = _post(
            f"/hunts/{hid}/overlay-items:bulk-normalize",
            {
                "saved_map_image_id": image_id,
                "items": [
                    {
                        "type": "funnel",
                        "label": "GPS-only",
                        "latitude": 44.5,
                        "longitude": -93.0,
                    },
                    {
                        "type": "funnel",
                        "label": "XY-only",
                        "x": 500,
                        "y": 400,
                    },
                ],
            },
        )
        if norm.status_code != 200:
            _bad("B.bulk_normalize", f"{norm.status_code} {norm.text}")
            return
        body = norm.json()
        print(f"  created_count={body.get('created_count')} skipped={body.get('skipped_count')}")
        if body.get("created_count") != 2:
            _bad("B.created_count", f"expected 2 got {body.get('created_count')}")
            return
        by_label = {it["label"]: it for it in body["created"]}
        gps = by_label.get("GPS-only")
        xy = by_label.get("XY-only")
        if not gps or not xy:
            _bad("B.labels_present", "missing GPS-only or XY-only")
            return
        if gps.get("x") is None or abs(gps["x"] - 500) > 1e-3:
            _bad("B.gps_x_derived", f"got {gps.get('x')}")
        else:
            _ok("B.gps_only.x derived to 500")
        if gps.get("y") is None or abs(gps["y"] - 400) > 1e-3:
            _bad("B.gps_y_derived", f"got {gps.get('y')}")
        else:
            _ok("B.gps_only.y derived to 400")
        if xy.get("latitude") is None or abs(xy["latitude"] - 44.5) > 1e-6:
            _bad("B.xy_lat_derived", f"got {xy.get('latitude')}")
        else:
            _ok("B.xy_only.latitude derived to 44.5")
        if xy.get("longitude") is None or abs(xy["longitude"] - -93.0) > 1e-6:
            _bad("B.xy_lng_derived", f"got {xy.get('longitude')}")
        else:
            _ok("B.xy_only.longitude derived to -93.0")
        for lbl, it in (("GPS-only", gps), ("XY-only", xy)):
            cs = it.get("coordinate_source")
            if cs != "derived_from_saved_map_bounds":
                _bad(f"B.{lbl}.coord_source", f"got {cs}")
            else:
                _ok(f"B.{lbl}.coordinate_source=derived_from_saved_map_bounds")
    finally:
        _delete(f"/hunts/{hid}")


# -------------------------------------------------------------------
# (c) pixel-only — no fabrication
# -------------------------------------------------------------------
def scenario_c():
    print("\n[C] Pixel-only image — no GPS fabrication")
    hid = _create_hunt()
    try:
        img_r = _post(
            "/saved-map-images",
            {
                "hunt_id": hid,
                "image_id": f"img_{uuid.uuid4().hex[:8]}",
                "image_url": "data:image/png;base64,iVBORw0KGgo=",
                "original_width": 800,
                "original_height": 600,
                "source": "upload",
            },
        )
        if img_r.status_code != 200:
            _bad("C.create_image", f"{img_r.status_code} {img_r.text}")
            return
        saved = img_r.json()["saved_map_image"]
        if saved.get("supports_geo_placement") is not False:
            _bad("C.supports_geo_false", f"got {saved.get('supports_geo_placement')}")
        else:
            _ok("C.supports_geo_placement == False")
        image_id = saved["image_id"]
        norm = _post(
            f"/hunts/{hid}/overlay-items:bulk-normalize",
            {
                "saved_map_image_id": image_id,
                "items": [
                    {
                        "type": "stand",
                        "label": "Should have no GPS",
                        "latitude": 44.9,
                        "longitude": -93.2,
                        "x": 100,
                        "y": 200,
                    }
                ],
            },
        )
        if norm.status_code != 200:
            _bad("C.bulk_normalize", f"{norm.status_code} {norm.text}")
            return
        body = norm.json()
        print(f"  created={body.get('created_count')} skipped={body.get('skipped_count')}")
        if body.get("created_count") != 1:
            print(f"  details: {json.dumps(body)[:700]}")
            _bad("C.created_count", f"expected 1 got {body.get('created_count')}")
            return
        it = body["created"][0]
        print(f"  item.latitude={it.get('latitude')} longitude={it.get('longitude')} src={it.get('coordinate_source')}")
        if it.get("latitude") is not None:
            _bad("C.latitude_null", f"got {it.get('latitude')} expected None")
        else:
            _ok("C.latitude is None (no fabrication)")
        if it.get("longitude") is not None:
            _bad("C.longitude_null", f"got {it.get('longitude')} expected None")
        else:
            _ok("C.longitude is None (no fabrication)")
        cs = it.get("coordinate_source")
        if cs != "pixel_only":
            _bad("C.coord_source", f"got {cs} expected pixel_only")
        else:
            _ok("C.coordinate_source == pixel_only")
    finally:
        _delete(f"/hunts/{hid}")


# -------------------------------------------------------------------
# (d) Cross-user isolation
# -------------------------------------------------------------------
def scenario_d():
    print("\n[D] Cross-user isolation — user B cannot read user A's items")
    hid = _create_hunt(headers=PRO_A)
    try:
        asset_r = _post(
            f"/hunts/{hid}/assets",
            {
                "type": "stand",
                "name": "A's Stand",
                "latitude": 44.5,
                "longitude": -93.0,
            },
            headers=PRO_A,
        )
        aid = asset_r.json()["asset"]["asset_id"]
        _post(
            f"/hunts/{hid}/overlay-items:bulk-normalize",
            {
                "items": [
                    {
                        "type": "stand",
                        "label": "Private to A",
                        "coordinateSource": "user_provided",
                        "sourceAssetId": aid,
                    }
                ],
            },
            headers=PRO_A,
        )
        a_listing = _get(f"/hunts/{hid}/overlay-items", headers=PRO_A)
        if a_listing.status_code != 200 or a_listing.json().get("count", 0) < 1:
            _bad("D.a_sees", f"{a_listing.status_code} {a_listing.text[:200]}")
        else:
            _ok(f"D.user_A GET own hunt -> 200 count={a_listing.json()['count']}")

        b_listing = _get(f"/hunts/{hid}/overlay-items", headers=PRO_B)
        print(f"  user_B GET A's hunt -> {b_listing.status_code} body_prefix={b_listing.text[:120]}")
        if b_listing.status_code == 200:
            _bad("D.b_forbidden", "B got 200 (data leak!)")
        elif b_listing.status_code in (403, 404):
            _ok(f"D.user_B blocked with {b_listing.status_code}")
        else:
            _bad("D.b_unexpected_status", f"{b_listing.status_code} {b_listing.text[:200]}")
    finally:
        _delete(f"/hunts/{hid}", headers=PRO_A)


def main():
    print(f"=== Task 11 spot-checks against {BASE} ===")
    r1 = _get("/auth/me", headers=PRO_A)
    r2 = _get("/auth/me", headers=PRO_B)
    print(f"Pro A /auth/me: {r1.status_code}  Pro B /auth/me: {r2.status_code}")
    assert r1.status_code == 200, f"test_session_rs_001 not valid: {r1.text}"
    assert r2.status_code == 200, f"test_session_rs_002 not valid: {r2.text}"

    scenario_a()
    scenario_b()
    scenario_c()
    scenario_d()

    print(f"\n=== SPOT-CHECK TOTALS: {len(passes)} pass / {len(fails)} fail ===")
    for tag, detail in fails:
        print(f"  FAIL  {tag}: {detail}")
    sys.exit(0 if not fails else 1)


if __name__ == "__main__":
    main()
