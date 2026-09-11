import math
from datetime import datetime, timezone

from fastapi import APIRouter

from lib.db import db
from lib.thermal_solver import build_analysis
from lib.materials import MATERIALS as MATERIAL_CATALOGUE
from models.materials import MaterialDefinition
from models.analysis import (
    AnalysisRequest,
    AnalysisResult,
    ChartPoint,
    HeatFlow,
    SavedAnalysis,
    SavedAnalysisCreate,
    ScenarioResult,
)

router = APIRouter()

# Legacy v1 implementation retained for traceability only. New requests use
# build_analysis (v2); saved historical results are read as-is, never recalculated.
MATERIALS = {
    "rammed-earth": {"label": "Rammed earth", "u": 0.42, "mass": 0.9},
    "stone-mud": {"label": "Stone + mud mortar", "u": 0.78, "mass": 1.0},
    "insulated-panel": {"label": "Insulated composite", "u": 0.24, "mass": 0.35},
    "adobe": {"label": "Adobe block", "u": 0.52, "mass": 0.85},
    "straw-clay": {"label": "Straw-clay composite", "u": 0.30, "mass": 0.55},
}


def _material(key: str) -> dict:
    return MATERIALS.get(key, MATERIALS["rammed-earth"])


def _simulate_temperature(req: AnalysisRequest, wall: dict, roof: dict) -> tuple[list[ChartPoint], float, float, float]:
    floor_area = req.dimensions.length * req.dimensions.width
    envelope_area = (2 * (req.dimensions.length + req.dimensions.width) * req.dimensions.height) + floor_area
    wall_area = max(envelope_area - floor_area, 1)
    opening = min(req.opening_area, wall_area * 0.45)
    opaque_area = max(wall_area - opening, 1)
    orientation_factor = {"south": 1.0, "south-east": 0.94, "east": 0.84, "west": 0.76, "north": 0.58}[req.orientation]
    mass_factor = {"low": 0.68, "medium": 0.82, "high": 0.93}[req.thermal_mass]
    total_u = (opaque_area * wall["u"] + floor_area * roof["u"] * 0.72 + opening * 2.9) / envelope_area
    solar_hourly = req.solar_irradiance * floor_area * 0.18 * orientation_factor
    inside = req.ambient_night + 4.5
    points: list[ChartPoint] = []
    heat_loss_total = 0.0
    solar_total = 0.0
    comfort_hours = 0.0
    for hour in range(req.duration_hours):
        phase = (hour % 24) / 24 * math.tau
        ambient = req.ambient_day - ((req.ambient_day - req.ambient_night) / 2) * (1 + math.cos(phase))
        daylight = max(0.0, math.sin((hour % 24 - 6) / 12 * math.pi)) if 6 <= hour % 24 <= 18 else 0.0
        solar_gain = solar_hourly * daylight * (0.72 + 0.28 * mass_factor)
        loss = max(0.0, (inside - ambient) * total_u * 0.22 + req.opening_area * 0.018)
        inside += (ambient - inside) * (0.075 * (2 - mass_factor)) + solar_gain * 0.08 - loss * 0.02
        inside = max(-30, min(40, inside))
        heat_loss_total += loss
        solar_total += solar_gain
        if 18 <= inside <= 26:
            comfort_hours += 1
        points.append(
            ChartPoint(
                hour=hour,
                label=f"{hour % 24:02d}:00",
                ambient_temp=round(ambient, 1),
                inside_temp=round(inside, 1),
                solar_gain=round(solar_gain, 2),
                heat_loss=round(loss, 2),
            )
        )
    return points, solar_total, heat_loss_total, comfort_hours


def _make_result(req: AnalysisRequest) -> AnalysisResult:
    wall = _material(req.wall_material)
    roof = _material(req.roof_material)
    points, solar_total, heat_loss_total, comfort_hours = _simulate_temperature(req, wall, roof)
    floor_area = req.dimensions.length * req.dimensions.width
    wall_area = 2 * (req.dimensions.length + req.dimensions.width) * req.dimensions.height
    heat_flows = [
        HeatFlow(name="Walls", value=round(heat_loss_total * wall["u"] / max(wall["u"] + 1, 1), 1), color="#F97316"),
        HeatFlow(name="Openings", value=round(heat_loss_total * min(req.opening_area / max(wall_area, 1) * 2.5, 0.42), 1), color="#EF4444"),
        HeatFlow(name="Roof + floor", value=round(heat_loss_total * roof["u"] / max(roof["u"] + 1.5, 1), 1), color="#38BDF8"),
        HeatFlow(name="Infiltration", value=round(heat_loss_total * 0.12, 1), color="#A78BFA"),
    ]
    scenarios = []
    combos = [
        ("Rammed earth + insulated roof", "rammed-earth", "insulated-panel", "Balanced thermal mass for winter sun."),
        ("Insulated composite envelope", "insulated-panel", "insulated-panel", "Lowest conductive loss; light thermal mass."),
        ("Adobe + straw-clay roof", "adobe", "straw-clay", "Local material language with strong buffering."),
    ]
    for name, wall_key, roof_key, note in combos:
        scenario_points, _, scenario_loss, scenario_comfort = _simulate_temperature(req, _material(wall_key), _material(roof_key))
        end_temp = scenario_points[-1].inside_temp if scenario_points else req.ambient_night
        score = max(1, min(99, round(100 - scenario_loss * 1.7 + scenario_comfort * 0.25)))
        scenarios.append(ScenarioResult(name=name, wall_material=wall_key, roof_material=roof_key, inside_temp=end_temp, heat_loss=round(scenario_loss, 1), comfort_hours=round(scenario_comfort, 1), score=score, note=note))
    scenarios.sort(key=lambda item: item.score, reverse=True)
    best = scenarios[0]
    avg_inside = sum(point.inside_temp for point in points) / max(len(points), 1)
    score = max(1, min(99, round(100 - heat_loss_total * 1.7 + comfort_hours * 0.3)))
    return AnalysisResult(
        inputs=req,
        average_inside_temp=round(avg_inside, 1),
        current_inside_temp=points[-1].inside_temp if points else 0,
        solar_energy_kwh=round(solar_total, 1),
        heat_loss_kwh=round(heat_loss_total, 1),
        comfort_hours=round(comfort_hours, 1),
        comfort_target="18–26 °C",
        efficiency_score=score,
        chart_data=points,
        heat_flows=heat_flows,
        scenarios=scenarios,
        recommendation=best.name,
        recommendation_detail=f"{best.note} This combination holds {best.inside_temp:.1f} °C at the end of the run with {best.heat_loss:.1f} kWh estimated heat loss.",
    )


@router.post("/analyze", response_model=AnalysisResult)
async def analyze_shelter(request: AnalysisRequest) -> AnalysisResult:
    return build_analysis(request)


@router.get("/materials", response_model=list[MaterialDefinition])
async def get_materials() -> list[MaterialDefinition]:
    return list(MATERIAL_CATALOGUE.values())


@router.get("/analyses", response_model=list[SavedAnalysis])
async def get_saved_analyses() -> list[SavedAnalysis]:
    documents = await db.analyses.find().sort("created_at", -1).to_list(1000)
    return [SavedAnalysis(**document) for document in documents]


@router.post("/analyses", response_model=SavedAnalysis)
async def save_analysis(payload: SavedAnalysisCreate) -> SavedAnalysis:
    saved = SavedAnalysis(name=payload.name, result=payload.result)
    await db.analyses.insert_one(saved.model_dump())
    return saved