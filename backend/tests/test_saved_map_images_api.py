"""Live integration tests for the Saved Map Image API (Task 5).

Validates that app-generated MapTiler images round-trip through
/api/saved-map-images with full geo metadata, and uploaded images
land as pixel-only records.

Skips when EXPO_PUBLIC_BACKEND_URL is unset (matches the
test_hunt_assets_api.py / test_orphan_cleanup.py pattern).
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not set", allow_module_level=True)

PRO_AUTH = {"Authorization": "Bearer test_session_rs_001"}
OTHER_AUTH = {"Authorization": "Bearer test_session_trial_001"}


def _api(path: str) -> str:
    return f"{BASE_URL}/api{path}"


@pytest.fixture
def hunt_id():
    hid = f"hunt_smi_test_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    resp = requests.post(
        _api("/hunts"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "hunt_id": hid,
            "metadata": {
                "species": "whitetail",
                "speciesName": "Whitetail Deer",
                "date": "2026-02-01",
                "timeWindow": "AM",
                "windDirection": "N",
            },
        },
        timeout=10,
    )
    assert resp.status_code == 200, resp.text
    yield hid
    requests.delete(_api(f"/hunts/{hid}"), headers=PRO_AUTH, timeout=10)


def _maptiler_payload(image_id: str, hunt_id_: str) -> dict:
    return {
        "image_id": image_id,
        "hunt_id": hunt_id_,
        "image_url": "https://example.com/maps/3.jpg",
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
    }


# -------------------------------------------------------------------
# MapTiler / app-generated path
# -------------------------------------------------------------------


def test_app_generated_image_saves_geo_metadata(hunt_id):
    image_id = f"img_mt_{uuid.uuid4().hex[:8]}"
    r = requests.post(
        _api("/saved-map-images"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json=_maptiler_payload(image_id, hunt_id),
        timeout=10,
    )
    assert r.status_code == 200, r.text
    smi = r.json()["saved_map_image"]
    assert smi["image_id"] == image_id
    assert smi["source"] == "maptiler"
    assert smi["supports_geo_placement"] is True
    assert smi["original_width"] == 1024
    assert smi["original_height"] == 768
    assert smi["north_lat"] == pytest.approx(45.0)
    assert smi["south_lat"] == pytest.approx(44.0)
    assert smi["west_lng"] == pytest.approx(-93.5)
    assert smi["east_lng"] == pytest.approx(-92.5)
    assert smi["zoom"] == pytest.approx(14.5)
    assert smi["style"] == "outdoors-v2"


def test_app_generated_image_idempotent_upsert(hunt_id):
    image_id = f"img_mt_idem_{uuid.uuid4().hex[:8]}"
    payload = _maptiler_payload(image_id, hunt_id)
    r1 = requests.post(
        _api("/saved-map-images"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json=payload,
        timeout=10,
    )
    assert r1.status_code == 200, r1.text
    created_at_1 = r1.json()["saved_map_image"]["created_at"]
    updated_at_1 = r1.json()["saved_map_image"]["updated_at"]

    time.sleep(0.05)
    payload2 = {**payload, "style": "satellite-v2"}
    r2 = requests.post(
        _api("/saved-map-images"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json=payload2,
        timeout=10,
    )
    assert r2.status_code == 200
    smi2 = r2.json()["saved_map_image"]
    assert smi2["created_at"] == created_at_1
    assert smi2["updated_at"] > updated_at_1
    assert smi2["style"] == "satellite-v2"


# -------------------------------------------------------------------
# Uploaded / pixel-only path
# -------------------------------------------------------------------


def test_uploaded_image_saves_as_pixel_only(hunt_id):
    image_id = f"img_up_{uuid.uuid4().hex[:8]}"
    r = requests.post(
        _api("/saved-map-images"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "image_id": image_id,
            "hunt_id": hunt_id,
            "original_width": 600,
            "original_height": 400,
            "source": "upload",
            "supports_geo_placement": False,
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    smi = r.json()["saved_map_image"]
    assert smi["source"] == "upload"
    assert smi["supports_geo_placement"] is False
    assert smi["original_width"] == 600
    assert smi["original_height"] == 400
    assert smi["north_lat"] is None
    assert smi["south_lat"] is None
    assert smi["west_lng"] is None
    assert smi["east_lng"] is None
    assert smi["zoom"] is None
    assert smi["style"] is None


def test_geo_placement_without_bounds_rejected():
    # Bounds-required when supports_geo_placement=true.
    image_id = f"img_bad_{uuid.uuid4().hex[:8]}"
    r = requests.post(
        _api("/saved-map-images"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={"image_id": image_id, "supports_geo_placement": True},
        timeout=10,
    )
    assert r.status_code == 422


# -------------------------------------------------------------------
# Existing flow back-compat
# -------------------------------------------------------------------


def test_missing_record_returns_404():
    # Existing saved hunt images that have no SavedMapImage row yet
    # must NOT crash readers \u2014 they should just 404.
    r = requests.get(
        _api(f"/saved-map-images/img_does_not_exist_{uuid.uuid4().hex[:6]}"),
        headers=PRO_AUTH,
        timeout=10,
    )
    assert r.status_code == 404


def test_list_filtered_by_hunt(hunt_id):
    a = f"img_list_a_{uuid.uuid4().hex[:6]}"
    b = f"img_list_b_{uuid.uuid4().hex[:6]}"
    for img in (a, b):
        r = requests.post(
            _api("/saved-map-images"),
            headers={**PRO_AUTH, "Content-Type": "application/json"},
            json=_maptiler_payload(img, hunt_id),
            timeout=10,
        )
        assert r.status_code == 200, r.text

    r = requests.get(
        _api(f"/saved-map-images?hunt_id={hunt_id}"),
        headers=PRO_AUTH,
        timeout=10,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    image_ids = {x["image_id"] for x in body["saved_map_images"]}
    assert a in image_ids and b in image_ids


# -------------------------------------------------------------------
# Auth isolation
# -------------------------------------------------------------------


def test_other_user_cannot_read(hunt_id):
    image_id = f"img_iso_{uuid.uuid4().hex[:8]}"
    requests.post(
        _api("/saved-map-images"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json=_maptiler_payload(image_id, hunt_id),
        timeout=10,
    )
    r = requests.get(
        _api(f"/saved-map-images/{image_id}"), headers=OTHER_AUTH, timeout=10
    )
    assert r.status_code == 404
