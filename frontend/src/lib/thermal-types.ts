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
}

export type UpdateAnalysisInput = <K extends keyof AnalysisRequest>(key: K, value: AnalysisRequest[K]) => void;