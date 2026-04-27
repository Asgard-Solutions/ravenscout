"""Backend tests for Enhanced Species Prompt rollout wiring on /api/analyze-hunt.

Targets the public preview URL via EXPO_PUBLIC_BACKEND_URL.
"""

import os
import io
import re
import base64
from pathlib import Path

import requests
from PIL import Image


def _resolve_backend_url() -> str:
    env_path = Path("/app/frontend/.env")
    text = env_path.read_text()
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("No backend URL found in /app/frontend/.env")


BASE_URL = _resolve_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

PRO_BEARER = "test_session_rs_001"
TRIAL_BEARER = "test_session_trial_001"


def _png_b64(width: int = 256, height: int = 256) -> str:
    img = Image.new("RGB", (width, height), color=(34, 110, 34))
    for x in range(0, width, 8):
        for y in range(0, height, 16):
            img.putpixel((x, y), ((x * 5) % 255, (y * 3) % 255, 90))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


PNG_BASE64 = _png_b64(256, 256)


def _post_analyze(*, bearer, animal, latitude, longitude, hunt_style="archery"):
    body = {
        "conditions": {
            "animal": animal,
            "hunt_date": "2025-11-15",
            "time_window": "morning",
            "wind_direction": "NW",
            "temperature": "38F",
            "property_type": "private",
            "hunt_style": hunt_style,
        },
        "map_image_base64": PNG_BASE64,
    }
    if latitude is not None:
        body["conditions"]["latitude"] = latitude
    if longitude is not None:
        body["conditions"]["longitude"] = longitude
    headers = {
        "Authorization": f"Bearer {bearer}",
        "Content-Type": "application/json",
    }
    return requests.post(f"{API}/analyze-hunt", headers=headers, json=body, timeout=180)


results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    flag = "PASS" if ok else "FAIL"
    print(f"  [{flag}] {name}" + (f" :: {detail}" if detail else ""))


def test_health_public():
    print("\n=== TEST: GET /api/health (public) ===")
    r = requests.get(f"{API}/health", timeout=15)
    record("health 200", r.status_code == 200, f"status={r.status_code}")
    record("health body has status=ok", r.json().get("status") == "ok", f"body={r.json()}")


def test_media_health_auth():
    print("\n=== TEST: GET /api/media/health (Pro auth) ===")
    r = requests.get(f"{API}/media/health", headers={"Authorization": f"Bearer {PRO_BEARER}"}, timeout=15)
    record("media/health 200", r.status_code == 200, f"status={r.status_code}")
    try:
        j = r.json()
        record("media/health.ok=true", j.get("ok") is True, f"body={j}")
    except Exception as e:
        record("media/health body json", False, str(e))


def test_trial_deer_legacy():
    print("\n=== TEST: Trial + animal=deer + East Texas → legacy ===")
    r = _post_analyze(bearer=TRIAL_BEARER, animal="deer", latitude=31.5, longitude=-94.5)
    print(f"  HTTP {r.status_code}")
    record("trial deer 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        record("trial body", False, f"body={r.text[:300]}")
        return
    j = r.json()
    record("trial success=True", j.get("success") is True, f"err={j.get('error')}")
    if not j.get("success"):
        return
    res = j["result"]
    record("trial result has id", bool(res.get("id")))
    record("trial result has overlays", isinstance(res.get("overlays"), list))
    record("trial result has summary", "summary" in res)
    record("trial result has v2", "v2" in res)
    meta = (res.get("meta") or {}).get("enhanced_analysis") or {}
    record("trial enhanced_analysis_enabled=False", meta.get("enhanced_analysis_enabled") is False,
           f"meta={meta}")
    record("trial reason in {tier_not_eligible, tier_has_no_modules}",
           meta.get("enhanced_rollout_reason") in ("tier_not_eligible", "tier_has_no_modules"),
           f"reason={meta.get('enhanced_rollout_reason')}")


def test_pro_elk_species_not_allowlisted():
    print("\n=== TEST: Pro + animal=elk → species_not_allowlisted ===")
    # Use Colorado coords (mountain_west). Region also won't be in allowlist
    # but species check fires first per evaluate_enhanced_rollout ordering.
    r = _post_analyze(bearer=PRO_BEARER, animal="elk", latitude=39.0, longitude=-106.5, hunt_style="rifle")
    print(f"  HTTP {r.status_code}")
    record("pro elk 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        record("pro elk body", False, f"body={r.text[:300]}")
        return
    j = r.json()
    if not j.get("success"):
        record("pro elk success", False, f"error={j.get('error')}")
        return
    res = j["result"]
    meta = (res.get("meta") or {}).get("enhanced_analysis") or {}
    record("pro elk enhanced_analysis_enabled=False", meta.get("enhanced_analysis_enabled") is False,
           f"meta={meta}")
    record("pro elk reason=species_not_allowlisted",
           meta.get("enhanced_rollout_reason") == "species_not_allowlisted",
           f"reason={meta.get('enhanced_rollout_reason')}")


def test_pro_deer_midwest_iowa():
    print("\n=== TEST: Pro + animal=deer + Iowa coords (41.5, -93.0) ===")
    r = _post_analyze(bearer=PRO_BEARER, animal="deer", latitude=41.5, longitude=-93.0)
    print(f"  HTTP {r.status_code}")
    record("pro deer iowa 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        record("pro deer body", False, f"body={r.text[:300]}")
        return
    j = r.json()
    if not j.get("success"):
        record("pro deer iowa success", False, f"error={j.get('error')}")
        return
    res = j["result"]
    region_resolution = j.get("region_resolution") or {}
    print(f"  region_resolution: {region_resolution}")
    meta = (res.get("meta") or {}).get("enhanced_analysis") or {}
    print(f"  enhanced_analysis meta: {meta}")
    # Per review request expectation:
    record("pro deer iowa enhanced_analysis_enabled=True",
           meta.get("enhanced_analysis_enabled") is True,
           f"meta={meta}, region={region_resolution.get('resolvedRegionId')}")
    record("pro deer iowa reason=ok",
           meta.get("enhanced_rollout_reason") == "ok",
           f"reason={meta.get('enhanced_rollout_reason')}")
    modules = meta.get("enhanced_modules_used") or []
    expected = {"behavior", "access", "regional"}
    record("pro deer iowa all 3 modules",
           expected.issubset(set(modules)),
           f"modules_used={modules}")


def test_pro_deer_east_texas_region_not_allowlisted():
    print("\n=== TEST: Pro + animal=deer + East Texas → region_not_allowlisted ===")
    r = _post_analyze(bearer=PRO_BEARER, animal="deer", latitude=31.5, longitude=-94.5)
    print(f"  HTTP {r.status_code}")
    record("pro deer ETX 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        return
    j = r.json()
    if not j.get("success"):
        record("pro deer ETX success", False, f"error={j.get('error')}")
        return
    res = j["result"]
    region_resolution = j.get("region_resolution") or {}
    meta = (res.get("meta") or {}).get("enhanced_analysis") or {}
    record("pro deer ETX enhanced_analysis_enabled=False",
           meta.get("enhanced_analysis_enabled") is False,
           f"meta={meta}, region={region_resolution.get('resolvedRegionId')}")
    record("pro deer ETX reason=region_not_allowlisted",
           meta.get("enhanced_rollout_reason") == "region_not_allowlisted",
           f"reason={meta.get('enhanced_rollout_reason')}")


def test_log_inspection_no_sensitive_data():
    print("\n=== TEST: backend log — enhanced_rollout decision lines free of sensitive data ===")
    log_paths = [
        "/var/log/supervisor/backend.err.log",
        "/var/log/supervisor/backend.out.log",
    ]
    sensitive_re = re.compile(
        r"(\blatitude\b|\blongitude\b|map_image_base64|bearer|session_token|api[_-]?key|"
        r"secret|data:image/|base64,)",
        re.IGNORECASE,
    )
    decision_lines = []
    sensitive_violations = []
    for path in log_paths:
        if not os.path.exists(path):
            continue
        try:
            with open(path) as f:
                content = f.read()[-300_000:]
        except Exception:
            continue
        for ln in content.splitlines():
            if "enhanced_rollout decision" in ln:
                decision_lines.append(ln)
                if sensitive_re.search(ln):
                    sensitive_violations.append(ln)
    record("backend log contains >=1 enhanced_rollout decision line",
           len(decision_lines) >= 1, f"count={len(decision_lines)}")
    if decision_lines:
        print(f"  Sample decision lines (last 3):")
        for ln in decision_lines[-3:]:
            print(f"    {ln[-200:]}")
    record("decision log lines free of sensitive data",
           len(sensitive_violations) == 0,
           f"violations={sensitive_violations[:3]}")


def main():
    print(f"Backend URL: {API}")
    test_health_public()
    test_media_health_auth()
    test_trial_deer_legacy()
    test_pro_elk_species_not_allowlisted()
    test_pro_deer_midwest_iowa()
    test_pro_deer_east_texas_region_not_allowlisted()
    test_log_inspection_no_sensitive_data()

    print("\n" + "=" * 72)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [(n, d) for n, ok, d in results if not ok]
    print(f"Total: {len(results)}, Passed: {passed}, Failed: {len(failed)}")
    if failed:
        print("\nFAILURES:")
        for n, d in failed:
            print(f"  - {n} :: {d}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
