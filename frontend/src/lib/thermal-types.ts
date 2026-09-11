// Mirrors AnalysisRequest and ShelterDimensions in backend/models/analysis.py.
export interface ShelterDimensions {
  length: number;
  width: number;
  height: number;
}

export interface AnalysisRequest {
  location: string;
  ambient_day: number;
  ambient_night: number;
  solar_irradiance: number;
  sunshine_hours: number;
  dimensions: ShelterDimensions;
  orientation: "south" | "south-east" | "east" | "west" | "north";
  opening_area: number;
  wall_material: string;
  roof_material: string;
  thermal_mass: "low" | "medium" | "high";
  duration_hours: number;
  physics?: PhysicsInputs | null;
}

export type UpdateAnalysisInput = <K extends keyof AnalysisRequest>(key: K, value: AnalysisRequest[K]) => void;

export interface MaterialDefinition {
  id: string;
  label: string;
  category: "Earth & masonry" | "Structural" | "Insulation";
  conductivity_w_m_k: number;
  density_kg_m3: number;
  specific_heat_j_kg_k: number;
  default_thickness_mm: number;
  description: string;
  source_url: string;
  property_basis: string;
}

export interface PhysicsInputs {
  wall_thickness_mm: number | null;
  roof_thickness_mm: number | null;
  wall_insulation_id: string | null;
  roof_insulation_id: string | null;
  wall_insulation_mm: number;
  roof_insulation_mm: number;
  air_changes_per_hour: number;
  glazing_u_value: number;
  solar_heat_gain_coefficient: number;
  floor_u_value: number;
  ground_temperature_c: number | null;
  initial_temperature_c: number | null;
  internal_gains_w: number;
  thermal_bridge_w_k: number;
  solar_absorptance: number;
}

export const DEFAULT_PHYSICS: PhysicsInputs = {
  wall_thickness_mm: null, roof_thickness_mm: null,
  wall_insulation_id: null, roof_insulation_id: null,
  wall_insulation_mm: 100, roof_insulation_mm: 100,
  air_changes_per_hour: .5, glazing_u_value: 2.8,
  solar_heat_gain_coefficient: .6, floor_u_value: .35,
  ground_temperature_c: null, initial_temperature_c: null,
  internal_gains_w: 0, thermal_bridge_w_k: 0, solar_absorptance: .6,
};

export function physicsValid(p: PhysicsInputs | null | undefined): boolean {
  if (!p) return true;
  const range = (v: number | null, min: number, max: number) => v === null || (Number.isFinite(v) && v >= min && v <= max);
  return range(p.wall_thickness_mm, .001, 1500) && range(p.roof_thickness_mm, .001, 1500)
    && range(p.wall_insulation_mm, 0, 500) && range(p.roof_insulation_mm, 0, 500)
    && range(p.air_changes_per_hour, 0, 10) && range(p.glazing_u_value, .001, 10)
    && range(p.solar_heat_gain_coefficient, 0, 1) && range(p.floor_u_value, .001, 10)
    && range(p.ground_temperature_c, -80, 60) && range(p.initial_temperature_c, -80, 60)
    && range(p.internal_gains_w, 0, 10000) && range(p.thermal_bridge_w_k, 0, 1000)
    && range(p.solar_absorptance, 0, 1);
}

export interface EnergyBalancePoint {
  hour: number; label: string;
  solar_in: number; internal_in: number; ambient_in: number;
  walls_out: number; roof_out: number; floor_out: number;
  openings_out: number; ventilation_out: number; bridges_out: number;
  storage_change: number; balance_error: number;
}

export interface TemperatureRangePoint { hour: number; low: number; high: number }

export interface ModelInfo {
  version: string;
  validation_status: "uncalibrated";
  timestep_seconds: number;
  wall_u_value: number;
  roof_u_value: number;
  heat_capacity_kj_k: number;
  air_density_kg_m3: number;
  max_balance_error_kwh: number;
  discomfort_degree_hours: number;
  effective_inputs: PhysicsInputs;
  material_snapshots: MaterialDefinition[];
  assumptions: string[];
  limitations: string[];
}

export interface ChartPoint { hour: number; label: string; ambient_temp: number; inside_temp: number; solar_gain: number; heat_loss: number }
export interface HeatFlow { name: string; value: number; color: string }
export interface ScenarioResult {
  name: string; wall_material: string; roof_material: string; inside_temp: number;
  heat_loss: number; comfort_hours: number; score: number; note: string;
  wall_u_value?: number | null; roof_u_value?: number | null; discomfort_degree_hours?: number | null;
}
export interface AnalysisResult {
  id: string; created_at: string; inputs: AnalysisRequest;
  average_inside_temp: number; current_inside_temp: number; solar_energy_kwh: number;
  heat_loss_kwh: number; comfort_hours: number; comfort_target: string; efficiency_score: number;
  chart_data: ChartPoint[]; heat_flows: HeatFlow[]; scenarios: ScenarioResult[];
  recommendation: string; recommendation_detail: string;
  model_info?: ModelInfo | null;
  energy_balance?: EnergyBalancePoint[];
  sensitivity?: TemperatureRangePoint[];
}