import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException, Response

from models.current_weather import CurrentWeatherReading, CurrentWeatherResponse
from routers.weather import LOCATION_COORDS

router = APIRouter()
# httpx INFO messages include query strings; never log the provider's appid.
logging.getLogger("httpx").setLevel(logging.WARNING)

CACHE_TTL = timedelta(minutes=10)
RECENT_LIMIT = timedelta(hours=1)
MAX_STALE = timedelta(hours=3)
RETRY_DELAY = timedelta(minutes=1)
READINGS: dict[str, CurrentWeatherReading] = {}
RETRY_AFTER: dict[str, tuple[datetime, str]] = {}
LOCKS = {location: asyncio.Lock() for location in LOCATION_COORDS}


def _result(location: str, message: str = "", retry_at: datetime | None = None) -> CurrentWeatherResponse:
    now = datetime.now(timezone.utc)
    reading = READINGS.get(location)
    if reading and now - reading.observed_at > MAX_STALE:
        reading = None
    status = "unavailable"
    next_refresh = retry_at or now + RETRY_DELAY
    if reading:
        stale = bool(message) or now - reading.observed_at > RECENT_LIMIT or now - reading.fetched_at >= CACHE_TTL
        status = "stale" if stale else "available"
        next_refresh = retry_at or max(now, reading.fetched_at + CACHE_TTL)
        if not message:
            message = "Older provider reading; not current conditions." if stale else "Latest available provider reading."
    latitude, longitude = LOCATION_COORDS[location]
    return CurrentWeatherResponse(
        location=location, latitude=latitude, longitude=longitude,
        status=status, reading=reading, checked_at=now,
        next_refresh_at=next_refresh,
        message=message or "Current conditions are unavailable. Simulation presets remain usable.",
    )


@router.get("/weather/current", response_model=CurrentWeatherResponse)
async def get_current_weather(response: Response, location: str = "Leh") -> CurrentWeatherResponse:
    """Real provider data only. Availability is explicit; never substitute a preset."""
    response.headers["Cache-Control"] = "no-store"
    if location not in LOCATION_COORDS:
        raise HTTPException(status_code=422, detail="Choose Leh, Kargil, Nubra Valley, or Pangong.")
    async with LOCKS[location]:
        now = datetime.now(timezone.utc)
        retry = RETRY_AFTER.get(location)
        if retry and now < retry[0]:
            return _result(location, retry[1], retry[0])
        cached = READINGS.get(location)
        if cached and now - cached.fetched_at < CACHE_TTL:
            return _result(location)
        key = os.environ.get("OPENWEATHER_API_KEY", "").strip()
        message = ""
        if not key:
            message = "OpenWeatherMap is not configured. Add the server API key to enable current conditions."
        else:
            latitude, longitude = LOCATION_COORDS[location]
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    upstream = await client.get(
                        "https://api.openweathermap.org/data/2.5/weather",
                        params={"lat": latitude, "lon": longitude, "appid": key, "units": "metric"},
                    )
                if upstream.status_code in (401, 403):
                    message = "OpenWeatherMap rejected the API key. New keys can take up to two hours to activate."
                elif upstream.status_code == 429:
                    message = "OpenWeatherMap's request limit was reached. Please try again shortly."
                elif upstream.status_code != 200:
                    message = "OpenWeatherMap is temporarily unavailable. Please try again shortly."
                else:
                    data = upstream.json()
                    fetched_at = datetime.now(timezone.utc)
                    observed_at = datetime.fromtimestamp(float(data["dt"]), timezone.utc)
                    # Reject implausibly dated data instead of presenting it as current.
                    if observed_at > fetched_at + timedelta(minutes=5) or fetched_at - observed_at > MAX_STALE:
                        message = "OpenWeatherMap returned an out-of-date reading. Current conditions are unavailable."
                    else:
                        conditions = data.get("weather") or [{}]
                        reading = CurrentWeatherReading(
                            temperature_c=data["main"]["temp"],
                            humidity_percent=data["main"]["humidity"],
                            wind_speed_m_s=data["wind"]["speed"],
                            wind_direction_degrees=data["wind"].get("deg"),
                            description=conditions[0].get("description") or "Conditions not supplied",
                            provider_place=data.get("name") or "Unnamed provider area",
                            observed_at=observed_at, fetched_at=fetched_at,
                        )
                        READINGS[location] = reading
                        RETRY_AFTER.pop(location, None)
                        return _result(location)
            except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError, OverflowError, OSError):
                # Never return upstream exception text: it can contain the secret URL.
                message = "OpenWeatherMap could not provide a valid reading. Please try again shortly."
        retry_at = datetime.now(timezone.utc) + RETRY_DELAY
        RETRY_AFTER[location] = (retry_at, message)
        return _result(location, message, retry_at)