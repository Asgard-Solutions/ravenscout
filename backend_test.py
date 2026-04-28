"""Backend test harness for Hunt GPS Assets + Saved Map Image geo metadata.

Tests against EXPO_PUBLIC_BACKEND_URL/api per the testing protocol.
Auth: Bearer test_session_rs_001 (Pro user test-user-001).
Cross-user check: Bearer test_session_trial_001 (Trial user).
"""
from __future__ import annotations

import os
import sys
import time
import uuid
import json

import requests

BASE = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://hunt-analysis-pro.preview.emergentagent.com",
).rstrip("/") + "/api"

PRO_TOKEN = "test_session_rs_001"
TRIAL_TOKEN = "test_session_trial_001"

H_PRO = {"Authorization": f"Bearer {PRO_TOKEN}", "Content-Type": "application/json"}
H_TRIAL = {"Authorization": f"Bearer {TRIAL_TOKEN}", "Content-Type": "application/json"}

passed = 0
failed: list[str] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    global passed
    if cond:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed.append(f"{label}  --  {detail}")
        print(f"  FAIL  {label}  --  {detail}")


def http(method: str, path: str, headers=H_PRO, json_body=None, params=None):
    url = f"{BASE}{path}"
    try:
        r = requests.request(
            method,
            url,
            headers=headers,
            json=json_body,
            params=params,
            timeout=30,
        )
    except Exception as exc:
        return None, {"_error": str(exc)}
    try:
        body = r.json()
    except Exception:
        body = {"_raw": r.text}
    return r.status_code, body


def main():
    ts = int(time.time())
    HUNT_ID = f"hunt_geo_test_{ts}_{uuid.uuid4().hex[:6]}"

    print("=" * 70)
    print(f"Base URL: {BASE}")
    print(f"Test hunt_id: {HUNT_ID}")
    print("=" * 70)

    # ---------------- PRE-STEP: create parent hunt ----------------
    print("\n--- PRE-STEP: Create parent hunt ---")
    code, body = http(
        "POST",
        "/hunts",
        json_body={
            "hunt_id": HUNT_ID,
            "metadata": {
                "species": "whitetail",
                "speciesName": "Whitetail Deer",
                "date": "2026-02-01",
                "timeWindow": "AM",
                "windDirection": "N",
            },
        },
    )
    check("PRE: POST /api/hunts -> 200", code == 200, f"got {code} body={body}")
    if code != 200:
        print("FATAL: cannot create parent hunt; aborting.")
        return

    # ============================================================
    # A. Hunt Location Assets
    # ============================================================
    print("\n--- A1: Happy path POST /api/hunts/{hid}/assets ---")
    payload = {
        "type": "stand",
        "name": "North ridge stand",
        "latitude": 44.9778,
        "longitude": -93.265,
        "notes": "trail cam covers SW",
    }
    code, body = http("POST", f"/hunts/{HUNT_ID}/assets", json_body=payload)
    check("A1.status==200", code == 200, f"got {code} body={body}")
    asset = (body or {}).get("asset", {}) if isinstance(body, dict) else {}
    aid = asset.get("asset_id", "")
    check("A1.asset_id starts with 'hla_'", isinstance(aid, str) and aid.startswith("hla_"), f"asset_id={aid}")
    check("A1.user_id==test-user-001", asset.get("user_id") == "test-user-001", f"user_id={asset.get('user_id')}")
    check("A1.hunt_id matches path", asset.get("hunt_id") == HUNT_ID, f"hunt_id={asset.get('hunt_id')}")
    check("A1.created_at == updated_at", asset.get("created_at") and asset.get("created_at") == asset.get("updated_at"),
          f"c={asset.get('created_at')} u={asset.get('updated_at')}")
    happy_asset_id = aid

    # A2 each canonical type
    print("\n--- A2: All canonical types accepted ---")
    canonical_types = ["stand", "blind", "feeder", "camera", "parking", "access_point",
                       "water", "scrape", "rub", "bedding", "custom"]
    type_asset_ids = {}
    for t in canonical_types:
        code, body = http(
            "POST",
            f"/hunts/{HUNT_ID}/assets",
            json_body={
                "type": t,
                "name": f"Asset {t}",
                "latitude": 44.0 + 0.01 * canonical_types.index(t),
                "longitude": -93.0 - 0.01 * canonical_types.index(t),
            },
        )
        ok = code == 200
        check(f"A2.type='{t}' -> 200", ok, f"got {code} body={body}")
        if ok:
            type_asset_ids[t] = body["asset"]["asset_id"]

    # A3 invalid latitude
    print("\n--- A3: Invalid latitude ---")
    for bad in (99, -91):
        code, body = http("POST", f"/hunts/{HUNT_ID}/assets", json_body={
            "type": "stand", "name": "x", "latitude": bad, "longitude": -93.0
        })
        check(f"A3.latitude={bad} -> 422", code == 422, f"got {code} body={body}")

    # A4 invalid longitude
    print("\n--- A4: Invalid longitude ---")
    for bad in (181, -181):
        code, body = http("POST", f"/hunts/{HUNT_ID}/assets", json_body={
            "type": "stand", "name": "x", "latitude": 44.0, "longitude": bad
        })
        check(f"A4.longitude={bad} -> 422", code == 422, f"got {code} body={body}")

    # A5 NaN latitude (raw JSON allowing NaN)
    print("\n--- A5: NaN latitude ---")
    url = f"{BASE}/hunts/{HUNT_ID}/assets"
    raw = '{"type":"stand","name":"x","latitude":NaN,"longitude":-93.0}'
    try:
        r = requests.post(url, headers=H_PRO, data=raw, timeout=30)
        code = r.status_code
        try:
            body = r.json()
        except Exception:
            body = r.text
    except Exception as exc:
        code = None
        body = str(exc)
    check("A5.NaN latitude -> 422", code == 422, f"got {code} body={body}")

    # A6 unknown type
    print("\n--- A6: Unknown type 'chair' ---")
    code, body = http("POST", f"/hunts/{HUNT_ID}/assets", json_body={
        "type": "chair", "name": "x", "latitude": 44.0, "longitude": -93.0
    })
    check("A6.type='chair' -> 422", code == 422, f"got {code} body={body}")

    # A7 missing name
    print("\n--- A7: Missing name ---")
    code, body = http("POST", f"/hunts/{HUNT_ID}/assets", json_body={
        "type": "stand", "latitude": 44.0, "longitude": -93.0
    })
    check("A7.no name -> 422", code == 422, f"got {code} body={body}")

    # A8 blank name
    print("\n--- A8: Blank name '   ' ---")
    code, body = http("POST", f"/hunts/{HUNT_ID}/assets", json_body={
        "type": "stand", "name": "   ", "latitude": 44.0, "longitude": -93.0
    })
    check("A8.blank name -> 422", code == 422, f"got {code} body={body}")

    # A9 non-existent hunt
    print("\n--- A9: Non-existent hunt_id ---")
    code, body = http("POST", "/hunts/hunt_does_not_exist/assets", json_body={
        "type": "stand", "name": "x", "latitude": 44.0, "longitude": -93.0
    })
    check("A9.unknown hunt -> 404", code == 404, f"got {code} body={body}")
    detail = (body or {}).get("detail") if isinstance(body, dict) else None
    check("A9.detail == 'Hunt not found'", detail == "Hunt not found", f"detail={detail}")

    # A10 list assets
    print("\n--- A10: List assets ---")
    code, body = http("GET", f"/hunts/{HUNT_ID}/assets")
    check("A10.GET list -> 200", code == 200, f"got {code} body={body}")
    assets_list = (body or {}).get("assets") or []
    expected_count = 1 + len(canonical_types)  # happy + 11 types
    check(f"A10.count=={expected_count}", (body or {}).get("count") == expected_count,
          f"count={body.get('count') if isinstance(body, dict) else None} (expected {expected_count})")
    cas = [a.get("created_at", "") for a in assets_list]
    check("A10.sorted asc by created_at", cas == sorted(cas), f"cas={cas}")

    # A11 GET single asset
    print("\n--- A11: GET single asset ---")
    code, body = http("GET", f"/hunts/{HUNT_ID}/assets/{happy_asset_id}")
    check("A11.GET asset -> 200", code == 200, f"got {code} body={body}")
    check("A11.asset_id matches",
          isinstance(body, dict) and body.get("asset", {}).get("asset_id") == happy_asset_id,
          f"body={body}")

    # A12 PUT update name
    print("\n--- A12: PUT rename asset ---")
    time.sleep(0.05)
    code, body = http("PUT", f"/hunts/{HUNT_ID}/assets/{happy_asset_id}", json_body={"name": "renamed"})
    check("A12.PUT -> 200", code == 200, f"got {code} body={body}")
    upd = (body or {}).get("asset", {}) if isinstance(body, dict) else {}
    check("A12.name=='renamed'", upd.get("name") == "renamed", f"name={upd.get('name')}")
    check("A12.updated_at advanced",
          upd.get("updated_at") and upd.get("updated_at") > upd.get("created_at", ""),
          f"c={upd.get('created_at')} u={upd.get('updated_at')}")

    # A13 PUT invalid latitude
    print("\n--- A13: PUT invalid latitude=999 ---")
    code, body = http("PUT", f"/hunts/{HUNT_ID}/assets/{happy_asset_id}", json_body={"latitude": 999})
    check("A13.PUT lat=999 -> 422", code == 422, f"got {code} body={body}")

    # A14 DELETE asset
    print("\n--- A14: DELETE asset ---")
    code, body = http("DELETE", f"/hunts/{HUNT_ID}/assets/{happy_asset_id}")
    check("A14.DELETE -> 200", code == 200, f"got {code} body={body}")
    check("A14.deleted==1", isinstance(body, dict) and body.get("deleted") == 1, f"body={body}")
    code, body = http("GET", f"/hunts/{HUNT_ID}/assets/{happy_asset_id}")
    check("A14.GET deleted -> 404", code == 404, f"got {code} body={body}")

    # A15 cross-user isolation
    print("\n--- A15: Cross-user isolation (Trial GETs Pro asset) ---")
    target = type_asset_ids.get("stand") or next(iter(type_asset_ids.values()), None)
    if target:
        code, body = http("GET", f"/hunts/{HUNT_ID}/assets/{target}", headers=H_TRIAL)
        check("A15.cross-user GET -> 404", code == 404, f"got {code} body={body}")
    else:
        check("A15.cross-user GET -> 404", False, "no type asset available")

    # ============================================================
    # B. Saved Map Image geo metadata
    # ============================================================
    print("\n--- B16: Minimal upsert ---")
    img1 = f"img_geo_{ts}"
    code, body = http("POST", "/saved-map-images", json_body={"image_id": img1})
    check("B16.POST -> 200", code == 200, f"got {code} body={body}")
    smi = (body or {}).get("saved_map_image", {}) if isinstance(body, dict) else {}
    check("B16.supports_geo_placement==False", smi.get("supports_geo_placement") is False,
          f"sgp={smi.get('supports_geo_placement')}")
    check("B16.source=='upload'", smi.get("source") == "upload", f"source={smi.get('source')}")

    # B17 geo placement without basis
    print("\n--- B17: supports_geo_placement=True without basis ---")
    img2 = f"img_geo2_{ts}"
    code, body = http("POST", "/saved-map-images", json_body={
        "image_id": img2, "supports_geo_placement": True
    })
    check("B17.-> 422", code == 422, f"got {code} body={body}")
    err_text = json.dumps(body) if isinstance(body, dict) else str(body)
    needed = ["original_width", "original_height", "north_lat", "south_lat", "west_lng", "east_lng"]
    for k in needed:
        check(f"B17.error mentions {k}", k in err_text, f"missing in: {err_text[:300]}")

    # B18 full geo payload happy path
    print("\n--- B18: Full geo payload ---")
    img3 = f"img_geo3_{ts}"
    code, body = http("POST", "/saved-map-images", json_body={
        "image_id": img3,
        "hunt_id": HUNT_ID,
        "image_url": "https://example.com/3.jpg",
        "original_width": 1024,
        "original_height": 768,
        "north_lat": 45.0,
        "south_lat": 44.0,
        "west_lng": -93.5,
        "east_lng": -92.5,
        "center_lat": 44.5,
        "center_lng": -93.0,
        "zoom": 14.5,
        "bearing": 10,
        "pitch": 20,
        "source": "maptiler",
        "style": "outdoors-v2",
        "supports_geo_placement": True,
    })
    check("B18.-> 200", code == 200, f"got {code} body={body}")
    smi3 = (body or {}).get("saved_map_image", {}) if isinstance(body, dict) else {}
    check("B18.persisted geo basis",
          smi3.get("supports_geo_placement") is True
          and smi3.get("north_lat") == 45.0
          and smi3.get("source") == "maptiler",
          f"smi3={smi3}")
    img3_created_at = smi3.get("created_at")

    # B19 inverted bounds
    print("\n--- B19: Inverted bounds ---")
    img_bad1 = f"img_bad1_{ts}"
    code, body = http("POST", "/saved-map-images", json_body={
        "image_id": img_bad1,
        "original_width": 1024, "original_height": 768,
        "north_lat": 10, "south_lat": 20,
        "west_lng": -93.5, "east_lng": -92.5,
        "supports_geo_placement": True,
    })
    check("B19.inverted bounds -> 422", code == 422, f"got {code} body={body}")

    # B20 zero-width bounds
    print("\n--- B20: Zero-width bounds ---")
    img_bad2 = f"img_bad2_{ts}"
    code, body = http("POST", "/saved-map-images", json_body={
        "image_id": img_bad2,
        "original_width": 1024, "original_height": 768,
        "north_lat": 45, "south_lat": 44,
        "west_lng": 0, "east_lng": 0,
        "supports_geo_placement": True,
    })
    check("B20.zero-width bounds -> 422", code == 422, f"got {code} body={body}")

    # B21 idempotent re-upsert
    print("\n--- B21: Idempotent re-upsert ---")
    time.sleep(0.05)
    code, body = http("POST", "/saved-map-images", json_body={
        "image_id": img3,
        "hunt_id": HUNT_ID,
        "image_url": "https://example.com/3.jpg",
        "original_width": 1024,
        "original_height": 768,
        "north_lat": 45.0,
        "south_lat": 44.0,
        "west_lng": -93.5,
        "east_lng": -92.5,
        "center_lat": 44.5,
        "center_lng": -93.0,
        "zoom": 14.5,
        "bearing": 10,
        "pitch": 20,
        "source": "maptiler",
        "style": "streets-v2",
        "supports_geo_placement": True,
    })
    check("B21.re-POST -> 200", code == 200, f"got {code} body={body}")
    smi3b = (body or {}).get("saved_map_image", {}) if isinstance(body, dict) else {}
    check("B21.style updated", smi3b.get("style") == "streets-v2", f"style={smi3b.get('style')}")
    check("B21.created_at stable",
          smi3b.get("created_at") == img3_created_at,
          f"c was {img3_created_at} now {smi3b.get('created_at')}")
    check("B21.updated_at advanced",
          smi3b.get("updated_at") and smi3b.get("updated_at") > img3_created_at,
          f"u={smi3b.get('updated_at')} c={img3_created_at}")

    # B22 hunt_id that doesn't exist -> 404
    print("\n--- B22: Non-existent hunt_id on saved-map-images ---")
    img_bad3 = f"img_bad3_{ts}"
    code, body = http("POST", "/saved-map-images", json_body={
        "image_id": img_bad3, "hunt_id": "hunt_does_not_exist_xxxxx",
    })
    check("B22.-> 404", code == 404, f"got {code} body={body}")

    # B23 GET single
    print("\n--- B23: GET /saved-map-images/{id} ---")
    code, body = http("GET", f"/saved-map-images/{img3}")
    check("B23.-> 200", code == 200, f"got {code} body={body}")
    check("B23.image_id matches",
          isinstance(body, dict) and body.get("saved_map_image", {}).get("image_id") == img3,
          f"body={body}")

    # B24 GET filtered by hunt_id
    print("\n--- B24: GET /saved-map-images?hunt_id=... ---")
    code, body = http("GET", "/saved-map-images", params={"hunt_id": HUNT_ID})
    check("B24.-> 200", code == 200, f"got {code} body={body}")
    images = (body or {}).get("saved_map_images") or []
    check("B24.contains img3", any(i.get("image_id") == img3 for i in images),
          f"images_count={len(images)}")
    check("B24.all images for hunt",
          all(i.get("hunt_id") == HUNT_ID for i in images),
          f"hunt_ids={[i.get('hunt_id') for i in images]}")

    # B25 PATCH
    print("\n--- B25: PATCH style ---")
    code, body = http("PATCH", f"/saved-map-images/{img3}", json_body={"style": "satellite-v2"})
    check("B25.-> 200", code == 200, f"got {code} body={body}")
    smi3c = (body or {}).get("saved_map_image", {}) if isinstance(body, dict) else {}
    check("B25.style updated", smi3c.get("style") == "satellite-v2", f"style={smi3c.get('style')}")
    check("B25.bounds unchanged",
          smi3c.get("north_lat") == 45.0 and smi3c.get("south_lat") == 44.0,
          f"smi3c={smi3c}")

    # B26 DELETE
    print("\n--- B26: DELETE /saved-map-images/{id} ---")
    code, body = http("DELETE", f"/saved-map-images/{img3}")
    check("B26.-> 200", code == 200, f"got {code} body={body}")
    check("B26.deleted==1", isinstance(body, dict) and body.get("deleted") == 1, f"body={body}")
    code, body = http("GET", f"/saved-map-images/{img3}")
    check("B26.GET deleted -> 404", code == 404, f"got {code} body={body}")

    # B27 cross-user
    print("\n--- B27: Cross-user GET image_id ---")
    code, body = http("GET", f"/saved-map-images/{img1}", headers=H_TRIAL)
    check("B27.cross-user GET -> 404", code == 404, f"got {code} body={body}")

    # ============================================================
    # C. Backward compatibility
    # ============================================================
    print("\n--- C28: GET /api/health ---")
    code, body = http("GET", "/health", headers={})  # public
    check("C28.health -> 200", code == 200, f"got {code} body={body}")

    print("\n--- C29: GET /api/hunts (Pro) ---")
    code, body = http("GET", "/hunts")
    check("C29.list hunts -> 200", code == 200, f"got {code} body={body}")
    check("C29.contains test hunt",
          isinstance(body, dict) and any(h.get("hunt_id") == HUNT_ID
                                          for h in (body.get("hunts") or [])),
          f"hunts_seen={[h.get('hunt_id') for h in (body or {}).get('hunts', [])][:5]}")

    # ---------------- CLEANUP ----------------
    print("\n--- CLEANUP: Delete test hunt + remaining saved image ---")
    code, body = http("DELETE", f"/hunts/{HUNT_ID}")
    print(f"  DELETE /hunts/{HUNT_ID} -> {code}  body={body}")
    http("DELETE", f"/saved-map-images/{img1}")

    # ---------------- SUMMARY ----------------
    total = passed + len(failed)
    print("\n" + "=" * 70)
    print(f"RESULT: {passed}/{total} substantive assertions PASS")
    if failed:
        print("\nFAILURES:")
        for f in failed:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("ALL ASSERTIONS PASS.")


if __name__ == "__main__":
    main()
