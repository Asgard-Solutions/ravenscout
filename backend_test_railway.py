"""
Railway-readiness backend tests.

Covers:
  1. POST /api/auth/google — new portable Google OAuth endpoint
  2. POST /api/analyze-hunt — OpenAI direct LLM path (not LiteLLM)
  3. Regression: /api/health, /api/auth/me, /api/subscription/tiers,
     /api/hunts CRUD spot check
  4. Railway deployment files present + valid
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import uuid
from pathlib import Path

import requests

FRONTEND_ENV = Path("/app/frontend/.env")
BACKEND_DIR = Path("/app/backend")


def _load_backend_url() -> str:
    for line in FRONTEND_ENV.read_text().splitlines():
        line = line.strip()
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            val = line.split("=", 1)[1].strip().strip('"').strip("'")
            if val:
                return val.rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL missing")


BASE = _load_backend_url()
API = f"{BASE}/api"

PRO_TOKEN = "test_session_rs_001"  # test-user-001 / tier=pro

PASS: list[str] = []
FAIL: list[tuple[str, str]] = []


def ok(name: str, detail: str = "") -> None:
    PASS.append(name)
    print(f"  PASS  {name}" + (f"  ({detail})" if detail else ""))


def fail(name: str, detail: str) -> None:
    FAIL.append((name, detail))
    print(f"  FAIL  {name}  ({detail})")


def section(title: str) -> None:
    print(f"\n=== {title} ===")


# ---------- helper: build a real 256x256 PNG --------------------------------

def make_png_256() -> str:
    """Return base64 of a solid 256x256 PNG. Use Pillow if available else a
    pre-built minimal PNG."""
    try:
        from PIL import Image  # pillow is in requirements.txt
        img = Image.new("RGB", (256, 256), color=(34, 89, 45))
        # Draw some variation so OpenAI doesn't flag as blank
        px = img.load()
        for y in range(0, 256, 16):
            for x in range(256):
                px[x, y] = (180, 120, 60)
        for x in range(0, 256, 16):
            for y in range(256):
                px[x, y] = (220, 220, 220)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception as e:
        raise RuntimeError(f"Pillow required to build PNG: {e}")


# ============================================================================
# 1. /api/auth/google
# ============================================================================

def test_auth_google_missing_body() -> None:
    section("AUTH GOOGLE — missing / empty id_token")
    # No body
    r = requests.post(f"{API}/auth/google", timeout=20)
    if r.status_code == 422:
        ok("no body -> 422 validation error", f"status={r.status_code}")
    else:
        fail("no body -> 422", f"got {r.status_code}: {r.text[:200]}")

    # Empty body
    r = requests.post(f"{API}/auth/google", json={}, timeout=20)
    if r.status_code == 422:
        ok("empty body -> 422 validation error")
    else:
        fail("empty body -> 422", f"got {r.status_code}: {r.text[:200]}")

    # id_token present but empty string — pydantic accepts "" since there is
    # no min_length constraint, so this will fall through to google verify
    # and return 401 "Invalid Google credential". Both 401 and 422 are
    # acceptable "non-500" behavior.
    r = requests.post(f"{API}/auth/google", json={"id_token": ""}, timeout=20)
    if r.status_code in (401, 422):
        ok("empty id_token string -> 401 or 422 (no 500)", f"status={r.status_code}")
    else:
        fail("empty id_token string -> 401/422", f"got {r.status_code}: {r.text[:200]}")


def test_auth_google_malformed() -> None:
    section("AUTH GOOGLE — malformed token rejected with 401")
    r = requests.post(f"{API}/auth/google", json={"id_token": "bogus"}, timeout=20)
    if r.status_code != 401:
        fail("malformed 'bogus' -> 401", f"got {r.status_code}: {r.text[:200]}")
    else:
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = ""
        if "Invalid Google credential" in detail:
            ok("malformed 'bogus' -> 401 'Invalid Google credential'")
        else:
            fail(
                "malformed 'bogus' -> 401 detail text",
                f"detail was: {detail!r}",
            )


def test_auth_google_tampered() -> None:
    section("AUTH GOOGLE — tampered / fake JWT rejected with 401")
    # Build a plausible-looking JWT that will fail signature verification
    header = base64.urlsafe_b64encode(
        json.dumps({"alg": "RS256", "typ": "JWT", "kid": "abc"}).encode()
    ).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(
        json.dumps({
            "iss": "accounts.google.com",
            "aud": "606163577844-8l9k4u38rlle46g4sbqnsaf0u08uluua.apps.googleusercontent.com",
            "sub": "1234567890",
            "email": "attacker@example.com",
            "email_verified": True,
            "exp": 9999999999,
            "iat": 1000000000,
        }).encode()
    ).rstrip(b"=").decode()
    sig = base64.urlsafe_b64encode(b"not-a-real-signature").rstrip(b"=").decode()
    tampered = f"{header}.{payload}.{sig}"

    r = requests.post(
        f"{API}/auth/google", json={"id_token": tampered}, timeout=20
    )
    if r.status_code == 401:
        ok("tampered JWT -> 401")
    else:
        fail("tampered JWT -> 401", f"got {r.status_code}: {r.text[:200]}")


def test_auth_google_garbage() -> None:
    section("AUTH GOOGLE — garbage strings never 500")
    for label, tok in [
        ("three-dots", "a.b.c"),
        ("unicode", "üñîçôdé.junk.here"),
        ("long", "x" * 4000),
    ]:
        r = requests.post(
            f"{API}/auth/google", json={"id_token": tok}, timeout=20
        )
        if r.status_code == 401:
            ok(f"{label} -> 401 (no 500)")
        else:
            fail(f"{label} -> 401", f"got {r.status_code}: {r.text[:200]}")


# ============================================================================
# 2. /api/analyze-hunt — OpenAI direct path
# ============================================================================

def test_analyze_hunt_openai_path() -> None:
    section("ANALYZE-HUNT — OpenAI direct path (LLM swap regression)")
    png_b64 = make_png_256()

    body = {
        "conditions": {
            "animal": "deer",
            "hunt_date": "2026-02-15",
            "time_window": "morning",
            "wind_direction": "NW",
            "property_type": "private",
            "region": "SE-US",
            "hunt_style": "saddle",
            "latitude": 32.5,
            "longitude": -95.5,
            "temperature": "38F",
        },
        "map_image_base64": png_b64,
        "additional_images": [],
    }
    headers = {
        "Authorization": f"Bearer {PRO_TOKEN}",
        "Content-Type": "application/json",
    }
    r = requests.post(
        f"{API}/analyze-hunt", json=body, headers=headers, timeout=180
    )
    if r.status_code != 200:
        fail(
            "analyze-hunt -> 200",
            f"got {r.status_code}: {r.text[:400]}",
        )
        return
    ok("analyze-hunt -> 200")

    try:
        payload = r.json()
    except Exception as e:
        fail("analyze-hunt JSON parse", f"{e}: {r.text[:200]}")
        return

    if payload.get("success") is True:
        ok("analyze-hunt success=true")
    else:
        fail(
            "analyze-hunt success=true",
            f"payload.success={payload.get('success')} error={payload.get('error')}",
        )
        return

    # region_resolution
    rr = payload.get("region_resolution")
    if isinstance(rr, dict) and rr.get("resolvedRegionId"):
        ok(
            "region_resolution present",
            f"id={rr.get('resolvedRegionId')} source={rr.get('regionResolutionSource')}",
        )
    else:
        fail("region_resolution present + well-shaped", f"got={rr}")

    # hunt_style_resolution
    hs = payload.get("hunt_style_resolution")
    if isinstance(hs, dict) and hs.get("styleId") == "saddle":
        ok(
            "hunt_style_resolution canonicalized",
            f"styleId={hs.get('styleId')} source={hs.get('source')}",
        )
    else:
        fail(
            "hunt_style_resolution == saddle/user_selected",
            f"got={hs}",
        )

    # Result skeleton
    res = payload.get("result") or {}
    if res.get("id") and "overlays" in res:
        ok(
            "result.id + result.overlays present",
            f"overlays={len(res.get('overlays') or [])}",
        )
    else:
        fail("result.id + overlays", f"result keys={list(res.keys())}")


def test_analyze_hunt_logs_openai_path() -> None:
    section("ANALYZE-HUNT — backend logs show OpenAI path (no emergentintegrations)")
    log_path = Path("/var/log/supervisor/backend.err.log")
    if not log_path.exists():
        fail("backend.err.log exists", str(log_path))
        return
    try:
        tail = log_path.read_text(errors="ignore").splitlines()[-500:]
    except Exception as e:
        fail("backend.err.log readable", str(e))
        return
    joined = "\n".join(tail)
    # The legacy path imports emergentintegrations inside
    # analyze_map_with_ai ONLY when OPENAI_API_KEY is not set. With
    # OPENAI_API_KEY set, that import line is never executed.
    # We therefore do a soft check: no "LiteLLM" errors on a successful
    # path, and no "from emergentintegrations" traceback line.
    bad_markers = [
        "emergentintegrations.llm.chat",
        "LlmChat",
        "litellm.exceptions",
        "litellm.APIError",
    ]
    hits = [m for m in bad_markers if m in joined]
    if not hits:
        ok("no emergentintegrations / LiteLLM markers in recent logs")
    else:
        fail(
            "no emergentintegrations / LiteLLM markers",
            f"found {hits} in last 500 lines",
        )


# ============================================================================
# 3. Regression smoke on other endpoints
# ============================================================================

def test_health() -> None:
    section("REGRESSION — GET /api/health")
    r = requests.get(f"{API}/health", timeout=20)
    if r.status_code == 200 and r.json().get("status") == "ok":
        ok("/api/health -> 200 ok")
    else:
        fail("/api/health", f"{r.status_code} {r.text[:200]}")


def test_auth_me() -> None:
    section("REGRESSION — GET /api/auth/me (PRO bearer)")
    r = requests.get(
        f"{API}/auth/me",
        headers={"Authorization": f"Bearer {PRO_TOKEN}"},
        timeout=20,
    )
    if r.status_code != 200:
        fail("/api/auth/me -> 200", f"{r.status_code} {r.text[:200]}")
        return
    js = r.json()
    if js.get("tier") == "pro" and js.get("user_id") == "test-user-001":
        ok("/api/auth/me tier=pro user_id=test-user-001")
    else:
        fail("/api/auth/me body", f"got={js}")


def test_subscription_tiers() -> None:
    section("REGRESSION — GET /api/subscription/tiers (public)")
    r = requests.get(f"{API}/subscription/tiers", timeout=20)
    if r.status_code == 200 and set(r.json().get("tiers", {}).keys()) >= {
        "trial",
        "core",
        "pro",
    }:
        ok("/api/subscription/tiers present trial/core/pro")
    else:
        fail("/api/subscription/tiers", f"{r.status_code} {r.text[:200]}")


def test_hunts_crud_spot_check() -> None:
    section("REGRESSION — /api/hunts CRUD spot-check")
    hid = f"rs-railway-test-{uuid.uuid4().hex[:8]}"
    headers = {
        "Authorization": f"Bearer {PRO_TOKEN}",
        "Content-Type": "application/json",
    }

    # POST
    create_body = {
        "hunt_id": hid,
        "metadata": {
            "species": "deer",
            "date": "2026-02-15",
            "timeWindow": "morning",
        },
        "analysis": {"summary": "railway regression test"},
    }
    r = requests.post(f"{API}/hunts", json=create_body, headers=headers, timeout=30)
    if r.status_code == 200 and r.json().get("ok"):
        ok("POST /api/hunts -> 200 ok")
    else:
        fail("POST /api/hunts", f"{r.status_code} {r.text[:300]}")
        return

    # GET list
    r = requests.get(f"{API}/hunts?limit=5", headers=headers, timeout=20)
    if r.status_code == 200 and isinstance(r.json().get("hunts"), list):
        ok("GET /api/hunts list -> 200")
    else:
        fail("GET /api/hunts list", f"{r.status_code} {r.text[:200]}")

    # GET single
    r = requests.get(f"{API}/hunts/{hid}", headers=headers, timeout=20)
    if r.status_code == 200 and r.json().get("hunt", {}).get("hunt_id") == hid:
        ok("GET /api/hunts/{id} -> 200")
    else:
        fail("GET /api/hunts/{id}", f"{r.status_code} {r.text[:200]}")

    # PUT
    r = requests.put(
        f"{API}/hunts/{hid}",
        json={"analysis": {"summary": "patched from railway test"}},
        headers=headers,
        timeout=20,
    )
    if r.status_code == 200:
        ok("PUT /api/hunts/{id} -> 200")
    else:
        fail("PUT /api/hunts/{id}", f"{r.status_code} {r.text[:200]}")

    # DELETE
    r = requests.delete(f"{API}/hunts/{hid}", headers=headers, timeout=20)
    if r.status_code == 200 and r.json().get("deleted") == 1:
        ok("DELETE /api/hunts/{id} -> 200 deleted=1")
    else:
        fail("DELETE /api/hunts/{id}", f"{r.status_code} {r.text[:200]}")


# ============================================================================
# 4. Railway deployment files
# ============================================================================

def test_railway_files() -> None:
    section("RAILWAY FILES — presence + validity")

    procfile = BACKEND_DIR / "Procfile"
    if procfile.exists():
        txt = procfile.read_text().strip()
        if txt == "web: uvicorn server:app --host 0.0.0.0 --port $PORT":
            ok("Procfile matches exact expected line")
        else:
            fail("Procfile content", f"got: {txt!r}")
    else:
        fail("Procfile exists", "missing")

    rj = BACKEND_DIR / "railway.json"
    if rj.exists():
        try:
            data = json.loads(rj.read_text())
            deploy = data.get("deploy") or {}
            has_start = "startCommand" in deploy
            has_health = deploy.get("healthcheckPath") == "/api/health"
            if has_start and has_health:
                ok(
                    "railway.json valid + has startCommand + healthcheckPath=/api/health",
                )
            else:
                fail(
                    "railway.json fields",
                    f"startCommand={has_start} healthcheckPath={deploy.get('healthcheckPath')}",
                )
        except Exception as e:
            fail("railway.json parse", str(e))
    else:
        fail("railway.json exists", "missing")

    env_example = BACKEND_DIR / ".env.railway.example"
    if env_example.exists():
        txt = env_example.read_text()
        required = [
            "MONGODB_URI",
            "OPENAI_API_KEY",
            "GOOGLE_CLIENT_ID",
            "S3_BUCKET_NAME",
            "WEATHER_API_KEY",
        ]
        missing = [k for k in required if k not in txt]
        if not missing:
            ok(".env.railway.example documents required vars")
        else:
            fail(".env.railway.example missing keys", f"{missing}")
    else:
        fail(".env.railway.example exists", "missing")

    readme = BACKEND_DIR / "README_RAILWAY.md"
    if readme.exists() and "Railway" in readme.read_text():
        ok("README_RAILWAY.md present")
    else:
        fail("README_RAILWAY.md", "missing or empty")


# ============================================================================

def main() -> int:
    print(f"Backend base: {BASE}")
    print(f"API root:     {API}\n")

    test_railway_files()
    test_health()
    test_auth_me()
    test_subscription_tiers()

    test_auth_google_missing_body()
    test_auth_google_malformed()
    test_auth_google_tampered()
    test_auth_google_garbage()

    test_hunts_crud_spot_check()

    test_analyze_hunt_openai_path()
    test_analyze_hunt_logs_openai_path()

    print("\n==============================================")
    print(f"PASS: {len(PASS)}    FAIL: {len(FAIL)}")
    if FAIL:
        print("\nFailures:")
        for name, detail in FAIL:
            print(f"  - {name}: {detail}")
        return 1
    print("All assertions passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
