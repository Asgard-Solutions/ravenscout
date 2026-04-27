"""Re-validation test for the two defensive fixes:

1. Backend: enhanced_rollout moved out of result.meta.enhanced_analysis
   into a top-level sibling field on /api/analyze-hunt response.
2. Confirm `data.result` is byte-identical to the legacy shape (no .meta).
3. Confirm usage counting safety — only ONE consume_one_analysis call
   in the analyze flow; no usage-incrementing in /api/media/presign-upload
   or /api/hunts POST.
"""
import os
import io
import json
import base64
import urllib.request
import urllib.error
import urllib.parse
import struct
import zlib
import sys
from typing import Any, Dict, Tuple

# Use the public preview URL per system prompt rules.
BASE_URL = os.environ.get(
    "BACKEND_URL",
    "https://tactical-gps-picker.preview.emergentagent.com",
).rstrip("/") + "/api"

PRO_BEARER = "test_session_rs_001"
TRIAL_BEARER = "test_session_trial_001"


def _make_png_256() -> str:
    """Create a 256x256 valid PNG (solid color) and return base64."""
    width, height = 256, 256
    raw = b""
    for y in range(height):
        raw += b"\x00"  # filter byte
        for x in range(width):
            raw += bytes([(x + y) % 256, (x * 2) % 256, (y * 2) % 256])
    def chunk(typ, data):
        crc = zlib.crc32(typ + data)
        return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", crc)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw, 6)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    return base64.b64encode(png).decode("ascii")


def http_request(method: str, path: str, *, body: Any = None, bearer: str = None,
                 timeout: int = 90) -> Tuple[int, Dict[str, str], Any]:
    url = BASE_URL + path
    data = None
    headers = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 "
                      "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, dict(resp.headers), json.loads(raw)
            except Exception:
                return resp.status, dict(resp.headers), raw.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            payload = json.loads(raw)
        except Exception:
            payload = raw.decode("utf-8", errors="replace")
        return e.code, dict(e.headers or {}), payload


PASS, FAIL = [], []


def assert_(cond: bool, label: str, detail: str = "") -> None:
    if cond:
        PASS.append(label)
        print(f"  PASS  {label}")
    else:
        FAIL.append(f"{label} :: {detail}")
        print(f"  FAIL  {label}  ::  {detail}")


# ---------------------------------------------------------------------
# Section A — Pro user, deer, Iowa GPS — enhanced_rollout enabled
# ---------------------------------------------------------------------
def test_iowa_pro_enhanced_enabled():
    print("\n=== A. Pro + deer + Iowa GPS (41.5, -93.0) ===")
    body = {
        "conditions": {
            "animal": "deer",
            "hunt_date": "2025-11-15",
            "time_window": "morning",
            "wind_direction": "NW",
            "temperature": "38F",
            "property_type": "private",
            "latitude": 41.5,
            "longitude": -93.0,
            "hunt_style": "archery",
        },
        "map_image_base64": _make_png_256(),
    }
    status, _, payload = http_request("POST", "/analyze-hunt", body=body, bearer=PRO_BEARER)
    print(f"  HTTP {status}")
    assert_(status == 200, "Iowa Pro analyze-hunt -> 200", f"got {status}: {str(payload)[:300]}")

    if not isinstance(payload, dict):
        FAIL.append("Iowa response is not JSON dict")
        return None

    assert_(payload.get("success") is True, "success == True", f"payload.success={payload.get('success')}")

    # Top-level enhanced_rollout must be present (sibling of result/usage/region_resolution/hunt_style_resolution)
    assert_("enhanced_rollout" in payload, "top-level 'enhanced_rollout' key present",
            f"keys={list(payload.keys())}")
    er = payload.get("enhanced_rollout")
    assert_(isinstance(er, dict), "enhanced_rollout is a dict", f"got {type(er).__name__}: {er}")
    if isinstance(er, dict):
        assert_(er.get("enhanced_analysis_enabled") is True,
                "enhanced_analysis_enabled == True",
                f"got {er.get('enhanced_analysis_enabled')}")
        modules = er.get("enhanced_modules_used") or []
        expected = {"behavior", "access", "regional"}
        assert_(set(modules) == expected,
                "enhanced_modules_used == ['behavior','access','regional']",
                f"got {modules}")
        assert_(er.get("enhanced_rollout_reason") == "ok",
                "enhanced_rollout_reason == 'ok'",
                f"got {er.get('enhanced_rollout_reason')}")

    # Result is the legacy shape — required keys; result.meta MUST be absent.
    result = payload.get("result")
    assert_(isinstance(result, dict), "result is a dict", f"got {type(result).__name__}")
    if isinstance(result, dict):
        for key in ("id", "overlays", "summary", "top_setups", "wind_notes",
                    "best_time", "key_assumptions", "species_tips",
                    "schema_version"):
            assert_(key in result, f"result.{key} present", f"keys={list(result.keys())}")
        assert_("v2" in result, "result.v2 present", f"keys={list(result.keys())}")
        assert_("meta" not in result,
                "result.meta is NOT present (legacy shape preserved)",
                f"result has 'meta' = {result.get('meta')!r}")

    # Top-level siblings present: usage, region_resolution, hunt_style_resolution
    for sibling in ("usage", "region_resolution", "hunt_style_resolution"):
        assert_(sibling in payload, f"top-level '{sibling}' present",
                f"keys={list(payload.keys())}")

    rr = payload.get("region_resolution") or {}
    assert_(rr.get("resolvedRegionId") == "midwest",
            "region_resolution.resolvedRegionId == 'midwest'",
            f"got {rr}")
    return payload


# ---------------------------------------------------------------------
# Section B — Pro user, deer, East Texas GPS — enhanced disabled
# ---------------------------------------------------------------------
def test_east_texas_pro_disabled():
    print("\n=== B. Pro + deer + East Texas GPS (31.5, -94.5) ===")
    body = {
        "conditions": {
            "animal": "deer",
            "hunt_date": "2025-11-15",
            "time_window": "morning",
            "wind_direction": "NW",
            "temperature": "38F",
            "property_type": "private",
            "latitude": 31.5,
            "longitude": -94.5,
            "hunt_style": "archery",
        },
        "map_image_base64": _make_png_256(),
    }
    status, _, payload = http_request("POST", "/analyze-hunt", body=body, bearer=PRO_BEARER)
    print(f"  HTTP {status}")
    assert_(status == 200, "East TX Pro analyze-hunt -> 200", f"got {status}: {str(payload)[:300]}")
    if not isinstance(payload, dict):
        return
    er = payload.get("enhanced_rollout") or {}
    assert_(er.get("enhanced_analysis_enabled") is False,
            "East TX enhanced_analysis_enabled == False",
            f"got {er}")
    assert_(er.get("enhanced_rollout_reason") == "region_not_allowlisted",
            "East TX reason == 'region_not_allowlisted'",
            f"got {er.get('enhanced_rollout_reason')}")
    # Result still legacy-shaped
    result = payload.get("result") or {}
    assert_("meta" not in result, "East TX result.meta absent",
            f"result has 'meta' key = {result.get('meta')!r}")


# ---------------------------------------------------------------------
# Section C — Trial fallback — schema regression check
# ---------------------------------------------------------------------
def test_trial_fallback_no_schema_regression():
    print("\n=== C. Trial user analyze-hunt (deer, East Texas) ===")
    body = {
        "conditions": {
            "animal": "deer",
            "hunt_date": "2025-11-15",
            "time_window": "morning",
            "wind_direction": "NW",
            "temperature": "38F",
            "property_type": "private",
            "latitude": 31.5,
            "longitude": -94.5,
        },
        "map_image_base64": _make_png_256(),
    }
    status, _, payload = http_request("POST", "/analyze-hunt", body=body, bearer=TRIAL_BEARER)
    print(f"  HTTP {status}")
    assert_(status == 200, "Trial analyze-hunt -> 200", f"got {status}: {str(payload)[:300]}")
    if not isinstance(payload, dict):
        return

    # Either success=True (analysis happened) or success=False (limit) — both are 200.
    if payload.get("success"):
        result = payload.get("result") or {}
        assert_("meta" not in result,
                "Trial result.meta absent (legacy shape)",
                f"result has 'meta' = {result.get('meta')!r}")
        assert_("enhanced_rollout" in payload,
                "Trial top-level enhanced_rollout present",
                f"keys={list(payload.keys())}")
        er = payload.get("enhanced_rollout") or {}
        assert_(er.get("enhanced_analysis_enabled") is False,
                "Trial enhanced_analysis_enabled == False",
                f"got {er}")
    else:
        # If trial blocked by limit, message is included; that's still a valid 200 fallback.
        assert_("error" in payload or "message" in payload or payload.get("usage") is not None,
                "Trial 200 includes error/message/usage on quota exhaustion",
                f"payload={payload}")


# ---------------------------------------------------------------------
# Section D — pytest tests/test_enhanced_rollout.py
# ---------------------------------------------------------------------
def test_pytest_rollout_suite():
    print("\n=== D. pytest tests/test_enhanced_rollout.py ===")
    import subprocess
    proc = subprocess.run(
        ["python", "-m", "pytest", "tests/test_enhanced_rollout.py", "-v", "--tb=short"],
        cwd="/app/backend",
        capture_output=True,
        text=True,
        timeout=120,
    )
    out = proc.stdout + proc.stderr
    print(out[-2000:])
    # Look for "37 passed" in output
    passed_match = "37 passed" in out
    assert_(proc.returncode == 0, "pytest exit code 0",
            f"returncode={proc.returncode}")
    assert_(passed_match, "37/37 tests pass",
            f"output tail did not contain '37 passed'")


# ---------------------------------------------------------------------
# Section E — /api/health and /api/media/health
# ---------------------------------------------------------------------
def test_health_endpoints():
    print("\n=== E. Health endpoints ===")
    status, _, payload = http_request("GET", "/health")
    assert_(status == 200, "GET /api/health -> 200", f"got {status}: {payload}")
    assert_(isinstance(payload, dict) and payload.get("status") == "ok",
            "/api/health body status == 'ok'", f"got {payload}")

    status, _, payload = http_request("GET", "/media/health", bearer=PRO_BEARER)
    assert_(status == 200, "GET /api/media/health (Bearer Pro) -> 200",
            f"got {status}: {payload}")
    if isinstance(payload, dict):
        assert_(payload.get("ok") is True, "/api/media/health ok=True", f"got {payload}")


# ---------------------------------------------------------------------
# Section F — usage-counting safety
# ---------------------------------------------------------------------
def test_usage_counting_safety():
    """Static check: confirm consume_one_analysis is only called inside
    analyze_hunt (after analyze_map_with_ai succeeds), and NOT in
    presign-upload or POST /api/hunts."""
    print("\n=== F. Static check: consume_one_analysis call sites ===")
    with open("/app/backend/server.py", "r") as f:
        src = f.read()

    # Find each invocation of consume_one_analysis (call, not declaration / docstring).
    lines = src.splitlines()
    call_lines = []
    for i, line in enumerate(lines, start=1):
        # Ignore comment-only lines and the function definition itself
        if "consume_one_analysis(" in line and not line.strip().startswith("#") \
           and "async def consume_one_analysis" not in line \
           and "`consume_one_analysis`" not in line:
            call_lines.append((i, line.strip()))

    print(f"  consume_one_analysis call sites:")
    for ln, content in call_lines:
        print(f"    L{ln}: {content}")

    # Expect exactly 2: one in analyze_hunt (~L1774), one in /api/analytics/consume (~L728).
    assert_(len(call_lines) == 2,
            "exactly 2 call sites in server.py",
            f"got {len(call_lines)}: {[l for l, _ in call_lines]}")

    # Find the analyze_hunt def and ensure the 1774-area call is inside it.
    def find_function_at(line_no: int) -> str:
        for i in range(line_no, 0, -1):
            stripped = lines[i - 1]
            if stripped.startswith("async def ") or stripped.startswith("def "):
                return stripped.split("(")[0].replace("async def ", "").replace("def ", "")
        return "?"

    for ln, content in call_lines:
        owner = find_function_at(ln)
        print(f"    L{ln} owner function: {owner}")

    # Confirm we have a call in analyze_hunt
    in_analyze_hunt = any(find_function_at(ln) == "analyze_hunt" for ln, _ in call_lines)
    assert_(in_analyze_hunt, "consume_one_analysis called inside analyze_hunt",
            f"call_lines={call_lines}")

    # Confirm at least one analyze_hunt call lies AFTER analyze_map_with_ai call
    # (i.e. is later in the same function body)
    am_idx = src.find("await analyze_map_with_ai(")
    if am_idx >= 0:
        am_line = src[:am_idx].count("\n") + 1
        ah_consume_lines = [ln for ln, _ in call_lines
                            if find_function_at(ln) == "analyze_hunt"]
        if ah_consume_lines:
            after_ai = all(ln > am_line for ln in ah_consume_lines)
            assert_(after_ai,
                    "analyze_hunt's consume_one_analysis is AFTER analyze_map_with_ai",
                    f"am_line={am_line}, consume_lines={ah_consume_lines}")

    # Now verify no consume / usage increments are reachable from
    # presign-upload route or /api/hunts POST route. Locate the route
    # function bodies and grep for analysis_count / consume_one / etc.
    def function_body(start_def_marker: str) -> str:
        start = src.find(start_def_marker)
        if start < 0:
            return ""
        # End is the next "@api_router" or "async def " at column 0 after start.
        rest = src[start + len(start_def_marker):]
        # Find the next route decorator OR top-level def
        nxt = len(rest)
        for marker in ("\n@api_router.", "\n@router.", "\nasync def ", "\ndef "):
            idx = rest.find(marker)
            if 0 <= idx < nxt:
                nxt = idx
        return rest[:nxt]

    presign_body = function_body('@api_router.post("/media/presign-upload")')
    hunts_post_body = function_body('@api_router.post("/hunts")')

    forbidden_markers = (
        "consume_one_analysis(",
        "analysis_count",
        "extra_analytics_credits",  # used in consumes
    )
    for label, body in [
        ("/api/media/presign-upload", presign_body),
        ("POST /api/hunts", hunts_post_body),
    ]:
        for marker in forbidden_markers:
            assert_(marker not in body,
                    f"{label} does NOT contain '{marker}'",
                    f"body length={len(body)}; markers found: {marker in body}")


# ---------------------------------------------------------------------
def main():
    test_health_endpoints()
    test_usage_counting_safety()
    test_pytest_rollout_suite()
    iowa = test_iowa_pro_enhanced_enabled()
    test_east_texas_pro_disabled()
    test_trial_fallback_no_schema_regression()

    print("\n" + "=" * 60)
    print(f"PASS: {len(PASS)}    FAIL: {len(FAIL)}")
    print("=" * 60)
    if FAIL:
        print("\nFAILURES:")
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
