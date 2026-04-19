import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getConfidenceLabel, getConfidenceColor } from '../types/analysis';

interface Props {
  value: number;
  size?: 'small' | 'medium';
  showBar?: boolean;
}

const C = { primary: '#0B1F2A', fogGray: '#9AA4A9' };

export default function ConfidenceIndicator({ value, size = 'medium', showBar = true }: Props) {
  const color = getConfidenceColor(value);
  const label = getConfidenceLabel(value);
  const pct = Math.round(value * 100);
  const isSmall = size === 'small';

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.label, isSmall && styles.labelSmall, { color }]}>{label}</Text>
        <Text style={[styles.pct, isSmall && styles.pctSmall]}>{pct}%</Text>
      </View>
      {showBar && (
        <View style={[styles.barTrack, isSmall && styles.barTrackSmall]}>
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }, isSmall && styles.barFillSmall]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  labelSmall: { fontSize: 10 },
  pct: { color: C.fogGray, fontSize: 11, fontWeight: '600' },
  pctSmall: { fontSize: 9 },
  barTrack: { height: 4, backgroundColor: 'rgba(58, 74, 82, 0.5)', borderRadius: 2, overflow: 'hidden' },
  barTrackSmall: { height: 3 },
  barFill: { height: '100%', borderRadius: 2 },
  barFillSmall: { height: '100%' },
});
