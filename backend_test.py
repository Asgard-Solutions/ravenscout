"""
Raven Scout backend tests — AWS S3 presign contract + regression smoke.

Run:
    python /app/backend_test.py

Backend URL is taken from /app/frontend/.env (EXPO_PUBLIC_BACKEND_URL).
AWS env is intentionally blank in this environment; we are verifying the
*presign contract* only, not real S3 uploads.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests

FRONTEND_ENV = Path("/app/frontend/.env")


def _load_backend_url() -> str:
    # Prefer EXPO_PUBLIC_BACKEND_URL from the frontend .env (Kubernetes ingress).
    if FRONTEND_ENV.exists():
        for line in FRONTEND_ENV.read_text().splitlines():
            line = line.strip()
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val:
                    return val.rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")


BASE = _load_backend_url()
API = f"{BASE}/api"

PRO_TOKEN = "test_session_rs_001"     # user_id=test-user-001, tier=pro
TRIAL_TOKEN = "test_session_trial_001"  # user_id=test-user-trial, tier=trial
PRO_USER_ID = "test-user-001"

# ---------- tiny assertion framework ------------------------------------

PASS: list[str] = []
FAIL: list[tuple[str, str]] = []


def ok(name: str, detail: str = "") -> None:
    PASS.append(name)
    print(f"  PASS  {name}" + (f"  ({detail})" if detail else ""))


def fail(name: str, detail: str) -> None:
    FAIL.append((name, detail))
    print(f"  FAIL  {name}  :: {detail}")


def expect_status(name: str, resp: requests.Response, expected: int) -> bool:
    body_preview = resp.text[:300].replace("\n", " ")
    if resp.status_code == expected:
        ok(name, f"{resp.status_code} body={body_preview}")
        return True
    fail(name, f"expected {expected} got {resp.status_code} body={body_preview}")
    return False


def expect_json(resp: requests.Response) -> dict:
    try:
        return resp.json()
    except Exception:
        return {}


# ---------- regression smoke --------------------------------------------

def test_regression_smoke() -> None:
    print("\n[REGRESSION SMOKE]")

    # /api/health
    r = requests.get(f"{API}/health", timeout=15)
    if expect_status("GET /api/health -> 200", r, 200):
        if expect_json(r).get("status") == "ok":
            ok("GET /api/health body.status == 'ok'")
        else:
            fail("GET /api/health body.status == 'ok'", f"body={r.text}")

    # /api/auth/me with Pro bearer
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {PRO_TOKEN}"}, timeout=15)
    if expect_status("GET /api/auth/me (Pro bearer) -> 200", r, 200):
        body = expect_json(r)
        if body.get("tier") == "pro" and body.get("user_id") == PRO_USER_ID:
            ok("auth/me identity+tier correct", f"tier={body.get('tier')} user_id={body.get('user_id')}")
        else:
            fail("auth/me identity+tier correct", f"body={body}")

    # /api/subscription/tiers (public)
    r = requests.get(f"{API}/subscription/tiers", timeout=15)
    if expect_status("GET /api/subscription/tiers -> 200", r, 200):
        body = expect_json(r)
        tiers = body.get("tiers", {})
        if {"trial", "core", "pro"}.issubset(tiers.keys()):
            ok("subscription/tiers contains trial/core/pro")
        else:
            fail("subscription/tiers contains trial/core/pro", f"keys={list(tiers.keys())}")

    # /api/species
    r = requests.get(f"{API}/species", timeout=15)
    if expect_status("GET /api/species -> 200", r, 200):
        body = expect_json(r)
        species_ids = {s.get("id") for s in body.get("species", [])}
        if {"deer", "turkey", "hog"}.issubset(species_ids):
            ok("GET /api/species includes deer/turkey/hog")
        else:
            fail("GET /api/species includes deer/turkey/hog", f"got={species_ids}")


# ---------- /api/media/presign-upload -----------------------------------

VALID_UPLOAD_BODY = {
    "imageId": "img_t1",
    "huntId": "hunt_t1",
    "role": "primary",
    "mime": "image/jpeg",
    "extension": "jpg",
}


def test_presign_upload() -> None:
    print("\n[POST /api/media/presign-upload]")
    url = f"{API}/media/presign-upload"

    # 1) No auth -> 401
    r = requests.post(url, json=VALID_UPLOAD_BODY, timeout=15)
    expect_status("no-auth -> 401", r, 401)

    # 2) Trial user -> 403 Pro-gated
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {TRIAL_TOKEN}"},
        json=VALID_UPLOAD_BODY,
        timeout=15,
    )
    if expect_status("trial bearer -> 403", r, 403):
        detail = (expect_json(r).get("detail") or "").lower()
        if "pro" in detail:
            ok("403 detail mentions Pro tier")
        else:
            fail("403 detail mentions Pro tier", f"detail={detail}")

    # 3) Pro + invalid role -> 400 (must run BEFORE S3 configured check)
    bad_role = dict(VALID_UPLOAD_BODY, role="bogus")
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json=bad_role,
        timeout=15,
    )
    if expect_status("pro + invalid role 'bogus' -> 400", r, 400):
        detail = (expect_json(r).get("detail") or "").lower()
        if "role" in detail:
            ok("role error detail mentions 'role'")
        else:
            fail("role error detail mentions 'role'", f"detail={detail}")

    # 4) Pro + invalid extension -> 400
    bad_ext = dict(VALID_UPLOAD_BODY, extension="exe")
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json=bad_ext,
        timeout=15,
    )
    if expect_status("pro + invalid extension 'exe' -> 400", r, 400):
        detail = (expect_json(r).get("detail") or "").lower()
        if "extension" in detail:
            ok("extension error detail mentions 'extension'")
        else:
            fail("extension error detail mentions 'extension'", f"detail={detail}")

    # 5) Pro + non-image mime -> 400
    bad_mime = dict(VALID_UPLOAD_BODY, mime="application/octet-stream")
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json=bad_mime,
        timeout=15,
    )
    expect_status("pro + non-image mime -> 400", r, 400)

    # 6) Pro + valid body -> 503 (AWS intentionally not configured)
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json=VALID_UPLOAD_BODY,
        timeout=15,
    )
    if expect_status("pro + valid payload -> 503 (S3 not configured)", r, 503):
        detail = (expect_json(r).get("detail") or "").lower()
        if "not configured" in detail or "cloud media" in detail:
            ok("503 detail mentions not-configured")
        else:
            fail("503 detail mentions not-configured", f"detail={detail}")


# ---------- /api/media/presign-download ---------------------------------

def test_presign_download() -> None:
    print("\n[POST /api/media/presign-download]")
    url = f"{API}/media/presign-download"

    own_key = f"hunts/{PRO_USER_ID}/h1/primary/img.jpg"
    other_key = "hunts/ANOTHER_USER/h1/primary/img.jpg"

    # 1) No auth -> 401
    r = requests.post(url, json={"storageKey": own_key}, timeout=15)
    expect_status("no-auth -> 401", r, 401)

    # 2) Trial user -> 403 Pro-gated
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {TRIAL_TOKEN}"},
        json={"storageKey": own_key},
        timeout=15,
    )
    expect_status("trial bearer -> 403", r, 403)

    # 3) Path-traversal storageKey containing '..' -> 400
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json={"storageKey": f"hunts/{PRO_USER_ID}/../evil/img.jpg"},
        timeout=15,
    )
    expect_status("pro + key containing '..' -> 400", r, 400)

    # 4) storageKey starting with '/' -> 400
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json={"storageKey": f"/hunts/{PRO_USER_ID}/h1/primary/img.jpg"},
        timeout=15,
    )
    expect_status("pro + key starting with '/' -> 400", r, 400)

    # 4b) Key not starting with 'hunts/' -> 400
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json={"storageKey": "uploads/foo/bar.jpg"},
        timeout=15,
    )
    expect_status("pro + non-'hunts/' prefix -> 400", r, 400)

    # 5) Ownership mismatch -> 403 (must run BEFORE S3 configured check)
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json={"storageKey": other_key},
        timeout=15,
    )
    if expect_status("pro + cross-user key -> 403", r, 403):
        detail = (expect_json(r).get("detail") or "").lower()
        if "does not belong" in detail or "caller" in detail:
            ok("403 detail names ownership violation")
        else:
            fail("403 detail names ownership violation", f"detail={detail}")

    # 6) Pro + own valid key -> 503 (S3 not configured)
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json={"storageKey": own_key},
        timeout=15,
    )
    if expect_status("pro + own key -> 503 (S3 not configured)", r, 503):
        detail = (expect_json(r).get("detail") or "").lower()
        if "not configured" in detail:
            ok("503 detail mentions not-configured")
        else:
            fail("503 detail mentions not-configured", f"detail={detail}")


# ---------- /api/media/delete -------------------------------------------

def test_media_delete() -> None:
    print("\n[POST /api/media/delete]")
    url = f"{API}/media/delete"

    own_key = f"hunts/{PRO_USER_ID}/h1/primary/img.jpg"
    other_key = "hunts/ANOTHER_USER/h1/primary/img.jpg"

    # 1) No auth -> 401
    r = requests.post(url, json={"storageKey": own_key}, timeout=15)
    expect_status("no-auth -> 401", r, 401)

    # 2) Trial -> 403 Pro-gated
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {TRIAL_TOKEN}"},
        json={"storageKey": own_key},
        timeout=15,
    )
    expect_status("trial bearer -> 403", r, 403)

    # 3) Path traversal -> 400
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json={"storageKey": f"hunts/{PRO_USER_ID}/../evil/img.jpg"},
        timeout=15,
    )
    expect_status("pro + '..' key -> 400", r, 400)

    # 4) Starts with '/' -> 400
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json={"storageKey": f"/hunts/{PRO_USER_ID}/h1/primary/img.jpg"},
        timeout=15,
    )
    expect_status("pro + '/' prefix key -> 400", r, 400)

    # 5) Ownership mismatch -> 403 (before S3-config check)
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json={"storageKey": other_key},
        timeout=15,
    )
    expect_status("pro + cross-user key -> 403", r, 403)

    # 6) Pro + own valid key -> 200 with {success:false, reason:"S3 not configured"}
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        json={"storageKey": own_key},
        timeout=15,
    )
    if expect_status("pro + own key -> 200 soft-fail", r, 200):
        body = expect_json(r)
        if body.get("success") is False and "not configured" in (body.get("reason") or "").lower():
            ok("delete body = {success:false, reason:'S3 not configured'}", f"body={body}")
        else:
            fail(
                "delete body = {success:false, reason:'S3 not configured'}",
                f"got={body}",
            )


# ---------- main --------------------------------------------------------

def main() -> int:
    print(f"Using API base: {API}")
    try:
        test_regression_smoke()
        test_presign_upload()
        test_presign_download()
        test_media_delete()
    except requests.RequestException as e:
        print(f"\nNETWORK ERROR: {e}")
        return 2

    print("\n============================================================")
    print(f"PASS: {len(PASS)}")
    print(f"FAIL: {len(FAIL)}")
    for name, why in FAIL:
        print(f"  - {name}: {why}")
    print("============================================================")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
