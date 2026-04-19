// Raven Scout — Analysis Adapter
// Normalizes v2/v1 API responses into stable UI view models

import type {
  AnalysisAPIResult, V2Analysis, AnalysisContext, MapObservation,
  V2Overlay, TopSetup, WindNotes, BestTime, KeyAssumption,
  ConfidenceSummary,
} from '../types/analysis';

export interface AnalysisViewModel {
  schemaVersion: string;
  summary: string;
  // Context
  context: AnalysisContext;
  confidenceSummary: ConfidenceSummary;
  // Sections
  mapObservations: MapObservation[];
  overlays: V2Overlay[];
  topSetups: TopSetup[];
  windNotes: WindNotes;
  bestTime: BestTime;
  keyAssumptions: KeyAssumption[];
  speciesTips: string[];
  // Booleans for conditional rendering
  hasMapObservations: boolean;
  hasTopSetups: boolean;
  hasWindNotes: boolean;
  hasAssumptions: boolean;
  hasSpeciesTips: boolean;
  hasConfidenceSummary: boolean;
  isV2: boolean;
}

const DEFAULT_CONTEXT: AnalysisContext = {
  image_count: 1, evidence_level: 'limited', used_multi_image_correlation: false,
};
const DEFAULT_WIND: WindNotes = {
  prevailing_wind_analysis: '', danger_zones: [], best_downwind_sides: [], wind_shift_risk: 'medium',
};
const DEFAULT_TIME: BestTime = { primary_window: '', secondary_window: '', explanation: '' };
const DEFAULT_CONFIDENCE: ConfidenceSummary = { overall_confidence: 0.5, main_limitations: [] };

export function buildAnalysisViewModel(result: AnalysisAPIResult): AnalysisViewModel {
  if (result.v2 && result.schema_version === 'v2') {
    return normalizeV2Analysis(result.v2);
  }
  return normalizeLegacyAnalysis(result);
}

function normalizeV2Analysis(v2: V2Analysis): AnalysisViewModel {
  const ctx = v2.analysis_context || DEFAULT_CONTEXT;
  const cs = v2.confidence_summary || DEFAULT_CONFIDENCE;
  const obs = v2.map_observations || [];
  const overlays = (v2.overlays || []).map((o, i) => ({
    id: o.id || `ov_${i + 1}`,
    type: o.type || 'stand',
    label: o.label || `Overlay ${i + 1}`,
    reason: o.reason || '',
    x_percent: o.x_percent ?? 50,
    y_percent: o.y_percent ?? 50,
    radius_percent: o.radius_percent ?? 5,
    confidence: o.confidence ?? 0.5,
    based_on: o.based_on || [],
  } as V2Overlay));

  const setups = (v2.top_setups || []).map((s, i) => ({
    rank: s.rank ?? i + 1,
    setup_name: s.setup_name || `Setup ${i + 1}`,
    setup_type: s.setup_type || 'stand',
    x_percent: s.x_percent ?? 50,
    y_percent: s.y_percent ?? 50,
    target_movement: s.target_movement || '',
    shot_opportunity: s.shot_opportunity || '',
    entry_strategy: s.entry_strategy || '',
    exit_strategy: s.exit_strategy || '',
    wind_risk: s.wind_risk || 'medium',
    thermals_risk: s.thermals_risk || 'unknown',
    pressure_risk: s.pressure_risk || 'medium',
    best_window: s.best_window || '',
    confidence: s.confidence ?? 0.5,
    why_this_works: s.why_this_works || [],
  } as TopSetup));

  const wn: WindNotes = typeof v2.wind_notes === 'object' && v2.wind_notes
    ? { ...DEFAULT_WIND, ...v2.wind_notes } : DEFAULT_WIND;
  const bt: BestTime = typeof v2.best_time === 'object' && v2.best_time
    ? { ...DEFAULT_TIME, ...v2.best_time } : DEFAULT_TIME;

  const ka: KeyAssumption[] = (v2.key_assumptions || []).map(a =>
    typeof a === 'string' ? { assumption: a, impact: 'medium' as const } : { assumption: a.assumption || '', impact: a.impact || 'medium' }
  );

  return {
    schemaVersion: 'v2',
    summary: v2.summary || '',
    context: ctx,
    confidenceSummary: cs,
    mapObservations: obs,
    overlays,
    topSetups: setups,
    windNotes: wn,
    bestTime: bt,
    keyAssumptions: ka,
    speciesTips: v2.species_tips || [],
    hasMapObservations: obs.length > 0,
    hasTopSetups: setups.length > 0,
    hasWindNotes: !!(wn.prevailing_wind_analysis || wn.danger_zones.length),
    hasAssumptions: ka.length > 0,
    hasSpeciesTips: (v2.species_tips || []).length > 0,
    hasConfidenceSummary: cs.overall_confidence > 0,
    isV2: true,
  };
}

function normalizeLegacyAnalysis(result: AnalysisAPIResult): AnalysisViewModel {
  const overlays: V2Overlay[] = (result.overlays || []).map((o, i) => ({
    id: `ov_${i + 1}`,
    type: (o.type || 'stand') as any,
    label: o.label || `Overlay ${i + 1}`,
    reason: o.reasoning || '',
    x_percent: o.x_percent ?? 50,
    y_percent: o.y_percent ?? 50,
    radius_percent: 5,
    confidence: o.confidence === 'high' ? 0.8 : o.confidence === 'medium' ? 0.5 : 0.3,
    based_on: [],
  }));

  const setups: TopSetup[] = (result.top_setups || []).map((s, i) => ({
    rank: i + 1,
    setup_name: typeof s === 'string' ? s : (s.setup_name || `Setup ${i + 1}`),
    setup_type: 'stand' as const,
    x_percent: 50, y_percent: 50,
    target_movement: '', shot_opportunity: '', entry_strategy: '', exit_strategy: '',
    wind_risk: 'medium' as const, thermals_risk: 'unknown' as const, pressure_risk: 'medium' as const,
    best_window: '', confidence: 0.5, why_this_works: [],
  }));

  const windStr = typeof result.wind_notes === 'string' ? result.wind_notes : '';
  const timeStr = typeof result.best_time === 'string' ? result.best_time : '';

  return {
    schemaVersion: 'v1',
    summary: result.summary || '',
    context: DEFAULT_CONTEXT,
    confidenceSummary: DEFAULT_CONFIDENCE,
    mapObservations: [],
    overlays,
    topSetups: setups,
    windNotes: { ...DEFAULT_WIND, prevailing_wind_analysis: windStr },
    bestTime: { ...DEFAULT_TIME, primary_window: timeStr },
    keyAssumptions: (result.key_assumptions || []).map(a =>
      typeof a === 'string' ? { assumption: a, impact: 'medium' as const } : a
    ),
    speciesTips: result.species_tips || [],
    hasMapObservations: false,
    hasTopSetups: setups.length > 0,
    hasWindNotes: !!windStr,
    hasAssumptions: (result.key_assumptions || []).length > 0,
    hasSpeciesTips: (result.species_tips || []).length > 0,
    hasConfidenceSummary: false,
    isV2: false,
  };
}
