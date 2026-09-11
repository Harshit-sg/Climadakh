// Mirrors backend/models/current_weather.py. All times are server-supplied ISO UTC.
export interface CurrentWeatherReading {
  temperature_c: number;
  humidity_percent: number;
  wind_speed_m_s: number;
  wind_direction_degrees: number | null;
  description: string;
  provider_place: string;
  observed_at: string;
  fetched_at: string;
}

export interface CurrentWeatherResponse {
  location: string;
  latitude: number;
  longitude: number;
  source: "OpenWeatherMap";
  status: "available" | "stale" | "unavailable";
  reading: CurrentWeatherReading | null;
  checked_at: string;
  next_refresh_at: string;
  message: string;
}