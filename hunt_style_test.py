"""
hunt_style_resolution contract validation for POST /api/analyze-hunt.

Scope: response shape only (LLM quality out of scope).
Cases: A omitted, B archery, C "Public Land", D alias "bow hunting",
       E garbage "banana". Plus F regression on region_resolution.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

FRONTEND_ENV = Path("/app/frontend/.env")


def _load_backend_url() -> str:
    for line in FRONTEND_ENV.read_text().splitlines():
        line = line.strip()
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'").rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not in /app/frontend/.env")


BASE = _load_backend_url()
API = f"{BASE}/api"
PRO_TOKEN = "test_session_rs_001"

# Tiny valid JPEG (8x8 solid gray) produced with PIL.
TINY_JPEG_B64 = (
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dA"
    "RkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8"
    "fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAIAAgDASIA"
    "AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA"
    "AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3"
    "ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm"
    "p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA"
    "AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx"
    "BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK"
    "U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3"
    "uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwBlFFFA"
    "H//Z"
)

PASS: list[str] = []
FAIL: list[tuple[str, str]] = []


def ok(name: str, detail: str = "") -> None:
    PASS.append(name)
    print(f"  PASS  {name}" + (f"  ({detail})" if detail else ""))


def fail(name: str, detail: str) -> None:
    FAIL.append((name, detail))
    print(f"  FAIL  {name}  :: {detail}")


def _base_conditions() -> dict:
    # Use real-looking whitetail-in-Texas data; GPS to exercise region_resolution.
    return {
        "animal": "deer",
        "hunt_date": "2025-11-08",
        "time_window": "morning",
        "wind_direction": "NNW",
        "temperature": "42F",
        "precipitation": "none",
        "property_type": "private",
        "region": "Leon County, TX",
        "latitude": 31.2956,
        "longitude": -95.9778,
    }


def run_case(label: str, hunt_style, expected_style_id, expected_label,
             expected_source, expected_raw) -> None:
    print(f"\n[CASE {label}] hunt_style={hunt_style!r}")
    conditions = _base_conditions()
    if hunt_style is not None:
        conditions["hunt_style"] = hunt_style
    payload = {
        "conditions": conditions,
        "map_image_base64": TINY_JPEG_B64,
    }
    try:
        r = requests.post(
            f"{API}/analyze-hunt",
            headers={
                "Authorization": f"Bearer {PRO_TOKEN}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=180,
        )
    except requests.RequestException as e:
        fail(f"{label} network", str(e))
        return

    preview = r.text[:400].replace("\n", " ")
    if r.status_code != 200:
        fail(f"{label} status 200", f"got {r.status_code} body={preview}")
        return
    ok(f"{label} status 200")

    body = r.json()
    if body.get("success") is not True:
        fail(f"{label} success=true", f"body.success={body.get('success')} error={body.get('error')}")
        # Continue so we can still inspect resolution if present.

    hsr = body.get("hunt_style_resolution")
    if not isinstance(hsr, dict):
        fail(f"{label} hunt_style_resolution is dict", f"got type={type(hsr).__name__} value={hsr!r}")
        return
    ok(f"{label} hunt_style_resolution is dict", f"hsr={hsr}")

    # Key inventory
    expected_keys = {"styleId", "styleLabel", "source", "rawInput"}
    if set(hsr.keys()) != expected_keys:
        fail(
            f"{label} hsr keys == {{styleId,styleLabel,source,rawInput}}",
            f"got keys={sorted(hsr.keys())}",
        )
    else:
        ok(f"{label} hsr has exactly the 4 expected keys")

    # Field-by-field assertions
    for field, expected in (
        ("styleId", expected_style_id),
        ("styleLabel", expected_label),
        ("source", expected_source),
        ("rawInput", expected_raw),
    ):
        actual = hsr.get(field)
        if actual == expected:
            ok(f"{label} hsr.{field} == {expected!r}")
        else:
            fail(f"{label} hsr.{field} == {expected!r}", f"got {actual!r}")

    # Regression: region_resolution should still be present+shaped
    rr = body.get("region_resolution")
    if not isinstance(rr, dict):
        fail(f"{label} region_resolution is dict", f"got type={type(rr).__name__} value={rr!r}")
    else:
        ok(f"{label} region_resolution is dict", f"rr={rr}")
        # Shape sanity: region_id / region_label / source (keys vary, so
        # just check it has something recognizable and is not empty)
        if rr and any(k in rr for k in ("region_id", "regionId", "regionLabel", "region_label", "source")):
            ok(f"{label} region_resolution has recognizable keys", f"keys={sorted(rr.keys())}")
        else:
            fail(f"{label} region_resolution has recognizable keys", f"keys={sorted(rr.keys()) if rr else '[]'}")


def main() -> int:
    print(f"Using API base: {API}")

    # A) omitted
    run_case(
        "A (omitted)",
        hunt_style=None,
        expected_style_id=None,
        expected_label=None,
        expected_source="unspecified",
        expected_raw=None,
    )
    # B) canonical "archery"
    run_case(
        "B (archery)",
        hunt_style="archery",
        expected_style_id="archery",
        expected_label="Archery",
        expected_source="user_selected",
        expected_raw="archery",
    )
    # C) display label normalization
    run_case(
        "C (Public Land)",
        hunt_style="Public Land",
        expected_style_id="public_land",
        expected_label="Public Land",
        expected_source="user_selected",
        expected_raw="Public Land",
    )
    # D) alias normalization
    run_case(
        "D (bow hunting alias)",
        hunt_style="bow hunting",
        expected_style_id="archery",
        expected_label="Archery",
        expected_source="user_selected",
        expected_raw="bow hunting",
    )
    # E) garbage fallback
    run_case(
        "E (banana garbage)",
        hunt_style="banana",
        expected_style_id=None,
        expected_label=None,
        expected_source="unspecified",
        expected_raw="banana",
    )

    print("\n============================================================")
    print(f"PASS: {len(PASS)}")
    print(f"FAIL: {len(FAIL)}")
    for name, why in FAIL:
        print(f"  - {name}: {why}")
    print("============================================================")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
