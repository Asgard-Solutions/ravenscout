// =====================================================================
// MarkerFormModal — Task 10.
//
// Bottom-sheet modal used to add or edit a saved-image marker. The
// caller passes:
//   * mode       — 'create' | 'edit'
//   * initial    — pre-filled fields when editing
//   * placement  — where the new marker will land; rendered as a
//                  read-only summary so the user can confirm before
//                  saving. Omitted on edit-only fields.
//   * onSubmit   — receives { type, name, notes } when the user
//                  taps "Save".
//   * onDelete   — optional. Edit mode shows a "Delete marker"
//                  button that calls this.
//   * onClose    — closes without saving.
//
// The form deliberately captures a small subset of the
// AnalysisOverlayItem schema (type / label / description). The
// caller is responsible for stitching in the placement coordinates
// and coordinate_source before POST/PUT.
// =====================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '../constants/theme';
import { getOverlayItemTypeInfo } from '../constants/overlayItemTaxonomy';

// Subset of AnalysisOverlayItemType available to user-added markers.
// The Task 10 spec restricts the picker to these (no "wind", "funnel",
// "recommended_setup" etc. — those are AI-only).
export const USER_MARKER_TYPES = [
  'stand',
  'blind',
  'camera',
  'feeder',
  'scrape',
  'rub',
  'trail',
  'bedding',
  'water',
  'parking',
  'access_point',
  'custom',
] as const;
export type UserMarkerType = (typeof USER_MARKER_TYPES)[number];

const MAX_NAME_LEN = 120;
const MAX_NOTES_LEN = 2000;

export interface MarkerFormFields {
  type: UserMarkerType;
  name: string;
  notes?: string | null;
}

export interface PlacementSummary {
  x: number;
  y: number;
  latitude?: number | null;
  longitude?: number | null;
  coordinateSource: 'derived_from_saved_map_bounds' | 'pixel_only' | string;
}

export interface MarkerFormModalProps {
  visible: boolean;
  mode: 'create' | 'edit';
  /** Pre-filled fields when editing. */
  initial?: Partial<MarkerFormFields>;
  /** Placement preview (read-only). Hidden when undefined. */
  placement?: PlacementSummary | null;
  busy?: boolean;
  onSubmit: (fields: MarkerFormFields) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export const MarkerFormModal: React.FC<MarkerFormModalProps> = ({
  visible,
  mode,
  initial,
  placement,
  busy,
  onSubmit,
  onDelete,
  onClose,
}) => {
  const [type, setType] = useState<UserMarkerType>(
    (initial?.type as UserMarkerType) || 'stand',
  );
  const [name, setName] = useState<string>(initial?.name || '');
  const [notes, setNotes] = useState<string>(initial?.notes || '');
  const [touched, setTouched] = useState<{ name?: boolean }>({});

  // Reset fields whenever the modal is opened so a previous edit
  // session doesn't leak into a fresh "+" tap.
  useEffect(() => {
    if (visible) {
      setType(((initial?.type as UserMarkerType) || 'stand'));
      setName(initial?.name || '');
      setNotes(initial?.notes || '');
      setTouched({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const trimmedName = name.trim();
  const nameError =
    touched.name && trimmedName.length === 0
      ? 'Name is required'
      : trimmedName.length > MAX_NAME_LEN
      ? `Name too long (max ${MAX_NAME_LEN})`
      : '';
  const notesError =
    notes.length > MAX_NOTES_LEN
      ? `Notes too long (max ${MAX_NOTES_LEN})`
      : '';

  const canSubmit =
    !busy && trimmedName.length > 0 && trimmedName.length <= MAX_NAME_LEN && !notesError;

  const placementSummary = useMemo(() => {
    if (!placement) return null;
    if (placement.coordinateSource === 'pixel_only') {
      return `Pixel: ${placement.x.toFixed(0)}, ${placement.y.toFixed(0)}  •  GPS: not available`;
    }
    if (
      placement.coordinateSource === 'derived_from_saved_map_bounds' &&
      typeof placement.latitude === 'number' &&
      typeof placement.longitude === 'number'
    ) {
      return `${placement.latitude.toFixed(6)}, ${placement.longitude.toFixed(6)}`;
    }
    return `Pixel: ${placement.x.toFixed(0)}, ${placement.y.toFixed(0)}`;
  }, [placement]);

  const handleSubmit = () => {
    setTouched(t => ({ ...t, name: true }));
    if (!canSubmit) return;
    onSubmit({
      type,
      name: trimmedName,
      notes: notes.trim() ? notes.trim() : null,
    });
  };

  const confirmDelete = () => {
    if (!onDelete) return;
    Alert.alert(
      'Delete marker?',
      'This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
      { cancelable: true },
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
          <Pressable
            style={styles.sheet}
            onPress={() => {}}
            testID="marker-form-modal"
          >
            <View style={styles.header}>
              <Text style={styles.title}>
                {mode === 'create' ? 'Add Marker' : 'Edit Marker'}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                disabled={busy}
                accessibilityLabel="Close"
                style={styles.closeBtn}
                testID="marker-form-close"
              >
                <Ionicons name="close" size={22} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            {placementSummary && (
              <View style={styles.placementBlock}>
                <Text style={styles.fieldLabel}>POSITION</Text>
                <Text style={styles.placementValue} testID="marker-form-placement">
                  {placementSummary}
                </Text>
              </View>
            )}

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.fieldLabel}>TYPE</Text>
              <View style={styles.typeGrid}>
                {USER_MARKER_TYPES.map(t => {
                  const info = getOverlayItemTypeInfo(t);
                  const active = type === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setType(t)}
                      disabled={busy}
                      style={[
                        styles.typeChip,
                        active && {
                          backgroundColor: info.color,
                          borderColor: info.color,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Type ${info.label}`}
                      testID={`marker-form-type-${t}`}
                    >
                      <Ionicons
                        name={info.icon as any}
                        size={14}
                        color={active ? '#FFFFFF' : info.color}
                      />
                      <Text
                        style={[
                          styles.typeChipLabel,
                          active && { color: '#FFFFFF', fontWeight: '700' },
                        ]}
                      >
                        {info.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, styles.fieldLabelTopGap]}>NAME *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                onBlur={() => setTouched(t => ({ ...t, name: true }))}
                placeholder="e.g. North Ridge Stand"
                placeholderTextColor={COLORS.fogGray}
                style={styles.input}
                editable={!busy}
                maxLength={MAX_NAME_LEN}
                testID="marker-form-name"
              />
              {nameError ? (
                <Text style={styles.errorText} testID="marker-form-name-error">
                  {nameError}
                </Text>
              ) : null}

              <Text style={[styles.fieldLabel, styles.fieldLabelTopGap]}>NOTES</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes"
                placeholderTextColor={COLORS.fogGray}
                style={[styles.input, styles.inputMultiline]}
                editable={!busy}
                multiline
                maxLength={MAX_NOTES_LEN}
                testID="marker-form-notes"
              />
              {notesError ? (
                <Text style={styles.errorText}>{notesError}</Text>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              {mode === 'edit' && onDelete && (
                <TouchableOpacity
                  onPress={confirmDelete}
                  disabled={busy}
                  style={[styles.btn, styles.btnDelete]}
                  testID="marker-form-delete"
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.avoidZones} />
                  <Text style={styles.btnDeleteText}>Delete</Text>
                </TouchableOpacity>
              )}
              <View style={styles.flex} />
              <TouchableOpacity
                onPress={onClose}
                disabled={busy}
                style={[styles.btn, styles.btnSecondary]}
                testID="marker-form-cancel"
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!canSubmit}
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  !canSubmit && styles.btnDisabled,
                ]}
                testID="marker-form-submit"
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.btnPrimaryText}>
                    {mode === 'create' ? 'Add Marker' : 'Save'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    paddingBottom: 14,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  title: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placementBlock: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  placementValue: {
    color: COLORS.textPrimary,
    fontSize: 13,
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  body: {
    paddingHorizontal: 16,
  },
  bodyContent: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  fieldLabel: {
    color: COLORS.fogGray,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  fieldLabelTopGap: {
    marginTop: 14,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardBg,
  },
  typeChipLabel: {
    color: COLORS.textPrimary,
    fontSize: 12,
  },
  input: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardBg,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  errorText: {
    color: COLORS.avoidZones,
    fontSize: 11,
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    gap: 8,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnPrimary: {
    backgroundColor: COLORS.accent,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  btnSecondaryText: {
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  btnDelete: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.avoidZones,
  },
  btnDeleteText: {
    color: COLORS.avoidZones,
    fontSize: 14,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

export default MarkerFormModal;
