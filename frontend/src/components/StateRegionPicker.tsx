/**
 * State + Region picker for the New Hunt → Conditions step.
 *
 * - Renders a tap-to-open modal with a searchable list of US states.
 * - Once a state is selected, the region(s) assigned to that state
 *   are resolved from `STATE_TO_HUNTING_REGIONS`. If the state has
 *   exactly one region, it is auto-selected and the region row
 *   simply displays it. If the state has multiple regions (forward-
 *   compat for GPS-based sub-region resolution), the row becomes a
 *   tap-to-open modal too.
 * - Both selections are surfaced via callbacks; the parent screen
 *   owns persistence.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  Modal,
  StyleSheet,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import {
  US_STATES,
  HUNTING_REGION_LABELS,
  regionsForState,
  defaultRegionForState,
  type HuntingRegionId,
} from '../constants/huntingRegions';

interface Props {
  stateCode: string | null;
  onStateChange: (next: string | null) => void;
  regionId: HuntingRegionId | null;
  onRegionChange: (next: HuntingRegionId | null) => void;
}

export default function StateRegionPicker({
  stateCode,
  onStateChange,
  regionId,
  onRegionChange,
}: Props) {
  const [stateModalOpen, setStateModalOpen] = useState(false);
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredStates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return US_STATES;
    return US_STATES.filter(
      s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().startsWith(q),
    );
  }, [search]);

  const selectedState = useMemo(
    () => US_STATES.find(s => s.code === stateCode) || null,
    [stateCode],
  );

  const regionOptions = useMemo(() => regionsForState(stateCode), [stateCode]);
  const hasMultipleRegions = regionOptions.length > 1;
  const onlyRegion = regionOptions.length === 1 ? regionOptions[0] : null;

  // Auto-select the single region when the state has exactly one — and
  // auto-clear the region when the state is cleared. We keep this here
  // (not in a useEffect) so the parent only ever sees consistent
  // (state, region) pairs in its state.
  const handleStateSelected = (code: string | null) => {
    onStateChange(code);
    setStateModalOpen(false);
    setSearch('');
    if (!code) {
      onRegionChange(null);
      return;
    }
    const def = defaultRegionForState(code);
    // For single-region states, lock the region to the canonical default.
    // For multi-region states, prefer to keep an existing pick if it
    // is still valid for the new state, otherwise reset to the default.
    if (regionsForState(code).length === 1) {
      onRegionChange(def);
    } else if (regionId && regionsForState(code).includes(regionId)) {
      // keep current
    } else {
      onRegionChange(def);
    }
  };

  return (
    <View>
      {/* STATE row */}
      <Text style={styles.fieldLabel}>STATE (OPTIONAL)</Text>
      <Pressable
        testID="state-picker-trigger"
        accessibilityRole="button"
        accessibilityLabel="Select state"
        onPress={() => setStateModalOpen(true)}
        style={({ pressed }) => [styles.dropdownField, pressed && styles.dropdownFieldPressed]}
      >
        <Ionicons name="location-outline" size={16} color={COLORS.fogGray} />
        <Text style={[styles.dropdownValue, !selectedState && styles.dropdownPlaceholder]}>
          {selectedState ? selectedState.name : 'Select a state'}
        </Text>
        {selectedState && (
          <TouchableOpacity
            testID="state-picker-clear"
            onPress={() => handleStateSelected(null)}
            hitSlop={10}
            style={styles.clearBtn}
          >
            <Ionicons name="close-circle" size={18} color={COLORS.fogGray} />
          </TouchableOpacity>
        )}
        <Ionicons name="chevron-down" size={18} color={COLORS.fogGray} />
      </Pressable>

      {/* REGION row — only appears when a state is picked */}
      {selectedState && regionOptions.length > 0 && (
        <View style={styles.regionRow}>
          <Text style={styles.fieldLabel}>HUNTING REGION</Text>
          {hasMultipleRegions ? (
            <Pressable
              testID="region-picker-trigger"
              accessibilityRole="button"
              accessibilityLabel="Select hunting region"
              onPress={() => setRegionModalOpen(true)}
              style={({ pressed }) => [
                styles.dropdownField,
                pressed && styles.dropdownFieldPressed,
              ]}
            >
              <Ionicons name="map" size={16} color={COLORS.accent} />
              <Text style={styles.dropdownValue}>
                {regionId ? HUNTING_REGION_LABELS[regionId] : 'Select a region'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={COLORS.fogGray} />
            </Pressable>
          ) : (
            <View style={styles.regionLockedRow} testID="region-picker-locked">
              <Ionicons name="map" size={16} color={COLORS.accent} />
              <Text style={styles.regionLockedText}>
                {onlyRegion ? HUNTING_REGION_LABELS[onlyRegion] : ''}
              </Text>
              <Text style={styles.regionLockedHint}>auto</Text>
            </View>
          )}
        </View>
      )}

      {/* State picker modal */}
      <Modal
        visible={stateModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setStateModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SELECT STATE</Text>
              <TouchableOpacity
                testID="state-picker-close"
                onPress={() => { setStateModalOpen(false); setSearch(''); }}
                hitSlop={12}
              >
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={COLORS.fogGray} />
              <TextInput
                testID="state-picker-search"
                style={styles.searchInput}
                placeholder="Search states…"
                placeholderTextColor={COLORS.fogGray}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                autoCapitalize="words"
              />
            </View>

            <FlatList
              data={filteredStates}
              keyExtractor={s => s.code}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.emptyText}>No states match “{search}”</Text>
              }
              renderItem={({ item }) => {
                const active = item.code === stateCode;
                return (
                  <TouchableOpacity
                    testID={`state-option-${item.code}`}
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => handleStateSelected(item.code)}
                  >
                    <Text style={[styles.rowText, active && styles.rowTextActive]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.rowCode, active && styles.rowTextActive]}>
                      {item.code}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Region picker modal — only for multi-region states */}
      <Modal
        visible={regionModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setRegionModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '50%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SELECT REGION</Text>
              <TouchableOpacity
                testID="region-picker-close"
                onPress={() => setRegionModalOpen(false)}
                hitSlop={12}
              >
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            {regionOptions.map(rid => {
              const active = rid === regionId;
              return (
                <TouchableOpacity
                  key={rid}
                  testID={`region-option-${rid}`}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => {
                    onRegionChange(rid);
                    setRegionModalOpen(false);
                  }}
                >
                  <Text style={[styles.rowText, active && styles.rowTextActive]}>
                    {HUNTING_REGION_LABELS[rid]}
                  </Text>
                  {active && <Ionicons name="checkmark" size={18} color={COLORS.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    color: COLORS.fogGray,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 16,
  },
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(58, 74, 82, 0.5)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.3)',
    paddingHorizontal: 12,
    minHeight: 48,
  },
  dropdownFieldPressed: { opacity: 0.75 },
  dropdownValue: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  dropdownPlaceholder: { color: COLORS.fogGray, fontWeight: '400' },
  clearBtn: { paddingHorizontal: 4 },
  regionRow: { marginTop: 4 },
  regionLockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(200, 155, 60, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(200, 155, 60, 0.45)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
  },
  regionLockedText: {
    flex: 1,
    color: COLORS.accent,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  regionLockedHint: {
    color: COLORS.fogGray,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(154, 164, 169, 0.2)',
  },
  modalTitle: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(58, 74, 82, 0.5)',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginVertical: 12,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(154, 164, 169, 0.12)',
  },
  rowActive: { backgroundColor: 'rgba(200, 155, 60, 0.12)' },
  rowText: { flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  rowTextActive: { color: COLORS.accent, fontWeight: '800' },
  rowCode: {
    color: COLORS.fogGray,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginLeft: 8,
  },
  emptyText: {
    color: COLORS.fogGray,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
