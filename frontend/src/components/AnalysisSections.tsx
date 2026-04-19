// Raven Scout — v2 Analysis Section Cards
// All result section components in one module for maintainability

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AnalysisViewModel } from '../utils/analysisAdapter';
import type { TopSetup, MapObservation, KeyAssumption } from '../types/analysis';
import { getEvidenceColor, getRiskColor } from '../types/analysis';
import ConfidenceIndicator from './ConfidenceIndicator';
import RiskBadge from './RiskBadge';

const C = {
  primary: '#0B1F2A', secondary: '#3A4A52', accent: '#C89B3C',
  text: '#FFFFFF', muted: '#9AA4A9', stands: '#2E7D32',
  corridors: '#F57C00', routes: '#42A5F5', avoid: '#C62828',
  card: 'rgba(58, 74, 82, 0.35)', border: 'rgba(154, 164, 169, 0.15)',
};

// ============================================================
// SUMMARY CARD
// ============================================================
export function AnalysisSummaryCard({ vm }: { vm: AnalysisViewModel }) {
  const evColor = getEvidenceColor(vm.context.evidence_level);
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Ionicons name="analytics" size={18} color={C.accent} />
        <Text style={s.cardTitle}>ANALYSIS SUMMARY</Text>
      </View>
      {/* Badges row */}
      <View style={s.badgeRow}>
        <View style={[s.badge, { backgroundColor: `${evColor}18`, borderColor: `${evColor}40` }]}>
          <View style={[s.badgeDot, { backgroundColor: evColor }]} />
          <Text style={[s.badgeText, { color: evColor }]}>{vm.context.evidence_level.toUpperCase()}</Text>
        </View>
        {vm.context.used_multi_image_correlation && (
          <View style={[s.badge, { backgroundColor: 'rgba(66,165,245,0.12)', borderColor: 'rgba(66,165,245,0.3)' }]}>
            <Ionicons name="images" size={10} color={C.routes} />
            <Text style={[s.badgeText, { color: C.routes }]}>MULTI-IMAGE</Text>
          </View>
        )}
        <View style={[s.badge, { backgroundColor: 'rgba(58,74,82,0.5)', borderColor: C.border }]}>
          <Text style={[s.badgeText, { color: C.muted }]}>{vm.context.image_count} IMAGE{vm.context.image_count !== 1 ? 'S' : ''}</Text>
        </View>
      </View>
      <Text style={s.summaryText}>{vm.summary}</Text>
      {vm.hasConfidenceSummary && (
        <View style={s.confidenceSection}>
          <ConfidenceIndicator value={vm.confidenceSummary.overall_confidence} />
          {vm.confidenceSummary.main_limitations.length > 0 && (
            <View style={s.limitationsList}>
              {vm.confidenceSummary.main_limitations.map((l, i) => (
                <View key={i} style={s.limitationRow}>
                  <Ionicons name="alert-circle-outline" size={12} color={C.muted} />
                  <Text style={s.limitationText}>{l}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================
// TOP SETUPS SECTION
// ============================================================
export function TopSetupsSection({ setups }: { setups: TopSetup[] }) {
  if (setups.length === 0) return (
    <View style={s.card}><View style={s.cardHeader}><Ionicons name="flag" size={18} color={C.accent} /><Text style={s.cardTitle}>TOP SETUPS</Text></View><Text style={s.emptyText}>No tactical setups identified</Text></View>
  );
  return (
    <View style={s.sectionGap}>
      <Text style={s.sectionLabel}>TOP SETUPS</Text>
      {setups.map(setup => <TopSetupCard key={setup.rank} setup={setup} />)}
    </View>
  );
}

function TopSetupCard({ setup }: { setup: TopSetup }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity style={s.setupCard} onPress={() => setExpanded(!expanded)} activeOpacity={0.8} testID={`setup-card-${setup.rank}`}>
      <View style={s.setupHeader}>
        <View style={s.rankCircle}><Text style={s.rankText}>{setup.rank}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.setupName}>{setup.setup_name}</Text>
          <Text style={s.setupType}>{setup.setup_type.toUpperCase()}</Text>
        </View>
        <ConfidenceIndicator value={setup.confidence} size="small" showBar={false} />
      </View>
      {/* Risk pills */}
      <View style={s.riskRow}>
        <RiskBadge level={setup.wind_risk} label={`Wind: ${setup.wind_risk}`} />
        <RiskBadge level={setup.thermals_risk} label={`Thermals: ${setup.thermals_risk}`} />
        <RiskBadge level={setup.pressure_risk} label={`Pressure: ${setup.pressure_risk}`} />
      </View>
      {setup.best_window ? <Text style={s.setupMeta}>Best: {setup.best_window}</Text> : null}
      {/* Expanded details */}
      {expanded && (
        <View style={s.setupDetails}>
          {setup.target_movement ? <DetailRow icon="paw" label="Movement" value={setup.target_movement} /> : null}
          {setup.shot_opportunity ? <DetailRow icon="locate" label="Shot" value={setup.shot_opportunity} /> : null}
          {setup.entry_strategy ? <DetailRow icon="enter" label="Entry" value={setup.entry_strategy} accent /> : null}
          {setup.exit_strategy ? <DetailRow icon="exit" label="Exit" value={setup.exit_strategy} accent /> : null}
          {setup.why_this_works.length > 0 && (
            <View style={s.whySection}>
              <Text style={s.whyLabel}>WHY THIS WORKS</Text>
              {setup.why_this_works.map((w, i) => (
                <View key={i} style={s.whyRow}>
                  <Ionicons name="checkmark-circle" size={14} color={C.stands} />
                  <Text style={s.whyText}>{w}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
      <View style={s.expandHint}>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
      </View>
    </TouchableOpacity>
  );
}

function DetailRow({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.detailRow}>
      <Ionicons name={icon as any} size={14} color={accent ? C.accent : C.muted} />
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

// ============================================================
// WIND ANALYSIS CARD
// ============================================================
export function WindAnalysisCard({ vm }: { vm: AnalysisViewModel }) {
  const wn = vm.windNotes;
  const bt = vm.bestTime;
  if (!vm.hasWindNotes && !bt.primary_window) return null;
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Ionicons name="compass" size={18} color={C.routes} />
        <Text style={s.cardTitle}>WIND & TIMING</Text>
      </View>
      {wn.prevailing_wind_analysis ? <Text style={s.bodyText}>{wn.prevailing_wind_analysis}</Text> : null}
      {wn.danger_zones.length > 0 && (
        <View style={s.dangerSection}>
          {wn.danger_zones.map((dz, i) => (
            <View key={i} style={s.dangerRow}>
              <Ionicons name="warning" size={12} color={C.avoid} />
              <Text style={[s.dangerText]}>{dz}</Text>
            </View>
          ))}
        </View>
      )}
      {wn.best_downwind_sides.length > 0 && (
        <View style={s.downwindRow}>
          <Ionicons name="checkmark-circle" size={14} color={C.stands} />
          <Text style={s.downwindText}>Best sides: {wn.best_downwind_sides.join(', ')}</Text>
        </View>
      )}
      <RiskBadge level={wn.wind_shift_risk} label={`Shift risk: ${wn.wind_shift_risk}`} />
      {/* Best Time */}
      {bt.primary_window ? (
        <View style={s.timeSection}>
          <View style={s.timeRow}><Ionicons name="time" size={14} color={C.accent} /><Text style={s.timeLabel}>Primary:</Text><Text style={s.timeValue}>{bt.primary_window}</Text></View>
          {bt.secondary_window ? <View style={s.timeRow}><Ionicons name="time-outline" size={14} color={C.muted} /><Text style={s.timeLabel}>Backup:</Text><Text style={s.timeValue}>{bt.secondary_window}</Text></View> : null}
          {bt.explanation ? <Text style={s.timeExplanation}>{bt.explanation}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

// ============================================================
// MAP OBSERVATIONS
// ============================================================
export function MapObservationsSection({ observations }: { observations: MapObservation[] }) {
  if (observations.length === 0) return null;
  return (
    <View style={s.sectionGap}>
      <Text style={s.sectionLabel}>TERRAIN INTEL ({observations.length})</Text>
      {observations.map(obs => (
        <View key={obs.id} style={s.obsCard} testID={`obs-${obs.id}`}>
          <View style={s.obsHeader}>
            <View style={s.obsTypeBadge}><Text style={s.obsTypeText}>{obs.feature_type.replace(/_/g, ' ')}</Text></View>
            <ConfidenceIndicator value={obs.confidence} size="small" showBar={false} />
          </View>
          <Text style={s.obsDesc}>{obs.description}</Text>
          {obs.evidence.length > 0 && (
            <View style={s.evidenceList}>
              {obs.evidence.map((e, i) => (
                <View key={i} style={s.evidenceRow}><Ionicons name="eye" size={10} color={C.muted} /><Text style={s.evidenceText}>{e}</Text></View>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

// ============================================================
// ASSUMPTIONS CARD
// ============================================================
export function AssumptionsCard({ assumptions, limitations }: { assumptions: KeyAssumption[]; limitations: string[] }) {
  if (assumptions.length === 0 && limitations.length === 0) return null;
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Ionicons name="information-circle" size={18} color={C.muted} />
        <Text style={s.cardTitle}>ASSUMPTIONS & LIMITATIONS</Text>
      </View>
      {assumptions.map((a, i) => (
        <View key={i} style={s.assumptionRow}>
          <RiskBadge level={a.impact} />
          <Text style={s.assumptionText}>{a.assumption}</Text>
        </View>
      ))}
      {limitations.length > 0 && limitations.map((l, i) => (
        <View key={`l-${i}`} style={s.limitationRow}>
          <Ionicons name="alert-circle-outline" size={12} color={C.corridors} />
          <Text style={s.limitationText}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

// ============================================================
// SPECIES TIPS
// ============================================================
export function SpeciesTipsCard({ tips }: { tips: string[] }) {
  if (tips.length === 0) return null;
  return (
    <View style={s.card}>
      <View style={s.cardHeader}><Ionicons name="paw" size={18} color={C.accent} /><Text style={s.cardTitle}>SPECIES TIPS</Text></View>
      {tips.map((t, i) => (
        <View key={i} style={s.tipRow}><Ionicons name="leaf" size={12} color={C.stands} /><Text style={s.tipText}>{t}</Text></View>
      ))}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  sectionGap: { gap: 10, marginBottom: 14 },
  sectionLabel: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  summaryText: { color: C.text, fontSize: 15, lineHeight: 24 },
  confidenceSection: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(154,164,169,0.1)' },
  limitationsList: { marginTop: 8, gap: 4 },
  limitationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  limitationText: { color: C.muted, fontSize: 12, lineHeight: 17, flex: 1 },
  emptyText: { color: C.muted, fontSize: 13, fontStyle: 'italic' },
  bodyText: { color: C.text, fontSize: 14, lineHeight: 22, marginBottom: 10 },
  // Setup
  setupCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border },
  setupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  rankCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: C.primary, fontSize: 15, fontWeight: '900' },
  setupName: { color: C.text, fontSize: 16, fontWeight: '800' },
  setupType: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  riskRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  setupMeta: { color: C.accent, fontSize: 12, fontWeight: '600' },
  setupDetails: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(154,164,169,0.1)', gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailLabel: { color: C.muted, fontSize: 11, fontWeight: '700', width: 50, letterSpacing: 0.5 },
  detailValue: { color: C.text, fontSize: 13, lineHeight: 19, flex: 1 },
  whySection: { marginTop: 8 },
  whyLabel: { color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  whyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
  whyText: { color: C.text, fontSize: 12, lineHeight: 18, flex: 1 },
  expandHint: { alignItems: 'center', marginTop: 6 },
  // Wind
  dangerSection: { marginBottom: 10, gap: 4 },
  dangerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  dangerText: { color: '#EF9A9A', fontSize: 13, lineHeight: 19, flex: 1 },
  downwindRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  downwindText: { color: C.stands, fontSize: 13, fontWeight: '600' },
  timeSection: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(154,164,169,0.1)', gap: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeLabel: { color: C.muted, fontSize: 12, fontWeight: '600', width: 60 },
  timeValue: { color: C.text, fontSize: 13, fontWeight: '700', flex: 1 },
  timeExplanation: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  // Observations
  obsCard: { backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  obsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  obsTypeBadge: { backgroundColor: 'rgba(200,155,60,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  obsTypeText: { color: C.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  obsDesc: { color: C.text, fontSize: 13, lineHeight: 20 },
  evidenceList: { marginTop: 8, gap: 3 },
  evidenceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  evidenceText: { color: C.muted, fontSize: 11, lineHeight: 16, flex: 1 },
  // Assumptions
  assumptionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  assumptionText: { color: C.text, fontSize: 13, lineHeight: 19, flex: 1 },
  // Tips
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  tipText: { color: C.text, fontSize: 13, lineHeight: 20, flex: 1 },
});
