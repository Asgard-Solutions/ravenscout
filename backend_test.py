"""Backend test for Sign in with Apple endpoint + auth regression checks.

Targets the live preview URL configured in /app/frontend/.env
(EXPO_PUBLIC_BACKEND_URL or REACT_APP_BACKEND_URL) and tests:

1. POST /api/auth/apple — malformed token rejection
2. POST /api/auth/apple — missing identity_token (422)
3. POST /api/auth/google — regression (garbage id_token -> 401)
4. POST /api/auth/login — regression with a freshly-registered user
5. GET  /api/auth/me — regression with seeded `test_session_rs_001`
6. Server import sanity (python-jose, httpx)
"""
from __future__ import annotations

import sys
import uuid
import requests
from pathlib import Path


def _read_backend_url() -> str:
    env_path = Path("/app/frontend/.env")
    text = env_path.read_text(encoding="utf-8")
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() in ("EXPO_PUBLIC_BACKEND_URL", "REACT_APP_BACKEND_URL"):
            return v.strip().strip('"').strip("'")
    raise RuntimeError("BACKEND_URL not found in /app/frontend/.env")


BASE = _read_backend_url().rstrip("/") + "/api"
print(f"BASE = {BASE}")

PASS = 0
FAIL = 0
NOTES = []


def _check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}  -- {detail}")
        NOTES.append(f"{label} :: {detail}")


# 1) /api/auth/apple — malformed identity_token
print("\n=== 1) POST /api/auth/apple with garbage identity_token ===")
r = requests.post(f"{BASE}/auth/apple", json={"identity_token": "garbage"}, timeout=20)
print(f"  status={r.status_code} body={r.text[:200]}")
_check("HTTP 401", r.status_code == 401, f"got {r.status_code}")
try:
    body = r.json()
    _check(
        "detail == 'Invalid Apple credential'",
        body.get("detail") == "Invalid Apple credential",
        f"got {body!r}",
    )
except Exception as e:
    _check("response is JSON", False, str(e))

print("\n=== 1b) POST /api/auth/apple with JWT-shaped but bogus token ===")
fake_jwt = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImZha2UifQ.eyJzdWIiOiJ4In0.SIG"
r = requests.post(f"{BASE}/auth/apple", json={"identity_token": fake_jwt}, timeout=20)
print(f"  status={r.status_code} body={r.text[:200]}")
_check("HTTP 401 on bogus JWT-shaped token", r.status_code == 401, f"got {r.status_code}")
try:
    _check(
        "detail == 'Invalid Apple credential' (bogus jwt)",
        r.json().get("detail") == "Invalid Apple credential",
        f"got {r.json()!r}",
    )
except Exception:
    pass


# 2) /api/auth/apple — missing identity_token field -> 422
print("\n=== 2) POST /api/auth/apple with empty body -> 422 ===")
r = requests.post(f"{BASE}/auth/apple", json={}, timeout=20)
print(f"  status={r.status_code} body={r.text[:300]}")
_check("HTTP 422 on missing identity_token", r.status_code == 422, f"got {r.status_code}")
try:
    body = r.json()
    detail = body.get("detail", [])
    if isinstance(detail, list) and detail:
        loc = detail[0].get("loc", [])
        _check(
            "validation error on identity_token field",
            "identity_token" in loc,
            f"loc={loc}",
        )
except Exception as e:
    _check("422 body parses", False, str(e))


# 3) /api/auth/google — regression with garbage id_token -> 401
print("\n=== 3) POST /api/auth/google with garbage id_token -> 401 ===")
r = requests.post(f"{BASE}/auth/google", json={"id_token": "garbage"}, timeout=20)
print(f"  status={r.status_code} body={r.text[:200]}")
_check("HTTP 401 on garbage Google id_token", r.status_code == 401, f"got {r.status_code}")
try:
    _check(
        "detail mentions Google credential",
        "Google" in str(r.json().get("detail", "")),
        f"got {r.json()!r}",
    )
except Exception:
    pass


# 4) /api/auth/login — regression
print("\n=== 4) /api/auth/login regression (register -> login) ===")
unique = uuid.uuid4().hex[:10]
test_email = f"applebackendtest_{unique}@ravenscout.app"
test_password = "RavenScout!2026"
test_name = "Apple Backend Tester"

r = requests.post(
    f"{BASE}/auth/register",
    json={"email": test_email, "password": test_password, "name": test_name},
    timeout=20,
)
print(f"  REGISTER status={r.status_code} body={r.text[:200]}")
register_ok = r.status_code in (200, 201)
_check("register fresh user OK", register_ok, f"got {r.status_code}: {r.text[:200]}")

if register_ok:
    r = requests.post(
        f"{BASE}/auth/login",
        json={"email": test_email, "password": test_password},
        timeout=20,
    )
    print(f"  LOGIN status={r.status_code} body={r.text[:200]}")
    _check("login returns 200", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        try:
            body = r.json()
            _check("login session_token", bool(body.get("session_token")), str(body)[:200])
            _check("login user_id", bool(body.get("user_id")), str(body)[:200])
            _check(
                "login email matches",
                (body.get("email") or "").lower() == test_email.lower(),
                str(body)[:200],
            )
            tok = body.get("session_token")
            if tok:
                r2 = requests.get(
                    f"{BASE}/auth/me",
                    headers={"Authorization": f"Bearer {tok}"},
                    timeout=15,
                )
                _check(
                    "minted session works on /auth/me",
                    r2.status_code == 200,
                    f"{r2.status_code} {r2.text[:200]}",
                )
        except Exception as e:
            _check("login JSON parse", False, str(e))

    r = requests.post(
        f"{BASE}/auth/login",
        json={"email": test_email, "password": "WrongPassword!2026"},
        timeout=20,
    )
    _check(
        "wrong password -> 401",
        r.status_code == 401,
        f"got {r.status_code}: {r.text[:200]}",
    )


# 5) /api/auth/me with seeded session token
print("\n=== 5) GET /api/auth/me with test_session_rs_001 ===")
r = requests.get(
    f"{BASE}/auth/me",
    headers={"Authorization": "Bearer test_session_rs_001"},
    timeout=15,
)
print(f"  status={r.status_code} body={r.text[:200]}")
_check("HTTP 200 on /auth/me", r.status_code == 200, f"got {r.status_code}")
if r.status_code == 200:
    try:
        body = r.json()
        _check(
            "user_id == test-user-001",
            body.get("user_id") == "test-user-001",
            str(body)[:200],
        )
        _check("email present", bool(body.get("email")), str(body)[:200])
        _check(
            "usage object present",
            isinstance(body.get("usage"), dict),
            str(body)[:200],
        )
    except Exception as e:
        _check("auth/me JSON parse", False, str(e))


# 6) Import sanity
print("\n=== 6) Backend import sanity (python-jose / httpx) ===")
try:
    import subprocess
    out = subprocess.run(
        ["python", "-c", "import jose, httpx; print(jose.__version__, httpx.__version__)"],
        cwd="/app/backend",
        capture_output=True,
        text=True,
        timeout=20,
    )
    print(f"  jose+httpx versions: {out.stdout.strip()} (stderr={out.stderr.strip()[:120]})")
    _check(
        "python-jose + httpx importable",
        out.returncode == 0,
        out.stderr.strip()[:200],
    )
except Exception as e:
    _check("import probe", False, str(e))


print("\n========================================")
print(f"PASS: {PASS}")
print(f"FAIL: {FAIL}")
if NOTES:
    print("Failures:")
    for n in NOTES:
        print(f"  - {n}")
print("========================================")
sys.exit(0 if FAIL == 0 else 1)
