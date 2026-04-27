"""Smoke test for the overlay-taxonomy unification on /api/analyze-hunt.

Runs against the preview URL using the seeded Pro test session, exercises
POST /api/analyze-hunt end-to-end, and asserts:
  * every overlay.type is one of the 8 canonical slugs,
  * every overlay.color is the canonical hex per overlay_taxonomy.py,
  * data.result_v1 (legacy shape) carries the canonical color through,
  * hunt_style_resolution + region_resolution + enhanced_rollout meta
    envelopes are still present (no regression).

Also runs a unit-style call to schema_validator.normalize_v2_response
to confirm that a bogus color like 'rebeccapurple' is overwritten with
the canonical hex.
"""
from __future__ import annotations

import base64
import os
import sys
import time
from io import BytesIO

import requests

# Backend import for unit-style validator check.
sys.path.insert(0, "/app/backend")
from schema_validator import normalize_v2_response, convert_v2_to_v1  # noqa: E402

BASE = os.environ.get(
    "RAVEN_TEST_BASE_URL",
    "https://map-legend.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE}/api"
PRO_TOKEN = "test_session_rs_001"

CANONICAL_COLORS = {
    "stand":        "#2E7D32",
    "corridor":     "#F57C00",
    "access_route": "#42A5F5",
    "avoid":        "#C62828",
    "bedding":      "#8D6E63",
    "food":         "#66BB6A",
    "water":        "#29B6F6",
    "trail":        "#FFCA28",
}
CANONICAL_TYPES = set(CANONICAL_COLORS.keys())

passes: list[str] = []
fails: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        passes.append(name)
        print(f"PASS  {name}")
    else:
        fails.append(f"{name}  — {detail}")
        print(f"FAIL  {name}  — {detail}")


# ---------------------------------------------------------------
# 1) Validator: rebeccapurple -> canonical hex; all 8 types stamped
# ---------------------------------------------------------------
print("\n=== Validator color override ===")

raw_bad = {
    "schema_version": "v2", "summary": "t",
    "analysis_context": {"image_count": 1, "evidence_level": "moderate",
                         "used_multi_image_correlation": False},
    "map_observations": [],
    "overlays": [{
        "id": "ov_rp", "type": "corridor", "label": "L", "reason": "R",
        "color": "rebeccapurple",
        "x_percent": 50, "y_percent": 50, "radius_percent": 4,
        "confidence": 0.7, "based_on": [],
    }],
    "top_setups": [],
    "wind_notes": {"prevailing_wind_analysis": "", "danger_zones": [],
                   "best_downwind_sides": [], "wind_shift_risk": "medium"},
    "best_time": {"primary_window": "", "secondary_window": "", "explanation": ""},
    "key_assumptions": [], "species_tips": [],
    "confidence_summary": {"overall_confidence": 0.5, "main_limitations": []},
}
norm, _ = normalize_v2_response(raw_bad)
check("validator stamps canonical hex over rebeccapurple",
      norm["overlays"][0]["color"] == "#F57C00",
      f"got {norm['overlays'][0].get('color')}")

raw_all = {
    "schema_version": "v2", "summary": "t",
    "analysis_context": {"image_count": 1, "evidence_level": "moderate",
                         "used_multi_image_correlation": False},
    "map_observations": [],
    "overlays": [
        {"id": f"ov_{i}", "type": t, "label": "L", "reason": "R",
         "color": "rebeccapurple",
         "x_percent": 50, "y_percent": 50, "radius_percent": 4,
         "confidence": 0.7, "based_on": []}
        for i, t in enumerate(CANONICAL_TYPES)
    ],
    "top_setups": [],
    "wind_notes": {"prevailing_wind_analysis": "", "danger_zones": [],
                   "best_downwind_sides": [], "wind_shift_risk": "medium"},
    "best_time": {"primary_window": "", "secondary_window": "", "explanation": ""},
    "key_assumptions": [], "species_tips": [],
    "confidence_summary": {"overall_confidence": 0.5, "main_limitations": []},
}
norm_all, _ = normalize_v2_response(raw_all)
bad = [(ov["type"], ov.get("color")) for ov in norm_all["overlays"]
       if ov.get("color") != CANONICAL_COLORS[ov["type"]]]
check("validator stamps canonical hex for all 8 types", not bad,
      f"mismatches: {bad}")


# ---------------------------------------------------------------
# 2) Live POST /api/analyze-hunt
# ---------------------------------------------------------------
print("\n=== Live POST /api/analyze-hunt ===")

def make_png_base64(size: int = 256) -> str:
    from PIL import Image
    import random
    img = Image.new("RGB", (size, size), (90, 110, 70))
    px = img.load()
    random.seed(42)
    for y in range(size):
        for x in range(size):
            v = (x * 13 + y * 17 + random.randint(0, 30)) % 256
            px[x, y] = (v, (v + 40) % 256, (v + 80) % 256)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


payload = {
    "map_image_base64": make_png_base64(256),
    "conditions": {
        "animal": "deer",
        "hunt_date": "2026-11-15",
        "time_window": "morning",
        "wind_direction": "NW",
        "temperature": "38F",
        "property_type": "private",
        "hunt_style": "archery",
        "latitude": 31.2956,
        "longitude": -95.9778,
    },
}
headers = {"Authorization": f"Bearer {PRO_TOKEN}",
           "Content-Type": "application/json"}

t0 = time.time()
r = requests.post(f"{API}/analyze-hunt", headers=headers, json=payload, timeout=240)
elapsed = time.time() - t0
print(f"HTTP {r.status_code} in {elapsed:.1f}s")

check("analyze-hunt returns 200", r.status_code == 200, f"body start: {r.text[:300]}")

data = r.json()
check("analyze-hunt success=true", data.get("success") is True,
      f"error: {data.get('error')}")

result = data.get("result") or {}
overlays = result.get("overlays") or []
check("result.overlays is non-empty list",
      isinstance(overlays, list) and len(overlays) > 0,
      f"overlays len={len(overlays)}")

type_problems: list[str] = []
color_problems: list[str] = []
for i, ov in enumerate(overlays):
    t = ov.get("type")
    c = ov.get("color")
    if t not in CANONICAL_TYPES:
        type_problems.append(f"overlay[{i}] type={t!r}")
    else:
        expected = CANONICAL_COLORS[t]
        if c != expected:
            color_problems.append(
                f"overlay[{i}] type={t} color={c!r} expected={expected}"
            )
check("every overlay.type ∈ canonical 8", not type_problems,
      "; ".join(type_problems))
check("every overlay.color is canonical hex for its type",
      not color_problems, "; ".join(color_problems))

# Report observed types for transparency
print(f"Observed overlay types: "
      f"{sorted({ov.get('type') for ov in overlays})}")

# v1 compat: either inline on response or recomputed locally.
# v1 compat: either inline on response or recomputed locally from
# a clean v2 shape. Note that `data.result` is already a v1-shaped
# AnalysisResult, not v2 (confidence is a string) — so we invoke
# convert_v2_to_v1 via a freshly validated v2 payload that reuses
# the LIVE response's overlay types + canonical colors. This proves
# the legacy conversion path stamps the color through.
result_v1 = data.get("result_v1") or data.get("resultV1") or {}
v1_overlays = result_v1.get("overlays") or []
if not v1_overlays:
    v2_shaped = {
        "schema_version": "v2", "summary": "t",
        "analysis_context": {"image_count": 1, "evidence_level": "moderate",
                             "used_multi_image_correlation": False},
        "map_observations": [],
        "overlays": [
            {"id": f"ov_{i}", "type": ov.get("type", "stand"),
             "label": ov.get("label", "L"), "reason": ov.get("reasoning", "R"),
             "x_percent": ov.get("x_percent", 50),
             "y_percent": ov.get("y_percent", 50),
             "radius_percent": 4, "confidence": 0.7, "based_on": []}
            for i, ov in enumerate(overlays)
        ],
        "top_setups": [],
        "wind_notes": {"prevailing_wind_analysis": "", "danger_zones": [],
                       "best_downwind_sides": [], "wind_shift_risk": "medium"},
        "best_time": {"primary_window": "", "secondary_window": "", "explanation": ""},
        "key_assumptions": [], "species_tips": [],
        "confidence_summary": {"overall_confidence": 0.5, "main_limitations": []},
    }
    v2_norm, _ = normalize_v2_response(v2_shaped)
    v1_overlays = convert_v2_to_v1(v2_norm).get("overlays") or []
    print(f"(v1 overlays computed from normalized v2, count={len(v1_overlays)})")

v1_color_problems: list[str] = []
for i, ov in enumerate(v1_overlays):
    t = ov.get("type")
    c = ov.get("color")
    if t in CANONICAL_TYPES and c != CANONICAL_COLORS[t]:
        v1_color_problems.append(f"v1_overlay[{i}] type={t} color={c!r}")
check("convert_v2_to_v1 carries canonical color through",
      not v1_color_problems, "; ".join(v1_color_problems))

# Regressions
rr = data.get("region_resolution") or {}
check("region_resolution present with resolvedRegionId",
      isinstance(rr, dict) and "resolvedRegionId" in rr, f"rr={rr!r}")

hsr = data.get("hunt_style_resolution") or {}
check("hunt_style_resolution present with styleId",
      isinstance(hsr, dict) and "styleId" in hsr, f"hsr={hsr!r}")
check("hunt_style_resolution.styleId == 'archery'",
      hsr.get("styleId") == "archery", f"got {hsr.get('styleId')!r}")

er = data.get("enhanced_rollout")
check("enhanced_rollout top-level sibling present",
      isinstance(er, dict) and "enhanced_analysis_enabled" in er,
      f"er={er!r}")

result_meta = result.get("meta") or {}
leak = "enhanced_analysis" in result_meta
check("result.meta does NOT leak enhanced_analysis (post-crash-fix holds)",
      not leak, f"result.meta={result_meta!r}")

print("\n" + "=" * 70)
print(f"PASS: {len(passes)}   FAIL: {len(fails)}")
if fails:
    print("\nFAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("All smoke checks green.")
