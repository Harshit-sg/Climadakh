"""Version 2: single-zone effective-capacitance, energy-conserving screening model.

Not a validated building simulator. Each 300 s interval has frozen forcing and
an exact RC solution; its mean temperature is integrated for signed heat flows.
"""
import math
from fastapi import HTTPException
from lib.materials import MATERIALS
from models.analysis import AnalysisRequest, AnalysisResult, ChartPoint, HeatFlow, ScenarioResult
from models.thermal import EnergyBalancePoint, ModelInfo, PhysicsInputs, TemperatureRangePoint

STEP = 300
STEPS_PER_HOUR = 3600 // STEP
FLOW_NAMES = ["Walls", "Roof", "Floor", "Openings", "Ventilation", "Thermal bridges"]
FLOW_KEYS = ["walls_out", "roof_out", "floor_out", "openings_out", "ventilation_out", "bridges_out"]
COLORS = ["#fb923c", "#38bdf8", "#a3b18a", "#fb7185", "#2dd4bf", "#cbd5e1"]
ALTITUDES = {"Leh": 3500, "Kargil": 2676, "Nubra Valley": 3048, "Pangong": 4350}


def validate_request(req: AnalysisRequest) -> None:
    physics = req.physics or PhysicsInputs()
    for key in (req.wall_material, req.roof_material):
        if key not in MATERIALS:
            raise HTTPException(422, "Unknown material. Choose a material from the catalogue.")
    for key in (physics.wall_insulation_id, physics.roof_insulation_id):
        if key and (key not in MATERIALS or MATERIALS[key].category != "Insulation"):
            raise HTTPException(422, "Choose an insulation material for an added insulation layer.")
    if req.location not in ALTITUDES:
        raise HTTPException(422, "Choose a supported Ladakh location.")
    if not all(math.isfinite(t) and -80 <= t <= 60 for t in (req.ambient_day, req.ambient_night)):
        raise HTTPException(422, "Ambient reference temperatures must be finite and between -80 and 60 °C.")
    if req.ambient_day < req.ambient_night:
        raise HTTPException(422, "Day reference temperature must not be below the night reference.")
    wall_area = 2 * (req.dimensions.length + req.dimensions.width) * req.dimensions.height
    if req.opening_area > wall_area:
        raise HTTPException(422, "Opening area cannot exceed gross wall area. Saved legacy results remain unchanged.")


def _parameters(req: AnalysisRequest):
    p = (req.physics or PhysicsInputs()).model_copy(deep=True)
    wall, roof = MATERIALS[req.wall_material], MATERIALS[req.roof_material]
    p.wall_thickness_mm = p.wall_thickness_mm or wall.default_thickness_mm
    p.roof_thickness_mm = p.roof_thickness_mm or roof.default_thickness_mm
    if p.ground_temperature_c is None:
        p.ground_temperature_c = (req.ambient_day + req.ambient_night) / 2
    if p.initial_temperature_c is None:
        p.initial_temperature_c = req.ambient_night
    floor = req.dimensions.length * req.dimensions.width
    walls = 2 * (req.dimensions.length + req.dimensions.width) * req.dimensions.height - req.opening_area
    volume = floor * req.dimensions.height
    wall_r = .13 + p.wall_thickness_mm / 1000 / wall.conductivity_w_m_k + .04
    roof_r = .10 + p.roof_thickness_mm / 1000 / roof.conductivity_w_m_k + .04
    snapshots = {wall.id: wall, roof.id: roof}
    for side in ("wall", "roof"):
        key = getattr(p, f"{side}_insulation_id")
        if key:
            insulation = MATERIALS[key]
            snapshots[key] = insulation
            resistance = getattr(p, f"{side}_insulation_mm") / 1000 / insulation.conductivity_w_m_k
            if side == "wall": wall_r += resistance
            else: roof_r += resistance
    u_wall, u_roof = 1 / wall_r, 1 / roof_r
    pressure = 101325 * (1 - 2.25577e-5 * ALTITUDES[req.location]) ** 5.25588
    density = pressure / (287.05 * (273.15 + (req.ambient_day + req.ambient_night) / 2))
    capacity = density * volume * 1005 + floor * {"low": 10000, "medium": 30000, "high": 60000}[req.thermal_mass]
    for material, thickness, area in ((wall, p.wall_thickness_mm, walls), (roof, p.roof_thickness_mm, floor)):
        penetration = math.sqrt(material.conductivity_w_m_k * 86400 / (math.pi * material.density_kg_m3 * material.specific_heat_j_kg_k))
        capacity += .5 * min(thickness / 1000, penetration) * area * material.density_kg_m3 * material.specific_heat_j_kg_k
    conductances = [u_wall * walls, u_roof * floor, p.floor_u_value * floor, p.glazing_u_value * req.opening_area, density * 1005 * volume * p.air_changes_per_hour / 3600, p.thermal_bridge_w_k]
    return p, u_wall, u_roof, capacity, density, conductances, list(snapshots.values())


def simulate(req: AnalysisRequest, conductance_scale: float = 1, solar_scale: float = 1):
    p, u_wall, u_roof, capacity, density, conductances, snapshots = _parameters(req)
    conductances = [h * conductance_scale for h in conductances]
    h_total = sum(conductances)
    gamma = h_total * STEP / capacity
    decay_fraction = -math.expm1(-gamma)
    inside = p.initial_temperature_c
    orientation = {"south": 1.0, "south-east": .85, "east": .65, "west": .65, "north": .25}[req.orientation]
    sunrise = 12 - req.sunshine_hours / 2
    shape = []
    for i in range(24 * STEPS_PER_HOUR):
        start = max(i / STEPS_PER_HOUR, sunrise)
        end = min((i + 1) / STEPS_PER_HOUR, sunrise + req.sunshine_hours)
        integral = (math.cos(math.pi * (start - sunrise) / req.sunshine_hours) - math.cos(math.pi * (end - sunrise) / req.sunshine_hours)) * req.sunshine_hours / math.pi if end > start else 0.
        shape.append(max(0., integral * STEPS_PER_HOUR))
    # Exact normalisation of the sampled daily irradiance curve to input kWh/m²/day.
    solar_norm = req.solar_irradiance * 1000 * STEPS_PER_HOUR / sum(shape)
    glazed_area = req.opening_area * p.solar_heat_gain_coefficient * orientation
    # Simplified sol-air forcing through opaque surfaces, not window transmission.
    opaque_solar_area = p.solar_absorptance * .04 * (conductances[1] + conductances[0] * .5 * orientation)
    energy, points = [], []
    totals = dict.fromkeys(["solar_in", "internal_in", "ambient_in", "storage_change", *FLOW_KEYS], 0.)
    comfort = discomfort = average_inside = 0.
    for hour in range(req.duration_hours):
        values = dict.fromkeys(totals, 0.)
        ambient_sum = 0.
        for substep in range(STEPS_PER_HOUR):
            t = hour + (substep + .5) / STEPS_PER_HOUR
            ambient = (req.ambient_day + req.ambient_night) / 2 + (req.ambient_day - req.ambient_night) / 2 * math.cos(math.tau * (t - 15) / 24)
            irradiance = shape[(hour % 24) * STEPS_PER_HOUR + substep] * solar_norm
            solar_w = irradiance * (glazed_area + opaque_solar_area) * solar_scale
            boundary_temps = [ambient, ambient, p.ground_temperature_c, ambient, ambient, ambient]
            equilibrium = (solar_w + p.internal_gains_w + sum(h * temp for h, temp in zip(conductances, boundary_temps))) / h_total
            next_inside = inside + (equilibrium - inside) * decay_fraction
            mean_inside = equilibrium + (inside - equilibrium) * decay_fraction / gamma
            values["solar_in"] += solar_w * STEP / 3.6e6
            values["internal_in"] += p.internal_gains_w * STEP / 3.6e6
            for key, h, boundary in zip(FLOW_KEYS, conductances, boundary_temps):
                signed_out = h * (mean_inside - boundary) * STEP / 3.6e6
                values[key] += max(signed_out, 0.)
                values["ambient_in"] += max(-signed_out, 0.)
            values["storage_change"] += capacity * (next_inside - inside) / 3.6e6
            comfort += (18 <= mean_inside <= 26) / STEPS_PER_HOUR
            discomfort += max(18 - mean_inside, mean_inside - 26, 0.) / STEPS_PER_HOUR
            average_inside += mean_inside / (STEPS_PER_HOUR * req.duration_hours)
            ambient_sum += ambient / STEPS_PER_HOUR
            inside = next_inside
        error = values["solar_in"] + values["internal_in"] + values["ambient_in"] - sum(values[key] for key in FLOW_KEYS) - values["storage_change"]
        label = f"D{hour // 24 + 1} {hour % 24:02d}:00"
        energy.append(EnergyBalancePoint(hour=hour, label=label, **{key: round(value, 8) for key, value in values.items()}, balance_error=round(error, 12)))
        points.append(ChartPoint(hour=hour, label=label, ambient_temp=round(ambient_sum, 2), inside_temp=round(inside, 2), solar_gain=round(values["solar_in"], 6), heat_loss=round(sum(values[key] for key in FLOW_KEYS), 6)))
        for key in totals: totals[key] += values[key]
    return {"points": points, "energy": energy, "totals": totals, "comfort": comfort, "discomfort": discomfort, "average": average_inside, "parameters": (p, u_wall, u_roof, capacity, density, snapshots)}


def build_analysis(req: AnalysisRequest) -> AnalysisResult:
    validate_request(req)
    base = simulate(req)
    p, u_wall, u_roof, capacity, density, snapshots = base["parameters"]
    low = simulate(req, 1.2, .8)
    high = simulate(req, .8, 1.2)
    score = lambda degree_hours: max(0, min(100, round(100 * math.exp(-degree_hours / (15 * req.duration_hours)))))
    scenarios = []
    candidates = [("Selected assembly", req, "Your exact current wall, roof, thicknesses, and insulation.")]
    for label, insulation in (("Mineral wool retrofit", "mineral-wool"), ("PIR retrofit", "pir"), ("Cork retrofit", "cork")):
        settings = p.model_copy(update={"wall_insulation_id": insulation, "roof_insulation_id": insulation, "wall_insulation_mm": 100., "roof_insulation_mm": 100.})
        candidates.append((label, req.model_copy(update={"physics": settings}), "Same core and sky; added insulation replaced with 100 mm on walls and roof. Structural/fire suitability not assessed."))
    for name, scenario_req, note in candidates:
        run = base if scenario_req is req else simulate(scenario_req)
        scenarios.append(ScenarioResult(name=name, wall_material=scenario_req.wall_material, roof_material=scenario_req.roof_material, inside_temp=run["points"][-1].inside_temp, heat_loss=round(sum(run["totals"][key] for key in FLOW_KEYS), 3), comfort_hours=round(run["comfort"], 2), score=score(run["discomfort"]), note=note, wall_u_value=round(run["parameters"][1], 4), roof_u_value=round(run["parameters"][2], 4), discomfort_degree_hours=round(run["discomfort"], 3)))
    scenarios.sort(key=lambda scenario: scenario.discomfort_degree_hours)
    best = scenarios[0]
    assumptions = [
        "One well-mixed effective thermal node. Exact RC integration with 5-minute frozen forcing; hourly energy bins and end-of-hour indoor temperatures.",
        "U = 1/(Rsi + sum(thickness/conductivity) + Rse). Rsi walls 0.13, roof 0.10; Rse 0.04 m²K/W. Added insulation is exterior and continuous.",
        "Ventilation H = air density × 1005 × volume × ACH / 3600 W/K. Density uses standard-atmosphere pressure at the Ladakh preset altitude.",
        "Daily solar input is energy-normalised over the sunshine duration. Generic orientation factors: S 1, SE 0.85, E/W 0.65, N 0.25; not a measured vertical-plane irradiance model.",
        "Solar entry includes opening area × SHGC plus simplified opaque sol-air gain. All openings are treated as equivalent glazing, not open doors.",
        "Ambient references define an idealised repeating daily minimum/maximum cycle, peaking at 15:00. Imported/forecast averages are not a measured hourly simulation.",
        "Capacity uses half the daily penetration depth of the core layers plus floor-area internal storage of 10/30/60 kJ/m²K for low/medium/high mass. Added external insulation capacitance is neglected.",
        "Default initial temperature equals the night reference; default constant ground temperature equals the day/night mean. No warm-up or HVAC is assumed.",
        "Comfort index = 100 × exp(-discomfort degree-hours / (15 × duration)). It is a ranking aid, not energy efficiency or a comfort certification.",
    ]
    limitations = [
        "UNCALIBRATED: generic dry properties are not laboratory certificates, CE verification, or measured Ladakh sample data.",
        "The quoted laboratory/HFM/ITT uncertainties in user notes cannot be applied to shelter-temperature predictions without the study, specimens, boundary conditions, and calibration data.",
        "No resolved thermal bridges, moisture, snow, long-wave sky cooling, shading, 3D conduction, phase-change materials, or operative-temperature comfort calculation. A lumped bridge conductance is optional.",
        "Sensitivity envelope uses two illustrative ±20% conductance/solar perturbations, not a confidence interval, validated error bound, or a probability statement.",
        "Check manufacturer data, moisture/temperature dependence, fire and structural suitability, and compare monitored temperatures/heat flux over representative weather before design decisions.",
    ]
    info = ModelInfo(version="rc-energy-v2.0", timestep_seconds=STEP, wall_u_value=round(u_wall, 5), roof_u_value=round(u_roof, 5), heat_capacity_kj_k=round(capacity / 1000, 3), air_density_kg_m3=round(density, 5), max_balance_error_kwh=max(abs(point.balance_error) for point in base["energy"]), discomfort_degree_hours=round(base["discomfort"], 3), effective_inputs=p, material_snapshots=snapshots, assumptions=assumptions, limitations=limitations)
    return AnalysisResult(inputs=req, average_inside_temp=round(base["average"], 2), current_inside_temp=base["points"][-1].inside_temp, solar_energy_kwh=round(base["totals"]["solar_in"], 6), heat_loss_kwh=round(sum(base["totals"][key] for key in FLOW_KEYS), 6), comfort_hours=round(base["comfort"], 2), comfort_target="18–26 °C", efficiency_score=score(base["discomfort"]), chart_data=base["points"], heat_flows=[HeatFlow(name=name, value=round(base["totals"][key], 6), color=color) for name, key, color in zip(FLOW_NAMES, FLOW_KEYS, COLORS)], scenarios=scenarios, recommendation=best.name, recommendation_detail=f"Lowest modelled discomfort among these four tested assemblies: {best.discomfort_degree_hours:.1f} °C·h outside 18–26 °C. {best.note} This is a comparative screening result, not a validated optimum.", model_info=info, energy_balance=base["energy"], sensitivity=[TemperatureRangePoint(hour=i, low=min(a.inside_temp, b.inside_temp, c.inside_temp), high=max(a.inside_temp, b.inside_temp, c.inside_temp)) for i, (a, b, c) in enumerate(zip(base["points"], low["points"], high["points"]))])