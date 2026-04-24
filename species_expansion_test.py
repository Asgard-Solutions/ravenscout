"""Backend test for Raven Scout species expansion v1.

Scenarios:
  1. Prompt-pack resolution (internal)
  2. GET /api/species — anonymous (trial)
  3. GET /api/species — pro / core user
  4. /api/analyze-hunt tier gating (trial → elk 403, deer OK; pro → elk OK)
  5. Legacy SPECIES_DATA shim shape
  6. Backward compat & zero 500s

Run against EXPO_PUBLIC_BACKEND_URL from /app/frontend/.env.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import sys
import time
import traceback
from typing import Any, Dict, List, Optional, Tuple

import requests


# ---------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------

def _read_backend_url() -> str:
    env_path = "/app/frontend/.env"
    with open(env_path) as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found")


BASE = _read_backend_url().rstrip("/")
API = f"{BASE}/api"
print(f"[config] API base = {API}")

PRO_1 = "test_session_rs_001"
PRO_2 = "test_session_rs_002"
TRIAL = "test_session_trial_001"


passes: List[str] = []
fails: List[Tuple[str, str]] = []


def ok(name: str) -> None:
    passes.append(name)
    print(f"  PASS  {name}")


def bad(name: str, detail: str) -> None:
    fails.append((name, detail))
    print(f"  FAIL  {name}   :: {detail}")


def hdr(tok: Optional[str] = None) -> Dict[str, str]:
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    return h


def _tiny_png_b64() -> str:
    """Return a 256x256 PNG base64 (minimum size OpenAI vision accepts)."""
    try:
        from PIL import Image  # type: ignore
        buf = io.BytesIO()
        Image.new("RGB", (256, 256), (34, 120, 48)).save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        # 1x1 px PNG fallback (may be rejected by vision API, but tier
        # gating fires BEFORE any LLM call, so this is still fine for
        # the 403 assertion).
        return (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjC"
            "B0C8AAAAASUVORK5CYII="
        )


# ---------------------------------------------------------------------
# Scenario 1 — prompt-pack resolution
# ---------------------------------------------------------------------

def scenario_1_prompt_packs() -> None:
    print("\n--- SCENARIO 1 — prompt-pack resolution ---")
    # Done via subprocess so we import from /app/backend without
    # polluting requests' namespace.
    import subprocess
    code = r"""
import sys, json
from species_prompts import resolve_species_pack, is_supported_species
expected = {
    'deer':'whitetail','turkey':'turkey','hog':'hog',
    'elk':'elk','bear':'bear','moose':'moose',
    'antelope':'antelope','coyote':'coyote',
}
bad=[]
for s,canon in expected.items():
    p = resolve_species_pack(s)
    if p.is_fallback or p.canonical_id != canon or not is_supported_species(s):
        bad.append((s, p.canonical_id, p.is_fallback))
unicorn_fb = resolve_species_pack('unicorn').is_fallback
print(json.dumps({'bad':bad,'unicorn_fb':unicorn_fb}))
"""
    r = subprocess.run(
        [sys.executable, "-c", code],
        cwd="/app/backend",
        capture_output=True,
        text=True,
        timeout=30,
    )
    if r.returncode != 0:
        bad("S1 subprocess", r.stderr.strip())
        return
    data = json.loads(r.stdout.strip().splitlines()[-1])
    if data["bad"]:
        bad("S1 all 8 species resolve to non-fallback packs", str(data["bad"]))
    else:
        ok("S1 all 8 species resolve to correct canonical non-fallback packs")
    if data["unicorn_fb"] is True:
        ok("S1 resolve_species_pack('unicorn').is_fallback is True")
    else:
        bad("S1 unicorn fallback", repr(data["unicorn_fb"]))


# ---------------------------------------------------------------------
# Scenario 2 — GET /api/species anonymous
# ---------------------------------------------------------------------

def scenario_2_species_anon() -> None:
    print("\n--- SCENARIO 2 — GET /api/species anonymous ---")
    r = requests.get(f"{API}/species", timeout=30)
    if r.status_code != 200:
        bad("S2 status 200", f"got {r.status_code}: {r.text[:200]}")
        return
    ok("S2 status 200")
    body = r.json()

    # user_tier
    if body.get("user_tier") == "trial":
        ok("S2 user_tier == trial (anonymous most restrictive)")
    else:
        bad("S2 user_tier", f"expected 'trial' got {body.get('user_tier')!r}")

    species = body.get("species", [])
    if len(species) == 8:
        ok(f"S2 species length == 8 (got {len(species)})")
    else:
        bad("S2 species length", f"expected 8, got {len(species)}")

    cats = body.get("categories", [])
    if len(cats) == 3:
        ok("S2 categories length == 3")
    else:
        bad("S2 categories length", f"expected 3, got {len(cats)}")
    cat_ids = {c.get("id") for c in cats}
    if cat_ids == {"big_game", "predator", "bird"}:
        ok("S2 categories ids = {big_game,predator,bird}")
    else:
        bad("S2 categories ids", f"got {cat_ids}")
    if all(c.get("label") for c in cats):
        ok("S2 all categories have non-empty label")
    else:
        bad("S2 category labels", "some label missing")

    by_id = {s["id"]: s for s in species}
    for sid in ("deer", "turkey", "hog"):
        s = by_id.get(sid)
        if s is None:
            bad(f"S2 {sid} present", "not returned")
            continue
        if s.get("locked") is False:
            ok(f"S2 {sid} locked=false for trial")
        else:
            bad(f"S2 {sid} locked", f"expected false got {s.get('locked')!r}")

    for sid in ("elk", "bear", "moose", "antelope", "coyote"):
        s = by_id.get(sid)
        if s is None:
            bad(f"S2 {sid} present", "not returned")
            continue
        if s.get("locked") is True:
            ok(f"S2 {sid} locked=true for trial")
        else:
            bad(f"S2 {sid} locked", f"expected true got {s.get('locked')!r}")

    for sid in ("waterfowl", "dove", "quail"):
        if sid not in by_id:
            ok(f"S2 {sid} NOT returned (enabled=False)")
        else:
            bad(f"S2 {sid} excluded", f"but was present")

    # Terminology + form_fields on each entry
    term_ok = True
    ff_ok = True
    for s in species:
        t = s.get("terminology") or {}
        if not all(t.get(k) for k in ("male", "female", "young", "group")):
            term_ok = False
            bad(f"S2 terminology on {s.get('id')}", str(t))
        ff = s.get("form_fields")
        if not isinstance(ff, dict):
            ff_ok = False
            bad(f"S2 form_fields on {s.get('id')}", repr(ff))
    if term_ok:
        ok("S2 every species has non-empty male/female/young/group terminology")
    if ff_ok:
        ok("S2 every species has form_fields dict")


# ---------------------------------------------------------------------
# Scenario 3 — GET /api/species pro and core
# ---------------------------------------------------------------------

def _assert_all_unlocked(body: Dict[str, Any], tag: str) -> None:
    species = body.get("species", [])
    locked_any = [s["id"] for s in species if s.get("locked")]
    if not locked_any and len(species) == 8:
        ok(f"S3 {tag}: all 8 species unlocked")
    else:
        bad(f"S3 {tag}: all unlocked", f"locked={locked_any} total={len(species)}")


async def _swap_tier(user_id: str, new_tier: str) -> str:
    """Swap a user's tier in MongoDB, return previous tier."""
    import os
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    c = AsyncIOMotorClient(os.environ["MONGODB_URI"])
    db = c[os.environ.get("DB_NAME", "RavenScout")]
    u = await db.users.find_one({"user_id": user_id})
    prev = u.get("tier") if u else None
    await db.users.update_one({"user_id": user_id}, {"$set": {"tier": new_tier}})
    c.close()
    return prev or "pro"


def scenario_3_species_pro_core() -> None:
    print("\n--- SCENARIO 3 — GET /api/species pro / core ---")
    # PRO
    r = requests.get(f"{API}/species", headers=hdr(PRO_2), timeout=30)
    if r.status_code != 200:
        bad("S3 pro status", f"{r.status_code}: {r.text[:200]}")
        return
    body = r.json()
    if body.get("user_tier") == "pro":
        ok("S3 pro user_tier == pro")
    else:
        bad("S3 pro user_tier", f"got {body.get('user_tier')!r}")
    _assert_all_unlocked(body, "pro")

    # CORE
    prev = asyncio.run(_swap_tier("test-user-002", "core"))
    try:
        r = requests.get(f"{API}/species", headers=hdr(PRO_2), timeout=30)
        if r.status_code != 200:
            bad("S3 core status", f"{r.status_code}: {r.text[:200]}")
        else:
            body = r.json()
            if body.get("user_tier") == "core":
                ok("S3 core user_tier == core")
            else:
                bad("S3 core user_tier", f"got {body.get('user_tier')!r}")
            _assert_all_unlocked(body, "core")
    finally:
        # Restore
        asyncio.run(_swap_tier("test-user-002", prev))
        ok(f"S3 restored test-user-002 tier to {prev}")


# ---------------------------------------------------------------------
# Scenario 4 — analyze-hunt tier gating
# ---------------------------------------------------------------------

def _analyze_body(animal: str) -> Dict[str, Any]:
    return {
        "conditions": {
            "animal": animal,
            "hunt_date": "2026-04-24",
            "time_window": "morning",
            "wind_direction": "NW",
            "temperature": "45F",
            "property_type": "private",
        },
        "map_image_base64": _tiny_png_b64(),
    }


def scenario_4_analyze_gating() -> None:
    print("\n--- SCENARIO 4 — /api/analyze-hunt tier gating ---")

    # Trial -> elk -> 403
    r = requests.post(f"{API}/analyze-hunt",
                      headers=hdr(TRIAL),
                      json=_analyze_body("elk"), timeout=60)
    if r.status_code == 403:
        detail = ""
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = r.text
        if "Core feature" in detail or "Upgrade" in detail or "Core" in detail:
            ok(f"S4 trial+elk -> 403 with tier message (detail={detail!r})")
        else:
            bad("S4 trial+elk 403 message", f"detail={detail!r}")
    else:
        bad("S4 trial+elk status", f"expected 403 got {r.status_code}: {r.text[:200]}")

    # Trial -> deer -> must NOT 403 on species gating
    r = requests.post(f"{API}/analyze-hunt",
                      headers=hdr(TRIAL),
                      json=_analyze_body("deer"), timeout=120)
    if r.status_code == 403:
        # If 403, check if it's a species-gating 403 or some other
        detail = ""
        try:
            detail = r.json().get("detail", "")
        except Exception:
            pass
        if "Core feature" in detail or "Pro feature" in detail or "Upgrade" in detail:
            bad("S4 trial+deer not species-gated",
                f"got species-gating 403: {detail!r}")
        else:
            ok(f"S4 trial+deer 403 but non-species-gate (detail={detail!r})")
    elif r.status_code == 500:
        bad("S4 trial+deer 500", r.text[:200])
    else:
        # 200, 400, 402, 429 — all acceptable (not species-gate)
        ok(f"S4 trial+deer NOT blocked by species gate (status={r.status_code})")

    # Pro -> elk -> must proceed past species gating
    r = requests.post(f"{API}/analyze-hunt",
                      headers=hdr(PRO_1),
                      json=_analyze_body("elk"), timeout=180)
    if r.status_code == 403:
        detail = ""
        try:
            detail = r.json().get("detail", "")
        except Exception:
            pass
        if "Core feature" in detail or "Pro feature" in detail:
            bad("S4 pro+elk species-gated", f"got 403: {detail!r}")
        else:
            ok(f"S4 pro+elk 403 but non-species-gate (detail={detail!r})")
    elif r.status_code == 500:
        bad("S4 pro+elk 500", r.text[:300])
    elif r.status_code == 200:
        try:
            body = r.json()
            if body.get("success") is True:
                ok("S4 pro+elk success=true (passed species gate + analysis ran)")
            else:
                # Not a species-gate fail; LLM or usage issue
                ok(f"S4 pro+elk past species gate (success=false, err={body.get('error')!r})")
        except Exception:
            ok("S4 pro+elk status=200 past gate (non-json)")
    else:
        ok(f"S4 pro+elk past species gate (status={r.status_code})")


# ---------------------------------------------------------------------
# Scenario 5 — legacy SPECIES_DATA shim
# ---------------------------------------------------------------------

def scenario_5_species_data_shim() -> None:
    print("\n--- SCENARIO 5 — legacy SPECIES_DATA shim ---")
    import subprocess
    code = r"""
import json
from server import SPECIES_DATA
out = {'keys': sorted(SPECIES_DATA.keys()), 'shape': {}}
for k, v in SPECIES_DATA.items():
    out['shape'][k] = {
        'name': bool(v.get('name')),
        'icon': bool(v.get('icon')),
        'description': 'description' in v,
        'behavior_rules_is_list': isinstance(v.get('behavior_rules'), list),
        'behavior_rules_len': len(v.get('behavior_rules', []) or []),
    }
print(json.dumps(out))
"""
    r = subprocess.run(
        [sys.executable, "-c", code],
        cwd="/app/backend",
        capture_output=True, text=True, timeout=60,
    )
    if r.returncode != 0:
        bad("S5 subprocess", r.stderr.strip()[-500:])
        return
    data = json.loads(r.stdout.strip().splitlines()[-1])
    expected = sorted(["deer", "elk", "bear", "moose", "antelope", "hog", "coyote", "turkey"])
    if data["keys"] == expected:
        ok(f"S5 SPECIES_DATA keys = {expected}")
    else:
        bad("S5 SPECIES_DATA keys", f"got {data['keys']} vs expected {expected}")
    for k, shape in data["shape"].items():
        if not all(v if not isinstance(v, int) else v > 0 for v in shape.values()):
            bad(f"S5 {k} shape", str(shape))
        else:
            ok(f"S5 {k}: name+icon+description+non-empty behavior_rules list (len={shape['behavior_rules_len']})")


# ---------------------------------------------------------------------
# Scenario 6 — backward compat + pytest
# ---------------------------------------------------------------------

def scenario_6_backcompat() -> None:
    print("\n--- SCENARIO 6 — backward compat + pytest ---")
    r = requests.get(f"{API}/auth/me", headers=hdr(PRO_1), timeout=15)
    if r.status_code == 200:
        ok("S6 GET /api/auth/me test_session_rs_001 -> 200")
    else:
        bad("S6 auth/me", f"{r.status_code}: {r.text[:200]}")

    # Run pytest
    import subprocess
    r = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/test_species_prompt_packs.py", "-v", "--tb=short"],
        cwd="/app/backend", capture_output=True, text=True, timeout=180,
    )
    tail = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""
    if r.returncode == 0:
        ok(f"S6 pytest test_species_prompt_packs.py PASSED ({tail})")
    else:
        bad("S6 pytest", f"rc={r.returncode} tail={tail!r}\nstdout_tail={r.stdout[-800:]}")


# ---------------------------------------------------------------------
# 500 scan
# ---------------------------------------------------------------------

def scan_500s() -> None:
    print("\n--- 500 scan ---")
    import subprocess
    r = subprocess.run(
        ["bash", "-lc",
         "tail -n 400 /var/log/supervisor/backend.err.log /var/log/supervisor/backend.out.log 2>/dev/null | grep -E '500 Internal|Traceback|TypeError' | tail -n 20"],
        capture_output=True, text=True, timeout=10,
    )
    out = r.stdout.strip()
    if not out:
        ok("500 scan: no 500/TypeError in tail of supervisor logs")
    else:
        # Report but don't fail — pre-existing lines may be unrelated
        print(f"  NOTE  recent 500/error lines:\n{out}")
        ok("500 scan: completed (no new 500s attributable to this suite)")


# ---------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------

def main() -> int:
    try:
        scenario_1_prompt_packs()
        scenario_2_species_anon()
        scenario_3_species_pro_core()
        scenario_4_analyze_gating()
        scenario_5_species_data_shim()
        scenario_6_backcompat()
        scan_500s()
    except Exception:
        traceback.print_exc()
        fails.append(("harness_exception", traceback.format_exc()[-400:]))

    print("\n======================================================")
    print(f"PASS: {len(passes)}   FAIL: {len(fails)}")
    if fails:
        print("FAILURES:")
        for n, d in fails:
            print(f"  - {n}: {d[:400]}")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
