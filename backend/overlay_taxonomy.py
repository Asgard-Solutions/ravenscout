"""Canonical map-overlay taxonomy (single source of truth).

The frontend legend, the overlay renderer, and the LLM prompt schema
all consume this module so the colour, icon, and label for every
overlay type stay in lockstep. Edit ONLY this file when adding,
removing, or recolouring an overlay type.

Each entry:
  * `type_id`  — the slug emitted by the LLM and stored on saved
                  hunts. Treated as immutable on the wire.
  * `label`    — human-readable name shown in the legend / detail
                  card / sheet (mirrors the frontend legend).
  * `color`    — Material-style hex used by every visual that
                  renders this overlay. Single source of truth.
  * `icon`     — Ionicons glyph name (frontend reference only;
                  ignored by the backend / LLM).
  * `geometry` — the geometry hint the prompt tells the LLM to
                  prefer for this overlay type.
  * `description` — short tactical purpose used in prompt help.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple


@dataclass(frozen=True)
class OverlayType:
    type_id: str
    label: str
    color: str          # hex, e.g. "#2E7D32"
    icon: str           # Ionicons glyph
    geometry: str       # "point" | "polygon" | "line"
    description: str


OVERLAY_TYPES: Tuple[OverlayType, ...] = (
    OverlayType(
        type_id="stand",
        label="Stand / Blind",
        color="#2E7D32",
        icon="pin",
        geometry="point",
        description="Tactical setup point — tree stand, saddle tree, ground blind, or shooting position.",
    ),
    OverlayType(
        type_id="corridor",
        label="Travel Corridor",
        color="#F57C00",
        icon="trail-sign",
        geometry="polygon",
        description="Likely game travel route between bedding and food / water — funnels, draws, saddles.",
    ),
    OverlayType(
        type_id="access_route",
        label="Access Route",
        color="#42A5F5",
        icon="walk",
        geometry="line",
        description="Recommended hunter approach / exit route from a road or map edge to the setup.",
    ),
    OverlayType(
        type_id="avoid",
        label="Avoid Zone",
        color="#C62828",
        icon="warning",
        geometry="polygon",
        description="Area to avoid crossing or hunting near — bedding interior, sanctuary, posted boundary, scent danger zone.",
    ),
    OverlayType(
        type_id="bedding",
        label="Bedding Area",
        color="#8D6E63",
        icon="bed",
        geometry="polygon",
        description="Likely daytime bedding cover — thick interior cover, north-aspect benches, brushy thickets.",
    ),
    OverlayType(
        type_id="food",
        label="Food Source",
        color="#66BB6A",
        icon="nutrition",
        geometry="polygon",
        description="Active food source visible or strongly inferred — ag field, mast oak flat, browse pocket, food plot.",
    ),
    OverlayType(
        type_id="water",
        label="Water Source",
        color="#29B6F6",
        icon="water",
        geometry="point",
        description="Reliable water — creek, stock pond, seep, river bend used by the target species.",
    ),
    OverlayType(
        type_id="trail",
        label="Trail / Path",
        color="#FFCA28",
        icon="footsteps",
        geometry="line",
        description="Visible animal trail or human / game path used as a movement reference.",
    ),
)


# Ordered list of overlay type ids — kept alongside the dataclass tuple
# so callers that just want the slug list don't have to map it.
OVERLAY_TYPE_IDS: Tuple[str, ...] = tuple(t.type_id for t in OVERLAY_TYPES)
OVERLAY_TYPE_PIPE_LIST: str = "|".join(OVERLAY_TYPE_IDS)


# Lookup helpers.
_BY_ID: Dict[str, OverlayType] = {t.type_id: t for t in OVERLAY_TYPES}


def get_overlay_type(type_id: str) -> OverlayType | None:
    if not type_id:
        return None
    return _BY_ID.get(type_id.strip().lower())


def overlay_color_for(type_id: str) -> str | None:
    t = get_overlay_type(type_id)
    return t.color if t else None


def render_overlay_type_table_for_prompt() -> str:
    """Markdown-style table the prompt builder embeds verbatim into the
    LLM system prompt so the model knows the canonical type, label,
    geometry hint, and HEX colour for every overlay it may emit."""
    rows: List[str] = [
        "| type_id | label | geometry | color (hex) | description |",
        "|---|---|---|---|---|",
    ]
    for t in OVERLAY_TYPES:
        rows.append(
            f"| `{t.type_id}` | {t.label} | {t.geometry} | `{t.color}` | {t.description} |"
        )
    return "\n".join(rows)


def render_overlay_type_directives_for_prompt() -> str:
    """Compact directive block telling the LLM the rules around overlay
    typing, colour echoing, and geometry. Embedded by the prompt
    builder. Stable wording — alerting / dashboards may key on it."""
    return (
        "OVERLAY TAXONOMY (single source of truth — match these EXACTLY):\n"
        f"  Permitted `type` values: {OVERLAY_TYPE_PIPE_LIST}.\n"
        "  Each overlay you emit MUST also include a `color` field set to the\n"
        "  canonical hex from the table below — this lets clients render\n"
        "  straight from the response without a separate lookup. Do NOT invent\n"
        "  colors. Do NOT use named colors like 'red' or 'orange'.\n"
        "\n"
        + render_overlay_type_table_for_prompt()
    )
