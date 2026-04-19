// Raven Scout — v2 Analysis Types

// --- Analysis Context ---
export interface AnalysisContext {
  image_count: number;
  evidence_level: 'limited' | 'moderate' | 'high';
  used_multi_image_correlation: boolean;
}

// --- Map Observation ---
export type FeatureType =
  | 'bedding_cover' | 'food_source' | 'water' | 'ridge' | 'saddle'
  | 'bench' | 'draw' | 'funnel' | 'edge' | 'crossing' | 'open_area'
  | 'road' | 'trail' | 'access_point' | 'pressure_zone' | 'unknown';

export interface MapObservation {
  id: string;
  feature_type: FeatureType;
  description: string;
  x_percent: number;
  y_percent: number;
  confidence: number;
  evidence: string[];
}

// --- Overlay (v2) ---
export interface V2Overlay {
  id: string;
  type: 'stand' | 'corridor' | 'access_route' | 'avoid';
  label: string;
  reason: string;
  x_percent: number;
  y_percent: number;
  radius_percent: number;
  confidence: number;
  based_on: string[];
}

// --- Top Setup ---
export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';
export type SetupType = 'stand' | 'saddle' | 'blind' | 'observation';

export interface TopSetup {
  rank: number;
  setup_name: string;
  setup_type: SetupType;
  x_percent: number;
  y_percent: number;
  target_movement: string;
  shot_opportunity: string;
  entry_strategy: string;
  exit_strategy: string;
  wind_risk: RiskLevel;
  thermals_risk: RiskLevel;
  pressure_risk: RiskLevel;
  best_window: string;
  confidence: number;
  why_this_works: string[];
}

// --- Wind Notes ---
export interface WindNotes {
  prevailing_wind_analysis: string;
  danger_zones: string[];
  best_downwind_sides: string[];
  wind_shift_risk: RiskLevel;
}

// --- Best Time ---
export interface BestTime {
  primary_window: string;
  secondary_window: string;
  explanation: string;
}

// --- Key Assumption ---
export interface KeyAssumption {
  assumption: string;
  impact: 'low' | 'medium' | 'high';
}

// --- Confidence Summary ---
export interface ConfidenceSummary {
  overall_confidence: number;
  main_limitations: string[];
}

// --- Full v2 Analysis ---
export interface V2Analysis {
  schema_version: string;
  analysis_context: AnalysisContext;
  map_observations: MapObservation[];
  overlays: V2Overlay[];
  summary: string;
  top_setups: TopSetup[];
  wind_notes: WindNotes;
  best_time: BestTime;
  key_assumptions: KeyAssumption[];
  species_tips: string[];
  confidence_summary: ConfidenceSummary;
}

// --- Legacy v1 Overlay ---
export interface V1Overlay {
  type: string;
  label: string;
  x_percent: number;
  y_percent: number;
  width_percent?: number;
  height_percent?: number;
  reasoning: string;
  confidence: string;
}

// --- API Result (from backend) ---
export interface AnalysisAPIResult {
  id: string;
  schema_version?: string;
  v2?: V2Analysis;
  // v1 compat fields (always present)
  overlays: V1Overlay[];
  summary: string;
  top_setups: any[];
  wind_notes: any;
  best_time: any;
  key_assumptions: any[];
  species_tips: string[];
}

// --- Confidence helpers ---
export type ConfidenceLevel = 'low' | 'moderate' | 'high';

export function getConfidenceLevel(val: number): ConfidenceLevel {
  if (val >= 0.7) return 'high';
  if (val >= 0.4) return 'moderate';
  return 'low';
}

export function getConfidenceLabel(val: number): string {
  if (val >= 0.7) return 'High';
  if (val >= 0.4) return 'Moderate';
  return 'Low';
}

export function getConfidenceColor(val: number): string {
  if (val >= 0.7) return '#2E7D32';
  if (val >= 0.4) return '#C89B3C';
  return '#9AA4A9';
}

export function getEvidenceColor(level: string): string {
  if (level === 'high') return '#2E7D32';
  if (level === 'moderate') return '#C89B3C';
  return '#9AA4A9';
}

export function getRiskColor(level: string): string {
  if (level === 'high') return '#C62828';
  if (level === 'medium') return '#F57C00';
  if (level === 'low') return '#2E7D32';
  return '#9AA4A9';
}
