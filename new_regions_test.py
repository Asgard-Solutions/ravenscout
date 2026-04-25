"""Test harness for new canonical regions (pacific_northwest + northeast)
+ new modifier blocks (regional + hunt-style) on top of species expansion.

Run from /app:
    python new_regions_test.py
"""
from __future__ import annotations

import base64
import io
import os
import sys
import time
from pathlib import Path

# Ensure backend imports resolve.
ROOT = Path("/app")
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

# Read backend URL.
import re
ENV_FE = (ROOT / "frontend/.env").read_text()
m = re.search(r"^EXPO_PUBLIC_BACKEND_URL=(.+)$", ENV_FE, re.M)
BASE = (m.group(1).strip() if m else "").rstrip("/")
API = f"{BASE}/api"
print(f"BASE = {BASE!r}")
print(f"API  = {API!r}")

import requests

PASS, FAIL = [], []

def ok(label, cond, extra=""):
    if cond:
        PASS.append(label)
        print(f"  ✅ {label}" + (f"  ({extra})" if extra else ""))
    else:
        FAIL.append((label, extra))
        print(f"  ❌ {label}" + (f"  ({extra})" if extra else ""))


# --------------------------------------------------------------------- #
# Scenario 1: GPS resolution
# --------------------------------------------------------------------- #
print("\n=== SCENARIO 1: GPS RESOLUTION ===")
from species_prompts.regions import resolve_region_from_coordinates, normalize_region_override

new_cases = [
    ("Olympic Peninsula WA", 47.5, -123.0, "pacific_northwest"),
    ("Portland OR",          45.5, -122.7, "pacific_northwest"),
    ("Eugene OR",            44.0, -123.1, "pacific_northwest"),
    ("Bangor ME",            44.8,  -68.8, "northeast"),
    ("Adirondacks NY",       43.9,  -74.2, "northeast"),
    ("Burlington VT",        44.5,  -73.2, "northeast"),
]
for name, lat, lon, expected in new_cases:
    actual = resolve_region_from_coordinates(lat, lon)
    ok(f"GPS: {name} -> {expected}", actual == expected, f"actual={actual}")

control_cases = [
    ("Bozeman MT",   45.7, -111.0, "mountain_west"),
    ("Cleveland OH", 41.5,  -81.7, "midwest"),
    ("Atlanta GA",   33.7,  -84.4, "southeast_us"),
    ("Cheyenne WY",  41.1, -104.8, "plains"),
]
for name, lat, lon, expected in control_cases:
    actual = resolve_region_from_coordinates(lat, lon)
    ok(f"GPS regression: {name} -> {expected}", actual == expected, f"actual={actual}")


# --------------------------------------------------------------------- #
# Scenario 2: Alias normalization
# --------------------------------------------------------------------- #
print("\n=== SCENARIO 2: ALIAS NORMALIZATION ===")
alias_cases = [
    ("Pacific Northwest", "pacific_northwest"),
    ("PNW",               "pacific_northwest"),
    ("Olympic Peninsula", "pacific_northwest"),
    ("New England",       "northeast"),
    ("Maine",             "northeast"),
    ("Adirondacks",       "northeast"),
    ("northeast",         "northeast"),
    ("north east",        "northeast"),
]
for inp, expected in alias_cases:
    actual = normalize_region_override(inp)
    ok(f"alias {inp!r} -> {expected}", actual == expected, f"actual={actual}")


# --------------------------------------------------------------------- #
# Scenario 3: Prompt rendering — new regional modifiers
# --------------------------------------------------------------------- #
print("\n=== SCENARIO 3: REGIONAL MODIFIER RENDERING ===")
from prompt_builder import assemble_system_prompt

CONDITIONS = {"hunt_date": "2026-09-15"}

# elk + (47.5, -123.0)
prompt = assemble_system_prompt("elk", CONDITIONS, image_count=1, tier="pro", gps_coords=(47.5, -123.0))
ok("elk PNW prompt contains 'Pacific Northwest'", "Pacific Northwest" in prompt)
ok("elk PNW prompt contains 'Roosevelt'",        "Roosevelt" in prompt)

# bear + (47.5, -123.0)
prompt = assemble_system_prompt("bear", CONDITIONS, image_count=1, tier="pro", gps_coords=(47.5, -123.0))
ok("bear PNW prompt contains 'Pacific Northwest'", "Pacific Northwest" in prompt)
ok("bear PNW prompt contains 'salmon' or 'clearcut'", ("salmon" in prompt) or ("clearcut" in prompt))

# moose + (44.8, -68.8) — Bangor ME
prompt = assemble_system_prompt("moose", CONDITIONS, image_count=1, tier="pro", gps_coords=(44.8, -68.8))
ok("moose Northeast prompt contains 'Northeast'", "Northeast" in prompt)
ok(
    "moose Northeast prompt contains 'Maine' OR 'beaver flowage' OR 'logging-road'",
    any(s in prompt for s in ("Maine", "beaver flowage", "logging-road")),
)

# coyote + (43.9, -74.2) — Adirondacks NY
prompt = assemble_system_prompt("coyote", CONDITIONS, image_count=1, tier="pro", gps_coords=(43.9, -74.2))
ok(
    "coyote Northeast prompt contains 'Eastern' or 'Northeast'",
    ("Eastern" in prompt) or ("Northeast" in prompt),
)
ok(
    "coyote Northeast prompt contains 'wolf admixture' OR 'deer-yard'",
    ("wolf admixture" in prompt) or ("deer-yard" in prompt),
)


# --------------------------------------------------------------------- #
# Scenario 4: Prompt rendering — new hunt-style modifiers
# --------------------------------------------------------------------- #
print("\n=== SCENARIO 4: HUNT-STYLE MODIFIER RENDERING ===")

# bear + hunt_style="blind"
prompt = assemble_system_prompt("bear", CONDITIONS, image_count=1, tier="pro", hunt_style="blind")
ok(
    "bear blind: contains 'Bait Blind' or 'Ground Blind / Bait Blind'",
    ("Bait Blind" in prompt) or ("Ground Blind / Bait Blind" in prompt),
)
ok(
    "bear blind: contains 'trail-cam' or 'bait acclimation'",
    ("trail-cam" in prompt) or ("bait acclimation" in prompt),
)

# moose + hunt_style="blind"
prompt = assemble_system_prompt("moose", CONDITIONS, image_count=1, tier="pro", hunt_style="blind")
ok(
    "moose blind: contains 'Canoe' or 'Ground / Canoe Blind'",
    ("Canoe" in prompt) or ("Ground / Canoe Blind" in prompt),
)
ok(
    "moose blind: contains 'water-edge' or 'shore'",
    ("water-edge" in prompt) or ("shore" in prompt),
)

# moose + hunt_style="public_land"
prompt = assemble_system_prompt("moose", CONDITIONS, image_count=1, tier="pro", hunt_style="public_land")
ok("moose public_land: contains 'Public Land'", "Public Land" in prompt)
ok(
    "moose public_land: contains 'pack-out' or 'boat ramps'",
    ("pack-out" in prompt) or ("boat ramps" in prompt),
)

# antelope + hunt_style="public_land"
prompt = assemble_system_prompt("antelope", CONDITIONS, image_count=1, tier="pro", hunt_style="public_land")
ok("antelope public_land: contains 'Public Land'", "Public Land" in prompt)
ok(
    "antelope public_land: 'BLM' or 'checkerboard' or 'section line'",
    ("BLM" in prompt) or ("checkerboard" in prompt) or ("section line" in prompt) or ("section-line" in prompt),
)


# --------------------------------------------------------------------- #
# Scenario 5: Combined region + style
# --------------------------------------------------------------------- #
print("\n=== SCENARIO 5: COMBINED region + style ===")

# elk + rifle + PNW
prompt = assemble_system_prompt(
    "elk", CONDITIONS, image_count=1, tier="pro",
    hunt_style="rifle", gps_coords=(47.5, -123.0),
)
ok("elk+rifle+PNW: contains 'Pacific Northwest' or 'Roosevelt'",
   ("Pacific Northwest" in prompt) or ("Roosevelt" in prompt))
ok("elk+rifle+PNW: contains 'Rifle (Elk)'", "Rifle (Elk)" in prompt)

# moose + public_land + Bangor
prompt = assemble_system_prompt(
    "moose", CONDITIONS, image_count=1, tier="pro",
    hunt_style="public_land", gps_coords=(44.8, -68.8),
)
ok("moose+public_land+NE: contains 'Northeast' or 'Maine'",
   ("Northeast" in prompt) or ("Maine" in prompt))
ok("moose+public_land+NE: contains 'Public Land (Moose)'",
   "Public Land (Moose)" in prompt)

# bear + blind + Olympic
prompt = assemble_system_prompt(
    "bear", CONDITIONS, image_count=1, tier="pro",
    hunt_style="blind", gps_coords=(47.5, -123.0),
)
ok("bear+blind+PNW: contains 'Pacific Northwest' or 'salmon'",
   ("Pacific Northwest" in prompt) or ("salmon" in prompt))
ok("bear+blind+PNW: contains 'Bait Blind'",
   "Bait Blind" in prompt)


# --------------------------------------------------------------------- #
# Scenario 6: Pytest no-regressions
# --------------------------------------------------------------------- #
print("\n=== SCENARIO 6: PYTEST FULL SUITE (specified files) ===")
import subprocess
PYTEST_TARGETS = [
    "tests/test_species_prompt_packs.py",
    "tests/test_species_expansion_modifiers.py",
    "tests/test_seasonal_modifiers.py",
    "tests/test_regional_modifiers.py",
    "tests/test_hunt_style_modifiers.py",
]
result = subprocess.run(
    ["python", "-m", "pytest", *PYTEST_TARGETS, "-q"],
    cwd=str(BACKEND),
    capture_output=True, text=True, timeout=180,
)
print("--- pytest stdout (tail) ---")
tail = result.stdout.splitlines()[-25:]
print("\n".join(tail))
if result.stderr.strip():
    print("--- pytest stderr (tail) ---")
    print("\n".join(result.stderr.splitlines()[-15:]))
ok("pytest target suites: exit code 0",
   result.returncode == 0,
   f"rc={result.returncode}")


# --------------------------------------------------------------------- #
# Scenario 7: Live /api/analyze-hunt smoke
# --------------------------------------------------------------------- #
print("\n=== SCENARIO 7: LIVE /api/analyze-hunt SMOKE ===")

# Tiny-but-valid 256x256 PNG to satisfy OpenAI's image input.
def make_png(w=256, h=256):
    try:
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (w, h), (90, 130, 80)).save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        # Fallback to a minimal 1x1 PNG (may be rejected, but we still
        # exercise pre-LLM paths).
        return (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDw"
            "ADhgGAWjR9awAAAABJRU5ErkJggg=="
        )

img_b64 = make_png()

headers = {
    "Authorization": "Bearer test_session_rs_001",
    "Content-Type": "application/json",
    "User-Agent": "RavenScoutTest/new-regions",
}

# Snapshot backend.out.log offset to scrape AFTER request.
LOG_PATH = "/var/log/supervisor/backend.out.log"
log_offset_before = 0
try:
    log_offset_before = os.path.getsize(LOG_PATH)
except OSError:
    pass

body = {
    "conditions": {
        "animal": "bear",
        "hunt_date": "2026-09-20",
        "time_window": "morning",
        "wind_direction": "NW",
        "temperature": "55F",
        "property_type": "public",
        "region": "Pacific Northwest",
        "hunt_style": "blind",
        "latitude": 47.5,
        "longitude": -123.0,
    },
    "map_image_base64": img_b64,
}

t0 = time.time()
resp = requests.post(f"{API}/analyze-hunt", json=body, headers=headers, timeout=120)
dt = time.time() - t0
print(f"  POST /api/analyze-hunt -> {resp.status_code}  ({dt:.1f}s)")
ok("/api/analyze-hunt: HTTP 200 (not 500)", resp.status_code == 200,
   f"status={resp.status_code} body={resp.text[:300]}")

if resp.status_code == 200:
    j = resp.json()
    rr = j.get("region_resolution") or {}
    hsr = j.get("hunt_style_resolution") or {}
    ok("region_resolution.resolvedRegionId == pacific_northwest",
       rr.get("resolvedRegionId") == "pacific_northwest",
       f"region_resolution={rr}")
    ok("region_resolution.regionResolutionSource == gps",
       rr.get("regionResolutionSource") == "gps",
       f"source={rr.get('regionResolutionSource')}")
    ok("hunt_style_resolution.styleId == blind",
       hsr.get("styleId") == "blind",
       f"hunt_style_resolution={hsr}")

# Scrape backend log for "Region resolved" + "Hunt style resolved" with
# the expected values, since the request just fired.
time.sleep(0.5)
try:
    with open(LOG_PATH, "r") as f:
        f.seek(log_offset_before)
        new_log = f.read()
except OSError:
    new_log = ""

ok("backend log shows 'Region resolved' with region_id=pacific_northwest",
   ("Region resolved" in new_log) and ("pacific_northwest" in new_log),
   f"log_excerpt_len={len(new_log)}")
ok("backend log shows 'Hunt style resolved' with style_id=blind",
   ("Hunt style resolved" in new_log) and ("style_id=blind" in new_log or "blind" in new_log),
   f"log_excerpt_len={len(new_log)}")


# --------------------------------------------------------------------- #
# Summary
# --------------------------------------------------------------------- #
print("\n" + "=" * 72)
print(f"PASSED: {len(PASS)}    FAILED: {len(FAIL)}")
if FAIL:
    print("\nFAILURES:")
    for label, extra in FAIL:
        print(f"  ❌ {label}    {extra}")
    sys.exit(1)
else:
    print("All assertions passed.")
    sys.exit(0)
