/**
 * Standalone map style picker — designed to render OUTSIDE / BELOW
 * the TacticalMapView WebView so its Pressable taps are never
 * intercepted by the parent responder system that protects the map's
 * pinch / pan from the surrounding ScrollView.
 *
 * Usage:
 *   const { styleId, setStyleId } = useMapStylePreference();
 *   <TacticalMapView controlledStyleId={styleId} onControlledStyleChange={setStyleId} showStyleSwitcher={false} />
 *   <MapStyleSwitcher styleId={styleId} onChange={setStyleId} onUpgradePress={...} />
 */
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { RAVEN_SCOUT_MAP_STYLES, type RavenScoutMapStyleId } from '../constants/mapStyles';
import { getAllowedMapStylesForPlan, normalizePlanId } from '../constants/planCapabilities';
import { useAuth } from '../hooks/useAuth';

interface MapStyleSwitcherProps {
  styleId: RavenScoutMapStyleId;
  onChange: (next: RavenScoutMapStyleId) => void;
  onUpgradePress?: () => void;
}

export function MapStyleSwitcher({ styleId, onChange, onUpgradePress }: MapStyleSwitcherProps) {
  const { user } = useAuth();
  const planId = normalizePlanId(user?.tier);
  const allowedStyleIds = useMemo(() => getAllowedMapStylesForPlan(planId), [planId]);
  const switcherStyles = useMemo(
    () => RAVEN_SCOUT_MAP_STYLES.filter(s => allowedStyleIds.includes(s.id)),
    [allowedStyleIds],
  );
  const isFreeTier = planId === 'free';

  if (isFreeTier) {
    return (
      <Pressable
        testID="map-style-upsell"
        accessibilityRole="button"
        accessibilityLabel="Upgrade to Core or Pro to unlock map styles"
        onPress={onUpgradePress}
        style={({ pressed }) => [styles.upsell, pressed && styles.upsellPressed]}
      >
        <Ionicons name="lock-closed" size={14} color={COLORS.accent} />
        <Text style={styles.upsellLabel}>UNLOCK MAP STYLES</Text>
        <Text style={styles.upsellSub}>Upgrade to Core or Pro</Text>
      </Pressable>
    );
  }

  if (switcherStyles.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.switcherContent}
        style={styles.switcher}
      >
        {switcherStyles.map((s) => {
          const active = styleId === s.id;
          return (
            <Pressable
              key={s.id}
              testID={`map-style-${s.id}`}
              accessibilityRole="button"
              accessibilityLabel={s.description}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.styleButton,
                active && styles.styleButtonActive,
                pressed && styles.styleButtonPressed,
              ]}
              onPress={() => onChange(s.id)}
              hitSlop={6}
            >
              <Ionicons
                name={s.icon as any}
                size={14}
                color={active ? COLORS.primary : COLORS.fogGray}
              />
              <Text style={[styles.styleLabel, active && styles.styleLabelActive]}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: 8, alignSelf: 'stretch' },
  switcher: { maxHeight: 48 },
  switcherContent: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(11, 31, 42, 0.92)',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(200, 155, 60, 0.35)',
    alignSelf: 'flex-start',
  },
  styleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 7,
    minHeight: 36,
  },
  styleButtonActive: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 6,
    elevation: 4,
  },
  styleButtonPressed: { opacity: 0.7 },
  styleLabel: {
    color: COLORS.fogGray,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  styleLabelActive: { color: COLORS.primary, fontWeight: '900' },
  upsell: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(11, 31, 42, 0.92)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(200, 155, 60, 0.55)',
    alignSelf: 'flex-start',
  },
  upsellPressed: { opacity: 0.78 },
  upsellLabel: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  upsellSub: { color: COLORS.fogGray, fontSize: 10, fontWeight: '600' },
});

export default MapStyleSwitcher;
