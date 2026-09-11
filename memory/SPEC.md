# Climadakh — Living Spec

## What it does
Climadakh (formerly Thermal Atlas) is a self-contained engineering dashboard for comparing passive shelter designs across Ladakh climate profiles. Users choose a location, enter geometry/material/opening inputs, run a deterministic thermal model, inspect temperature and heat-flow charts, compare material scenarios, and save/revisit completed analyses.

## Brand
- Public name: **Climadakh**. The header uses a warm-ivory Playfair Display Variable wordmark, with the tagline “Climate · Shelter · Ladakh” and restrained reveal/hover motion. Existing scientific UI typography remains unchanged.
- The wordmark has the exact credit “by team vijay” immediately beside it, baseline-aligned in smaller IBM Plex Sans text (10px mobile / 11px desktop).
- User will provide the logo later; no custom logo has been generated. Header currently uses the wordmark alone. Site metadata, section branding, accessibility label, API greeting, and new Claude review prompts use Climadakh.
- Saved analyses/review history are not rewritten. Machine-readable `thermal-atlas-ansys-handoff-v1/v2` identifiers and internal session prefixes remain for compatibility. Public preview URL stays https://highalt-thermal-app.preview.emergentagent.com.

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
- Shared TS contracts live in `frontend/src/lib/thermal-types.ts`, mirroring backend models. Workspace tabs retain shared draft state; the later thermal-v2 feature adds backwards-compatible optional result/input fields (below).
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

## Expanded materials and thermal model v2
- `GET /api/materials` serves 18 definitions: the original five IDs plus brick, concrete, AAC, timber, mineral/glass wool, EPS, XPS, PIR, PUR, aerogel, cork, hemp fibre. Each includes SI conductivity, density, specific heat, a default layer thickness, reference URL, and explicit property-basis caveat. Generic table data and scenario estimates are not certified local samples.
- Materials has catalogue search/category filters, inspection with sources, editable core thickness, optional exterior insulation for wall/roof, derived U-values, and explicit heat-balance settings: ACH, glazing U/SHGC, floor U, initial/ground temperatures, sensible internal gain, bridge conductance, and solar absorptance.
- New `/api/analyze` calls use `lib/thermal_solver.py` (`rc-energy-v2.0`). One effective thermal node, layer-series resistance including surface films, standard-atmosphere Ladakh density, actual U·A·ΔT and ACH heat flows, exact RC solution per 300-second frozen-forcing interval, and signed environmental exchanges. No arbitrary temperature clamps or allocated pathway percentages.
- Solar uses a sunshine-window sine curve integrated/normalised to entered daily kWh/m², generic orientation factors and simplified sol-air opaque absorption. Idealised daily ambient references are not measured hourly input. Internal storage uses an explicitly approximate active core depth plus low/medium/high internal-mass assumptions. Ground is a constant boundary. See run-specific `model_info.assumptions` and `limitations`.
- `AnalysisRequest.physics` is optional; older clients and saved inputs remain readable. New results append `model_info`, hourly `energy_balance`, and `sensitivity`. Snapshots store the material properties and resolved settings used by each new run. No migration, update, deletion, or automatic recomputation of existing analyses is performed.
- `memory/data_preservation.json` records a canonical SHA256 over 14 pre-existing Mongo analyses and their IDs. This is a read-only regression baseline, not a deletion list. Legacy studies show an explicit notice and their original values/charts; no synthetic ledger or sensitivity is invented for them.
- Graphs: inside/ambient with target comfort band, optional illustrative sensitivity envelope, interactive heat-loss donut, hourly/cumulative signed stacked energy ledger, selected-hour slider, six real loss pathways, animated energy flow, and numerical closure display. Closure is explicitly NOT empirical accuracy. ±20% conductance/solar perturbations are not a confidence interval.
- Four scenario comparisons rank selected assembly and 100 mm mineral-wool/PIR/cork retrofits on the same core by discomfort degree-hours; the stored `efficiency_score` field becomes a labelled comfort ranking index for v2, not a physical efficiency percentage.
- JSON ANSYS exports retain v1 for legacy runs, use v2 plus metadata/ledger/sensitivity for new runs. CSV keeps original columns and appends energy-ledger columns for v2 only. Saved lists retain access to up to 1000 records.
- User provided general descriptions of laboratory/HFM/ITT validation but no specimen data, source study links, or measured shelter temperatures. No quoted precision percentages are adopted. Model remains UNCALIBRATED and requires manufacturer/local test properties and field calibration; no CE/ASTM/ISO certification or guaranteed prediction accuracy is claimed.