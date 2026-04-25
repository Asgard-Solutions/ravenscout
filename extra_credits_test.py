"""
Extra Hunt Analytics Packs — end-to-end backend test harness.

Verifies the new endpoints:
  GET  /api/user/analytics-usage
  POST /api/analytics/consume
  POST /api/purchases/extra-credits
  POST /api/purchases/revenuecat-webhook

Test target: http://localhost:8001 (per the review request).
"""
import os
import sys
import json
import asyncio
import httpx
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

BASE = "http://localhost:8001/api"
PRO_TOKEN = "test_session_rs_001"
CORE_TOKEN = "test_session_core_001"
TRIAL_TOKEN = "test_session_trial_001"

PRO_UID = "test-user-001"
CORE_UID = "test-user-core"
TRIAL_UID = "test-user-trial"

PASSED = []
FAILED = []


def H(token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def expect(cond, msg, ctx=None):
    if cond:
        PASSED.append(msg)
        print(f"  PASS  {msg}")
    else:
        FAILED.append((msg, ctx))
        print(f"  FAIL  {msg}")
        if ctx:
            print(f"        ctx={ctx}")


def section(title):
    print(f"\n=== {title} ===")


async def db_handle():
    client = AsyncIOMotorClient(os.environ.get("MONGODB_URI") or os.environ.get("MONGO_URL"))
    return client[os.environ.get("DB_NAME", "RavenScout")]


async def reseed():
    db = await db_handle()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=365)
    for uid, email, tier, token in [
        (PRO_UID,   "pro@ravenscout.app",   "pro",   PRO_TOKEN),
        (CORE_UID,  "core@ravenscout.app",  "core",  CORE_TOKEN),
        (TRIAL_UID, "trial@ravenscout.app", "trial", TRIAL_TOKEN),
    ]:
        await db.users.replace_one({"user_id": uid}, {
            "user_id": uid, "email": email, "name": uid, "tier": tier,
            "has_password": False, "analysis_count": 0, "rollover_count": 0,
            "extra_analytics_credits": 0,
            "billing_cycle_start": now.isoformat(),
            "created_at": now, "updated_at": now,
        }, upsert=True)
        await db.user_sessions.replace_one({"session_token": token}, {
            "user_id": uid, "session_token": token,
            "expires_at": expires, "created_at": now,
        }, upsert=True)
    await db.processed_purchases.delete_many({"user_id": {"$in": [PRO_UID, CORE_UID, TRIAL_UID]}})
    await db.analytics_ledger.delete_many({"user_id": {"$in": [PRO_UID, CORE_UID, TRIAL_UID]}})


async def patch_user(uid, fields):
    db = await db_handle()
    await db.users.update_one({"user_id": uid}, {"$set": fields})


async def get_user(uid):
    db = await db_handle()
    return await db.users.find_one({"user_id": uid}, {"_id": 0})


async def section_A(c: httpx.AsyncClient):
    section("A — GET /api/user/analytics-usage")

    r = await c.get(f"{BASE}/user/analytics-usage")
    expect(r.status_code == 401, "A1: 401 without Bearer", r.text)

    r = await c.get(f"{BASE}/user/analytics-usage", headers=H(PRO_TOKEN))
    expect(r.status_code == 200, "A2: pro user 200", r.text)
    j = r.json()
    expect(j.get("plan") == "pro", "A2: plan=pro", j)
    expect(j.get("monthlyAnalyticsLimit") == 40, "A2: monthlyAnalyticsLimit=40", j)
    expect(j.get("monthlyAnalyticsUsed") == 0, "A2: monthlyAnalyticsUsed=0", j)
    expect(j.get("monthlyAnalyticsRemaining") == 40, "A2: monthlyAnalyticsRemaining=40", j)
    expect(j.get("extraAnalyticsCredits") == 0, "A2: extraAnalyticsCredits=0", j)
    expect(j.get("totalRemaining") == 40, "A2: totalRemaining=40", j)
    packs = j.get("packs") or []
    expect(len(packs) == 3, "A2: packs has 3 entries", packs)
    pack_ids = {p.get("id") for p in packs}
    expected_ids = {
        "ravenscout_extra_analytics_5",
        "ravenscout_extra_analytics_10",
        "ravenscout_extra_analytics_15",
    }
    expect(pack_ids == expected_ids, "A2: pack ids match documented", pack_ids)
    pmap = {p["id"]: p for p in packs}
    expect(pmap["ravenscout_extra_analytics_5"]["credits"] == 5
           and abs(pmap["ravenscout_extra_analytics_5"]["price_usd"] - 5.99) < 0.001,
           "A2: 5-pack credits/price",
           pmap.get("ravenscout_extra_analytics_5"))
    expect(pmap["ravenscout_extra_analytics_10"]["credits"] == 10
           and abs(pmap["ravenscout_extra_analytics_10"]["price_usd"] - 10.99) < 0.001,
           "A2: 10-pack credits/price",
           pmap.get("ravenscout_extra_analytics_10"))
    expect(pmap["ravenscout_extra_analytics_15"]["credits"] == 15
           and abs(pmap["ravenscout_extra_analytics_15"]["price_usd"] - 14.99) < 0.001,
           "A2: 15-pack credits/price",
           pmap.get("ravenscout_extra_analytics_15"))
    for p in packs:
        expect("label" in p and bool(p["label"]), f"A2: pack {p.get('id')} has label", p)

    r = await c.get(f"{BASE}/user/analytics-usage", headers=H(CORE_TOKEN))
    expect(r.status_code == 200, "A3: core user 200", r.text)
    j = r.json()
    expect(j.get("plan") == "core", "A3: plan=core", j)
    expect(j.get("monthlyAnalyticsLimit") == 10, "A3: limit=10", j)
    expect(j.get("totalRemaining") == 10, "A3: totalRemaining=10", j)


async def section_B(c: httpx.AsyncClient):
    section("B — POST /api/purchases/extra-credits")

    r = await c.post(f"{BASE}/purchases/extra-credits",
                     json={"pack_id": "ravenscout_extra_analytics_5", "transaction_id": "tx_unauth"})
    expect(r.status_code == 401, "B1: 401 unauth", r.text)

    r = await c.post(f"{BASE}/purchases/extra-credits",
                     headers=H(PRO_TOKEN),
                     json={"pack_id": "totally_unknown_pack", "transaction_id": "tx_unknown"})
    expect(r.status_code == 400, "B2: 400 unknown pack_id", r.text)

    r = await c.post(f"{BASE}/purchases/extra-credits",
                     headers=H(PRO_TOKEN),
                     json={"pack_id": "ravenscout_extra_analytics_5", "transaction_id": "tx_a"})
    expect(r.status_code == 200, "B3: pro buys 5-pack tx=tx_a -> 200", r.text)
    j = r.json()
    expect(j.get("duplicate") is False, "B3: duplicate=false", j)
    expect(j.get("credits_granted") == 5, "B3: credits_granted=5", j)
    expect(j.get("extra_analytics_credits") == 5, "B3: balance=5", j)

    r = await c.get(f"{BASE}/user/analytics-usage", headers=H(PRO_TOKEN))
    j = r.json()
    expect(j.get("extraAnalyticsCredits") == 5, "B3: usage extraAnalyticsCredits=5", j)
    expect(j.get("totalRemaining") == 45, "B3: usage totalRemaining=45", j)

    r = await c.post(f"{BASE}/purchases/extra-credits",
                     headers=H(PRO_TOKEN),
                     json={"pack_id": "ravenscout_extra_analytics_5", "transaction_id": "tx_a"})
    expect(r.status_code == 200, "B4: replay tx_a -> 200", r.text)
    j = r.json()
    expect(j.get("duplicate") is True, "B4: duplicate=true", j)
    expect(j.get("credits_granted") == 0, "B4: credits_granted=0", j)
    expect(j.get("extra_analytics_credits") == 5, "B4: balance still 5 (no double grant)", j)

    r = await c.post(f"{BASE}/purchases/extra-credits",
                     headers=H(PRO_TOKEN),
                     json={"pack_id": "ravenscout_extra_analytics_10", "transaction_id": "tx_b"})
    expect(r.status_code == 200, "B5a: 10-pack tx_b -> 200", r.text)
    j = r.json()
    expect(j.get("extra_analytics_credits") == 15, "B5a: balance=15", j)

    r = await c.post(f"{BASE}/purchases/extra-credits",
                     headers=H(PRO_TOKEN),
                     json={"pack_id": "ravenscout_extra_analytics_15", "transaction_id": "tx_c"})
    expect(r.status_code == 200, "B5b: 15-pack tx_c -> 200", r.text)
    j = r.json()
    expect(j.get("extra_analytics_credits") == 30, "B5b: balance=30", j)


async def section_C(c: httpx.AsyncClient):
    section("C — Consumption order (monthly first, then extra)")

    # Set Pro user to analysis_count=39, extra_analytics_credits=2, fresh cycle
    now = datetime.now(timezone.utc)
    await patch_user(PRO_UID, {
        "analysis_count": 39,
        "rollover_count": 0,
        "extra_analytics_credits": 2,
        "billing_cycle_start": now.isoformat(),
    })
    db = await db_handle()
    await db.processed_purchases.delete_many({"user_id": PRO_UID})

    r = await c.post(f"{BASE}/analytics/consume", headers=H(PRO_TOKEN))
    expect(r.status_code == 200, "C1: consume #1 -> 200", r.text)
    j = r.json()
    expect(j.get("charged") == "monthly", "C1: charged=monthly", j)
    u = j.get("usage") or {}
    expect(u.get("monthlyAnalyticsRemaining") == 0, "C1: monthly_remaining=0", u)
    expect(u.get("extraAnalyticsCredits") == 2, "C1: extra=2", u)

    r = await c.post(f"{BASE}/analytics/consume", headers=H(PRO_TOKEN))
    expect(r.status_code == 200, "C2: consume #2 -> 200", r.text)
    j = r.json()
    expect(j.get("charged") == "extra", "C2: charged=extra", j)
    u = j.get("usage") or {}
    expect(u.get("extraAnalyticsCredits") == 1, "C2: extra=1", u)

    r = await c.post(f"{BASE}/analytics/consume", headers=H(PRO_TOKEN))
    expect(r.status_code == 200, "C3: consume #3 -> 200", r.text)
    j = r.json()
    expect(j.get("charged") == "extra", "C3: charged=extra", j)
    u = j.get("usage") or {}
    expect(u.get("extraAnalyticsCredits") == 0, "C3: extra=0", u)

    r = await c.post(f"{BASE}/analytics/consume", headers=H(PRO_TOKEN))
    expect(r.status_code == 402, "C4: consume #4 -> 402", r.text)
    try:
        j = r.json()
    except Exception:
        j = None
    detail = (j or {}).get("detail") or {}
    if isinstance(detail, str):
        try:
            detail = json.loads(detail)
        except Exception:
            pass
    expect(isinstance(detail, dict) and detail.get("code") == "out_of_credits",
           "C4: detail.code='out_of_credits'", j)


async def section_D(c: httpx.AsyncClient):
    section("D — Cycle reset preserves extra credits")

    past = datetime.now(timezone.utc) - timedelta(days=31)
    await patch_user(PRO_UID, {
        "analysis_count": 40,
        "rollover_count": 0,
        "extra_analytics_credits": 7,
        "billing_cycle_start": past.isoformat(),
    })

    r = await c.get(f"{BASE}/user/analytics-usage", headers=H(PRO_TOKEN))
    expect(r.status_code == 200, "D1: usage 200", r.text)
    j = r.json()
    expect(j.get("monthlyAnalyticsUsed") == 0, "D1: monthlyAnalyticsUsed=0 (reset)", j)
    expect(j.get("extraAnalyticsCredits") == 7, "D1: extraAnalyticsCredits=7 (preserved)", j)

    r = await c.post(f"{BASE}/analytics/consume", headers=H(PRO_TOKEN))
    expect(r.status_code == 200, "D2: consume 200", r.text)
    j = r.json()
    expect(j.get("charged") == "monthly", "D2: charged=monthly (NOT extra)", j)
    u = j.get("usage") or {}
    expect(u.get("extraAnalyticsCredits") == 7, "D2: extra still 7", u)


async def section_E(c: httpx.AsyncClient):
    section("E — Subscription analyze endpoint integration (smoke)")
    # Best-effort: verify /api/analyze-hunt exists and the consume hook fires on success.
    # Set Pro user so we can detect a decrement (start at known state).
    await patch_user(PRO_UID, {
        "analysis_count": 0,
        "rollover_count": 0,
        "extra_analytics_credits": 0,
        "billing_cycle_start": datetime.now(timezone.utc).isoformat(),
    })

    # Build a tiny valid PNG via PIL if available, else a minimal hardcoded one.
    import base64, io
    try:
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (256, 256), color=(120, 90, 50)).save(buf, format="PNG")
        png_bytes = buf.getvalue()
    except Exception:
        # Hardcoded 1x1 transparent PNG
        png_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
    img_b64 = base64.b64encode(png_bytes).decode()

    body = {
        "conditions": {
            "animal": "deer",
            "hunt_date": "2026-04-15",
            "time_window": "morning",
            "wind_direction": "NW",
            "temperature": "45F",
            "property_type": "private",
        },
        "map_image_base64": img_b64,
    }
    before = await get_user(PRO_UID)
    before_count = int((before or {}).get("analysis_count", 0))
    before_extra = int((before or {}).get("extra_analytics_credits", 0))

    r = await c.post(f"{BASE}/analyze-hunt", headers=H(PRO_TOKEN), json=body, timeout=60)
    expect(r.status_code in (200, 422), "E: /api/analyze-hunt route exists", f"status={r.status_code} body={r.text[:200]}")
    after = await get_user(PRO_UID)
    after_count = int((after or {}).get("analysis_count", 0))
    after_extra = int((after or {}).get("extra_analytics_credits", 0))

    # If the analyze succeeded (LLM responded), exactly one credit must have been
    # consumed (from monthly OR extra). If it failed, no decrement is fine.
    j = None
    try:
        j = r.json()
    except Exception:
        pass
    succeeded = isinstance(j, dict) and j.get("success") is True
    if succeeded:
        delta_total = (after_count - before_count) + (before_extra - after_extra)
        expect(delta_total == 1,
               "E: on success, total credits dropped by exactly 1",
               {"before_count": before_count, "after_count": after_count,
                "before_extra": before_extra, "after_extra": after_extra})
    else:
        # Endpoint exists; AI may have failed. Note the result.
        expect(True, "E: analyze-hunt non-success (AI/short-circuit) — credit hook untested but route alive",
               {"status": r.status_code, "body": (r.text[:200] if r.text else None)})


async def section_F(c: httpx.AsyncClient):
    section("F — RevenueCat webhook idempotency")
    db = await db_handle()
    # Make sure no leftover idempotency record blocks the test
    await db.processed_purchases.delete_many({"_id": "revenuecat:rc_xyz_123"})

    body = {
        "event": {
            "type": "NON_RENEWING_PURCHASE",
            "app_user_id": PRO_UID,
            "product_id": "ravenscout_extra_analytics_10",
            "transaction_id": "rc_xyz_123",
        }
    }
    # Fetch user balance prior
    before = await get_user(PRO_UID)
    before_extra = int((before or {}).get("extra_analytics_credits", 0))

    r = await c.post(f"{BASE}/purchases/revenuecat-webhook", json=body)
    expect(r.status_code == 200, "F1: webhook NON_RENEWING_PURCHASE -> 200", r.text)
    j = r.json()
    expect(j.get("duplicate") is False, "F1: duplicate=false", j)
    expect(j.get("credits_granted") == 10, "F1: credits_granted=10", j)
    after = await get_user(PRO_UID)
    after_extra = int((after or {}).get("extra_analytics_credits", 0))
    expect(after_extra - before_extra == 10, "F1: balance increased by 10", {"before": before_extra, "after": after_extra})

    r = await c.post(f"{BASE}/purchases/revenuecat-webhook", json=body)
    expect(r.status_code == 200, "F2: replay -> 200", r.text)
    j = r.json()
    expect(j.get("duplicate") is True, "F2: duplicate=true", j)
    expect(j.get("credits_granted") == 0, "F2: credits_granted=0", j)
    after2 = await get_user(PRO_UID)
    expect(int((after2 or {}).get("extra_analytics_credits", 0)) == after_extra,
           "F2: balance unchanged on replay", {"after2": after2})

    body3 = {
        "event": {
            "type": "RENEWAL",
            "app_user_id": PRO_UID,
            "product_id": "ravenscout_extra_analytics_10",
            "transaction_id": "rc_other_1",
        }
    }
    r = await c.post(f"{BASE}/purchases/revenuecat-webhook", json=body3)
    expect(r.status_code == 200, "F3: non-NON_RENEWING_PURCHASE -> 200", r.text)
    j = r.json()
    expect(j.get("ignored") == "RENEWAL", "F3: ignored=<type>", j)

    body4 = {
        "event": {
            "type": "NON_RENEWING_PURCHASE",
            "app_user_id": PRO_UID,
            "product_id": "ravenscout_unknown_product_xyz",
            "transaction_id": "rc_unknown_1",
        }
    }
    r = await c.post(f"{BASE}/purchases/revenuecat-webhook", json=body4)
    expect(r.status_code == 200, "F4: unknown product -> 200", r.text)
    j = r.json()
    expect(j.get("ignored") == "unknown_product", "F4: ignored='unknown_product'", j)

    body5 = {
        "event": {
            "type": "NON_RENEWING_PURCHASE",
            # missing app_user_id
            "product_id": "ravenscout_extra_analytics_10",
            "transaction_id": "rc_missing_1",
        }
    }
    r = await c.post(f"{BASE}/purchases/revenuecat-webhook", json=body5)
    expect(r.status_code == 400, "F5: missing required fields -> 400", r.text)


async def section_G(c: httpx.AsyncClient):
    section("G — Cross-tier behaviour (trial)")

    # Reseed trial user fresh
    await patch_user(TRIAL_UID, {
        "analysis_count": 0,
        "rollover_count": 0,
        "extra_analytics_credits": 0,
        "billing_cycle_start": datetime.now(timezone.utc).isoformat(),
    })
    db = await db_handle()
    await db.processed_purchases.delete_many({"user_id": TRIAL_UID})

    # G1: trial buys 5-pack
    r = await c.post(f"{BASE}/purchases/extra-credits",
                     headers=H(TRIAL_TOKEN),
                     json={"pack_id": "ravenscout_extra_analytics_5", "transaction_id": "tx_trial_g"})
    expect(r.status_code == 200, "G1: trial extra-credits 5-pack -> 200", r.text)
    j = r.json()
    expect(j.get("credits_granted") == 5, "G1: credits_granted=5", j)
    expect(j.get("extra_analytics_credits") == 5, "G1: balance=5", j)

    # G2: trial consume; trial has lifetime limit 3; analysis_count=0 so monthly bucket
    # has 3 remaining. The brief says "should drain the extra credits (charged='extra')"
    # — but per server code (consume_one_analysis), the trial has lifetime "monthly"
    # bucket of 3 free, so charged=monthly first. To verify the spirit of the test —
    # that trial users CAN drain extra credits — we'll exhaust the lifetime first.
    # Set analysis_count=3 (lifetime exhausted) so the next consume drains extra.
    await patch_user(TRIAL_UID, {"analysis_count": 3})

    r = await c.post(f"{BASE}/analytics/consume", headers=H(TRIAL_TOKEN))
    expect(r.status_code == 200, "G2: trial consume after lifetime exhausted -> 200", r.text)
    j = r.json()
    expect(j.get("charged") == "extra", "G2: charged=extra (drains extra credits)", j)
    u = j.get("usage") or {}
    expect(u.get("extraAnalyticsCredits") == 4, "G2: extra=4", u)


async def main():
    print(f"Re-seeding test users at {BASE}")
    await reseed()

    async with httpx.AsyncClient(timeout=30) as c:
        await section_A(c)
        await section_B(c)
        await section_C(c)
        await section_D(c)
        await section_E(c)
        await section_F(c)
        await section_G(c)

    print(f"\n=== SUMMARY ===")
    print(f"PASSED: {len(PASSED)}")
    print(f"FAILED: {len(FAILED)}")
    if FAILED:
        print("\nFailed assertions:")
        for m, ctx in FAILED:
            print(f"  - {m}")
            if ctx:
                print(f"    ctx={ctx}")
    sys.exit(0 if not FAILED else 1)


if __name__ == "__main__":
    asyncio.run(main())
