"""
Raven Scout — Schema Validator & Response Repair
Validates v2 analysis responses and repairs invalid JSON.
"""

import json
import logging
from typing import Tuple

logger = logging.getLogger(__name__)

REQUIRED_TOP_KEYS = [
    "schema_version", "analysis_context", "map_observations", "overlays",
    "summary", "top_setups", "wind_notes", "best_time",
    "key_assumptions", "species_tips", "confidence_summary",
]

VALID_OVERLAY_TYPES = {"stand", "corridor", "access_route", "avoid"}
VALID_SETUP_TYPES = {"stand", "saddle", "blind", "observation"}
VALID_RISK_LEVELS = {"low", "medium", "high", "unknown"}
VALID_EVIDENCE_LEVELS = {"limited", "moderate", "high"}


def clamp(val: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, val))


def validate_and_normalize(data: dict) -> Tuple[bool, list, dict]:
    """
    Validate the v2 schema. Returns (is_valid, errors, normalized_data).
    Normalizes values in-place where possible instead of rejecting.
    """
    errors = []

    # Top-level keys
    for key in REQUIRED_TOP_KEYS:
        if key not in data:
            errors.append(f"Missing required key: {key}")
            # Add defaults
            if key == "schema_version":
                data["schema_version"] = "v2"
            elif key == "analysis_context":
                data["analysis_context"] = {"image_count": 1, "evidence_level": "limited", "used_multi_image_correlation": False}
            elif key in ("map_observations", "overlays", "species_tips"):
                data[key] = []
            elif key == "summary":
                data[key] = ""
            elif key == "top_setups":
                data[key] = []
            elif key == "wind_notes":
                data[key] = {"prevailing_wind_analysis": "", "danger_zones": [], "best_downwind_sides": [], "wind_shift_risk": "medium"}
            elif key == "best_time":
                data[key] = {"primary_window": "", "secondary_window": "", "explanation": ""}
            elif key == "key_assumptions":
                data[key] = []
            elif key == "confidence_summary":
                data[key] = {"overall_confidence": 0.5, "main_limitations": []}

    # Validate analysis_context
    ctx = data.get("analysis_context", {})
    if not isinstance(ctx, dict):
        data["analysis_context"] = {"image_count": 1, "evidence_level": "limited", "used_multi_image_correlation": False}
    else:
        if ctx.get("evidence_level") not in VALID_EVIDENCE_LEVELS:
            ctx["evidence_level"] = "limited"

    # Validate overlays
    overlays = data.get("overlays", [])
    if not isinstance(overlays, list):
        data["overlays"] = []
        errors.append("overlays is not a list")
    else:
        for i, ov in enumerate(overlays):
            if not isinstance(ov, dict):
                continue
            # Ensure id
            if "id" not in ov:
                ov["id"] = f"ov_{i + 1}"
            # Validate type
            if ov.get("type") not in VALID_OVERLAY_TYPES:
                ov["type"] = "stand"
                errors.append(f"overlay[{i}] invalid type, defaulted to 'stand'")
            # Clamp coordinates
            if "x_percent" in ov:
                ov["x_percent"] = clamp(float(ov["x_percent"]), 5, 95)
            if "y_percent" in ov:
                ov["y_percent"] = clamp(float(ov["y_percent"]), 5, 95)
            # Clamp confidence
            if "confidence" in ov:
                ov["confidence"] = clamp(float(ov["confidence"]), 0.0, 1.0)
            # Ensure required fields
            ov.setdefault("label", f"Overlay {i + 1}")
            ov.setdefault("reason", ov.get("reasoning", ""))
            ov.setdefault("radius_percent", 5)
            ov.setdefault("based_on", [])

    # Validate map_observations
    obs_list = data.get("map_observations", [])
    if not isinstance(obs_list, list):
        data["map_observations"] = []
    else:
        for i, obs in enumerate(obs_list):
            if not isinstance(obs, dict):
                continue
            if "id" not in obs:
                obs["id"] = f"obs_{i + 1}"
            if "x_percent" in obs:
                obs["x_percent"] = clamp(float(obs["x_percent"]), 5, 95)
            if "y_percent" in obs:
                obs["y_percent"] = clamp(float(obs["y_percent"]), 5, 95)
            if "confidence" in obs:
                obs["confidence"] = clamp(float(obs["confidence"]), 0.0, 1.0)
            obs.setdefault("feature_type", "unknown")
            obs.setdefault("description", "")
            obs.setdefault("evidence", [])

    # Validate top_setups
    setups = data.get("top_setups", [])
    if not isinstance(setups, list):
        data["top_setups"] = []
    else:
        for i, setup in enumerate(setups):
            if not isinstance(setup, dict):
                continue
            setup.setdefault("rank", i + 1)
            if setup.get("setup_type") not in VALID_SETUP_TYPES:
                setup["setup_type"] = "stand"
            if "x_percent" in setup:
                setup["x_percent"] = clamp(float(setup["x_percent"]), 5, 95)
            if "y_percent" in setup:
                setup["y_percent"] = clamp(float(setup["y_percent"]), 5, 95)
            if "confidence" in setup:
                setup["confidence"] = clamp(float(setup["confidence"]), 0.0, 1.0)
            for risk_field in ("wind_risk", "thermals_risk", "pressure_risk"):
                if setup.get(risk_field) not in VALID_RISK_LEVELS:
                    setup[risk_field] = "medium"
            setup.setdefault("setup_name", f"Setup {i + 1}")
            setup.setdefault("target_movement", "")
            setup.setdefault("shot_opportunity", "")
            setup.setdefault("entry_strategy", "")
            setup.setdefault("exit_strategy", "")
            setup.setdefault("best_window", "")
            setup.setdefault("why_this_works", [])

    # Validate wind_notes
    wn = data.get("wind_notes")
    if not isinstance(wn, dict):
        data["wind_notes"] = {"prevailing_wind_analysis": str(wn) if wn else "", "danger_zones": [], "best_downwind_sides": [], "wind_shift_risk": "medium"}
    else:
        wn.setdefault("prevailing_wind_analysis", "")
        wn.setdefault("danger_zones", [])
        wn.setdefault("best_downwind_sides", [])
        if wn.get("wind_shift_risk") not in VALID_RISK_LEVELS:
            wn["wind_shift_risk"] = "medium"

    # Validate best_time
    bt = data.get("best_time")
    if not isinstance(bt, dict):
        data["best_time"] = {"primary_window": str(bt) if bt else "", "secondary_window": "", "explanation": ""}
    else:
        bt.setdefault("primary_window", "")
        bt.setdefault("secondary_window", "")
        bt.setdefault("explanation", "")

    # Validate key_assumptions
    ka = data.get("key_assumptions", [])
    if not isinstance(ka, list):
        data["key_assumptions"] = []
    else:
        for i, item in enumerate(ka):
            if isinstance(item, str):
                ka[i] = {"assumption": item, "impact": "medium"}
            elif isinstance(item, dict):
                item.setdefault("assumption", "")
                if item.get("impact") not in ("low", "medium", "high"):
                    item["impact"] = "medium"

    # Validate confidence_summary
    cs = data.get("confidence_summary")
    if not isinstance(cs, dict):
        data["confidence_summary"] = {"overall_confidence": 0.5, "main_limitations": []}
    else:
        if "overall_confidence" in cs:
            cs["overall_confidence"] = clamp(float(cs["overall_confidence"]), 0.0, 1.0)
        cs.setdefault("main_limitations", [])

    is_valid = len(errors) == 0
    return is_valid, errors, data


def parse_llm_response(raw: str) -> Tuple[bool, dict, str]:
    """
    Parse raw LLM output into a dict. Returns (success, data, error_msg).
    Handles markdown code fences and extra text.
    """
    text = raw.strip()

    # Strip markdown code fences
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [line for line in lines if not line.strip().startswith("```")]
        text = "\n".join(lines).strip()

    # Find JSON object boundaries
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return False, {}, "No JSON object found in response"

    json_str = text[start:end + 1]

    try:
        data = json.loads(json_str)
        return True, data, ""
    except json.JSONDecodeError as e:
        return False, {}, f"JSON parse error: {e}"


def convert_v2_to_v1(v2_data: dict) -> dict:
    """
    Convert v2 schema response to v1 format for backward compatibility.
    Used by legacy frontend code that hasn't been updated yet.
    """
    overlays = []
    for ov in v2_data.get("overlays", []):
        overlays.append({
            "type": ov.get("type", "stand"),
            "label": ov.get("label", ""),
            "x_percent": ov.get("x_percent", 50),
            "y_percent": ov.get("y_percent", 50),
            "width_percent": ov.get("radius_percent", 5) * 2 if ov.get("type") in ("corridor", "avoid") else None,
            "height_percent": ov.get("radius_percent", 5) * 2 if ov.get("type") in ("corridor", "avoid") else None,
            "reasoning": ov.get("reason", ""),
            "confidence": _confidence_float_to_str(ov.get("confidence", 0.5)),
        })

    # Convert wind_notes
    wn = v2_data.get("wind_notes", {})
    wind_str = wn.get("prevailing_wind_analysis", "") if isinstance(wn, dict) else str(wn)

    # Convert best_time
    bt = v2_data.get("best_time", {})
    time_str = bt.get("primary_window", "") if isinstance(bt, dict) else str(bt)

    # Convert top_setups
    setups = []
    for s in v2_data.get("top_setups", []):
        if isinstance(s, dict):
            setups.append(s.get("setup_name", "") + ": " + s.get("target_movement", ""))
        else:
            setups.append(str(s))

    # Convert key_assumptions
    assumptions = []
    for ka in v2_data.get("key_assumptions", []):
        if isinstance(ka, dict):
            assumptions.append(ka.get("assumption", ""))
        else:
            assumptions.append(str(ka))

    return {
        "overlays": overlays,
        "summary": v2_data.get("summary", ""),
        "top_setups": setups,
        "wind_notes": wind_str,
        "best_time": time_str,
        "key_assumptions": assumptions,
        "species_tips": v2_data.get("species_tips", []),
    }


def _confidence_float_to_str(val: float) -> str:
    if val >= 0.7:
        return "high"
    if val >= 0.4:
        return "medium"
    return "low"
