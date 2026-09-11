# Thermal Atlas — Living Spec

## What it does
Thermal Atlas is a self-contained engineering dashboard for comparing passive shelter designs across Ladakh climate profiles. Users choose a location, enter geometry/material/opening inputs, run a deterministic thermal model, inspect temperature and heat-flow charts, compare material scenarios, and save/revisit completed analyses.

## Data model
- `AnalysisRequest`: location, ambient day/night temperatures, solar irradiance, sunshine hours, dimensions, orientation, opening area, wall/roof materials, thermal mass, and simulation duration.
- `AnalysisResult`: inputs, inside temperature series, solar energy, estimated heat loss, comfort hours, heat-flow breakdown, scenario comparisons, and recommendation.
- `SavedAnalysis`: named result persisted in MongoDB.

## Key flows
1. Use the wide site-level workspace tabs: Overview, Shelter geometry, Solar & climate, Materials, Analysis, Saved runs. The selected section is deep-linkable through `?tab=geometry` etc.; browser back/forward works without replacing shared in-memory draft state.
2. Choose a Ladakh preset and simulation duration from the shared context bar. Geometry provides dimensions/openings, an animated proportional isometric preview, and live footprint/volume/wall-area readouts. Solar provides orientation with an animated compass, daily irradiation, sunshine duration, day/night ambient inputs, weather series tools, and current OpenWeatherMap conditions. Materials provides wall/roof choices and thermal mass with a descriptive guide.
3. Inputs stay intact while switching tabs. Geometry → Solar → Materials → Analysis next buttons and Overview shortcuts provide additional navigation. All tabs are keyboard-accessible and wrap on narrow screens. The old narrow all-in-one sidebar is removed; each section uses the workspace width.
4. Run analysis from the persistent header or Analysis tab and review the existing charts, scenarios, recommendation, Claude review, and ANSYS downloads. Input edits mark existing results as outdated until rerun. Exports keep the completed result’s location rather than the edited draft location.
5. Save the completed run and open it from the dedicated Saved runs fieldbook; opening restores all inputs/results and navigates to Analysis. Navigation does not persist an unsaved draft across a full browser reload; saved runs remain in MongoDB.

## UI update boundaries
- No thermal solver or API contract changes in the workspace-tab update. Shared TS AnalysisRequest/ShelterDimensions moved to `frontend/src/lib/thermal-types.ts`, still mirroring backend models.
- Geometry remains rectangular; the preview is illustrative and does not draw individual openings. Solar compass shows selected orientation, not real-time astronomical sun position. Humidity and wind remain contextual.
- Geometry/solar limits follow existing API limits; the run buttons disable while numeric inputs are invalid. Existing analyses remain accessible. No new integrations or authentication.

## Auth
No authentication; this is a single-user research/demo workspace.

## Integrations
- Optional live and historical weather use Open-Meteo's public forecast/archive endpoints (no API key in the non-commercial public tier), with graceful UI fallback when unavailable.
- CSV import accepts measured rows with `timestamp`/`datetime`/`time`, `temperature`/`temp`, and optional `solar_radiation`/`solar_irradiance` columns.
- ANSYS handoff exports the current analysis as a thermal time-series CSV and a JSON parameter package; these are browser downloads and do not require an external service.
- Claude Sonnet 4.6 is integrated through the Emergent-managed Anthropic path. A streamed `/api/ai/review` route supports design review, result explanation, and study-note modes. Completed responses are stored in `ai_reviews`; Claude is explicitly framed as an engineering assistant, not a certified design authority or ANSYS replacement.

## Current conditions — OpenWeatherMap
- `GET /api/weather/current?location=Leh` uses OpenWeatherMap Current Weather 2.5 in metric units. Supported presets: Leh (34.1526, 77.5771), Kargil (34.5539, 76.1349), Nubra Valley / Diskit (34.5512, 77.5485), Pangong (33.7595, 78.6676). Nubra's former coordinates were corrected for both weather providers.
- `CurrentWeatherReading` contains temperature °C, relative humidity %, wind speed m/s, optional wind direction, provider description/place, UTC observation and fetch timestamps. `CurrentWeatherResponse` contains location/coordinates, source, availability (`available`/`stale`/`unavailable`), optional reading, checked/next-refresh timestamps, and a safe message. Matching TS interfaces live in `frontend/src/lib/current-weather.ts`.
- CurrentWeather card responds automatically to climate selection and loading saved runs, supports manual refresh, checks every minute while visible, and uses a 10-minute per-location server cache with request coalescing. The displayed provider update is in Asia/Kolkata (IST), distinct from the fetch time.
- Provider observations older than one hour are labelled older readings; no reading older than three hours is shown. Refresh failures serve only clearly marked stale provider data within that limit, or an explicit unavailable state. No invented data, winter presets, Open-Meteo archive readings, or imported rows are used as current readings. Invalid locations return 422.
- Server-only `OPENWEATHER_API_KEY` lives in `backend/.env`; never return or log it. httpx request-URL INFO logging is disabled to prevent query-string key disclosure. API key was user-supplied; no login credentials are needed.
- Current weather is contextual, not a replacement for the thermal model's day/night series. Humidity/wind do not change the reduced-order solver. Open-Meteo and measured CSV/ANSYS workflows remain separate and functional. This is coordinate-based provider weather, not guaranteed site-specific sensor accuracy.