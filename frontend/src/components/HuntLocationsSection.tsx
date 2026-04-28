// =====================================================================
// HuntLocationsSection — optional "Known Hunt Locations" section.
//
// Displayed inside the Conditions step of the New Hunt wizard
// (app/setup.tsx). The user can:
//   - add zero, one, or many GPS assets
//   - manually enter type / name / lat / lng / notes
//   - edit or remove an asset before hunt submission
//
// The component is fully controlled — `assets` and `onChange` are
// passed in by the parent. No persistence happens here; the parent
// is responsible for stashing the asset list (see
// src/media/pendingHuntAssets.ts) so the /results screen can drain
// it after the hunt is upserted to the backend.
//
// Validation mirrors backend/geo_validation.py + the Pydantic model
// in backend/models/hunt_location_asset.py:
//   - type required (one of HUNT_LOCATION_ASSET_TYPES)
//   - name required, non-blank, max 120 chars
//   - latitude  required, finite, ∈ [-90, 90]
//   - longitude required, finite, ∈ [-180, 180]
//   - notes optional, max 2000 chars
// =====================================================================
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '../constants/theme';
import {
  HUNT_LOCATION_ASSET_TYPES,
  type HuntLocationAssetType,
} from '../types/geo';
import {
  validateAssetForm,
  type AssetFormState,
  type AssetFormErrors,
} from '../lib/huntAssetValidation';
import {
  makePendingAsset,
  type PendingHuntAsset,
} from '../media/pendingHuntAssets';

const TYPE_LABELS: Record<HuntLocationAssetType, string> = {
  stand: 'Stand',
  blind: 'Blind',
  feeder: 'Feeder',
  camera: 'Trail Cam',
  parking: 'Parking',
  access_point: 'Access Point',
  water: 'Water',
  scrape: 'Scrape',
  rub: 'Rub',
  bedding: 'Bedding',
  custom: 'Other',
};

const TYPE_ICONS: Record<HuntLocationAssetType, keyof typeof Ionicons.glyphMap> = {
  stand: 'eye-outline',
  blind: 'shield-outline',
  feeder: 'cafe-outline',
  camera: 'videocam-outline',
  parking: 'car-outline',
  access_point: 'log-in-outline',
  water: 'water-outline',
  scrape: 'leaf-outline',
  // No tree glyph in the Ionicons set bundled with Expo \u2014 reuse leaf
  // for Rub which is fine semantically (rubs are tree damage).
  rub: 'leaf-outline',
  bedding: 'moon-outline',
  custom: 'pin-outline',
};

function _glyphFallback(name: keyof typeof Ionicons.glyphMap): keyof typeof Ionicons.glyphMap {
  return name;
}

export interface HuntLocationsSectionProps {
  assets: PendingHuntAsset[];
  onChange: (next: PendingHuntAsset[]) => void;
}

interface FormState extends AssetFormState {}

const EMPTY_FORM: FormState = {
  type: 'stand',
  name: '',
  latitude: '',
  longitude: '',
  notes: '',
};

interface FormErrors extends AssetFormErrors {}

/**
 * Re-export the pure validator so existing callers / tests can keep
 * importing from this module if needed. The canonical home of the
 * validation logic is `src/lib/huntAssetValidation.ts`.
 */
export { validateAssetForm } from '../lib/huntAssetValidation';

export default function HuntLocationsSection({
  assets,
  onChange,
}: HuntLocationsSectionProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  const editingExisting = !!editingId;

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setEditorOpen(true);
  };

  const openEdit = (asset: PendingHuntAsset) => {
    setEditingId(asset.localId);
    setForm({
      type: asset.type,
      name: asset.name,
      latitude: String(asset.latitude),
      longitude: String(asset.longitude),
      notes: asset.notes ?? '',
    });
    setErrors({});
    setEditorOpen(true);
  };

  const close = () => {
    setEditorOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const submit = () => {
    const validation = validateAssetForm(form);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    const payload = {
      type: form.type,
      name: form.name.trim(),
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      notes: form.notes.trim() ? form.notes.trim() : null,
    };
    if (editingExisting && editingId) {
      onChange(
        assets.map((a) =>
          a.localId === editingId ? { ...a, ...payload } : a,
        ),
      );
    } else {
      onChange([...assets, makePendingAsset(payload)]);
    }
    close();
  };

  const remove = (localId: string) => {
    onChange(assets.filter((a) => a.localId !== localId));
  };

  const typeLabel = useMemo(() => TYPE_LABELS[form.type] || 'Other', [form.type]);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>KNOWN HUNT LOCATIONS</Text>
          <Text style={styles.sectionSubtitle}>
            Optional · stands, blinds, feeders, cameras, parking…
          </Text>
        </View>
        <TouchableOpacity
          testID="add-hunt-asset-button"
          onPress={openAdd}
          style={styles.addButton}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color={COLORS.primary} />
          <Text style={styles.addButtonText}>ADD</Text>
        </TouchableOpacity>
      </View>

      {assets.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="map-outline" size={20} color={COLORS.fogGray} />
          <Text style={styles.emptyText}>
            No locations added. Skip if you don&apos;t need any.
          </Text>
        </View>
      ) : (
        <View style={styles.list} testID="hunt-asset-list">
          {assets.map((asset) => (
            <View
              key={asset.localId}
              style={styles.assetCard}
              testID={`hunt-asset-${asset.localId}`}
            >
              <View style={styles.assetIconWrap}>
                <Ionicons
                  name={_glyphFallback(TYPE_ICONS[asset.type])}
                  size={20}
                  color={COLORS.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.assetName} numberOfLines={1}>
                  {asset.name}
                </Text>
                <Text style={styles.assetMeta} numberOfLines={1}>
                  {TYPE_LABELS[asset.type]} · {asset.latitude.toFixed(6)},{' '}
                  {asset.longitude.toFixed(6)}
                </Text>
                {asset.notes ? (
                  <Text style={styles.assetNotes} numberOfLines={2}>
                    {asset.notes}
                  </Text>
                ) : null}
              </View>
              <View style={styles.assetActions}>
                <TouchableOpacity
                  testID={`edit-hunt-asset-${asset.localId}`}
                  onPress={() => openEdit(asset)}
                  style={styles.iconButton}
                  hitSlop={8}
                >
                  <Ionicons
                    name="create-outline"
                    size={18}
                    color={COLORS.fogGray}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`delete-hunt-asset-${asset.localId}`}
                  onPress={() => remove(asset.localId)}
                  style={styles.iconButton}
                  hitSlop={8}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={COLORS.avoidZones}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <Modal
        visible={editorOpen}
        animationType="slide"
        transparent
        onRequestClose={close}
      >
        <Pressable style={styles.modalBackdrop} onPress={close}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingExisting ? 'Edit Location' : 'Add Location'}
              </Text>
              <TouchableOpacity onPress={close} hitSlop={10}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {/* Type picker */}
              <Text style={styles.fieldLabel}>Type</Text>
              <TouchableOpacity
                testID="asset-type-trigger"
                onPress={() => setTypePickerOpen((p) => !p)}
                style={styles.fieldRow}
              >
                <Text style={styles.fieldValue}>{typeLabel}</Text>
                <Ionicons
                  name={typePickerOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={COLORS.fogGray}
                />
              </TouchableOpacity>
              {errors.type ? (
                <Text style={styles.fieldError}>{errors.type}</Text>
              ) : null}
              {typePickerOpen ? (
                <View style={styles.typeGrid}>
                  {HUNT_LOCATION_ASSET_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      testID={`asset-type-option-${t}`}
                      onPress={() => {
                        setForm((f) => ({ ...f, type: t }));
                        setTypePickerOpen(false);
                      }}
                      style={[
                        styles.typeChip,
                        form.type === t && styles.typeChipActive,
                      ]}
                    >
                      <Ionicons
                        name={_glyphFallback(TYPE_ICONS[t])}
                        size={14}
                        color={form.type === t ? COLORS.primary : COLORS.fogGray}
                      />
                      <Text
                        style={[
                          styles.typeChipText,
                          form.type === t && styles.typeChipTextActive,
                        ]}
                      >
                        {TYPE_LABELS[t]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {/* Name */}
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Name</Text>
              <TextInput
                testID="asset-name-input"
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="e.g. North Ridge Stand"
                placeholderTextColor={COLORS.fogGray}
                style={styles.input}
                maxLength={120}
              />
              {errors.name ? (
                <Text style={styles.fieldError}>{errors.name}</Text>
              ) : null}

              {/* Lat / Lng */}
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                    Latitude
                  </Text>
                  <TextInput
                    testID="asset-lat-input"
                    value={form.latitude}
                    onChangeText={(v) =>
                      setForm((f) => ({ ...f, latitude: v }))
                    }
                    placeholder="32.123456"
                    placeholderTextColor={COLORS.fogGray}
                    keyboardType="numbers-and-punctuation"
                    style={styles.input}
                  />
                  {errors.latitude ? (
                    <Text style={styles.fieldError}>{errors.latitude}</Text>
                  ) : null}
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                    Longitude
                  </Text>
                  <TextInput
                    testID="asset-lng-input"
                    value={form.longitude}
                    onChangeText={(v) =>
                      setForm((f) => ({ ...f, longitude: v }))
                    }
                    placeholder="-97.123456"
                    placeholderTextColor={COLORS.fogGray}
                    keyboardType="numbers-and-punctuation"
                    style={styles.input}
                  />
                  {errors.longitude ? (
                    <Text style={styles.fieldError}>{errors.longitude}</Text>
                  ) : null}
                </View>
              </View>

              {/* Notes */}
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                Notes (optional)
              </Text>
              <TextInput
                testID="asset-notes-input"
                value={form.notes}
                onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                placeholder="e.g. Good for north wind"
                placeholderTextColor={COLORS.fogGray}
                style={[styles.input, styles.notesInput]}
                multiline
                maxLength={2000}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                testID="asset-cancel-button"
                onPress={close}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="asset-save-button"
                onPress={submit}
                style={styles.saveButton}
              >
                <Text style={styles.saveButtonText}>
                  {editingExisting ? 'SAVE' : 'ADD'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sectionSubtitle: {
    color: COLORS.fogGray,
    fontSize: 12,
    marginTop: 2,
  },
  addButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    color: COLORS.primary,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
  },
  emptyCard: {
    backgroundColor: 'rgba(58,74,82,0.4)',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(58,74,82,0.6)',
    borderStyle: 'dashed',
  },
  emptyText: { color: COLORS.fogGray, fontSize: 13, flex: 1 },
  list: { gap: 10 },
  assetCard: {
    backgroundColor: 'rgba(58,74,82,0.5)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(200,155,60,0.18)',
  },
  assetIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(200,155,60,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  assetMeta: {
    color: COLORS.fogGray,
    fontSize: 12,
    marginTop: 2,
  },
  assetNotes: {
    color: COLORS.fogGray,
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  assetActions: { flexDirection: 'row', gap: 4 },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(58,74,82,0.6)',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  fieldLabel: {
    color: COLORS.fogGray,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  fieldRow: {
    backgroundColor: 'rgba(58,74,82,0.5)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValue: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  fieldError: {
    color: COLORS.avoidZones,
    fontSize: 12,
    marginTop: 4,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(58,74,82,0.5)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  typeChipText: {
    color: COLORS.fogGray,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  typeChipTextActive: { color: COLORS.primary },
  input: {
    backgroundColor: 'rgba(58,74,82,0.5)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'rgba(58,74,82,0.5)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.fogGray,
    fontWeight: '900',
    letterSpacing: 1,
  },
  saveButton: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    color: COLORS.primary,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
