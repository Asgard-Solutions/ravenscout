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
import { useNetwork } from '../src/hooks/useNetwork';

const { width } = Dimensions.get('window');
const STEPS = ['Species', 'Maps', 'Conditions', 'Review'];
const MAX_MAPS = 5;

export default function SetupScreen() {
  const router = useRouter();
  const { isConnected } = useNetwork();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Form state
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [mapImages, setMapImages] = useState<string[]>([]);
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
      case 1: return mapImages.length > 0;
      case 2: return windDirection !== '';
      case 3: return true;
      default: return false;
    }
  };

  const pickImage = async () => {
    if (mapImages.length >= MAX_MAPS) {
      Alert.alert('Limit Reached', `Maximum ${MAX_MAPS} maps per hunt.`);
      return;
    }
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
    if (!result.canceled && result.assets[0]?.base64) {
      setMapImages(prev => [...prev, `data:image/jpeg;base64,${result.assets[0].base64}`]);
    }
  };

  const removeMap = (index: number) => {
    setMapImages(prev => prev.filter((_, i) => i !== index));
  };

  const submitAnalysis = async () => {
    if (mapImages.length === 0) return;
    if (!isConnected) {
      Alert.alert('Offline', 'Map analysis requires an internet connection. Please connect and try again.');
      return;
    }

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
          map_image_base64: mapImages[0],
        }),
      });
      const data = await response.json();
      if (data.success && data.result) {
        // Add IDs to overlays
        const overlaysWithIds = (data.result.overlays || []).map((o: any, i: number) => ({
          ...o,
          id: `ai-${i}-${Date.now()}`,
          isCustom: false,
        }));
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
          mapImages,
          mapImage: mapImages[0],
          result: { ...data.result, overlays: overlaysWithIds },
          createdAt: new Date().toISOString(),
        };
        const existing = await AsyncStorage.getItem('hunt_history');
        const history = existing ? JSON.parse(existing) : [];
        history.unshift(huntRecord);
        await AsyncStorage.setItem('hunt_history', JSON.stringify(history));
        router.push({ pathname: '/results', params: { huntId: huntRecord.id } });
      } else {
        Alert.alert('Analysis Failed', data.error || 'Please try again.');
      }
    } catch {
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
            {['Interpreting terrain features', 'Applying species behavior rules', 'Evaluating wind & conditions', 'Scoring setup locations'].map(label => (
              <View key={label} style={styles.loadingStepRow}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.accent} />
                <Text style={styles.loadingStepText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Offline Banner */}
        {!isConnected && (
          <View testID="offline-banner-setup" style={styles.offlineBanner}>
            <Ionicons name="cloud-offline" size={16} color={COLORS.accent} />
            <Text style={styles.offlineBannerText}>OFFLINE — Analysis requires connection</Text>
          </View>
        )}

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity testID="setup-back-button" onPress={() => step > 0 ? setStep(step - 1) : router.back()} style={styles.backButton}>
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
        <View style={styles.stepLabels}>
          {STEPS.map((s, i) => (
            <Text key={s} style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>{s}</Text>
          ))}
        </View>

        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
                    style={[styles.speciesCard, selectedSpecies === species.id && styles.speciesCardActive]}
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
                    <Text style={[styles.speciesName, selectedSpecies === species.id && styles.speciesNameActive]}>{species.name}</Text>
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

          {/* Step 1: Multi-Map Upload */}
          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>UPLOAD MAPS</Text>
              <Text style={styles.stepDescription}>
                Upload satellite, aerial, or topo maps ({mapImages.length}/{MAX_MAPS})
              </Text>

              {/* Uploaded maps grid */}
              {mapImages.length > 0 && (
                <View style={styles.mapsGrid}>
                  {mapImages.map((img, idx) => (
                    <View key={idx} style={styles.mapThumbContainer}>
                      <Image source={{ uri: img }} style={styles.mapThumb} resizeMode="cover" />
                      <View style={styles.mapThumbBadge}>
                        <Text style={styles.mapThumbBadgeText}>{idx + 1}</Text>
                      </View>
                      <TouchableOpacity
                        testID={`remove-map-${idx}`}
                        style={styles.removeMapButton}
                        onPress={() => removeMap(idx)}
                      >
                        <Ionicons name="close-circle" size={22} color={COLORS.avoidZones} />
                      </TouchableOpacity>
                      {idx === 0 && (
                        <View style={styles.primaryMapBadge}>
                          <Text style={styles.primaryMapText}>PRIMARY</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Add more maps button */}
              {mapImages.length < MAX_MAPS && (
                <TouchableOpacity
                  testID="upload-map-button"
                  style={[styles.uploadArea, mapImages.length > 0 && styles.uploadAreaCompact]}
                  onPress={pickImage}
                  activeOpacity={0.7}
                >
                  <Ionicons name="cloud-upload" size={mapImages.length > 0 ? 32 : 48} color={COLORS.accent} />
                  <Text style={styles.uploadTitle}>
                    {mapImages.length === 0 ? 'TAP TO UPLOAD MAP' : 'ADD ANOTHER MAP'}
                  </Text>
                  {mapImages.length === 0 && (
                    <Text style={styles.uploadSubtitle}>Satellite, aerial, or topo map{'\n'}PNG, JPG supported</Text>
                  )}
                </TouchableOpacity>
              )}

              <View style={styles.tipCard}>
                <Ionicons name="bulb" size={18} color={COLORS.accent} />
                <Text style={styles.tipText}>
                  {mapImages.length === 0
                    ? 'Best results with satellite or aerial imagery showing terrain features, tree lines, and water sources.'
                    : 'Upload multiple maps to compare views (e.g., satellite + topo). The first map is used for AI analysis.'}
                </Text>
              </View>
            </View>
          )}

          {/* Step 2: Conditions */}
          {step === 2 && (
            <View>
              <Text style={styles.stepTitle}>HUNT CONDITIONS</Text>
              <Text style={styles.stepDescription}>Set the environmental parameters</Text>

              <Text style={styles.fieldLabel}>TIME WINDOW</Text>
              <View style={styles.timeGrid}>
                {TIME_WINDOWS.map((tw) => (
                  <TouchableOpacity key={tw.id} testID={`time-${tw.id}`} style={[styles.timeCard, timeWindow === tw.id && styles.timeCardActive]} onPress={() => setTimeWindow(tw.id)}>
                    <Ionicons name={tw.id === 'morning' ? 'sunny' : tw.id === 'evening' ? 'moon' : 'time'} size={22} color={timeWindow === tw.id ? COLORS.accent : COLORS.fogGray} />
                    <Text style={[styles.timeLabel, timeWindow === tw.id && styles.timeLabelActive]}>{tw.label}</Text>
                    <Text style={styles.timeSubtitle}>{tw.subtitle}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>WIND DIRECTION</Text>
              <View style={styles.windGrid}>
                {WIND_DIRECTIONS.map((dir) => (
                  <TouchableOpacity key={dir} testID={`wind-${dir}`} style={[styles.windChip, windDirection === dir && styles.windChipActive]} onPress={() => setWindDirection(dir)}>
                    <Text style={[styles.windText, windDirection === dir && styles.windTextActive]}>{dir}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>TEMPERATURE (OPTIONAL)</Text>
              <TextInput testID="temperature-input" style={styles.textInput} placeholder="e.g., 45°F" placeholderTextColor={COLORS.fogGray} value={temperature} onChangeText={setTemperature} />

              <Text style={styles.fieldLabel}>PRECIPITATION</Text>
              <View style={styles.precipGrid}>
                {['none', 'light rain', 'heavy rain', 'snow'].map((p) => (
                  <TouchableOpacity key={p} testID={`precip-${p.replace(' ', '-')}`} style={[styles.precipChip, precipitation === p && styles.precipChipActive]} onPress={() => setPrecipitation(p)}>
                    <Text style={[styles.precipText, precipitation === p && styles.precipTextActive]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>PROPERTY TYPE</Text>
              <View style={styles.propGrid}>
                {['public', 'private'].map((pt) => (
                  <TouchableOpacity key={pt} testID={`property-${pt}`} style={[styles.propChip, propertyType === pt && styles.propChipActive]} onPress={() => setPropertyType(pt)}>
                    <Ionicons name={pt === 'public' ? 'globe' : 'lock-closed'} size={18} color={propertyType === pt ? COLORS.accent : COLORS.fogGray} />
                    <Text style={[styles.propText, propertyType === pt && styles.propTextActive]}>{pt.charAt(0).toUpperCase() + pt.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>REGION / STATE (OPTIONAL)</Text>
              <TextInput testID="region-input" style={styles.textInput} placeholder="e.g., East Texas, Southern Ohio" placeholderTextColor={COLORS.fogGray} value={region} onChangeText={setRegion} />
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
                <ReviewRow label="Maps" value={`${mapImages.length} uploaded`} />
              </View>

              {/* Map thumbnails in review */}
              <View style={styles.reviewMapsRow}>
                {mapImages.map((img, idx) => (
                  <View key={idx} style={styles.reviewMapThumb}>
                    <Image source={{ uri: img }} style={styles.reviewMapImage} resizeMode="cover" />
                    <Text style={styles.reviewMapIdx}>{idx + 1}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.disclaimerCard}>
                <Ionicons name="shield-checkmark" size={18} color={COLORS.fogGray} />
                <Text style={styles.disclaimerText}>Recommendations are AI-generated suggestions. Always verify regulations and property boundaries.</Text>
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
              <Text style={[styles.nextButtonText, !canProceed() && styles.nextButtonTextDisabled]}>CONTINUE</Text>
              <Ionicons name="arrow-forward" size={20} color={canProceed() ? COLORS.primary : COLORS.fogGray} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="analyze-button"
              style={[styles.analyzeButton, !isConnected && styles.analyzeButtonDisabled]}
              onPress={submitAnalysis}
              activeOpacity={0.8}
              disabled={!isConnected}
            >
              {!isConnected && <Ionicons name="cloud-offline" size={20} color={COLORS.fogGray} />}
              {isConnected && <Ionicons name="navigate" size={22} color={COLORS.primary} />}
              <Text style={[styles.analyzeButtonText, !isConnected && styles.analyzeButtonTextDisabled]}>
                {isConnected ? 'ANALYZE HUNT' : 'OFFLINE'}
              </Text>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 8,
    backgroundColor: 'rgba(200, 155, 60, 0.12)', borderBottomWidth: 1,
    borderBottomColor: 'rgba(200, 155, 60, 0.3)',
  },
  offlineBannerText: { color: COLORS.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: 'rgba(58, 74, 82, 0.5)' },
  topTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  stepIndicator: { backgroundColor: 'rgba(200, 155, 60, 0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  stepText: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },
  progressBar: { height: 3, backgroundColor: 'rgba(58, 74, 82, 0.5)', marginHorizontal: 16, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: COLORS.accent, borderRadius: 2 },
  stepLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  stepLabel: { color: COLORS.fogGray, fontSize: 11, fontWeight: '600', letterSpacing: 1, opacity: 0.5 },
  stepLabelActive: { color: COLORS.accent, opacity: 1 },
  scrollContent: { flex: 1 },
  scrollInner: { padding: 20, paddingBottom: 32 },
  stepTitle: { color: COLORS.textPrimary, fontSize: 24, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  stepDescription: { color: COLORS.fogGray, fontSize: 14, marginBottom: 24, letterSpacing: 0.3 },
  // Species
  speciesGrid: { gap: 14 },
  speciesCard: { backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 14, padding: 20, borderWidth: 2, borderColor: 'transparent' },
  speciesCardActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(200, 155, 60, 0.08)' },
  speciesIconContainer: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(58, 74, 82, 0.6)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  speciesName: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  speciesNameActive: { color: COLORS.accent },
  speciesDesc: { color: COLORS.fogGray, fontSize: 13, marginTop: 6, lineHeight: 20 },
  selectedCheck: { position: 'absolute', top: 20, right: 20 },
  // Multi-Map Upload
  mapsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  mapThumbContainer: { position: 'relative', width: (width - 70) / 3, height: 90, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)' },
  mapThumb: { width: '100%', height: '100%' },
  mapThumbBadge: { position: 'absolute', top: 4, left: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center' },
  mapThumbBadgeText: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '800' },
  removeMapButton: { position: 'absolute', top: 2, right: 2 },
  primaryMapBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(200, 155, 60, 0.85)', paddingVertical: 2, alignItems: 'center' },
  primaryMapText: { color: COLORS.primary, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  uploadArea: {
    backgroundColor: 'rgba(58, 74, 82, 0.3)', borderRadius: 16, borderWidth: 2,
    borderColor: COLORS.accent, borderStyle: 'dashed', padding: 40,
    alignItems: 'center', justifyContent: 'center', minHeight: 220, marginBottom: 20,
  },
  uploadAreaCompact: { padding: 20, minHeight: 100 },
  uploadTitle: { color: COLORS.accent, fontSize: 16, fontWeight: '800', letterSpacing: 1.5, marginTop: 12 },
  uploadSubtitle: { color: COLORS.fogGray, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  tipCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(200, 155, 60, 0.08)', borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.2)',
  },
  tipText: { color: COLORS.fogGray, fontSize: 13, lineHeight: 20, flex: 1 },
  // Conditions
  fieldLabel: { color: COLORS.fogGray, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 20 },
  timeGrid: { flexDirection: 'row', gap: 10 },
  timeCard: { flex: 1, backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: 'transparent', minHeight: 80, justifyContent: 'center' },
  timeCardActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(200, 155, 60, 0.08)' },
  timeLabel: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700', marginTop: 6 },
  timeLabelActive: { color: COLORS.accent },
  timeSubtitle: { color: COLORS.fogGray, fontSize: 10, marginTop: 2 },
  windGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  windChip: { width: (width - 110) / 4, height: 48, borderRadius: 10, backgroundColor: 'rgba(58, 74, 82, 0.4)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  windChipActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(200, 155, 60, 0.08)' },
  windText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  windTextActive: { color: COLORS.accent },
  textInput: { backgroundColor: 'rgba(58, 74, 82, 0.5)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, minHeight: 52, color: COLORS.textPrimary, fontSize: 15, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)' },
  precipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  precipChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(58, 74, 82, 0.4)', borderWidth: 2, borderColor: 'transparent', minHeight: 48, justifyContent: 'center' },
  precipChipActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(200, 155, 60, 0.08)' },
  precipText: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  precipTextActive: { color: COLORS.accent },
  propGrid: { flexDirection: 'row', gap: 12 },
  propChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, backgroundColor: 'rgba(58, 74, 82, 0.4)', borderWidth: 2, borderColor: 'transparent', minHeight: 52 },
  propChipActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(200, 155, 60, 0.08)' },
  propText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  propTextActive: { color: COLORS.accent },
  // Review
  reviewCard: { backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.2)', marginBottom: 20 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(154, 164, 169, 0.1)' },
  reviewLabel: { color: COLORS.fogGray, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  reviewValue: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  reviewMapsRow: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  reviewMapThumb: { position: 'relative', width: 80, height: 60, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)' },
  reviewMapImage: { width: '100%', height: '100%' },
  reviewMapIdx: { position: 'absolute', bottom: 2, left: 4, color: COLORS.textPrimary, fontSize: 10, fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 4, borderRadius: 3 },
  disclaimerCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(58, 74, 82, 0.3)', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.15)' },
  disclaimerText: { color: COLORS.fogGray, fontSize: 12, lineHeight: 18, flex: 1 },
  // Bottom
  bottomBar: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: 'rgba(154, 164, 169, 0.1)' },
  nextButton: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56 },
  nextButtonDisabled: { backgroundColor: 'rgba(58, 74, 82, 0.5)' },
  nextButtonText: { color: COLORS.primary, fontSize: 16, fontWeight: '800', letterSpacing: 1.5 },
  nextButtonTextDisabled: { color: COLORS.fogGray },
  analyzeButton: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 60 },
  analyzeButtonDisabled: { backgroundColor: 'rgba(58, 74, 82, 0.5)' },
  analyzeButtonText: { color: COLORS.primary, fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  analyzeButtonTextDisabled: { color: COLORS.fogGray },
  // Loading
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingTitle: { color: COLORS.accent, fontSize: 22, fontWeight: '900', letterSpacing: 2, marginTop: 16 },
  loadingSubtitle: { color: COLORS.fogGray, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  loadingSteps: { marginTop: 40, gap: 14, alignSelf: 'stretch' },
  loadingStepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingStepText: { color: COLORS.textSecondary, fontSize: 14 },
});
