import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { CloudSun, Droplets, MapPin, RefreshCw, Thermometer, Wind } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import type { CurrentWeatherResponse } from "@/lib/current-weather";

function weatherTime(value: string) {
  return `${new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value))} IST`;
}

function windDirection(degrees: number | null) {
  if (degrees === null) return "Direction not supplied";
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return `From ${points[Math.round(degrees / 45) % 8]} · ${Math.round(degrees)}°`;
}

export default function CurrentWeather({ location }: { location: string }) {
  const reducedMotion = useReducedMotion();
  const query = useQuery({
    queryKey: ["current-weather", location],
    queryFn: () => apiGet<CurrentWeatherResponse>(`/weather/current?location=${encodeURIComponent(location)}`),
    staleTime: 60000,
    refetchInterval: 60000,
    retry: false,
  });
  // A failed refresh must never keep the previous cached reading labelled live.
  const data = query.data;
  const reading = !query.isError && data?.status !== "unavailable" ? data?.reading : null;
  const loading = query.isPending && !query.isError;
  const status = loading ? "Connecting" : query.isError || !reading ? "Unavailable" : data?.status === "stale" ? "Older reading" : "Latest reading";
  const metrics = [
    { id: "temperature", label: "Current temperature", value: reading ? reading.temperature_c.toFixed(1) : "—", unit: "°C", note: reading?.description ?? "Air temperature", icon: Thermometer, tone: "text-orange-200", tint: "bg-orange-300/10 text-orange-300" },
    { id: "humidity", label: "Relative humidity", value: reading ? reading.humidity_percent.toFixed(0) : "—", unit: "%", note: "Outdoor moisture level", icon: Droplets, tone: "text-sky-200", tint: "bg-sky-300/10 text-sky-300" },
    { id: "wind", label: "Wind speed", value: reading ? reading.wind_speed_m_s.toFixed(1) : "—", unit: "m/s", note: reading ? `${(reading.wind_speed_m_s * 3.6).toFixed(1)} km/h · ${windDirection(reading.wind_direction_degrees)}` : "Local wind conditions", icon: Wind, tone: "text-teal-200", tint: "bg-teal-300/10 text-teal-300" },
  ];

  return (
    <Card className="mb-6 overflow-hidden border-sky-200/15 bg-[#0a141d]/90 shadow-[0_18px_60px_rgba(0,0,0,.2)] backdrop-blur-xl" data-testid="current-weather-panel" aria-label="Current Ladakh weather">
      <CardContent className="p-0">
        <div className="grid lg:grid-cols-[minmax(220px,.95fr)_2.2fr]">
          <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.17em] text-sky-300" data-testid="current-weather-eyebrow"><CloudSun size={15} /> Ladakh / current conditions</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h2 className="font-heading text-2xl tracking-tight" data-testid="current-weather-location">{location}</h2>
              <Badge variant="outline" className={reading && data?.status === "available" ? "border-emerald-300/20 bg-emerald-300/5 text-emerald-200" : "border-amber-300/20 text-amber-200"} data-testid="current-weather-status">{status}</Badge>
            </div>
            <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-slate-400" data-testid="current-weather-coordinates"><MapPin size={11} />{data ? `${data.latitude.toFixed(4)}° N / ${data.longitude.toFixed(4)}° E` : "Resolving selected location…"}</p>
            <a href="https://openweathermap.org/" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-[11px] text-slate-400 underline decoration-slate-600 underline-offset-4 transition-colors hover:text-sky-200" data-testid="current-weather-attribution">Weather by OpenWeatherMap ↗</a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3" aria-live="polite" aria-busy={query.isFetching}>
            {metrics.map(({ id, label, value, unit, note, icon: Icon, tone, tint }, index) => (
              <motion.div key={`${location}-${id}`} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35, delay: index * .06 }} whileHover={reducedMotion ? undefined : { y: -2 }} className="border-b border-white/[.06] p-5 last:border-0 sm:border-b-0 sm:border-r" data-testid={`current-weather-${id}-card`}>
                <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-slate-400" data-testid={`current-weather-${id}-label`}>{label}</p><div className={`rounded-lg p-1.5 ${tint}`}><Icon size={16} aria-hidden="true" /></div></div>
                <p className={`mt-3 font-mono text-[32px] tracking-tight ${tone} ${loading ? "animate-pulse" : ""}`} data-testid={`current-weather-${id}-value`}>{value}<span className="ml-1.5 text-sm text-slate-400" data-testid={`current-weather-${id}-unit`}>{unit}</span></p>
                <p className="mt-2 text-[11px] capitalize leading-5 text-slate-400" data-testid={`current-weather-${id}-description`}>{note}</p>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-white/10 bg-black/15 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            {reading ? <>
              <p className="font-mono text-[10px] text-slate-300" data-testid="current-weather-observed-at">Provider update · {weatherTime(reading.observed_at)}</p>
              <p className="text-[10px] text-slate-400" data-testid="current-weather-provider-area">Provider area: {reading.provider_place} · Retrieved {weatherTime(reading.fetched_at)}</p>
            </> : <p role="status" className="max-w-2xl text-xs leading-5 text-slate-400" data-testid="current-weather-unavailable">{loading ? "Fetching real conditions for your selected Ladakh location…" : query.isError ? "Could not reach the weather service. No current readings are shown; simulation presets are still available." : data?.message}</p>}
            {data?.status === "stale" && !query.isError && <p className="text-xs text-amber-200" data-testid="current-weather-stale-warning">{data.message}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-[10px] text-slate-500" data-testid="current-weather-refresh-policy">Auto-checks · 10-min provider cache</span>
            <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()} className="border-sky-300/20 bg-sky-400/5 text-xs text-sky-200 transition-colors hover:bg-sky-400/15" data-testid="refresh-current-weather-button"><RefreshCw size={13} className={query.isFetching && !reducedMotion ? "animate-spin" : ""} />{query.isFetching ? "Checking…" : "Refresh"}</Button>
          </div>
        </div>
        <p className="border-t border-white/5 px-5 py-2.5 text-[10px] leading-5 text-slate-500" data-testid="current-weather-accuracy-note">Coordinate-based provider estimates, not an on-site sensor; mountain microclimates can differ. Humidity and wind are context only, not inputs to the thermal solver.</p>
      </CardContent>
    </Card>
  );
}