"""
Focused re-run of scenarios 5 (verify-otp) and 6 (reset-password) from
/app/password_auth_test.py — exercises the tz-naive datetime fix in
/app/backend/password_auth.py (verify_otp ~line 370 / reset_password ~line 410).

Zero 500s expected.
"""
from __future__ import annotations

import re
import sys
import time
import uuid
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import requests


def _resolve_backend_url() -> str:
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")


BASE = _resolve_backend_url().rstrip("/")
API = f"{BASE}/api"

PASS_COUNT = 0
FAIL_COUNT = 0
FAILURES: list[str] = []


def check(cond: bool, label: str, extra: str = "") -> bool:
    global PASS_COUNT, FAIL_COUNT
    if cond:
        PASS_COUNT += 1
        print(f"  PASS  {label}")
        return True
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


LOG_PATHS = [
    "/var/log/supervisor/backend.err.log",
    "/var/log/supervisor/backend.out.log",
]


def _read_log(path: str) -> str:
    try:
        r = subprocess.run(
            ["sudo", "cat", path], capture_output=True, text=True, timeout=5
        )
        return r.stdout or ""
    except Exception:
        return ""


def _current_log_offsets() -> Dict[str, int]:
    offs: Dict[str, int] = {}
    for p in LOG_PATHS:
        try:
            r = subprocess.run(
                ["sudo", "stat", "-c", "%s", p], capture_output=True, text=True, timeout=5
            )
            offs[p] = int((r.stdout or "0").strip())
        except Exception:
            offs[p] = 0
    return offs


def _tail_and_find_otp(email: str, since_offsets: Dict[str, int], max_wait_s: float = 6.0) -> Optional[str]:
    deadline = time.time() + max_wait_s
    code_re = re.compile(r"password reset code is:\s*(\d{6})")
    to_re = re.compile(r"^\s*to=" + re.escape(email) + r"\s*$", re.MULTILINE)
    while time.time() < deadline:
        for path in LOG_PATHS:
            content = _read_log(path)
            off = since_offsets.get(path, 0)
            if len(content) > off:
                new_chunk = content[off:]
                blocks = new_chunk.split("[ConsoleMailer] Would send email:")
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


def _count_500s_in_logs(since_offsets: Dict[str, int]) -> int:
    """Return number of new 500 entries / tracebacks in backend logs."""
    total = 0
    for path in LOG_PATHS:
        content = _read_log(path)
        off = since_offsets.get(path, 0)
        if len(content) > off:
            new_chunk = content[off:]
            total += new_chunk.count("Internal Server Error")
            total += len(re.findall(r"TypeError.*offset-naive.*offset-aware", new_chunk))
    return total


def run() -> Tuple[int, int]:
    print(f"Backend base: {BASE}")
    print(f"API base:     {API}")
    print()

    # Snapshot log sizes — zero 500s expected during run
    run_start_offsets = _current_log_offsets()

    # --- setup: register user + capture OTP ---
    email = f"pwtest_{uuid.uuid4().hex[:10]}@example.com"
    orig_pw = "StrongPass1!"
    new_pw = "AnotherStrong2@"
    name = "Reset Test"

    print("=== SETUP: register ===")
    r = _post("/auth/register", {"email": email, "password": orig_pw, "name": name})
    check(r.status_code == 200, "register fresh user -> 200", f"got {r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        print("  cannot continue without registered user")
        return PASS_COUNT, FAIL_COUNT

    print("\n=== SETUP: request-password-reset & capture OTP ===")
    pre_offsets = _current_log_offsets()
    r = _post("/auth/request-password-reset", {"email": email})
    check(r.status_code == 200, "request-password-reset -> 200", f"got {r.status_code}")
    otp = _tail_and_find_otp(email, pre_offsets, max_wait_s=6.0)
    check(otp is not None and len(otp) == 6, "OTP scraped from ConsoleMailer log", f"otp={otp!r}")
    print(f"    (captured OTP: {otp})")
    if not otp:
        return PASS_COUNT, FAIL_COUNT

    # =================================================================
    # SCENARIO 5 — VERIFY OTP
    # =================================================================
    print("\n=== 5. VERIFY OTP /api/auth/verify-otp ===")

    # 5a) wrong OTP "000000" -> 401
    wrong = "000000" if otp != "000000" else "111111"
    r = _post("/auth/verify-otp", {"email": email, "otp": wrong})
    check(
        r.status_code == 401,
        f"wrong OTP {wrong!r} -> 401 (was 500 before fix)",
        f"got {r.status_code} body={r.text[:200]}",
    )

    # 5b) real OTP -> 200 with reset_token: "rst_..."
    reset_token: Optional[str] = None
    r = _post("/auth/verify-otp", {"email": email, "otp": otp})
    check(
        r.status_code == 200,
        "real OTP -> 200 (was 500 before fix)",
        f"got {r.status_code} body={r.text[:300]}",
    )
    if r.status_code == 200:
        d = r.json()
        reset_token = d.get("reset_token")
        check(
            isinstance(reset_token, str) and reset_token.startswith("rst_"),
            "reset_token has 'rst_' prefix",
            f"got {reset_token!r}",
        )

    # 5c) lockout — fresh OTP + 6 consecutive wrong attempts -> [401,401,401,401,401,429]
    print("\n  Sub-test: 6 consecutive wrong OTPs after fresh request -> [401,401,401,401,401,429]")
    r = _post("/auth/request-password-reset", {"email": email})
    check(r.status_code == 200, "fresh reset request for lockout test -> 200", f"got {r.status_code}")

    statuses = []
    for _ in range(6):
        rr = _post("/auth/verify-otp", {"email": email, "otp": "000001"})
        statuses.append(rr.status_code)
    expected = [401, 401, 401, 401, 401, 429]
    check(
        statuses == expected,
        f"6 wrong attempts sequence == {expected}",
        f"got {statuses}",
    )

    # After 429, next verify-otp should find no record -> 400 "No active reset code"
    rr = _post("/auth/verify-otp", {"email": email, "otp": "000002"})
    check(
        rr.status_code == 400,
        "after 429 purge, next verify-otp -> 400 'No active reset code'",
        f"got {rr.status_code} body={rr.text[:200]}",
    )

    # =================================================================
    # SCENARIO 6 — RESET PASSWORD
    # =================================================================
    print("\n=== 6. RESET PASSWORD /api/auth/reset-password ===")
    if not reset_token:
        check(False, "SKIPPED: no reset_token from verify-otp step")
        return PASS_COUNT, FAIL_COUNT

    # 6a) Valid reset_token + strong new pw -> 200 {ok:true, session_token}
    r = _post("/auth/reset-password", {"reset_token": reset_token, "new_password": new_pw})
    check(
        r.status_code == 200,
        "reset-password with valid token -> 200 (was 500 before fix)",
        f"got {r.status_code} body={r.text[:300]}",
    )
    new_session_token: Optional[str] = None
    if r.status_code == 200:
        d = r.json()
        check(d.get("ok") is True, "reset-password body ok=true")
        new_session_token = d.get("session_token")
        check(bool(new_session_token), "reset-password returns session_token")

    # 6b) Old pw no longer logs in -> 401
    r = _post("/auth/login", {"email": email, "password": orig_pw})
    check(
        r.status_code == 401,
        "login with OLD password after reset -> 401",
        f"got {r.status_code} body={r.text[:200]}",
    )

    # 6c) New session_token works on /api/auth/me -> 200
    if new_session_token:
        r = _get("/auth/me", token=new_session_token)
        check(
            r.status_code == 200,
            "new session_token works on /api/auth/me -> 200",
            f"got {r.status_code} body={r.text[:200]}",
        )
        if r.status_code == 200:
            d = r.json()
            check(d.get("email") == email, "auth/me echoes email", f"got {d.get('email')!r}")

    # Bonus: new password can log in -> 200
    r = _post("/auth/login", {"email": email, "password": new_pw})
    check(r.status_code == 200, "login with NEW password after reset -> 200",
          f"got {r.status_code} body={r.text[:200]}")

    # 6d) Re-use of same reset_token -> 400 "Reset link invalid or expired."
    r = _post("/auth/reset-password", {"reset_token": reset_token, "new_password": "YetAnother9$x"})
    check(
        r.status_code == 400,
        "re-use same reset_token -> 400",
        f"got {r.status_code} body={r.text[:300]}",
    )
    if r.status_code == 400:
        detail = ""
        try:
            detail = r.json().get("detail", "")
        except Exception:
            pass
        check(
            "invalid" in detail.lower() or "expired" in detail.lower(),
            f"400 detail mentions invalid/expired (got: {detail!r})",
        )

    # =================================================================
    # ZERO-500s INVARIANT
    # =================================================================
    print("\n=== ZERO 500s INVARIANT ===")
    err_count = _count_500s_in_logs(run_start_offsets)
    check(
        err_count == 0,
        "zero new 'Internal Server Error' / tz-compare TypeErrors in backend logs during run",
        f"found {err_count} markers since run start",
    )

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
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(2)
    sys.exit(0 if f == 0 else 1)
