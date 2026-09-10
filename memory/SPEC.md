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
No live external weather integration. The default area profiles are seeded in the frontend and the simulation is calculated by the FastAPI model endpoint.