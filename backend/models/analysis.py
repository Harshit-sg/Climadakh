from datetime import datetime, timezone
from typing import Literal
import uuid

from pydantic import BaseModel, Field
from models.thermal import PhysicsInputs, EnergyBalancePoint, TemperatureRangePoint, ModelInfo


class ShelterDimensions(BaseModel):
    length: float = Field(gt=0, le=30)
    width: float = Field(gt=0, le=30)
    height: float = Field(gt=0, le=15)


class AnalysisRequest(BaseModel):
    location: str
    ambient_day: float
    ambient_night: float
    solar_irradiance: float = Field(gt=0, le=12)
    sunshine_hours: float = Field(gt=0, le=24)
    dimensions: ShelterDimensions
    orientation: Literal["south", "south-east", "east", "west", "north"]
    opening_area: float = Field(ge=0, le=100)
    wall_material: str
    roof_material: str
    thermal_mass: Literal["low", "medium", "high"]
    duration_hours: int = Field(ge=6, le=168)
    physics: PhysicsInputs | None = None


class ChartPoint(BaseModel):
    hour: int
    label: str
    ambient_temp: float
    inside_temp: float
    solar_gain: float
    heat_loss: float


class HeatFlow(BaseModel):
    name: str
    value: float
    color: str


class ScenarioResult(BaseModel):
    name: str
    wall_material: str
    roof_material: str
    inside_temp: float
    heat_loss: float
    comfort_hours: float
    score: int
    note: str
    wall_u_value: float | None = None
    roof_u_value: float | None = None
    discomfort_degree_hours: float | None = None


class AnalysisResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    inputs: AnalysisRequest
    average_inside_temp: float
    current_inside_temp: float
    solar_energy_kwh: float
    heat_loss_kwh: float
    comfort_hours: float
    comfort_target: str
    efficiency_score: int
    chart_data: list[ChartPoint]
    heat_flows: list[HeatFlow]
    scenarios: list[ScenarioResult]
    recommendation: str
    recommendation_detail: str
    model_info: ModelInfo | None = None
    energy_balance: list[EnergyBalancePoint] = Field(default_factory=list)
    sensitivity: list[TemperatureRangePoint] = Field(default_factory=list)


class SavedAnalysisCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    result: AnalysisResult


class SavedAnalysis(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    result: AnalysisResult