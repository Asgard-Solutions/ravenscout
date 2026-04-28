"""Live integration tests for the Analysis Overlay Items API (Task 6).

Skips when EXPO_PUBLIC_BACKEND_URL is unset.
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
    hid = f"hunt_aoi_test_{int(time.time())}_{uuid.uuid4().hex[:6]}"
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


@pytest.fixture
def asset_id(hunt_id):
    """Pre-create a HuntLocationAsset for user_provided overlay tests."""
    r = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "name": "Source Asset",
            "latitude": 32.123456,
            "longitude": -97.123456,
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()["asset"]["asset_id"]


# ---------- Happy paths ----------


def test_create_user_provided_overlay_with_gps(hunt_id, asset_id):
    payload = {
        "type": "stand",
        "label": "North Ridge Stand",
        "description": "Primary tree stand",
        "latitude": 32.123456,
        "longitude": -97.123456,
        "x": 540.5,
        "y": 320.7,
        "coordinate_source": "user_provided",
        "source_asset_id": asset_id,
        "confidence": 0.95,
    }
    r = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json=payload,
        timeout=10,
    )
    assert r.status_code == 200, r.text
    item = r.json()["overlay_item"]
    assert item["item_id"].startswith("aoi_")
    assert item["coordinate_source"] == "user_provided"
    assert item["source_asset_id"] == asset_id
    assert item["latitude"] == pytest.approx(32.123456)
    assert item["longitude"] == pytest.approx(-97.123456)
    assert item["x"] == pytest.approx(540.5)
    assert item["y"] == pytest.approx(320.7)
    assert item["confidence"] == pytest.approx(0.95)


def test_create_pixel_only_overlay(hunt_id):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "recommended_setup",
            "label": "Edge of food plot",
            "x": 400,
            "y": 300,
            "coordinate_source": "pixel_only",
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    item = r.json()["overlay_item"]
    assert item["coordinate_source"] == "pixel_only"
    assert item["latitude"] is None
    assert item["longitude"] is None
    assert item["source_asset_id"] is None


def test_create_ai_estimated_overlay(hunt_id):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "funnel",
            "label": "Saddle between ridges",
            "latitude": 32.0,
            "longitude": -97.0,
            "x": 120,
            "y": 240,
            "coordinate_source": "ai_estimated_from_image",
            "confidence": 0.7,
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text


# ---------- Validation ----------


def test_invalid_type_rejected(hunt_id):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "rocketship",
            "label": "x",
            "coordinate_source": "pixel_only",
            "x": 0,
            "y": 0,
        },
        timeout=10,
    )
    assert r.status_code == 422


def test_invalid_coordinate_source_rejected(hunt_id):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "label": "x",
            "coordinate_source": "telepathic",
            "x": 0,
            "y": 0,
        },
        timeout=10,
    )
    assert r.status_code == 422


@pytest.mark.parametrize("bad_lat", [99, -91])
def test_invalid_latitude_rejected(hunt_id, asset_id, bad_lat):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "label": "x",
            "latitude": bad_lat,
            "longitude": -97.0,
            "coordinate_source": "user_provided",
            "source_asset_id": asset_id,
        },
        timeout=10,
    )
    assert r.status_code == 422


def test_user_provided_without_source_asset_rejected(hunt_id):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "label": "x",
            "latitude": 32.0,
            "longitude": -97.0,
            "coordinate_source": "user_provided",
        },
        timeout=10,
    )
    assert r.status_code == 422


def test_user_provided_with_unknown_asset_rejected(hunt_id):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "label": "x",
            "latitude": 32.0,
            "longitude": -97.0,
            "coordinate_source": "user_provided",
            "source_asset_id": "hla_does_not_exist",
        },
        timeout=10,
    )
    assert r.status_code == 400


def test_pixel_only_with_lat_lng_rejected(hunt_id):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "label": "x",
            "latitude": 32.0,
            "longitude": -97.0,
            "coordinate_source": "pixel_only",
        },
        timeout=10,
    )
    assert r.status_code == 422


def test_blank_label_rejected(hunt_id):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "label": "    ",
            "coordinate_source": "pixel_only",
            "x": 0,
            "y": 0,
        },
        timeout=10,
    )
    assert r.status_code == 422


# ---------- Persistence + retrieval ----------


def test_list_and_get_overlay_items(hunt_id, asset_id):
    # Create three items with stable label prefix.
    for i in range(3):
        r = requests.post(
            _api(f"/hunts/{hunt_id}/overlay-items"),
            headers={**PRO_AUTH, "Content-Type": "application/json"},
            json={
                "type": "stand",
                "label": f"item_{i}",
                "latitude": 32.0,
                "longitude": -97.0,
                "x": float(i),
                "y": float(i),
                "coordinate_source": "user_provided",
                "source_asset_id": asset_id,
            },
            timeout=10,
        )
        assert r.status_code == 200, r.text
        time.sleep(0.005)

    list_resp = requests.get(
        _api(f"/hunts/{hunt_id}/overlay-items"), headers=PRO_AUTH, timeout=10
    )
    assert list_resp.status_code == 200
    body = list_resp.json()
    assert body["count"] == 3
    labels = [i["label"] for i in body["overlay_items"]]
    assert labels == ["item_0", "item_1", "item_2"]

    # GET single
    first_id = body["overlay_items"][0]["item_id"]
    g = requests.get(
        _api(f"/hunts/{hunt_id}/overlay-items/{first_id}"),
        headers=PRO_AUTH,
        timeout=10,
    )
    assert g.status_code == 200
    item = g.json()["overlay_item"]
    # Coordinate metadata + source attribution preserved across read.
    assert item["coordinate_source"] == "user_provided"
    assert item["source_asset_id"] == asset_id
    assert item["latitude"] is not None
    assert item["x"] is not None


def test_update_overlay_item(hunt_id, asset_id):
    create = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "label": "to-rename",
            "latitude": 32.0,
            "longitude": -97.0,
            "coordinate_source": "user_provided",
            "source_asset_id": asset_id,
        },
        timeout=10,
    )
    item_id = create.json()["overlay_item"]["item_id"]
    original_updated = create.json()["overlay_item"]["updated_at"]
    time.sleep(0.02)

    r = requests.put(
        _api(f"/hunts/{hunt_id}/overlay-items/{item_id}"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={"label": "renamed", "confidence": 0.5},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    item = r.json()["overlay_item"]
    assert item["label"] == "renamed"
    assert item["confidence"] == pytest.approx(0.5)
    assert item["updated_at"] > original_updated


def test_delete_overlay_item(hunt_id, asset_id):
    create = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "label": "doomed",
            "latitude": 32.0,
            "longitude": -97.0,
            "coordinate_source": "user_provided",
            "source_asset_id": asset_id,
        },
        timeout=10,
    )
    item_id = create.json()["overlay_item"]["item_id"]
    d = requests.delete(
        _api(f"/hunts/{hunt_id}/overlay-items/{item_id}"),
        headers=PRO_AUTH,
        timeout=10,
    )
    assert d.status_code == 200
    g = requests.get(
        _api(f"/hunts/{hunt_id}/overlay-items/{item_id}"),
        headers=PRO_AUTH,
        timeout=10,
    )
    assert g.status_code == 404


# ---------- Auth isolation ----------


def test_other_user_cannot_access(hunt_id):
    create = requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "label": "private",
            "x": 0,
            "y": 0,
            "coordinate_source": "pixel_only",
        },
        timeout=10,
    )
    item_id = create.json()["overlay_item"]["item_id"]
    g = requests.get(
        _api(f"/hunts/{hunt_id}/overlay-items/{item_id}"),
        headers=OTHER_AUTH,
        timeout=10,
    )
    assert g.status_code == 404
    list_resp = requests.get(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers=OTHER_AUTH,
        timeout=10,
    )
    assert list_resp.status_code == 404


# ---------- Cascade ----------


def test_delete_hunt_cascades_overlay_items(hunt_id, asset_id):
    requests.post(
        _api(f"/hunts/{hunt_id}/overlay-items"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "label": "casc",
            "latitude": 32.0,
            "longitude": -97.0,
            "coordinate_source": "user_provided",
            "source_asset_id": asset_id,
        },
        timeout=10,
    )
    requests.delete(_api(f"/hunts/{hunt_id}"), headers=PRO_AUTH, timeout=10)

    # Re-create the same hunt id and verify zero overlay items.
    requests.post(
        _api("/hunts"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "hunt_id": hunt_id,
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
    list_resp = requests.get(
        _api(f"/hunts/{hunt_id}/overlay-items"), headers=PRO_AUTH, timeout=10
    )
    assert list_resp.status_code == 200
    assert list_resp.json()["count"] == 0
