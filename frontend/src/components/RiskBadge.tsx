import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getRiskColor } from '../types/analysis';

interface Props { level: string; label?: string; }

export default function RiskBadge({ level, label }: Props) {
  const color = getRiskColor(level);
  const display = label || level.charAt(0).toUpperCase() + level.slice(1);
  return (
    <View style={[styles.badge, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
});
