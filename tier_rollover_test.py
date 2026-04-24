#!/usr/bin/env python3
"""
Tier limits + rollover v2 backend test.

Validates:
 1. Pro limit = 40 (was 100)
 2. Core rollover replace-mode (unchanged) — expected cap at tier limit (10)
 3. Pro rollover accumulate-mode (new) — add on top, cap at 40*12=480
 4. Pro rollover cap at 480
 5. Pro limit-reached message
 6. Regression: Trial limit=3 (is_lifetime)

Mutates the user doc directly in Mongo between scenarios, then calls
GET /api/auth/me through the public preview URL to observe the
effect of the in-place rollover inside check_analysis_allowed.
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BACKEND_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BACKEND_URL}/api"

MONGO_URI = os.environ.get("MONGODB_URI") or os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "RavenScout")

print(f"[cfg] API={API}")
print(f"[cfg] DB={DB_NAME}")

TOKEN_PRO_1 = "test_session_rs_001"      # test-user-001, pro
TOKEN_PRO_2 = "test_session_rs_002"      # test-user-002, pro
TOKEN_TRIAL = "test_session_trial_001"   # test-user-trial, trial

USER_PRO_1 = "test-user-001"
USER_PRO_2 = "test-user-002"
USER_TRIAL = "test-user-trial"
USER_CORE_TEST = "test-user-core-rollover"  # seeded locally in this suite


results = []


def check(name, cond, detail=""):
    tag = "PASS" if cond else "FAIL"
    msg = f"[{tag}] {name}"
    if detail:
        msg += f"  -- {detail}"
    print(msg)
    results.append((name, cond, detail))
    return cond


def auth_me(token):
    r = requests.get(f"{API}/auth/me",
                     headers={"Authorization": f"Bearer {token}"},
                     timeout=30)
    return r


async def main():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]

    # --- Preflight: ensure seeded Pro users exist and session tokens valid ---
    now = datetime.now(timezone.utc)
    exp = (now + timedelta(days=30)).isoformat()

    for uid, email, token in [
        (USER_PRO_1, "test@ravenscout.app", TOKEN_PRO_1),
        (USER_PRO_2, "test2@ravenscout.app", TOKEN_PRO_2),
    ]:
        await db.users.update_one(
            {"user_id": uid},
            {"$setOnInsert": {
                "user_id": uid,
                "email": email,
                "name": email.split("@")[0],
                "picture": "",
                "email_verified": True,
                "analysis_count": 0,
                "rollover_count": 0,
                "billing_cycle_start": now.isoformat(),
                "created_at": now.isoformat(),
            }, "$set": {"tier": "pro"}},
            upsert=True,
        )
        await db.user_sessions.update_one(
            {"session_token": token},
            {"$set": {
                "session_token": token,
                "user_id": uid,
                "expires_at": exp,
            }},
            upsert=True,
        )

    # Seed a Core test user for scenario 2 (not present in test_credentials)
    core_token = "test_session_core_rollover"
    await db.users.update_one(
        {"user_id": USER_CORE_TEST},
        {"$setOnInsert": {
            "user_id": USER_CORE_TEST,
            "email": "core_rollover@ravenscout.app",
            "name": "Core Rollover Test",
            "picture": "",
            "email_verified": True,
            "created_at": now.isoformat(),
        }, "$set": {
            "tier": "core",
            "analysis_count": 0,
            "rollover_count": 0,
            "billing_cycle_start": now.isoformat(),
        }},
        upsert=True,
    )
    await db.user_sessions.update_one(
        {"session_token": core_token},
        {"$set": {
            "session_token": core_token,
            "user_id": USER_CORE_TEST,
            "expires_at": exp,
        }},
        upsert=True,
    )

    # ---------------------------------------------------------------
    # SCENARIO 1 — Tier limit Pro = 40
    # ---------------------------------------------------------------
    print("\n=== SCENARIO 1 — Pro tier limit = 40 ===")
    # Reset test-user-002 to a clean in-cycle state
    await db.users.update_one(
        {"user_id": USER_PRO_2},
        {"$set": {
            "tier": "pro",
            "analysis_count": 0,
            "rollover_count": 0,
            "billing_cycle_start": now.isoformat(),
        }}
    )

    r = auth_me(TOKEN_PRO_2)
    check("S1 auth/me 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        usage = body.get("usage", {})
        check("S1 tier=pro", body.get("tier") == "pro", f"tier={body.get('tier')}")
        check("S1 usage.limit == 40 (not 100)", usage.get("limit") == 40,
              f"limit={usage.get('limit')}")
        expected_remaining = 40 - 0 + 0
        check("S1 usage.remaining == 40 - 0 + 0 = 40",
              usage.get("remaining") == expected_remaining,
              f"remaining={usage.get('remaining')}, expected={expected_remaining}")
        check("S1 usage.allowed == True", usage.get("allowed") is True)

    # ---------------------------------------------------------------
    # SCENARIO 2 — Core replace-mode rollover (unchanged)
    # ---------------------------------------------------------------
    print("\n=== SCENARIO 2 — Core replace-mode rollover ===")
    past = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    await db.users.update_one(
        {"user_id": USER_CORE_TEST},
        {"$set": {
            "tier": "core",
            "analysis_count": 3,
            "rollover_count": 0,
            "billing_cycle_start": past,
        }}
    )

    r = auth_me(core_token)
    check("S2 auth/me 200", r.status_code == 200,
          f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        usage = r.json().get("usage", {})
        check("S2 tier=core", r.json().get("tier") == "core")
        check("S2 usage.limit == 10", usage.get("limit") == 10,
              f"limit={usage.get('limit')}")
        check("S2 usage.rollover == 7 (10-3 capped at 10)",
              usage.get("rollover") == 7,
              f"rollover={usage.get('rollover')}")
        check("S2 usage.remaining == 17 (10+7)",
              usage.get("remaining") == 17,
              f"remaining={usage.get('remaining')}")
        # Verify Mongo side: analysis_count reset to 0
        u = await db.users.find_one({"user_id": USER_CORE_TEST})
        check("S2 analysis_count reset to 0",
              u.get("analysis_count") == 0, f"got {u.get('analysis_count')}")
        check("S2 rollover_count persisted = 7",
              u.get("rollover_count") == 7, f"got {u.get('rollover_count')}")

    # ---------------------------------------------------------------
    # SCENARIO 3 — Pro accumulate-mode rollover (new)
    # ---------------------------------------------------------------
    print("\n=== SCENARIO 3 — Pro accumulate-mode rollover ===")
    await db.users.update_one(
        {"user_id": USER_PRO_2},
        {"$set": {
            "tier": "pro",
            "analysis_count": 5,
            "rollover_count": 30,
            "billing_cycle_start": past,
        }}
    )

    r = auth_me(TOKEN_PRO_2)
    check("S3 auth/me 200", r.status_code == 200,
          f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        usage = r.json().get("usage", {})
        # unused = 40-5 = 35, new_rollover = min(30+35, 480) = 65
        check("S3 usage.limit == 40", usage.get("limit") == 40,
              f"limit={usage.get('limit')}")
        check("S3 usage.rollover == 65 (30+35)",
              usage.get("rollover") == 65,
              f"rollover={usage.get('rollover')}")
        check("S3 usage.remaining == 105 (40+65)",
              usage.get("remaining") == 105,
              f"remaining={usage.get('remaining')}")
        u = await db.users.find_one({"user_id": USER_PRO_2})
        check("S3 analysis_count reset to 0",
              u.get("analysis_count") == 0, f"got {u.get('analysis_count')}")
        check("S3 rollover_count persisted = 65",
              u.get("rollover_count") == 65, f"got {u.get('rollover_count')}")

    # ---------------------------------------------------------------
    # SCENARIO 4 — Pro rollover cap at 480
    # ---------------------------------------------------------------
    print("\n=== SCENARIO 4 — Pro rollover cap = 480 ===")
    await db.users.update_one(
        {"user_id": USER_PRO_2},
        {"$set": {
            "tier": "pro",
            "analysis_count": 0,
            "rollover_count": 475,
            "billing_cycle_start": past,
        }}
    )

    r = auth_me(TOKEN_PRO_2)
    check("S4 auth/me 200", r.status_code == 200,
          f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        usage = r.json().get("usage", {})
        # unused = 40, new_rollover = min(475+40, 480) = 480
        check("S4 usage.rollover == 480 (capped)",
              usage.get("rollover") == 480,
              f"rollover={usage.get('rollover')}")
        check("S4 usage.remaining == 520 (40+480)",
              usage.get("remaining") == 520,
              f"remaining={usage.get('remaining')}")
        check("S4 usage.limit == 40", usage.get("limit") == 40)

    # ---------------------------------------------------------------
    # SCENARIO 5 — Pro limit reached message
    # ---------------------------------------------------------------
    print("\n=== SCENARIO 5 — Pro limit reached ===")
    await db.users.update_one(
        {"user_id": USER_PRO_2},
        {"$set": {
            "tier": "pro",
            "analysis_count": 40,
            "rollover_count": 0,
            "billing_cycle_start": datetime.now(timezone.utc).isoformat(),
        }}
    )
    r = auth_me(TOKEN_PRO_2)
    check("S5 auth/me 200", r.status_code == 200,
          f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        usage = r.json().get("usage", {})
        check("S5 usage.allowed == False", usage.get("allowed") is False,
              f"allowed={usage.get('allowed')}")
        check("S5 usage.remaining == 0", usage.get("remaining") == 0,
              f"remaining={usage.get('remaining')}")
        check("S5 usage.limit == 40", usage.get("limit") == 40,
              f"limit={usage.get('limit')}")
        msg = usage.get("message", "")
        check("S5 message contains 'Monthly limit reached'",
              "Monthly limit reached" in msg, f"message={msg!r}")

    # ---------------------------------------------------------------
    # SCENARIO 6 — Regression: Trial still limit=3, auth stable
    # ---------------------------------------------------------------
    print("\n=== SCENARIO 6 — Regression: Trial & auth ===")
    r = auth_me(TOKEN_TRIAL)
    if r.status_code != 200:
        # Trial user may need seeding
        await db.users.update_one(
            {"user_id": USER_TRIAL},
            {"$setOnInsert": {
                "user_id": USER_TRIAL,
                "email": "trial@ravenscout.app",
                "name": "Trial Tester",
                "picture": "",
                "email_verified": True,
                "analysis_count": 0,
                "created_at": now.isoformat(),
            }, "$set": {"tier": "trial"}},
            upsert=True,
        )
        await db.user_sessions.update_one(
            {"session_token": TOKEN_TRIAL},
            {"$set": {
                "session_token": TOKEN_TRIAL,
                "user_id": USER_TRIAL,
                "expires_at": exp,
            }},
            upsert=True,
        )
        r = auth_me(TOKEN_TRIAL)

    check("S6 auth/me Trial 200", r.status_code == 200,
          f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        usage = r.json().get("usage", {})
        check("S6 Trial tier=trial", r.json().get("tier") == "trial")
        check("S6 Trial usage.limit == 3", usage.get("limit") == 3,
              f"limit={usage.get('limit')}")

    # Auth/me for Pro 1 still works (no 500)
    r1 = auth_me(TOKEN_PRO_1)
    check("S6 Pro1 auth/me still 200", r1.status_code == 200,
          f"got {r1.status_code}")
    if r1.status_code == 200:
        check("S6 Pro1 usage.limit == 40",
              r1.json().get("usage", {}).get("limit") == 40,
              f"limit={r1.json().get('usage', {}).get('limit')}")

    # ---------------------------------------------------------------
    # Cleanup
    # ---------------------------------------------------------------
    print("\n=== CLEANUP ===")
    await db.users.update_one(
        {"user_id": USER_PRO_2},
        {"$set": {
            "tier": "pro",
            "analysis_count": 0,
            "rollover_count": 0,
            "billing_cycle_start": datetime.now(timezone.utc).isoformat(),
        }}
    )
    # Verify cleanup
    u = await db.users.find_one({"user_id": USER_PRO_2})
    check("CLEANUP test-user-002 reset",
          u.get("analysis_count") == 0 and u.get("rollover_count") == 0 and u.get("tier") == "pro",
          f"state={u.get('tier')}/{u.get('analysis_count')}/{u.get('rollover_count')}")

    client.close()

    # ---------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [n for n, ok, d in results if not ok]
    print(f"\n===== RESULT: {passed}/{len(results)} passed =====")
    if failed:
        print("FAILED:")
        for n in failed:
            detail = next(d for nn, ok, d in results if nn == n and not ok)
            print(f"  - {n}  ({detail})")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
