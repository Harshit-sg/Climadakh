from datetime import datetime, timezone

from pydantic import BaseModel, Field


class WeatherPoint(BaseModel):
    timestamp: str
    temperature: float
    solar_radiation_w_m2: float


class WeatherResponse(BaseModel):
    location: str
    source: str
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    current_temperature: float
    current_solar_radiation: float
    ambient_day: float
    ambient_night: float
    solar_irradiance: float
    points: list[WeatherPoint]