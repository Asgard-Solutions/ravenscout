"""Live integration tests for the Hunt GPS Assets API (Task 3).

Exercises the full CRUD surface mounted by `hunt_geo_router.py` plus
the asset hydration on `GET /api/hunts/{id}` from server.py.

Skips when EXPO_PUBLIC_BACKEND_URL is not set so the suite stays
green in environments without a live backend (matches the pattern
in test_orphan_cleanup.py).

Auth uses the seeded sessions documented in
/app/memory/test_credentials.md:
  * Pro test user (#1) -> test_session_rs_001 -> test-user-001
  * Pro test user (#2) -> test_session_rs_002 -> test-user-002
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
# Trial session is the only OTHER live-seeded session in this env
# (see /app/memory/test_credentials.md). Different user_id from
# PRO_AUTH, which is exactly what we need for the cross-user
# isolation tests.
OTHER_AUTH = {"Authorization": "Bearer test_session_trial_001"}


def _api(path: str) -> str:
    return f"{BASE_URL}/api{path}"


@pytest.fixture
def hunt_id():
    """Create a hunt for the Pro test user and clean it up on teardown.

    The DELETE /api/hunts/{id} endpoint cascades to
    hunt_location_assets thanks to the cleanup hook added in server.py,
    so each test starts and ends with a clean slate.
    """
    hid = f"hunt_assets_test_{int(time.time())}_{uuid.uuid4().hex[:6]}"
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
    # Cleanup — best-effort. If the test already deleted the hunt,
    # this returns 404, which is fine.
    requests.delete(_api(f"/hunts/{hid}"), headers=PRO_AUTH, timeout=10)


# -------------------------------------------------------------------
# CRUD happy paths
# -------------------------------------------------------------------


def test_create_valid_asset(hunt_id):
    payload = {
        "type": "stand",
        "name": "North Ridge Stand",
        "latitude": 32.123456,
        "longitude": -97.123456,
        "notes": "Good for north wind",
    }
    r = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json=payload,
        timeout=10,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    asset = body["asset"]
    assert body["ok"] is True
    assert asset["asset_id"].startswith("hla_")
    assert asset["user_id"] == "test-user-001"
    assert asset["hunt_id"] == hunt_id
    assert asset["type"] == "stand"
    assert asset["name"] == "North Ridge Stand"
    assert asset["latitude"] == pytest.approx(32.123456)
    assert asset["longitude"] == pytest.approx(-97.123456)
    assert asset["notes"] == "Good for north wind"
    assert asset["created_at"] == asset["updated_at"]


@pytest.mark.parametrize(
    "asset_type",
    [
        "stand",
        "blind",
        "feeder",
        "camera",
        "parking",
        "access_point",
        "water",
        "scrape",
        "rub",
        "bedding",
        "custom",
    ],
)
def test_create_each_canonical_type(hunt_id, asset_type):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": asset_type,
            "name": f"{asset_type}_marker",
            "latitude": 30.0,
            "longitude": -97.0,
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert r.json()["asset"]["type"] == asset_type


def test_list_assets_for_hunt(hunt_id):
    # Create three with stable name prefix so we can assert ordering.
    for i, t in enumerate(["stand", "feeder", "camera"]):
        r = requests.post(
            _api(f"/hunts/{hunt_id}/assets"),
            headers={**PRO_AUTH, "Content-Type": "application/json"},
            json={
                "type": t,
                "name": f"asset_{i}",
                "latitude": 30.0 + i * 0.001,
                "longitude": -97.0 - i * 0.001,
            },
            timeout=10,
        )
        assert r.status_code == 200, r.text
        # Tiny pause so created_at ordering is deterministic.
        time.sleep(0.005)

    r = requests.get(_api(f"/hunts/{hunt_id}/assets"), headers=PRO_AUTH, timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["count"] == 3
    names = [a["name"] for a in body["assets"]]
    assert names == ["asset_0", "asset_1", "asset_2"]


def test_update_asset(hunt_id):
    create = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={"type": "stand", "name": "Stand A", "latitude": 30.0, "longitude": -97.0},
        timeout=10,
    )
    assert create.status_code == 200, create.text
    asset_id = create.json()["asset"]["asset_id"]
    original_updated = create.json()["asset"]["updated_at"]

    # Force a measurable timestamp delta
    time.sleep(0.02)

    r = requests.put(
        _api(f"/hunts/{hunt_id}/assets/{asset_id}"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "name": "Stand A (renamed)",
            "type": "blind",
            "latitude": 30.5,
            "longitude": -97.5,
            "notes": "now a blind",
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    a = r.json()["asset"]
    assert a["name"] == "Stand A (renamed)"
    assert a["type"] == "blind"
    assert a["latitude"] == pytest.approx(30.5)
    assert a["longitude"] == pytest.approx(-97.5)
    assert a["notes"] == "now a blind"
    assert a["updated_at"] > original_updated


def test_delete_asset(hunt_id):
    create = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={"type": "stand", "name": "Doomed", "latitude": 30.0, "longitude": -97.0},
        timeout=10,
    )
    assert create.status_code == 200, create.text
    asset_id = create.json()["asset"]["asset_id"]

    d = requests.delete(
        _api(f"/hunts/{hunt_id}/assets/{asset_id}"), headers=PRO_AUTH, timeout=10
    )
    assert d.status_code == 200, d.text
    assert d.json()["deleted"] == 1

    # Subsequent GET → 404
    g = requests.get(
        _api(f"/hunts/{hunt_id}/assets/{asset_id}"), headers=PRO_AUTH, timeout=10
    )
    assert g.status_code == 404


# -------------------------------------------------------------------
# Validation
# -------------------------------------------------------------------


@pytest.mark.parametrize("bad_lat", [99, -91, 1000])
def test_reject_invalid_latitude(hunt_id, bad_lat):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "name": "x",
            "latitude": bad_lat,
            "longitude": -97.0,
        },
        timeout=10,
    )
    assert r.status_code == 422


@pytest.mark.parametrize("bad_lng", [181, -181, 1000])
def test_reject_invalid_longitude(hunt_id, bad_lng):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "name": "x",
            "latitude": 30.0,
            "longitude": bad_lng,
        },
        timeout=10,
    )
    assert r.status_code == 422


def test_reject_missing_name(hunt_id):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={"type": "stand", "latitude": 30.0, "longitude": -97.0},
        timeout=10,
    )
    assert r.status_code == 422


def test_reject_blank_name(hunt_id):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "name": "    ",
            "latitude": 30.0,
            "longitude": -97.0,
        },
        timeout=10,
    )
    assert r.status_code == 422


def test_reject_invalid_type(hunt_id):
    r = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "rocketship",
            "name": "x",
            "latitude": 30.0,
            "longitude": -97.0,
        },
        timeout=10,
    )
    assert r.status_code == 422


def test_update_with_invalid_lat_rejected(hunt_id):
    create = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={"type": "stand", "name": "x", "latitude": 30.0, "longitude": -97.0},
        timeout=10,
    )
    asset_id = create.json()["asset"]["asset_id"]

    r = requests.put(
        _api(f"/hunts/{hunt_id}/assets/{asset_id}"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={"latitude": 999},
        timeout=10,
    )
    assert r.status_code == 422


# -------------------------------------------------------------------
# Authorization / isolation
# -------------------------------------------------------------------


def test_create_against_unknown_hunt_404(hunt_id):  # noqa: ARG001
    r = requests.post(
        _api("/hunts/hunt_does_not_exist_xyz/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={
            "type": "stand",
            "name": "ghost",
            "latitude": 30.0,
            "longitude": -97.0,
        },
        timeout=10,
    )
    assert r.status_code == 404
    assert r.json().get("detail") == "Hunt not found"


def test_other_user_cannot_access_assets(hunt_id):
    # User #1 creates an asset on their hunt.
    create = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={"type": "stand", "name": "private", "latitude": 30.0, "longitude": -97.0},
        timeout=10,
    )
    assert create.status_code == 200, create.text
    asset_id = create.json()["asset"]["asset_id"]

    # User #2 (different test_session_rs_002) tries to read.
    g = requests.get(
        _api(f"/hunts/{hunt_id}/assets/{asset_id}"), headers=OTHER_AUTH, timeout=10
    )
    # The hunt itself doesn't belong to user #2 — list/get under it
    # must 404 (router intentionally does not leak existence).
    assert g.status_code == 404

    # And listing
    list_resp = requests.get(
        _api(f"/hunts/{hunt_id}/assets"), headers=OTHER_AUTH, timeout=10
    )
    assert list_resp.status_code == 404

    # And update / delete attempts must also 404 (defense in depth —
    # even if the hunt-ownership guard were bypassed, the (user_id,
    # hunt_id, asset_id) Mongo filter would still miss).
    upd = requests.put(
        _api(f"/hunts/{hunt_id}/assets/{asset_id}"),
        headers={**OTHER_AUTH, "Content-Type": "application/json"},
        json={"name": "stolen"},
        timeout=10,
    )
    assert upd.status_code == 404

    dlt = requests.delete(
        _api(f"/hunts/{hunt_id}/assets/{asset_id}"), headers=OTHER_AUTH, timeout=10
    )
    assert dlt.status_code == 404


def test_user_cannot_attach_asset_to_other_users_hunt(hunt_id):
    # User #2 tries to POST against user #1's hunt -> 404 hunt not found
    # for them (the ownership guard runs before the asset write).
    r = requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**OTHER_AUTH, "Content-Type": "application/json"},
        json={"type": "stand", "name": "intruder", "latitude": 30.0, "longitude": -97.0},
        timeout=10,
    )
    assert r.status_code == 404


# -------------------------------------------------------------------
# Hunt detail integration + back-compat
# -------------------------------------------------------------------


def test_hunt_detail_hydrates_location_assets(hunt_id):
    # Create two assets...
    for i in range(2):
        requests.post(
            _api(f"/hunts/{hunt_id}/assets"),
            headers={**PRO_AUTH, "Content-Type": "application/json"},
            json={
                "type": "stand",
                "name": f"detail_asset_{i}",
                "latitude": 30.0,
                "longitude": -97.0,
            },
            timeout=10,
        )
        time.sleep(0.005)

    # ...then read the hunt; assets should be hydrated.
    r = requests.get(_api(f"/hunts/{hunt_id}"), headers=PRO_AUTH, timeout=10)
    assert r.status_code == 200, r.text
    hunt = r.json()["hunt"]
    assert "location_assets" in hunt
    assert len(hunt["location_assets"]) == 2
    names = sorted(a["name"] for a in hunt["location_assets"])
    assert names == ["detail_asset_0", "detail_asset_1"]


def test_hunt_detail_with_zero_assets_still_works(hunt_id):
    """A hunt with no assets must return location_assets=[] (back-compat
    for hunts created before the GPS-asset feature)."""
    r = requests.get(_api(f"/hunts/{hunt_id}"), headers=PRO_AUTH, timeout=10)
    assert r.status_code == 200, r.text
    hunt = r.json()["hunt"]
    assert hunt.get("location_assets", []) == []


def test_hunt_detail_skip_assets_via_query(hunt_id):
    requests.post(
        _api(f"/hunts/{hunt_id}/assets"),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json={"type": "stand", "name": "skip_me", "latitude": 30.0, "longitude": -97.0},
        timeout=10,
    )
    r = requests.get(
        _api(f"/hunts/{hunt_id}?include_assets=false"),
        headers=PRO_AUTH,
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert "location_assets" not in r.json()["hunt"]


def test_delete_hunt_cascades_location_assets(hunt_id):
    # Create two assets...
    asset_ids = []
    for i in range(2):
        c = requests.post(
            _api(f"/hunts/{hunt_id}/assets"),
            headers={**PRO_AUTH, "Content-Type": "application/json"},
            json={
                "type": "stand",
                "name": f"casc_{i}",
                "latitude": 30.0,
                "longitude": -97.0,
            },
            timeout=10,
        )
        asset_ids.append(c.json()["asset"]["asset_id"])

    # ... delete the hunt ...
    d = requests.delete(_api(f"/hunts/{hunt_id}"), headers=PRO_AUTH, timeout=10)
    assert d.status_code == 200, d.text

    # ... then re-create the same hunt id (so the asset routes pass
    # the ownership guard) and confirm the assets do NOT come back.
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
    r = requests.get(_api(f"/hunts/{hunt_id}/assets"), headers=PRO_AUTH, timeout=10)
    assert r.status_code == 200
    assert r.json()["count"] == 0
