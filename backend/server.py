from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import json
import base64
import tempfile
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# --- Models ---

class HuntConditions(BaseModel):
    animal: str  # deer, turkey, hog
    hunt_date: str
    time_window: str  # morning, evening, all-day
    wind_direction: str
    temperature: Optional[str] = None
    precipitation: Optional[str] = None
    property_type: Optional[str] = "public"
    region: Optional[str] = None

class AnalyzeRequest(BaseModel):
    conditions: HuntConditions
    map_image_base64: str  # base64 encoded map image

class OverlayMarker(BaseModel):
    type: str  # stand, corridor, access_route, avoid
    label: str
    x_percent: float  # 0-100 position on map
    y_percent: float
    width_percent: Optional[float] = None
    height_percent: Optional[float] = None
    reasoning: str
    confidence: str  # low, medium, high

class AnalysisResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    overlays: List[OverlayMarker]
    summary: str
    top_setups: List[str]
    wind_notes: str
    best_time: str
    key_assumptions: List[str]
    species_tips: List[str]

class AnalyzeResponse(BaseModel):
    success: bool
    result: Optional[AnalysisResult] = None
    error: Optional[str] = None


# --- Species Data ---

SPECIES_DATA = {
    "deer": {
        "name": "Whitetail Deer",
        "icon": "deer",
        "description": "Focus on bedding-to-feeding transitions. Prioritize funnels, saddles, and edges. Wind advantage is critical.",
        "behavior_rules": [
            "Deer move from bedding to feeding areas during dawn and dusk transitions",
            "Funnels, saddles, and terrain edges concentrate deer movement",
            "Wind direction is critical - always set up downwind of expected travel",
            "Mature bucks use cover and terrain to stay hidden during daylight",
            "Water sources are magnets during hot weather",
            "Rut activity changes movement patterns significantly"
        ]
    },
    "turkey": {
        "name": "Wild Turkey",
        "icon": "turkey",
        "description": "Focus on roost-to-strut zones. Open areas near cover edges. Morning setup positioning is key.",
        "behavior_rules": [
            "Turkeys roost in tall trees, often near water or ridgelines",
            "Morning fly-down leads to strut zones in open areas",
            "Set up between roost and open areas like fields or clearings",
            "Turkeys prefer edges between cover and open ground",
            "Avoid setting up too close to roost trees",
            "Afternoon turkeys return toward roost through familiar travel routes"
        ]
    },
    "hog": {
        "name": "Wild Hog",
        "icon": "hog",
        "description": "Focus on water, thick cover, and feeding zones. Night movement tendencies. Ambush near trails and crossings.",
        "behavior_rules": [
            "Hogs are primarily nocturnal, most active at dusk and dawn",
            "Water and wallowing areas are critical attractants",
            "Thick cover provides daytime bedding areas",
            "Hogs travel established trails between bedding, water, and food",
            "Agricultural fields and food plots attract hog activity",
            "Trail crossings and pinch points are ideal ambush locations"
        ]
    }
}


# --- AI Analysis ---

async def analyze_map_with_ai(conditions: HuntConditions, map_image_base64: str) -> AnalysisResult:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise ValueError("EMERGENT_LLM_KEY not configured")

    species = SPECIES_DATA.get(conditions.animal)
    if not species:
        raise ValueError(f"Unknown species: {conditions.animal}")

    species_rules = "\n".join(f"- {r}" for r in species["behavior_rules"])

    system_prompt = f"""You are Raven Scout, an expert hunting strategist AI. You analyze map imagery and provide tactical hunting setup recommendations.

You MUST respond with valid JSON only. No markdown, no code blocks, no extra text.

Species: {species['name']}
Species Behavior Rules:
{species_rules}

Hunt Conditions:
- Date: {conditions.hunt_date}
- Time Window: {conditions.time_window}
- Wind Direction: {conditions.wind_direction}
- Temperature: {conditions.temperature or 'Not specified'}
- Precipitation: {conditions.precipitation or 'None'}
- Property Type: {conditions.property_type or 'public'}
- Region: {conditions.region or 'Not specified'}

OVERLAY COLOR CODING:
- "stand" (Forest Green) = Recommended stand/blind placement
- "corridor" (Amber/Orange) = Likely animal travel corridors
- "access_route" (Sky Blue) = Suggested access routes for the hunter
- "avoid" (Deep Red) = Areas to avoid (wind exposure, high visibility, pressure)

Analyze the map image and respond with this exact JSON structure:
{{
  "overlays": [
    {{
      "type": "stand|corridor|access_route|avoid",
      "label": "Short descriptive label",
      "x_percent": 0-100,
      "y_percent": 0-100,
      "width_percent": null or 5-30 for zones,
      "height_percent": null or 5-30 for zones,
      "reasoning": "Brief explanation why this spot matters",
      "confidence": "low|medium|high"
    }}
  ],
  "summary": "2-3 sentence overview of the recommended hunt plan",
  "top_setups": ["Setup 1 description", "Setup 2 description", "Setup 3 description"],
  "wind_notes": "Wind analysis and how it affects the setup",
  "best_time": "Recommended time based on conditions and species",
  "key_assumptions": ["Assumption 1", "Assumption 2"],
  "species_tips": ["Tip 1 for this species in these conditions", "Tip 2"]
}}

Provide 3-6 overlay markers covering stands, corridors, access routes, and avoid zones. Place them at realistic positions on the map. Each x_percent and y_percent should be between 5 and 95."""

    session_id = str(uuid.uuid4())
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=system_prompt
    )
    chat.with_model("openai", "gpt-5.2")

    # Clean base64 string
    clean_base64 = map_image_base64
    if "," in clean_base64:
        clean_base64 = clean_base64.split(",", 1)[1]

    image_content = ImageContent(image_base64=clean_base64)

    user_message = UserMessage(
        text=f"Analyze this map for a {species['name']} hunt. Conditions: {conditions.time_window} hunt, wind from {conditions.wind_direction}. Provide tactical overlay recommendations as JSON.",
        file_contents=[image_content]
    )

    response = await chat.send_message(user_message)
    logger.info(f"AI Response received, length: {len(response)}")

    # Parse JSON from response
    response_text = response.strip()
    # Remove markdown code blocks if present
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        lines = [line for line in lines if not line.startswith("```")]
        response_text = "\n".join(lines)

    parsed = json.loads(response_text)

    overlays = []
    for o in parsed.get("overlays", []):
        overlays.append(OverlayMarker(
            type=o.get("type", "stand"),
            label=o.get("label", "Marker"),
            x_percent=float(o.get("x_percent", 50)),
            y_percent=float(o.get("y_percent", 50)),
            width_percent=float(o["width_percent"]) if o.get("width_percent") else None,
            height_percent=float(o["height_percent"]) if o.get("height_percent") else None,
            reasoning=o.get("reasoning", ""),
            confidence=o.get("confidence", "medium")
        ))

    return AnalysisResult(
        overlays=overlays,
        summary=parsed.get("summary", "Analysis complete."),
        top_setups=parsed.get("top_setups", []),
        wind_notes=parsed.get("wind_notes", ""),
        best_time=parsed.get("best_time", ""),
        key_assumptions=parsed.get("key_assumptions", []),
        species_tips=parsed.get("species_tips", [])
    )


# --- Routes ---

@api_router.get("/")
async def root():
    return {"message": "Raven Scout API", "version": "1.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "ok"}

@api_router.get("/species")
async def get_species():
    species_list = []
    for key, data in SPECIES_DATA.items():
        species_list.append({
            "id": key,
            "name": data["name"],
            "description": data["description"],
            "icon": data["icon"]
        })
    return {"species": species_list}

@api_router.post("/analyze-hunt", response_model=AnalyzeResponse)
async def analyze_hunt(request: AnalyzeRequest):
    try:
        logger.info(f"Analyzing hunt for {request.conditions.animal}")
        result = await analyze_map_with_ai(request.conditions, request.map_image_base64)
        return AnalyzeResponse(success=True, result=result)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}")
        return AnalyzeResponse(success=False, error="Failed to parse AI response. Please try again.")
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return AnalyzeResponse(success=False, error=str(e))


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
