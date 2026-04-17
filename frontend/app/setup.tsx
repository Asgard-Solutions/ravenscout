import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPECIES, WIND_DIRECTIONS, TIME_WINDOWS, BACKEND_URL } from '../src/constants/theme';

const { width } = Dimensions.get('window');
const STEPS = ['Species', 'Map', 'Conditions', 'Review'];

export default function SetupScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Form state
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [huntDate, setHuntDate] = useState(new Date().toISOString().split('T')[0]);
  const [timeWindow, setTimeWindow] = useState('morning');
  const [windDirection, setWindDirection] = useState('N');
  const [temperature, setTemperature] = useState('');
  const [precipitation, setPrecipitation] = useState('none');
  const [propertyType, setPropertyType] = useState('public');
  const [region, setRegion] = useState('');

  const canProceed = () => {
    switch (step) {
      case 0: return selectedSpecies !== '';
      case 1: return mapImage !== null;
      case 2: return windDirection !== '';
      case 3: return true;
      default: return false;
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera roll access is needed to upload map images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        setMapImage(`data:image/jpeg;base64,${asset.base64}`);
      }
    }
  };

  const submitAnalysis = async () => {
    if (!mapImage) return;

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/analyze-hunt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditions: {
            animal: selectedSpecies,
            hunt_date: huntDate,
            time_window: timeWindow,
            wind_direction: windDirection,
            temperature: temperature || null,
            precipitation: precipitation !== 'none' ? precipitation : null,
            property_type: propertyType,
            region: region || null,
          },
          map_image_base64: mapImage,
        }),
      });

      const data = await response.json();

      if (data.success && data.result) {
        // Save to local storage
        const huntRecord = {
          id: data.result.id,
          species: selectedSpecies,
          speciesName: SPECIES.find(s => s.id === selectedSpecies)?.name || selectedSpecies,
          date: huntDate,
          timeWindow,
          windDirection,
          temperature,
          propertyType,
          region,
          mapImage,
          result: data.result,
          createdAt: new Date().toISOString(),
        };

        const existing = await AsyncStorage.getItem('hunt_history');
        const history = existing ? JSON.parse(existing) : [];
        history.unshift(huntRecord);
        await AsyncStorage.setItem('hunt_history', JSON.stringify(history));

        // Navigate to results
        router.push({
          pathname: '/results',
          params: { huntId: huntRecord.id },
        });
      } else {
        Alert.alert('Analysis Failed', data.error || 'Please try again.');
      }
    } catch (error: any) {
      Alert.alert('Connection Error', 'Could not reach the server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Ionicons name="navigate" size={48} color={COLORS.accent} style={{ marginTop: 24 }} />
          <Text style={styles.loadingTitle}>ANALYZING TERRAIN</Text>
          <Text style={styles.loadingSubtitle}>
            AI is evaluating your map for{'\n'}
            {SPECIES.find(s => s.id === selectedSpecies)?.name || 'game'} patterns...
          </Text>
          <View style={styles.loadingSteps}>
            <LoadingStep label="Interpreting terrain features" />
            <LoadingStep label="Applying species behavior rules" />
            <LoadingStep label="Evaluating wind & conditions" />
            <LoadingStep label="Scoring setup locations" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            testID="setup-back-button"
            onPress={() => step > 0 ? setStep(step - 1) : router.back()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>NEW HUNT</Text>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>{step + 1}/{STEPS.length}</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
        </View>

        {/* Step Labels */}
        <View style={styles.stepLabels}>
          {STEPS.map((s, i) => (
            <Text
              key={s}
              style={[styles.stepLabel, i <= step && styles.stepLabelActive]}
            >
              {s}
            </Text>
          ))}
        </View>

        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollInner}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step 0: Species */}
          {step === 0 && (
            <View>
              <Text style={styles.stepTitle}>SELECT SPECIES</Text>
              <Text style={styles.stepDescription}>Choose the game you're targeting</Text>
              <View style={styles.speciesGrid}>
                {SPECIES.map((species) => (
                  <TouchableOpacity
                    key={species.id}
                    testID={`species-${species.id}`}
                    style={[
                      styles.speciesCard,
                      selectedSpecies === species.id && styles.speciesCardActive,
                    ]}
                    onPress={() => setSelectedSpecies(species.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.speciesIconContainer}>
                      <Ionicons
                        name={species.id === 'deer' ? 'leaf' : species.id === 'turkey' ? 'sunny' : 'paw'}
                        size={32}
                        color={selectedSpecies === species.id ? COLORS.accent : COLORS.fogGray}
                      />
                    </View>
                    <Text style={[
                      styles.speciesName,
                      selectedSpecies === species.id && styles.speciesNameActive,
                    ]}>
                      {species.name}
                    </Text>
                    <Text style={styles.speciesDesc}>{species.description}</Text>
                    {selectedSpecies === species.id && (
                      <View style={styles.selectedCheck}>
                        <Ionicons name="checkmark-circle" size={24} color={COLORS.accent} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Step 1: Map Upload */}
          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>UPLOAD MAP</Text>
              <Text style={styles.stepDescription}>
                Upload a satellite or topographic map screenshot of your hunting area
              </Text>

              {mapImage ? (
                <View style={styles.mapPreviewContainer}>
                  <Image
                    source={{ uri: mapImage }}
                    style={styles.mapPreview}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    testID="change-map-button"
                    style={styles.changeMapButton}
                    onPress={pickImage}
                  >
                    <Ionicons name="swap-horizontal" size={20} color={COLORS.textPrimary} />
                    <Text style={styles.changeMapText}>CHANGE MAP</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  testID="upload-map-button"
                  style={styles.uploadArea}
                  onPress={pickImage}
                  activeOpacity={0.7}
                >
                  <Ionicons name="cloud-upload" size={48} color={COLORS.accent} />
                  <Text style={styles.uploadTitle}>TAP TO UPLOAD MAP</Text>
                  <Text style={styles.uploadSubtitle}>
                    Satellite, aerial, or topo map{'\n'}PNG, JPG supported
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.tipCard}>
                <Ionicons name="bulb" size={18} color={COLORS.accent} />
                <Text style={styles.tipText}>
                  Best results with satellite or aerial imagery showing terrain features, tree lines, and water sources.
                </Text>
              </View>
            </View>
          )}

          {/* Step 2: Conditions */}
          {step === 2 && (
            <View>
              <Text style={styles.stepTitle}>HUNT CONDITIONS</Text>
              <Text style={styles.stepDescription}>Set the environmental parameters</Text>

              {/* Time Window */}
              <Text style={styles.fieldLabel}>TIME WINDOW</Text>
              <View style={styles.timeGrid}>
                {TIME_WINDOWS.map((tw) => (
                  <TouchableOpacity
                    key={tw.id}
                    testID={`time-${tw.id}`}
                    style={[styles.timeCard, timeWindow === tw.id && styles.timeCardActive]}
                    onPress={() => setTimeWindow(tw.id)}
                  >
                    <Ionicons
                      name={tw.id === 'morning' ? 'sunny' : tw.id === 'evening' ? 'moon' : 'time'}
                      size={22}
                      color={timeWindow === tw.id ? COLORS.accent : COLORS.fogGray}
                    />
                    <Text style={[styles.timeLabel, timeWindow === tw.id && styles.timeLabelActive]}>
                      {tw.label}
                    </Text>
                    <Text style={styles.timeSubtitle}>{tw.subtitle}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Wind Direction */}
              <Text style={styles.fieldLabel}>WIND DIRECTION</Text>
              <View style={styles.windGrid}>
                {WIND_DIRECTIONS.map((dir) => (
                  <TouchableOpacity
                    key={dir}
                    testID={`wind-${dir}`}
                    style={[styles.windChip, windDirection === dir && styles.windChipActive]}
                    onPress={() => setWindDirection(dir)}
                  >
                    <Text style={[styles.windText, windDirection === dir && styles.windTextActive]}>
                      {dir}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Temperature */}
              <Text style={styles.fieldLabel}>TEMPERATURE (OPTIONAL)</Text>
              <TextInput
                testID="temperature-input"
                style={styles.textInput}
                placeholder="e.g., 45°F"
                placeholderTextColor={COLORS.fogGray}
                value={temperature}
                onChangeText={setTemperature}
                keyboardType="default"
              />

              {/* Precipitation */}
              <Text style={styles.fieldLabel}>PRECIPITATION</Text>
              <View style={styles.precipGrid}>
                {['none', 'light rain', 'heavy rain', 'snow'].map((p) => (
                  <TouchableOpacity
                    key={p}
                    testID={`precip-${p.replace(' ', '-')}`}
                    style={[styles.precipChip, precipitation === p && styles.precipChipActive]}
                    onPress={() => setPrecipitation(p)}
                  >
                    <Text style={[styles.precipText, precipitation === p && styles.precipTextActive]}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Property Type */}
              <Text style={styles.fieldLabel}>PROPERTY TYPE</Text>
              <View style={styles.propGrid}>
                {['public', 'private'].map((pt) => (
                  <TouchableOpacity
                    key={pt}
                    testID={`property-${pt}`}
                    style={[styles.propChip, propertyType === pt && styles.propChipActive]}
                    onPress={() => setPropertyType(pt)}
                  >
                    <Ionicons
                      name={pt === 'public' ? 'globe' : 'lock-closed'}
                      size={18}
                      color={propertyType === pt ? COLORS.accent : COLORS.fogGray}
                    />
                    <Text style={[styles.propText, propertyType === pt && styles.propTextActive]}>
                      {pt.charAt(0).toUpperCase() + pt.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Region */}
              <Text style={styles.fieldLabel}>REGION / STATE (OPTIONAL)</Text>
              <TextInput
                testID="region-input"
                style={styles.textInput}
                placeholder="e.g., East Texas, Southern Ohio"
                placeholderTextColor={COLORS.fogGray}
                value={region}
                onChangeText={setRegion}
              />
            </View>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <View>
              <Text style={styles.stepTitle}>REVIEW & ANALYZE</Text>
              <Text style={styles.stepDescription}>Confirm your hunt parameters</Text>

              <View style={styles.reviewCard}>
                <ReviewRow label="Species" value={SPECIES.find(s => s.id === selectedSpecies)?.name || ''} />
                <ReviewRow label="Date" value={huntDate} />
                <ReviewRow label="Time" value={TIME_WINDOWS.find(t => t.id === timeWindow)?.label || ''} />
                <ReviewRow label="Wind" value={`From ${windDirection}`} />
                {temperature ? <ReviewRow label="Temp" value={temperature} /> : null}
                <ReviewRow label="Precip" value={precipitation.charAt(0).toUpperCase() + precipitation.slice(1)} />
                <ReviewRow label="Property" value={propertyType.charAt(0).toUpperCase() + propertyType.slice(1)} />
                {region ? <ReviewRow label="Region" value={region} /> : null}
              </View>

              {mapImage && (
                <View style={styles.reviewMapContainer}>
                  <Text style={styles.reviewMapLabel}>MAP IMAGE</Text>
                  <Image source={{ uri: mapImage }} style={styles.reviewMap} resizeMode="cover" />
                </View>
              )}

              <View style={styles.disclaimerCard}>
                <Ionicons name="shield-checkmark" size={18} color={COLORS.fogGray} />
                <Text style={styles.disclaimerText}>
                  Recommendations are AI-generated suggestions. Always verify regulations and property boundaries.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Bottom Action */}
        <View style={styles.bottomBar}>
          {step < 3 ? (
            <TouchableOpacity
              testID="next-step-button"
              style={[styles.nextButton, !canProceed() && styles.nextButtonDisabled]}
              onPress={() => canProceed() && setStep(step + 1)}
              disabled={!canProceed()}
              activeOpacity={0.8}
            >
              <Text style={[styles.nextButtonText, !canProceed() && styles.nextButtonTextDisabled]}>
                CONTINUE
              </Text>
              <Ionicons
                name="arrow-forward"
                size={20}
                color={canProceed() ? COLORS.primary : COLORS.fogGray}
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="analyze-button"
              style={styles.analyzeButton}
              onPress={submitAnalysis}
              activeOpacity={0.8}
            >
              <Ionicons name="navigate" size={22} color={COLORS.primary} />
              <Text style={styles.analyzeButtonText}>ANALYZE HUNT</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

function LoadingStep({ label }: { label: string }) {
  return (
    <View style={styles.loadingStepRow}>
      <Ionicons name="checkmark-circle" size={16} color={COLORS.accent} />
      <Text style={styles.loadingStepText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: 'rgba(58, 74, 82, 0.5)',
  },
  topTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  stepIndicator: {
    backgroundColor: 'rgba(200, 155, 60, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  stepText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  progressBar: {
    height: 3,
    backgroundColor: 'rgba(58, 74, 82, 0.5)',
    marginHorizontal: 16,
    borderRadius: 2,
  },
  progressFill: {
    height: 3,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  stepLabel: {
    color: COLORS.fogGray,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    opacity: 0.5,
  },
  stepLabelActive: {
    color: COLORS.accent,
    opacity: 1,
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: 20,
    paddingBottom: 32,
  },
  stepTitle: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 6,
  },
  stepDescription: {
    color: COLORS.fogGray,
    fontSize: 14,
    marginBottom: 24,
    letterSpacing: 0.3,
  },
  // Species
  speciesGrid: {
    gap: 14,
  },
  speciesCard: {
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderRadius: 14,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  speciesCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(200, 155, 60, 0.08)',
  },
  speciesIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(58, 74, 82, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  speciesName: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  speciesNameActive: {
    color: COLORS.accent,
  },
  speciesDesc: {
    color: COLORS.fogGray,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 20,
  },
  selectedCheck: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  // Map Upload
  uploadArea: {
    backgroundColor: 'rgba(58, 74, 82, 0.3)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
    marginBottom: 20,
  },
  uploadTitle: {
    color: COLORS.accent,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 16,
  },
  uploadSubtitle: {
    color: COLORS.fogGray,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  mapPreviewContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.3)',
  },
  mapPreview: {
    width: '100%',
    height: 260,
  },
  changeMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: COLORS.secondary,
  },
  changeMapText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(200, 155, 60, 0.08)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(200, 155, 60, 0.2)',
  },
  tipText: {
    color: COLORS.fogGray,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  // Conditions
  fieldLabel: {
    color: COLORS.fogGray,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 20,
  },
  timeGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  timeCard: {
    flex: 1,
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 80,
    justifyContent: 'center',
  },
  timeCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(200, 155, 60, 0.08)',
  },
  timeLabel: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  timeLabelActive: {
    color: COLORS.accent,
  },
  timeSubtitle: {
    color: COLORS.fogGray,
    fontSize: 10,
    marginTop: 2,
  },
  windGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  windChip: {
    width: (width - 110) / 4,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  windChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(200, 155, 60, 0.08)',
  },
  windText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  windTextActive: {
    color: COLORS.accent,
  },
  textInput: {
    backgroundColor: 'rgba(58, 74, 82, 0.5)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    color: COLORS.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.3)',
  },
  precipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  precipChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 48,
    justifyContent: 'center',
  },
  precipChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(200, 155, 60, 0.08)',
  },
  precipText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  precipTextActive: {
    color: COLORS.accent,
  },
  propGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  propChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 52,
  },
  propChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(200, 155, 60, 0.08)',
  },
  propText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  propTextActive: {
    color: COLORS.accent,
  },
  // Review
  reviewCard: {
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.2)',
    marginBottom: 20,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(154, 164, 169, 0.1)',
  },
  reviewLabel: {
    color: COLORS.fogGray,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  reviewValue: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  reviewMapContainer: {
    marginBottom: 20,
  },
  reviewMapLabel: {
    color: COLORS.fogGray,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  reviewMap: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.2)',
  },
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(58, 74, 82, 0.3)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.15)',
  },
  disclaimerText: {
    color: COLORS.fogGray,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  // Bottom
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(154, 164, 169, 0.1)',
  },
  nextButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
  },
  nextButtonDisabled: {
    backgroundColor: 'rgba(58, 74, 82, 0.5)',
  },
  nextButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  nextButtonTextDisabled: {
    color: COLORS.fogGray,
  },
  analyzeButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 60,
  },
  analyzeButtonText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingTitle: {
    color: COLORS.accent,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 16,
  },
  loadingSubtitle: {
    color: COLORS.fogGray,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
  loadingSteps: {
    marginTop: 40,
    gap: 14,
    alignSelf: 'stretch',
  },
  loadingStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingStepText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
});
