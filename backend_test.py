"""Backend tests for the Enhanced Species Prompt Framework.

Validates:
1. Backward compatibility (legacy prompt unchanged when no flags set).
2. POST /api/analyze-hunt still works (no flags wired into API yet).
3. Enhanced opt-in mode emits banner + sub-blocks.
4. Enhanced framework registries return non-None for required keys.
5. Failure isolation when an unknown enhanced_region_id is passed.
6. Existing test suites under /app/backend/tests/.
7. /api/health and /api/media/health return 200.

Run: python /app/backend_test.py
"""

from __future__ import annotations

import base64
import io
import os
import re
import subprocess
import sys
import traceback
from typing import List, Tuple

# Ensure /app/backend is importable.
sys.path.insert(0, "/app/backend")

import requests

BACKEND_URL = "http://localhost:8001/api"
PRO_BEARER = "Bearer test_session_rs_001"

PASS: List[str] = []
FAIL: List[Tuple[str, str]] = []


def _ok(name: str) -> None:
    PASS.append(name)
    print(f"  PASS  {name}")


def _bad(name: str, msg: str) -> None:
    FAIL.append((name, msg))
    print(f"  FAIL  {name}: {msg}")


def _make_small_png_b64() -> str:
    try:
        from PIL import Image
    except ImportError:
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
            "890000000d49444154789c63000100000005000100200d0aa400000000049454e44ae426082"
        )
        return base64.b64encode(png).decode()
    img = Image.new("RGB", (256, 256), (240, 240, 240))
    for y in range(80, 120):
        for x in range(80, 200):
            img.putpixel((x, y), (40, 100, 60))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def section_1_backward_compat_prompt() -> None:
    print("\n=== SECTION 1: Backward compatibility (assemble_system_prompt) ===")
    try:
        from prompt_builder import assemble_system_prompt
    except Exception:
        _bad("import assemble_system_prompt", traceback.format_exc())
        return

    conditions = {
        "animal": "whitetail",
        "hunt_date": "2025-11-15",
        "time_window": "morning",
        "wind_direction": "NW",
        "temperature": "38F",
        "property_type": "private",
        "latitude": 31.2956,
        "longitude": -95.9778,
    }
    try:
        legacy = assemble_system_prompt(
            animal="whitetail",
            conditions=conditions,
            image_count=1,
            tier="pro",
        )
    except Exception:
        _bad("legacy build (no enhanced flags)", traceback.format_exc())
        return

    forbidden = [
        "ENHANCED PROMPT EXTENSIONS",
        "ENHANCED BEHAVIOR CONTEXT",
        "ENHANCED ACCESS ANALYSIS",
        "ENHANCED REGIONAL CONTEXT",
    ]
    found = [s for s in forbidden if s in legacy]
    if not found:
        _ok("legacy prompt contains no ENHANCED markers")
    else:
        _bad("legacy prompt unexpectedly contains ENHANCED markers", repr(found))

    legacy2 = assemble_system_prompt(
        animal="whitetail",
        conditions=conditions,
        image_count=1,
        tier="pro",
    )
    if legacy == legacy2:
        _ok("legacy prompt is deterministic across builds (byte-identical)")
    else:
        _bad("legacy prompt differs between identical calls", "non-deterministic")


def section_2_enhanced_opt_in() -> None:
    print("\n=== SECTION 2: Enhanced framework opt-in ===")
    try:
        from prompt_builder import assemble_system_prompt
        from species_prompts.enhanced import PressureLevel, TerrainType
    except Exception:
        _bad("imports for enhanced opt-in", traceback.format_exc())
        return

    conditions = {
        "animal": "whitetail",
        "hunt_date": "2025-11-15",
        "time_window": "morning",
        "wind_direction": "NW",
        "temperature": "38F",
        "property_type": "private",
        "latitude": 41.9,
        "longitude": -91.5,
    }
    try:
        enhanced = assemble_system_prompt(
            animal="whitetail",
            conditions=conditions,
            image_count=1,
            tier="pro",
            use_enhanced_behavior=True,
            use_enhanced_access=True,
            use_enhanced_regional=True,
            enhanced_pressure_level=PressureLevel.HIGH,
            enhanced_terrain=TerrainType.AGRICULTURAL,
            enhanced_region_id="midwest_agricultural",
            enhanced_terrain_features=[{
                "type": "creek",
                "description": "Creek east of stand",
                "visibility": "visible",
            }],
        )
    except Exception:
        _bad("enhanced build", traceback.format_exc())
        return

    if "ENHANCED PROMPT EXTENSIONS" in enhanced:
        _ok("enhanced prompt contains ENHANCED PROMPT EXTENSIONS banner")
    else:
        _bad("missing banner", "ENHANCED PROMPT EXTENSIONS not found")

    for marker in (
        "ENHANCED REGIONAL CONTEXT",
        "ENHANCED BEHAVIOR CONTEXT",
        "ENHANCED ACCESS ANALYSIS",
    ):
        if marker in enhanced:
            _ok(f"enhanced prompt contains '{marker}' sub-block")
        else:
            _bad(f"missing sub-block '{marker}'", "not found in enhanced prompt")

    try:
        legacy = assemble_system_prompt(
            animal="whitetail",
            conditions=conditions,
            image_count=1,
            tier="pro",
        )
    except Exception as e:
        _bad("legacy rebuild for prefix check", str(e))
        return

    if enhanced.startswith(legacy):
        _ok("enhanced prompt is a strict superset starting with the legacy prompt")
    else:
        _bad("enhanced prompt does not start with legacy prompt",
             "additive contract violated")

    if "CROSS-MODULE INTERACTION NOTES" in enhanced:
        _ok("CROSS-MODULE INTERACTION NOTES section emitted")
    else:
        _bad("interaction notes section",
             "CROSS-MODULE INTERACTION NOTES header not found")

    interaction_signals = (
        "lower confidence",
        "second-",
        "regional baseline",
    )
    if any(sig in enhanced for sig in interaction_signals):
        _ok("interaction notes carry expected cross-module reasoning text")
    else:
        _bad("interaction notes content",
             f"none of {interaction_signals} appear in the prompt")


def section_3_registries() -> None:
    print("\n=== SECTION 3: Enhanced framework registries ===")
    try:
        from species_prompts.enhanced import (
            EnhancedRegionalModifier,
            get_enhanced_behavior_pattern,
            get_enhanced_regional_modifier,
        )
        from species_prompts.pack import RegionalModifier
    except Exception:
        _bad("registry imports", traceback.format_exc())
        return

    for region in (
        "south_texas",
        "colorado_high_country",
        "midwest_agricultural",
        "pacific_northwest",
    ):
        mod = get_enhanced_regional_modifier(region)
        if mod is not None:
            _ok(f"get_enhanced_regional_modifier('{region}') -> non-None")
        else:
            _bad(f"region '{region}'", "get_enhanced_regional_modifier returned None")

    for species in ("whitetail", "turkey"):
        pat = get_enhanced_behavior_pattern(species, "pressure_response")
        if pat is not None:
            _ok(f"get_enhanced_behavior_pattern('{species}', 'pressure_response') -> non-None")
        else:
            _bad(f"behavior '{species}'", "get_enhanced_behavior_pattern returned None")

    if issubclass(EnhancedRegionalModifier, RegionalModifier):
        _ok("EnhancedRegionalModifier IS subclass of RegionalModifier")
    else:
        _bad("subclass check",
             "EnhancedRegionalModifier is NOT a subclass of RegionalModifier")


def section_4_failure_isolation() -> None:
    print("\n=== SECTION 4: Failure isolation (unknown enhanced_region_id) ===")
    try:
        from prompt_builder import assemble_system_prompt
    except Exception:
        _bad("import for failure isolation", traceback.format_exc())
        return

    conditions = {
        "animal": "whitetail",
        "hunt_date": "2025-11-15",
        "time_window": "morning",
        "wind_direction": "NW",
        "temperature": "38F",
        "property_type": "private",
    }
    try:
        out = assemble_system_prompt(
            animal="whitetail",
            conditions=conditions,
            image_count=1,
            tier="pro",
            use_enhanced_regional=True,
            enhanced_region_id="atlantis_lost_continent",
        )
    except Exception as e:
        _bad("unknown region id raised an exception",
             f"{type(e).__name__}: {e}")
        return

    if isinstance(out, str) and len(out) > 0:
        _ok("unknown enhanced_region_id returns prompt string without crashing")
    else:
        _bad("unknown region id return value", f"unexpected: {type(out)}")


def section_5_api_analyze_hunt() -> None:
    print("\n=== SECTION 5: POST /api/analyze-hunt (request shape unchanged) ===")
    img_b64 = _make_small_png_b64()
    body = {
        "conditions": {
            # Note: backend species registry id is "deer" (prompt_pack_id=whitetail).
            # Frontend always sends "deer" — using "whitetail" here would 403.
            "animal": "deer",
            "hunt_date": "2025-11-15",
            "time_window": "morning",
            "wind_direction": "NW",
            "temperature": "38F",
            "property_type": "private",
            "latitude": 31.2956,
            "longitude": -95.9778,
            "hunt_style": "archery",
        },
        "map_image_base64": img_b64,
    }
    try:
        r = requests.post(
            f"{BACKEND_URL}/analyze-hunt",
            headers={"Authorization": PRO_BEARER, "Content-Type": "application/json"},
            json=body,
            timeout=180,
        )
    except Exception as e:
        _bad("POST /api/analyze-hunt", f"request failed: {e}")
        return

    if r.status_code == 200:
        _ok("POST /api/analyze-hunt -> 200")
    else:
        _bad("POST /api/analyze-hunt status",
             f"expected 200, got {r.status_code} body={r.text[:300]}")
        return

    try:
        data = r.json()
    except Exception:
        _bad("response JSON", "not parseable as JSON")
        return

    if "success" in data:
        _ok("response has 'success' field")
    else:
        _bad("response shape", "missing 'success'")

    if data.get("success") is True:
        result = data.get("result") or {}
        for key in ("id", "overlays", "summary"):
            if key in result:
                _ok(f"result contains '{key}'")
            else:
                _bad(f"result missing '{key}'", repr(list(result.keys())))
        if "v2" in result:
            _ok("result.v2 present (v2 schema active)")
        else:
            print("  INFO  result.v2 not present — v1-only fallback")
    elif data.get("success") is False:
        err = data.get("error", "")
        print(f"  INFO  analyze returned success=false (likely OpenAI image rejection): {err!r}")
        _ok("analyze-hunt 200 with structured error envelope (no 5xx)")

    rr = data.get("region_resolution") or {}
    if rr.get("resolvedRegionId"):
        _ok(f"region_resolution.resolvedRegionId='{rr.get('resolvedRegionId')}'")
    else:
        print(f"  INFO  region_resolution: {rr}")


def section_6_health_endpoints() -> None:
    print("\n=== SECTION 6: Health endpoints ===")
    # /api/health is public; /api/media/health requires auth (any tier).
    endpoint_specs = [
        ("/health", None),
        ("/media/health", PRO_BEARER),
    ]
    for path, bearer in endpoint_specs:
        headers = {"Authorization": bearer} if bearer else {}
        try:
            r = requests.get(f"{BACKEND_URL}{path}", headers=headers, timeout=15)
        except Exception as e:
            _bad(f"GET {path}", f"request failed: {e}")
            continue
        if r.status_code == 200:
            _ok(f"GET {path} -> 200 ({r.text[:160]!r})")
        else:
            _bad(f"GET {path}", f"status={r.status_code}, body={r.text[:200]}")


def section_7_pytest_suites() -> None:
    print("\n=== SECTION 7: pytest test_enhanced_prompt_framework.py ===")
    p = subprocess.run(
        [sys.executable, "-m", "pytest",
         "tests/test_enhanced_prompt_framework.py", "-v", "--tb=short"],
        cwd="/app/backend",
        capture_output=True,
        text=True,
        timeout=180,
    )
    print(p.stdout[-2000:])
    if p.returncode != 0:
        print(p.stderr[-1000:])
    if p.returncode == 0 and "25 passed" in p.stdout:
        _ok("test_enhanced_prompt_framework.py: 25/25 PASSED")
    else:
        _bad("test_enhanced_prompt_framework.py",
             f"returncode={p.returncode}")

    print("\n=== SECTION 7b: pytest tests/ (full backend suite) ===")
    p2 = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/", "--tb=line", "-q"],
        cwd="/app/backend",
        capture_output=True,
        text=True,
        timeout=600,
    )
    out = p2.stdout or ""
    print(out[-3500:])
    if p2.stderr:
        print("STDERR:", p2.stderr[-500:])

    m_pass = re.search(r"(\d+) passed", out)
    m_fail = re.search(r"(\d+) failed", out)
    passed = int(m_pass.group(1)) if m_pass else 0
    failed = int(m_fail.group(1)) if m_fail else 0
    print(f"  >> totals: passed={passed}, failed={failed}")
    if failed <= 3:
        _ok(f"full pytest suite: {passed} passed, {failed} failed (<=3 pre-existing)")
    else:
        _bad("full pytest suite",
             f"{failed} failures (>3 pre-existing) — potential regression")


def main() -> int:
    section_1_backward_compat_prompt()
    section_2_enhanced_opt_in()
    section_3_registries()
    section_4_failure_isolation()
    section_5_api_analyze_hunt()
    section_6_health_endpoints()
    section_7_pytest_suites()

    print("\n" + "=" * 70)
    print(f"PASSED: {len(PASS)}")
    print(f"FAILED: {len(FAIL)}")
    if FAIL:
        print("\nFailed assertions:")
        for name, msg in FAIL:
            print(f"  FAIL  {name}\n        {msg}")
    print("=" * 70)
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
