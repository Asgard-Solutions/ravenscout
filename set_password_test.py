"""
Tests for POST /api/auth/set-password and has_password flag on /api/auth/me.

Env: EXPO_PUBLIC_BACKEND_URL from /app/frontend/.env
Seed user: test-user-002 / email=test2@ravenscout.app / session_token=test_session_rs_002
"""
import os
import sys
import asyncio
import requests
from motor.motor_asyncio import AsyncIOMotorClient

# Load envs
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"

MONGO_URL = os.environ.get("MONGO_URL") or os.environ.get("MONGODB_URI")
DB_NAME = os.environ.get("DB_NAME") or "raven_scout"

TEST_EMAIL = "test2@ravenscout.app"
TEST_SESSION = "test_session_rs_002"
OTHER_SESSION = "test_session_rs_001"

results = []

def rec(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    line = f"[{status}] {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    results.append((name, ok, detail))


async def unset_password_hash(email):
    c = AsyncIOMotorClient(MONGO_URL)
    db = c[DB_NAME]
    r = await db.users.update_one({"email": email}, {"$unset": {"password_hash": ""}})
    c.close()
    return r.matched_count


async def has_password_hash(email):
    c = AsyncIOMotorClient(MONGO_URL)
    db = c[DB_NAME]
    u = await db.users.find_one({"email": email}, {"_id": 0, "password_hash": 1})
    c.close()
    return bool(u and u.get("password_hash"))


def h(token):
    return {"Authorization": f"Bearer {token}"} if token else {}


def scenario_1_google_only():
    print("\n===== SCENARIO 1: Google-only user (unset password_hash) =====")
    asyncio.run(unset_password_hash(TEST_EMAIL))
    assert not asyncio.run(has_password_hash(TEST_EMAIL)), "Precondition: password_hash must be unset"

    # 1a GET /api/auth/me -> has_password:false
    r = requests.get(f"{API}/auth/me", headers=h(TEST_SESSION), timeout=15)
    rec("1a /auth/me returns 200",
        r.status_code == 200, f"status={r.status_code}")
    j = r.json() if r.ok else {}
    rec("1a has_password field present and boolean",
        "has_password" in j and isinstance(j.get("has_password"), bool),
        f"has_password={j.get('has_password')!r}")
    rec("1a has_password is False (Google-only)",
        j.get("has_password") is False,
        f"has_password={j.get('has_password')!r}")

    # 1b POST /api/auth/set-password -> 200 {ok:true}
    r = requests.post(f"{API}/auth/set-password",
                      headers=h(TEST_SESSION),
                      json={"new_password": "NewStrong1!"}, timeout=15)
    rec("1b set-password 200", r.status_code == 200,
        f"status={r.status_code} body={r.text[:200]}")
    rec("1b response ok:true", r.ok and r.json().get("ok") is True,
        f"body={r.text[:200]}")

    # 1c GET /auth/me -> has_password:true
    r = requests.get(f"{API}/auth/me", headers=h(TEST_SESSION), timeout=15)
    j = r.json() if r.ok else {}
    rec("1c has_password now True",
        r.status_code == 200 and j.get("has_password") is True,
        f"status={r.status_code} has_password={j.get('has_password')!r}")

    # 1d login with email+new password
    r = requests.post(f"{API}/auth/login",
                      json={"email": TEST_EMAIL, "password": "NewStrong1!"},
                      timeout=15)
    rec("1d login 200 with new password",
        r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.ok:
        tok = r.json().get("session_token")
        rec("1d session_token returned on login", bool(tok and tok.startswith("rs_")),
            f"token={tok}")

    # 1e Second set-password -> 409
    r = requests.post(f"{API}/auth/set-password",
                      headers=h(TEST_SESSION),
                      json={"new_password": "YetAnother2@"}, timeout=15)
    rec("1e second set-password returns 409",
        r.status_code == 409, f"status={r.status_code} body={r.text[:200]}")
    det = (r.json().get("detail") if r.ok or r.status_code == 409 else "") or ""
    rec("1e detail contains 'already has a password'",
        "already has a password" in det.lower(),
        f"detail={det}")


def scenario_2_weak_passwords():
    print("\n===== SCENARIO 2: Weak password validation =====")
    # Re-unset password_hash so endpoint reaches validate_password
    asyncio.run(unset_password_hash(TEST_EMAIL))

    cases = [
        ("short1!", "Password must be at least 10 characters long."),
        ("lowercase1!", "Password must include an uppercase letter."),
        ("UPPERCASE1!", "Password must include a lowercase letter."),
        ("NoDigitsAll!", "Password must include a number."),
        ("NoSymbols123A", "Password must include a symbol"),
    ]
    for pw, expected_detail_substring in cases:
        r = requests.post(f"{API}/auth/set-password",
                          headers=h(TEST_SESSION),
                          json={"new_password": pw}, timeout=15)
        # "short1!" has length 7. Pydantic min_length=10 triggers a 422 before
        # validate_password. The review calls for 400. Report accurately.
        expect_400 = True
        ok = (r.status_code == 400)
        detail = ""
        try:
            detail = r.json().get("detail", "")
            if isinstance(detail, list):
                detail = str(detail)
        except Exception:
            detail = r.text
        rec(f"2 weak pw={pw!r} -> 400",
            ok, f"status={r.status_code} detail={detail[:200]}")
        rec(f"2 weak pw={pw!r} detail contains expected substring",
            expected_detail_substring.lower() in (detail or "").lower(),
            f"detail={detail[:200]}")


def scenario_3_auth():
    print("\n===== SCENARIO 3: Auth errors =====")
    # No bearer
    r = requests.post(f"{API}/auth/set-password",
                      json={"new_password": "NewStrong1!"}, timeout=15)
    rec("3 no Bearer -> 401", r.status_code == 401,
        f"status={r.status_code} body={r.text[:200]}")

    # Bogus bearer
    r = requests.post(f"{API}/auth/set-password",
                      headers={"Authorization": "Bearer garbage"},
                      json={"new_password": "NewStrong1!"}, timeout=15)
    rec("3 bogus Bearer -> 401", r.status_code == 401,
        f"status={r.status_code} body={r.text[:200]}")

    # Missing body (empty) -> 422
    r = requests.post(f"{API}/auth/set-password",
                      headers=h(TEST_SESSION),
                      json={}, timeout=15)
    rec("3 empty body -> 422 (not 500)", r.status_code == 422,
        f"status={r.status_code} body={r.text[:200]}")

    # Completely missing body -> 422 also acceptable
    r = requests.post(f"{API}/auth/set-password",
                      headers=h(TEST_SESSION), timeout=15)
    rec("3 missing body -> 422 (not 500)", r.status_code in (422,),
        f"status={r.status_code}")


def scenario_4_regression():
    print("\n===== SCENARIO 4: Regression — /auth/me on other user =====")
    r = requests.get(f"{API}/auth/me", headers=h(OTHER_SESSION), timeout=15)
    rec("4 /auth/me test_session_rs_001 -> 200", r.status_code == 200,
        f"status={r.status_code}")
    j = r.json() if r.ok else {}
    rec("4 has_password field present and boolean",
        "has_password" in j and isinstance(j.get("has_password"), bool),
        f"has_password={j.get('has_password')!r}")


def summary():
    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = total - passed
    print("\n" + "=" * 60)
    print(f"Total: {total} | PASS: {passed} | FAIL: {failed}")
    if failed:
        print("\nFailures:")
        for name, ok, detail in results:
            if not ok:
                print(f"  - {name}: {detail}")
    return failed == 0


if __name__ == "__main__":
    print(f"Backend URL: {API}")
    print(f"MONGO_URL configured: {bool(MONGO_URL)}")
    try:
        scenario_1_google_only()
        scenario_2_weak_passwords()
        scenario_3_auth()
        scenario_4_regression()
        ok = summary()
        sys.exit(0 if ok else 1)
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(2)
