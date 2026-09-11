import csv
import io
from datetime import datetime, timedelta, timezone
from statistics import mean

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile

from lib.dates import today_iso
from models.weather import WeatherPoint, WeatherResponse

router = APIRouter()
LIVE_CACHE: dict[str, WeatherResponse] = {}

LOCATION_COORDS = {
    "Leh": (34.1526, 77.5771),
    "Kargil": (34.5539, 76.1349),
    "Nubra Valley": (34.5512, 77.5485),  # Diskit, representative settlement in Nubra Valley
    "Pangong": (33.7595, 78.6676),
}


def _coordinates(location: str) -> tuple[float, float]:
    return LOCATION_COORDS.get(location, LOCATION_COORDS["Leh"])


def _day_night(points: list[WeatherPoint]) -> tuple[float, float, float]:
    day: list[float] = []
    night: list[float] = []
    solar_total = 0.0
    for point in points:
        try:
            hour = datetime.fromisoformat(point.timestamp.replace("Z", "+00:00")).hour
        except ValueError:
            hour = 12
        (day if 6 <= hour < 19 else night).append(point.temperature)
        solar_total += max(0.0, point.solar_radiation_w_m2) / 1000
    fallback = points[-1].temperature if points else 0.0
    return (
        round(mean(day) if day else fallback, 1),
        round(mean(night) if night else fallback, 1),
        round(max(solar_total, 0.1), 1),
    )


def _response(location: str, source: str, points: list[WeatherPoint]) -> WeatherResponse:
    day, night, solar = _day_night(points)
    return WeatherResponse(
        location=location,
        source=source,
        fetched_at=datetime.now(timezone.utc),
        current_temperature=points[0].temperature if points else night,
        current_solar_radiation=points[0].solar_radiation_w_m2 if points else 0,
        ambient_day=day,
        ambient_night=night,
        solar_irradiance=solar,
        points=points,
    )


async def _open_meteo(url: str, params: dict[str, str]) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Weather source unavailable: {exc}") from exc


def _points_from_payload(payload: dict, limit: int = 48) -> list[WeatherPoint]:
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    temperatures = hourly.get("temperature_2m", [])
    radiation = hourly.get("shortwave_radiation", [])
    return [
        WeatherPoint(
            timestamp=str(timestamp),
            temperature=round(float(temperatures[index]), 1),
            solar_radiation_w_m2=round(float(radiation[index] or 0), 1),
        )
        for index, timestamp in enumerate(times[:limit])
        if index < len(temperatures) and temperatures[index] is not None
    ]


@router.get("/weather/live", response_model=WeatherResponse)
async def get_live_weather(location: str = "Leh") -> WeatherResponse:
    cached = LIVE_CACHE.get(location)
    if cached and datetime.now(timezone.utc) - cached.fetched_at < timedelta(minutes=10):
        return cached
    latitude, longitude = _coordinates(location)
    source = "Open-Meteo Forecast API · hourly refresh"
    try:
        payload = await _open_meteo(
            "https://api.open-meteo.com/v1/forecast",
            {
                "latitude": str(latitude),
                "longitude": str(longitude),
                "current": "temperature_2m,shortwave_radiation",
                "hourly": "temperature_2m,shortwave_radiation",
                "forecast_days": "2",
                "timezone": "auto",
            },
        )
    except HTTPException:
        end = datetime.fromisoformat(today_iso())
        payload = await _open_meteo(
            "https://archive-api.open-meteo.com/v1/archive",
            {
                "latitude": str(latitude),
                "longitude": str(longitude),
                "start_date": (end - timedelta(days=1)).date().isoformat(),
                "end_date": end.date().isoformat(),
                "hourly": "temperature_2m,shortwave_radiation",
                "timezone": "auto",
            },
        )
        source = "Open-Meteo archive fallback · forecast rate limited"
    points = _points_from_payload(payload)
    current = payload.get("current", {})
    result = _response(location, source, points)
    result.current_temperature = round(float(current.get("temperature_2m", result.current_temperature)), 1)
    result.current_solar_radiation = round(float(current.get("shortwave_radiation", result.current_solar_radiation) or 0), 1)
    LIVE_CACHE[location] = result
    return result


@router.get("/weather/sample", response_model=WeatherResponse)
async def get_weather_sample(location: str = "Leh") -> WeatherResponse:
    end = datetime.fromisoformat(today_iso())
    start = end - timedelta(days=6)
    latitude, longitude = _coordinates(location)
    payload = await _open_meteo(
        "https://archive-api.open-meteo.com/v1/archive",
        {
            "latitude": str(latitude),
            "longitude": str(longitude),
            "start_date": start.date().isoformat(),
            "end_date": end.date().isoformat(),
            "hourly": "temperature_2m,shortwave_radiation",
            "timezone": "auto",
        },
    )
    return _response(location, "Open-Meteo Historical Forecast Archive · 7 day sample", _points_from_payload(payload, 168))


@router.post("/weather/import", response_model=WeatherResponse)
async def import_weather_csv(location: str = "Leh", file: UploadFile = File(...)) -> WeatherResponse:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Upload a .csv file")
    try:
        content = (await file.read()).decode("utf-8-sig")
        rows = csv.DictReader(io.StringIO(content))
        points: list[WeatherPoint] = []
        for index, row in enumerate(rows):
            normalized = {str(key).strip().lower().replace(" ", "_"): value for key, value in row.items() if key}
            timestamp = normalized.get("timestamp") or normalized.get("datetime") or normalized.get("time") or f"imported-{index:03d}"
            raw_temperature = normalized.get("temperature") or normalized.get("temp") or normalized.get("ambient_temperature") or normalized.get("ambient_temp")
            if raw_temperature in (None, ""):
                raise ValueError("temperature column is required")
            raw_solar = normalized.get("solar_radiation") or normalized.get("solar_irradiance") or normalized.get("radiation") or 0
            points.append(WeatherPoint(timestamp=str(timestamp), temperature=round(float(raw_temperature), 1), solar_radiation_w_m2=round(float(raw_solar or 0), 1)))
    except (UnicodeDecodeError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=f"CSV format error: {exc}") from exc
    if len(points) < 2:
        raise HTTPException(status_code=422, detail="CSV must contain at least two readings")
    return _response(location, f"Uploaded measured CSV · {file.filename}", points[:168])