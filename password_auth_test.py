"""
Black-box contract test for the password-auth suite added in
/app/backend/password_auth.py (mounted under /api).

Uses EXPO_PUBLIC_BACKEND_URL from /app/frontend/.env.

OTP retrieval: MSGRAPH_* env vars are blank, so the ConsoleMailer logs
the full email body (which contains the 6-digit OTP) to
/var/log/supervisor/backend.out.log. We tail that log after calling
/api/auth/request-password-reset and regex-extract the code.
"""
from __future__ import annotations

import os
import re
import sys
import uuid
import time
import json
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import requests


# ---------- resolve backend URL from /app/frontend/.env ----------
def _resolve_backend_url() -> str:
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")


BASE = _resolve_backend_url().rstrip("/")
API = f"{BASE}/api"

# color-ish status
PASS_COUNT = 0
FAIL_COUNT = 0
FAILURES: list[str] = []


def check(cond: bool, label: str, extra: str = "") -> bool:
    global PASS_COUNT, FAIL_COUNT
    if cond:
        PASS_COUNT += 1
        print(f"  PASS  {label}")
        return True
    else:
        FAIL_COUNT += 1
        msg = f"  FAIL  {label}"
        if extra:
            msg += f"\n        {extra}"
        print(msg)
        FAILURES.append(f"{label} :: {extra}".strip())
        return False


def _post(path: str, body: Dict[str, Any], token: Optional[str] = None, timeout: int = 30) -> requests.Response:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", json=body, headers=headers, timeout=timeout)


def _get(path: str, token: Optional[str] = None, timeout: int = 30) -> requests.Response:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=headers, timeout=timeout)


def _patch(path: str, body: Dict[str, Any], token: Optional[str] = None, timeout: int = 30) -> requests.Response:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.patch(f"{API}{path}", json=body, headers=headers, timeout=timeout)


def _delete(path: str, token: Optional[str] = None, timeout: int = 30) -> requests.Response:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.delete(f"{API}{path}", headers=headers, timeout=timeout)


# ---------- OTP retrieval: scrape ConsoleMailer log ----------
# Review says backend.out.log, but Python's logger writes to stderr by
# default, so in this environment the ConsoleMailer line lands in
# backend.err.log. Check both for robustness.
LOG_PATHS = ["/var/log/supervisor/backend.err.log", "/var/log/supervisor/backend.out.log"]


def _read_log_bytes(path: str) -> str:
    try:
        result = subprocess.run(
            ["sudo", "cat", path],
            capture_output=True, text=True, timeout=5,
        )
        return result.stdout or ""
    except Exception:
        return ""


def _tail_log_and_find_otp_for_email(email: str, since_offsets: Dict[str, int], max_wait_s: float = 6.0) -> Optional[str]:
    """
    Poll backend log files starting at their recorded offsets for a
    ConsoleMailer entry addressed to `email` and return the 6-digit
    code inside. Returns None if not found within max_wait_s.
    """
    deadline = time.time() + max_wait_s
    code_re = re.compile(r"password reset code is:\s*(\d{6})")
    to_re = re.compile(r"^\s*to=" + re.escape(email) + r"\s*$", re.MULTILINE)
    while time.time() < deadline:
        for path in LOG_PATHS:
            content = _read_log_bytes(path)
            off = since_offsets.get(path, 0)
            if len(content) > off:
                new_chunk = content[off:]
                blocks = new_chunk.split("[ConsoleMailer] Would send email:")
                # Iterate newest-last so if there are multiple, we get latest
                match_code: Optional[str] = None
                for blk in blocks[1:]:
                    if to_re.search(blk):
                        m = code_re.search(blk)
                        if m:
                            match_code = m.group(1)
                if match_code:
                    return match_code
        time.sleep(0.4)
    return None


def _current_log_offsets() -> Dict[str, int]:
    offs: Dict[str, int] = {}
    for p in LOG_PATHS:
        try:
            result = subprocess.run(
                ["sudo", "stat", "-c", "%s", p],
                capture_output=True, text=True, timeout=5,
            )
            offs[p] = int((result.stdout or "0").strip())
        except Exception:
            offs[p] = 0
    return offs


# ====================================================================
# Scenarios
# ====================================================================

def run() -> Tuple[int, int]:
    print(f"Backend base: {BASE}")
    print(f"API base:     {API}")
    print()

    fresh_email = f"pwtest_{uuid.uuid4().hex[:10]}@example.com"
    fresh_pw = "StrongPass1!"   # 12 chars, upper, lower, digit, symbol
    fresh_name = "PW Test"
    new_pw = "AnotherStrong2@"
    third_pw = "ThirdPassX3#"

    # -----------------------------------------------------------------
    # 1. REGISTER
    # -----------------------------------------------------------------
    print("=== 1. REGISTER /api/auth/register ===")
    r = _post("/auth/register", {"email": fresh_email, "password": fresh_pw, "name": fresh_name})
    check(r.status_code == 200, "fresh register -> 200", f"got {r.status_code} body={r.text[:300]}")
    data = {}
    if r.status_code == 200:
        data = r.json()
        check("session_token" in data and data["session_token"], "register returns session_token")
        check(data.get("email") == fresh_email, "register echoes email (lowercased)", f"got {data.get('email')}")
        check(data.get("name") == fresh_name, "register echoes name")
        check("user_id" in data and data["user_id"], "register returns user_id")
        check(data.get("email_verified") is False, "register email_verified=false")
    session_token = data.get("session_token")
    user_id = data.get("user_id")

    # Negative password cases
    bad_pws = [
        ("short1!",       "too short (<10)"),
        ("lowercase1!",   "no upper"),
        ("UPPERCASE1!",   "no lower"),
        ("NoDigitsAll!",  "no digit"),
        ("NoSymbols123A", "no symbol"),
    ]
    for pw, why in bad_pws:
        email_tmp = f"pwneg_{uuid.uuid4().hex[:8]}@example.com"
        r2 = _post("/auth/register", {"email": email_tmp, "password": pw, "name": "Neg"})
        # validate_password runs first (400); otherwise pydantic min_length=10 -> 422 for short.
        ok = r2.status_code in (400, 422)
        check(
            ok,
            f"register bad pw [{why}] -> 400/422 (got {r2.status_code})",
            f"body={r2.text[:200]}",
        )
        if ok and r2.status_code == 400:
            try:
                detail = r2.json().get("detail", "")
                check(isinstance(detail, str) and len(detail) > 0, f"  detail present for [{why}]", f"detail={detail!r}")
            except Exception:
                pass

    # Re-register same email -> 409
    r3 = _post("/auth/register", {"email": fresh_email, "password": fresh_pw, "name": fresh_name})
    check(r3.status_code == 409, "re-register same email -> 409", f"got {r3.status_code} body={r3.text[:200]}")
    if r3.status_code == 409:
        check(
            "already exists" in r3.json().get("detail", "").lower(),
            "409 detail mentions already exists",
        )

    # -----------------------------------------------------------------
    # 2. LOGIN
    # -----------------------------------------------------------------
    print("\n=== 2. LOGIN /api/auth/login ===")
    r = _post("/auth/login", {"email": fresh_email, "password": fresh_pw})
    check(r.status_code == 200, "correct creds -> 200", f"got {r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        d = r.json()
        check(bool(d.get("session_token")), "login returns session_token")
        # overwrite session_token so subsequent tests use a fresh one
        login_token = d.get("session_token")
    else:
        login_token = session_token

    r = _post("/auth/login", {"email": fresh_email, "password": "WrongPass9!"})
    check(r.status_code == 401, "wrong password -> 401", f"got {r.status_code}")
    if r.status_code == 401:
        check(
            r.json().get("detail") == "Invalid email or password.",
            "wrong-pw detail == 'Invalid email or password.'",
            f"got detail={r.json().get('detail')!r}",
        )

    r = _post("/auth/login", {"email": f"nobody_{uuid.uuid4().hex[:8]}@example.com", "password": "WhateverPass1!"})
    check(r.status_code == 401, "unknown email -> 401", f"got {r.status_code}")
    if r.status_code == 401:
        check(
            r.json().get("detail") == "Invalid email or password.",
            "unknown-email detail identical (no enumeration)",
        )

    # -----------------------------------------------------------------
    # 3. /api/auth/me with fresh session token
    # -----------------------------------------------------------------
    print("\n=== 3. /api/auth/me with register session ===")
    r = _get("/auth/me", token=session_token)
    check(r.status_code == 200, "GET /auth/me with register token -> 200", f"got {r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        d = r.json()
        check(d.get("email") == fresh_email, "auth/me email matches", f"got {d.get('email')!r}")

    # -----------------------------------------------------------------
    # 4. REQUEST PASSWORD RESET
    # -----------------------------------------------------------------
    print("\n=== 4. REQUEST PASSWORD RESET /api/auth/request-password-reset ===")
    # For unknown email (anti-enumeration)
    r = _post("/auth/request-password-reset", {"email": f"ghost_{uuid.uuid4().hex[:8]}@example.com"})
    check(r.status_code == 200, "unknown email -> 200 (anti-enumeration)", f"got {r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        check(r.json().get("ok") is True, "unknown email response {ok:true}")

    # For known email — record log offsets first
    log_offsets = _current_log_offsets()
    r = _post("/auth/request-password-reset", {"email": fresh_email})
    check(r.status_code == 200, "known email -> 200", f"got {r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        check(r.json().get("ok") is True, "known email response {ok:true}")
    otp = _tail_log_and_find_otp_for_email(fresh_email, log_offsets, max_wait_s=6.0)
    check(otp is not None and len(otp) == 6, "OTP scraped from ConsoleMailer log", f"otp={otp!r}")
    print(f"    (captured OTP: {otp})")

    # -----------------------------------------------------------------
    # 5. VERIFY OTP
    # -----------------------------------------------------------------
    print("\n=== 5. VERIFY OTP /api/auth/verify-otp ===")
    # Wrong OTP -> 401 (first attempt; won't trigger purge)
    wrong = "000000"
    if otp == "000000":
        wrong = "111111"
    r = _post("/auth/verify-otp", {"email": fresh_email, "otp": wrong})
    check(r.status_code == 401, "wrong OTP -> 401", f"got {r.status_code} body={r.text[:200]}")

    # Real OTP -> 200
    reset_token: Optional[str] = None
    if otp:
        r = _post("/auth/verify-otp", {"email": fresh_email, "otp": otp})
        check(r.status_code == 200, "real OTP -> 200", f"got {r.status_code} body={r.text[:200]}")
        if r.status_code == 200:
            d = r.json()
            reset_token = d.get("reset_token")
            check(
                isinstance(reset_token, str) and reset_token.startswith("rst_"),
                "reset_token has 'rst_' prefix",
                f"got {reset_token!r}",
            )

    # 5+ wrong attempts after a fresh request -> 429 + purge
    print("\n  Sub-test: 5 wrong OTPs -> 429 and purge")
    _ = _current_log_offsets()
    r = _post("/auth/request-password-reset", {"email": fresh_email})
    check(r.status_code == 200, "fresh reset request for lockout test -> 200")
    # We don't actually need the OTP; we just spam wrong ones.
    # Spec: attempts<5 -> 401; at 5th wrong attempt, the guard at the
    # top of verify_otp fires on the _next_ call (attempts>=5 -> 429 + purge).
    responses = []
    for i in range(6):
        rr = _post("/auth/verify-otp", {"email": fresh_email, "otp": "000001"})
        responses.append(rr.status_code)
    # We expect 5x 401 then 429 (the 6th); the spec says "5+ wrong
    # attempts -> 429 + record purged". Accept either: 429 appears by
    # the 6th, OR by the 5th (stricter implementation).
    got_429 = 429 in responses
    check(got_429, "5+ wrong OTPs eventually returns 429", f"status list={responses}")
    # After 429, the record should be purged -> next verify-otp -> 400 "No active reset code"
    rr = _post("/auth/verify-otp", {"email": fresh_email, "otp": "000002"})
    check(
        rr.status_code == 400,
        "after 429 purge, verify-otp -> 400 'no active reset code'",
        f"got {rr.status_code} body={rr.text[:200]}",
    )

    # -----------------------------------------------------------------
    # 6. RESET PASSWORD
    # -----------------------------------------------------------------
    print("\n=== 6. RESET PASSWORD /api/auth/reset-password ===")
    if reset_token:
        r = _post("/auth/reset-password", {"reset_token": reset_token, "new_password": new_pw})
        check(r.status_code == 200, "reset-password with valid token -> 200", f"got {r.status_code} body={r.text[:300]}")
        reset_session_token: Optional[str] = None
        if r.status_code == 200:
            d = r.json()
            check(d.get("ok") is True, "reset-password ok=true")
            reset_session_token = d.get("session_token")
            check(bool(reset_session_token), "reset-password returns session_token")

        # Old password no longer works
        r = _post("/auth/login", {"email": fresh_email, "password": fresh_pw})
        check(r.status_code == 401, "old password no longer works -> 401", f"got {r.status_code}")
        # New password works
        r = _post("/auth/login", {"email": fresh_email, "password": new_pw})
        check(r.status_code == 200, "new password works -> 200", f"got {r.status_code} body={r.text[:200]}")
        if r.status_code == 200:
            # Replace session_token with login token to continue
            session_token = r.json().get("session_token")

        # The reset_session_token should also work on /auth/me
        if reset_session_token:
            r = _get("/auth/me", token=reset_session_token)
            check(r.status_code == 200, "reset_session_token works on /auth/me", f"got {r.status_code}")
    else:
        check(False, "SKIPPED: no reset_token from verify-otp step")

    # -----------------------------------------------------------------
    # 7. CHANGE PASSWORD (fresh register again so we have a known current pw)
    # -----------------------------------------------------------------
    print("\n=== 7. CHANGE PASSWORD /api/auth/change-password ===")
    cp_email = f"pwcp_{uuid.uuid4().hex[:10]}@example.com"
    cp_pw = "StrongPass1!"
    r = _post("/auth/register", {"email": cp_email, "password": cp_pw, "name": "CP Test"})
    check(r.status_code == 200, "fresh register for change-pw -> 200", f"got {r.status_code}")
    cp_token = r.json().get("session_token") if r.status_code == 200 else None

    if cp_token:
        # Wrong current_password -> 401
        rr = _post(
            "/auth/change-password",
            {"current_password": "TotallyWrong1!", "new_password": third_pw},
            token=cp_token,
        )
        check(rr.status_code == 401, "wrong current_password -> 401", f"got {rr.status_code}")

        # Success
        rr = _post(
            "/auth/change-password",
            {"current_password": cp_pw, "new_password": third_pw},
            token=cp_token,
        )
        check(rr.status_code == 200, "change-password success -> 200", f"got {rr.status_code} body={rr.text[:200]}")
        if rr.status_code == 200:
            check(rr.json().get("ok") is True, "change-password ok=true")

        # Old pw -> 401
        rr = _post("/auth/login", {"email": cp_email, "password": cp_pw})
        check(rr.status_code == 401, "login with old pw after change -> 401", f"got {rr.status_code}")
        # New pw -> 200
        rr = _post("/auth/login", {"email": cp_email, "password": third_pw})
        check(rr.status_code == 200, "login with new pw after change -> 200", f"got {rr.status_code}")

        # change-password without Bearer -> 401
        rr = _post(
            "/auth/change-password",
            {"current_password": third_pw, "new_password": "YetAnother9$"},
            token=None,
        )
        check(rr.status_code == 401, "change-password without Bearer -> 401", f"got {rr.status_code}")

    # -----------------------------------------------------------------
    # 8. PROFILE (PATCH / DELETE /api/users/me)
    # -----------------------------------------------------------------
    print("\n=== 8. PROFILE PATCH/DELETE /api/users/me ===")
    prof_email = f"pwprof_{uuid.uuid4().hex[:10]}@example.com"
    prof_pw = "StrongPass1!"
    r = _post("/auth/register", {"email": prof_email, "password": prof_pw, "name": "Before Rename"})
    check(r.status_code == 200, "fresh register for profile -> 200")
    prof_token = r.json().get("session_token") if r.status_code == 200 else None

    # PATCH with no auth -> 401
    rr = _patch("/users/me", {"name": "Nope"}, token=None)
    check(rr.status_code == 401, "PATCH /users/me without Bearer -> 401", f"got {rr.status_code}")
    # DELETE with no auth -> 401
    rr = _delete("/users/me", token=None)
    check(rr.status_code == 401, "DELETE /users/me without Bearer -> 401", f"got {rr.status_code}")

    if prof_token:
        # PATCH name
        rr = _patch("/users/me", {"name": "Renamed User"}, token=prof_token)
        check(rr.status_code == 200, "PATCH /users/me name -> 200", f"got {rr.status_code} body={rr.text[:200]}")
        # GET /auth/me reflects new name
        r2 = _get("/auth/me", token=prof_token)
        check(r2.status_code == 200, "GET /auth/me after rename -> 200")
        if r2.status_code == 200:
            check(
                r2.json().get("name") == "Renamed User",
                "GET /auth/me shows new name",
                f"got {r2.json().get('name')!r}",
            )

        # DELETE
        rr = _delete("/users/me", token=prof_token)
        check(rr.status_code == 200, "DELETE /users/me -> 200", f"got {rr.status_code} body={rr.text[:200]}")
        if rr.status_code == 200:
            body = rr.json()
            check(body.get("ok") is True and body.get("deleted") == 1, "DELETE body ok=true deleted=1", f"body={body}")
        # Subsequent /auth/me with same token -> 401
        r2 = _get("/auth/me", token=prof_token)
        check(r2.status_code == 401, "after DELETE, /auth/me with same token -> 401", f"got {r2.status_code}")

    # -----------------------------------------------------------------
    # 9. REGRESSION — existing pre-seeded session
    # -----------------------------------------------------------------
    print("\n=== 9. Regression: existing test_session_rs_001 still valid ===")
    r = _get("/auth/me", token="test_session_rs_001")
    check(r.status_code == 200, "pre-seeded session -> 200", f"got {r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        d = r.json()
        check(d.get("tier") == "pro", "pre-seeded user tier=pro", f"got tier={d.get('tier')!r}")
        check(d.get("user_id") == "test-user-001", "pre-seeded user_id=test-user-001", f"got {d.get('user_id')!r}")

    # -----------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------
    print()
    print(f"======== RESULTS: {PASS_COUNT} pass / {FAIL_COUNT} fail ========")
    if FAIL_COUNT:
        print("\nFailures:")
        for f in FAILURES:
            print(f"  - {f}")
    return PASS_COUNT, FAIL_COUNT


if __name__ == "__main__":
    try:
        p, f = run()
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(2)
    sys.exit(0 if f == 0 else 1)
