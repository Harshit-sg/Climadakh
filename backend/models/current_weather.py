from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CurrentWeatherReading(BaseModel):
    temperature_c: float = Field(allow_inf_nan=False)
    humidity_percent: float = Field(ge=0, le=100, allow_inf_nan=False)
    wind_speed_m_s: float = Field(ge=0, allow_inf_nan=False)
    wind_direction_degrees: float | None = Field(default=None, ge=0, le=360)
    description: str
    provider_place: str
    observed_at: datetime
    fetched_at: datetime


class CurrentWeatherResponse(BaseModel):
    location: str
    latitude: float
    longitude: float
    source: Literal["OpenWeatherMap"] = "OpenWeatherMap"
    status: Literal["available", "stale", "unavailable"]
    reading: CurrentWeatherReading | None = None
    checked_at: datetime
    next_refresh_at: datetime
    message: str