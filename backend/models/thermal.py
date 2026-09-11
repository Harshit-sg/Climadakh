from typing import Literal
from pydantic import BaseModel, Field, ConfigDict
from models.materials import MaterialDefinition


class PhysicsInputs(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    wall_thickness_mm: float | None = Field(default=None, gt=0, le=1500)
    roof_thickness_mm: float | None = Field(default=None, gt=0, le=1500)
    wall_insulation_id: str | None = None
    roof_insulation_id: str | None = None
    wall_insulation_mm: float = Field(default=100, ge=0, le=500)
    roof_insulation_mm: float = Field(default=100, ge=0, le=500)
    air_changes_per_hour: float = Field(default=.5, ge=0, le=10)
    glazing_u_value: float = Field(default=2.8, gt=0, le=10)
    solar_heat_gain_coefficient: float = Field(default=.6, ge=0, le=1)
    floor_u_value: float = Field(default=.35, gt=0, le=10)
    ground_temperature_c: float | None = Field(default=None, ge=-80, le=60)
    initial_temperature_c: float | None = Field(default=None, ge=-80, le=60)
    internal_gains_w: float = Field(default=0, ge=0, le=10000)
    thermal_bridge_w_k: float = Field(default=0, ge=0, le=1000)
    solar_absorptance: float = Field(default=.6, ge=0, le=1)


class EnergyBalancePoint(BaseModel):
    hour: int
    label: str
    solar_in: float
    internal_in: float
    ambient_in: float
    walls_out: float
    roof_out: float
    floor_out: float
    openings_out: float
    ventilation_out: float
    bridges_out: float
    storage_change: float
    balance_error: float


class TemperatureRangePoint(BaseModel):
    hour: int
    low: float
    high: float


class ModelInfo(BaseModel):
    version: str
    validation_status: Literal["uncalibrated"] = "uncalibrated"
    timestep_seconds: int
    wall_u_value: float
    roof_u_value: float
    heat_capacity_kj_k: float
    air_density_kg_m3: float
    max_balance_error_kwh: float
    discomfort_degree_hours: float
    effective_inputs: PhysicsInputs
    material_snapshots: list[MaterialDefinition]
    assumptions: list[str]
    limitations: list[str]