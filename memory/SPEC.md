# Thermal Atlas — Living Spec

## What it does
Thermal Atlas is a self-contained engineering dashboard for comparing passive shelter designs across Ladakh climate profiles. Users choose a location, enter geometry/material/opening inputs, run a deterministic thermal model, inspect temperature and heat-flow charts, compare material scenarios, and save/revisit completed analyses.

## Data model
- `AnalysisRequest`: location, ambient day/night temperatures, solar irradiance, sunshine hours, dimensions, orientation, opening area, wall/roof materials, thermal mass, and simulation duration.
- `AnalysisResult`: inputs, inside temperature series, solar energy, estimated heat loss, comfort hours, heat-flow breakdown, scenario comparisons, and recommendation.
- `SavedAnalysis`: named result persisted in MongoDB.

## Key flows
1. Choose a Ladakh preset or edit simulation controls.
2. Run analysis and review the animated dashboard charts and recommendation.
3. Save the current run and revisit it from Recent runs.

## Auth
No authentication; this is a single-user research/demo workspace.

## Integrations
- Optional live and historical weather use Open-Meteo's public forecast/archive endpoints (no API key in the non-commercial public tier), with graceful UI fallback when unavailable.
- CSV import accepts measured rows with `timestamp`/`datetime`/`time`, `temperature`/`temp`, and optional `solar_radiation`/`solar_irradiance` columns.
- ANSYS handoff exports the current analysis as a thermal time-series CSV and a JSON parameter package; these are browser downloads and do not require an external service.