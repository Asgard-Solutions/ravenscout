import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { compressImage, profileForTier } from '../src/media/imageProcessor';
import { logClientEvent } from '../src/utils/clientLog';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, WIND_DIRECTIONS, TIME_WINDOWS, BACKEND_URL } from '../src/constants/theme';
import { useSpeciesCatalog, groupSpeciesByCategory } from '../src/constants/species';
import { getSpeciesIconImage } from '../src/constants/speciesIcons';
import { getHuntStyleIconImage } from '../src/constants/huntStyleIcons';
import {
  HUNT_STYLES,
  HUNT_WEAPONS,
  HUNT_METHODS,
  type HuntStyleId,
  type HuntWeaponId,
  type HuntMethodId,
  getHuntStyleLabel,
} from '../src/constants/huntStyles';
import { useNetwork } from '../src/hooks/useNetwork';
import { useAuth } from '../src/hooks/useAuth';
import { RavenSpinner } from '../src/components/RavenSpinner';
import { useScrollToTopOnFocus } from '../src/hooks/useScrollToTopOnFocus';
import TacticalMapView from '../src/map/TacticalMapView';
import { MapStyleSwitcher } from '../src/map/MapStyleSwitcher';
import { useMapStylePreference } from '../src/hooks/useMapStylePreference';
import StateRegionPicker from '../src/components/StateRegionPicker';
import {
  defaultRegionForState,
  resolveStateFromGeocode,
  HUNTING_REGION_LABELS,
  type HuntingRegionId,
} from '../src/constants/huntingRegions';
import { saveHunt } from '../src/media/huntPersistence';
import { seatProvisionalFromAnalyze } from '../src/media/provisionalHuntStore';
import {
  savePendingAssets,
  type PendingHuntAsset,
} from '../src/media/pendingHuntAssets';
import {
  saveMapImageMetaList,
  makeUploadMeta,
  type PendingMapImageMeta,
} from '../src/media/pendingMapImageMeta';
import { probeImage } from '../src/media/imageProbe';
import HuntLocationsSection from '../src/components/HuntLocationsSection';
import { useAnalyticsUsage } from '../src/hooks/useAnalyticsUsage';
import { grantExtraCreditsPurchase } from '../src/api/analyticsApi';
import OutOfCreditsModal from '../src/components/OutOfCreditsModal';
import {
  isPurchasesAvailable,
  purchasePackage as rcPurchasePackage,
  getCreditPackPackages,
} from '../src/lib/purchases';
import { canonicalCreditPackId } from '../src/constants/revenuecat';

const { width } = Dimensions.get('window');
const STEPS = ['Species', 'Maps', 'Conditions', 'Review'];
const MAX_MAPS = 5;

interface WeatherData {
  wind_direction: string;
  wind_speed_mph: number;
  temperature_f: number;
  precipitation_chance: number;
  cloud_cover: number;
  condition: string;
  humidity: number;
  pressure_mb: number;
  sunrise: string | null;
  sunset: string | null;
  location_name: string | null;
  fetched_at: string;
  is_forecast: boolean;
}

type FieldSource = 'auto' | 'manual';

export default function SetupScreen() {
  const router = useRouter();
  const { isConnected } = useNetwork();
  const { sessionToken, refreshUser, user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTopOnFocus(scrollRef);
  const [step, setStep] = useState(0);
  // Reset scroll to the top whenever the setup wizard advances or
  // retreats between steps — the ScrollView is reused across all
  // steps (single screen, variable content), so without this the
  // previous step's scroll offset carries over. Use `scrollTo`
  // instead of `scrollToEnd` to always land at the first field.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: 0, animated: false });
    }
  }, [step]);
  const [loading, setLoading] = useState(false);
  const speciesCatalog = useSpeciesCatalog();
  const [limitReached, setLimitReached] = useState(false);

  // Form state
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [mapImages, setMapImages] = useState<string[]>([]);
  // Geo metadata captured at the moment each map image was added.
  // Index-aligned with mapImages. Drained to /api/saved-map-images
  // after the hunt is upserted (see /results.tsx).
  const [mapImagesMeta, setMapImagesMeta] = useState<(PendingMapImageMeta | null)[]>([]);
  const [primaryMapIndex, setPrimaryMapIndex] = useState(0);
  const [mapInputMode, setMapInputMode] = useState<'upload' | 'interactive'>('upload');
  const [showInteractiveMap, setShowInteractiveMap] = useState(false);
  const [coordInput, setCoordInput] = useState(''); // legacy, kept for compat
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const [mapKey, setMapKey] = useState(0);
  const [captureCount, setCaptureCount] = useState(0);
  const [huntDate, setHuntDate] = useState(new Date().toISOString().split('T')[0]);

  // Lifted map-style state — owned here so the chip switcher can render
  // OUTSIDE the WebView wrapper (the wrapper steals all touches via
  // its onStartShouldSetResponderCapture handlers to protect map pinch
  // /pan from the parent ScrollView, which previously prevented chip
  // taps from ever firing on Android).
  const { styleId: mapStyleId, setStyleId: setMapStyleId } = useMapStylePreference();

  const isPaidTier = user?.tier === 'core' || user?.tier === 'pro';

  // Out-of-credits modal state. We do NOT auto-fetch usage on every
  // setup-screen mount (it'd be wasteful for the 99% of analyses that
  // succeed). The hook is fetched lazily by `refresh()` below the
  // first time we hit a 402.
  const { usage: analyticsUsage, refresh: refreshAnalyticsUsage } = useAnalyticsUsage(false);
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);

  // Pack purchase from the analyze flow's "out of credits" modal.
  // Drives a real RevenueCat purchase via the `credit_packs` offering
  // when the SDK is available; falls back to a synthetic transaction
  // id in Expo Go / web previews. The grant call always uses the
  // canonical pack id so the backend's alias resolver is happy.
  const handleAnalyzePackPurchase = useCallback(async (pack: { id: string; credits: number }) => {
    const canonicalId =
      (canonicalCreditPackId(pack.id) as string | null) || pack.id;

    if (isPurchasesAvailable()) {
      const pkgs = await getCreditPackPackages();
      if (pkgs.ok) {
        const pkg = (pkgs.value as Record<string, any>)[canonicalId];
        if (pkg) {
          const result = await rcPurchasePackage(pkg);
          if (result.status === 'cancelled') return 'cancelled' as const;
          if (result.status === 'success' && result.transactionId) {
            try {
              await grantExtraCreditsPurchase(canonicalId, result.transactionId);
              await refreshAnalyticsUsage();
              return 'success' as const;
            } catch {
              return 'cancelled' as const;
            }
          }
          // 'error' / 'unavailable' fall through to preview path so
          // the user still has a way out in dev builds.
        }
      }
    }

    const txnId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await grantExtraCreditsPurchase(canonicalId, txnId);
      await refreshAnalyticsUsage();
      return 'success' as const;
    } catch {
      return 'cancelled' as const;
    }
  }, [refreshAnalyticsUsage]);

  const [timeWindow, setTimeWindow] = useState('morning');
  const [windDirection, setWindDirection] = useState('N');
  const [windSpeed, setWindSpeed] = useState('');
  const [temperature, setTemperature] = useState('');
  const [precipitation, setPrecipitation] = useState('none');
  const [cloudCover, setCloudCover] = useState('');
  const [propertyType, setPropertyType] = useState('public');
  const [region, setRegion] = useState(''); // legacy free-form (still saved for hunts created before the state/region picker)
  // New structured location fields. `stateCode` is the 2-letter US
  // state code; `huntingRegion` is the canonical region id derived
  // from the state (auto for single-region states, user-pickable for
  // multi-region states). Both ride alongside the legacy `region`
  // string until backfilled.
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [huntingRegion, setHuntingRegion] = useState<HuntingRegionId | null>(null);
  // Canonical hunt-style id (archery/rifle/blind/saddle/public_land/
  // spot_and_stalk) or null when unselected. ONLY canonical ids leave
  // this screen — see src/constants/huntStyles.ts.
  // Hunt-style flow is split into a 2-step natural progression:
  // Step 1 — Weapon (archery / rifle / shotgun)
  // Step 2 — Method (blind / saddle / spot_and_stalk)
  // Both ride alongside the analyze payload. The legacy `hunt_style`
  // field is filled from the more specific selection (method first,
  // then weapon) so existing prompt packs keep working unchanged
  // until the backend learns to read both fields independently.
  const [huntWeapon, setHuntWeapon] = useState<HuntWeaponId | null>(null);
  const [huntMethod, setHuntMethod] = useState<HuntMethodId | null>(null);
  // Derived legacy id for back-compat with persistence + analyze body.
  const huntStyle: HuntStyleId | null = huntMethod || huntWeapon || null;
  const setHuntStyle = (next: HuntStyleId | null) => {
    // Keep legacy clear-all behavior when a downstream consumer
    // (e.g. an old test or the "Clear" button) tries to reset.
    if (next == null) {
      setHuntWeapon(null);
      setHuntMethod(null);
      return;
    }
    if (['archery', 'rifle', 'shotgun'].includes(next)) {
      setHuntWeapon(next as HuntWeaponId);
    } else if (['blind', 'saddle', 'spot_and_stalk'].includes(next)) {
      setHuntMethod(next as HuntMethodId);
    }
  };

  // Weather auto-fill
  const [locationCoords, setLocationCoords] = useState<{lat: number; lon: number} | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [lastWeatherFetch, setLastWeatherFetch] = useState<string | null>(null);

  // Track which fields are auto vs manual
  const [fieldSources, setFieldSources] = useState<Record<string, FieldSource>>({
    wind_direction: 'manual',
    wind_speed: 'manual',
    temperature: 'manual',
    precipitation: 'manual',
    cloud_cover: 'manual',
  });

  // Optional GPS assets the user adds before submitting analysis.
  // Persisted briefly to AsyncStorage when the user taps ANALYZE so
  // /results.tsx can drain them via the new
  // /api/hunts/{id}/assets endpoint after the parent hunt is upserted
  // to the cloud (the assets need a server-side hunt_id to attach to).
  const [pendingAssets, setPendingAssets] = useState<PendingHuntAsset[]>([]);

  const canProceed = () => {
    switch (step) {
      case 0: return selectedSpecies !== '';
      case 1: return mapImages.length > 0;
      case 2: return windDirection !== '';
      case 3: return true;
      default: return false;
    }
  };

  const [isCompressing, setIsCompressing] = useState(false);

  /**
   * Compress + resize an image before it enters the state that
   * downstream depends on (LLM upload, AsyncStorage provisional
   * cache, analysisStore). On mobile Chrome the raw gallery
   * picker can hand back 5-15MB base64 blobs that blow past
   * localStorage quota and JS heap limits. A one-pass resize
   * through expo-image-manipulator drops a typical 1.8MB upload
   * to ~300-700KB without noticeable quality loss (PROFILE_PRO =
   * 2048px max-dim @ 0.85 JPEG; PROFILE_CORE = 1280px @ 0.70).
   *
   * Logs a `image_compressed` event so we can see before/after
   * byte sizes in backend logs and catch quota regressions early.
   */
  const compressForPipeline = async (input: string, source: 'upload' | 'capture'): Promise<string> => {
    const before = (input || '').length;
    const profile = profileForTier(user?.tier || 'trial');
    try {
      setIsCompressing(true);
      const out = await compressImage(input, profile);
      logClientEvent({
        event: 'image_compressed',
        data: {
          source,
          tier: user?.tier ?? null,
          before_bytes: before,
          after_bytes: out.bytes,
          after_width: out.width,
          after_height: out.height,
          compressed: out.compressed,
          failed: out.failed,
          profile_max_dim: profile.maxDim,
          profile_quality: profile.quality,
        },
      });
      if (out.failed) return input;
      return out.dataUri;
    } catch (err: any) {
      logClientEvent({
        event: 'image_compressed',
        data: {
          source,
          tier: user?.tier ?? null,
          before_bytes: before,
          failed: true,
          error: err?.message || String(err),
        },
      });
      return input;
    } finally {
      setIsCompressing(false);
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
      const raw = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const compressed = await compressForPipeline(raw, 'upload');
      // Probe the COMPRESSED dataUrl for original pixel dims —
      // that's what the saved image actually persists. Used so
      // /api/saved-map-images can record (originalWidth,
      // originalHeight) for pixel-only marker placement.
      const probed = probeImage(compressed);
      setMapImages(prev => [...prev, compressed]);
      setMapImagesMeta(prev => [
        ...prev,
        makeUploadMeta(probed ? { width: probed.width, height: probed.height } : null),
      ]);
    }
  };

  const removeMap = (index: number) => {
    setMapImages(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Adjust primary index
      if (index === primaryMapIndex) {
        setPrimaryMapIndex(0);
      } else if (index < primaryMapIndex) {
        setPrimaryMapIndex(prev2 => Math.max(0, prev2 - 1));
      }
      return updated;
    });
    // Keep the parallel meta array in lock-step with mapImages so
    // /results.tsx can zip them with hunt.mediaRefs by index.
    setMapImagesMeta(prev => prev.filter((_, i) => i !== index));
  };

  const setPrimary = (index: number) => {
    setPrimaryMapIndex(index);
  };

  const captureMapView = () => {
    if (mapImages.length >= MAX_MAPS) {
      Alert.alert('Limit Reached', `Maximum ${MAX_MAPS} maps per hunt.`);
      return;
    }
    // Trigger capture via the TacticalMapView component
    setCaptureCount(prev => prev + 1);
  };

  const handleMapCapture = useCallback(async (base64: string, geoMeta?: any) => {
    if (mapImages.length >= MAX_MAPS) return;
    const compressed = await compressForPipeline(base64, 'capture');
    setMapImages(prev => [...prev, compressed]);

    // Geo metadata MUST come from the moment of capture — that's the
    // contract for SavedMapImage.supportsGeoPlacement = true. If the
    // bundled WebView capture script returned the bounds + camera
    // state, store a maptiler entry; otherwise fall back to a
    // pixel-only upload-style record so the saved row still tracks
    // the original dimensions for marker math.
    let metaEntry: PendingMapImageMeta;
    if (
      geoMeta &&
      typeof geoMeta.northLat === 'number' &&
      typeof geoMeta.southLat === 'number' &&
      typeof geoMeta.westLng === 'number' &&
      typeof geoMeta.eastLng === 'number' &&
      typeof geoMeta.originalWidth === 'number' &&
      typeof geoMeta.originalHeight === 'number'
    ) {
      metaEntry = {
        source: 'maptiler',
        supportsGeoPlacement: true,
        originalWidth: geoMeta.originalWidth,
        originalHeight: geoMeta.originalHeight,
        northLat: geoMeta.northLat,
        southLat: geoMeta.southLat,
        westLng: geoMeta.westLng,
        eastLng: geoMeta.eastLng,
        centerLat: geoMeta.centerLat ?? geoMeta.northLat,
        centerLng: geoMeta.centerLng ?? geoMeta.westLng,
        zoom: typeof geoMeta.zoom === 'number' ? geoMeta.zoom : 0,
        bearing: typeof geoMeta.bearing === 'number' ? geoMeta.bearing : 0,
        pitch: typeof geoMeta.pitch === 'number' ? geoMeta.pitch : 0,
        style: geoMeta.styleUrl ?? null,
      };
    } else {
      const probed = probeImage(compressed);
      metaEntry = makeUploadMeta(
        probed ? { width: probed.width, height: probed.height } : null,
      );
    }
    setMapImagesMeta(prev => [...prev, metaEntry]);

    Alert.alert('Captured!', 'Map view saved. You can capture more or continue.');
  }, [mapImages.length]);

  const goToCoordinates = () => {
    const lat = parseFloat(latInput.trim());
    const lon = parseFloat(lonInput.trim());
    if (
      !isNaN(lat) && !isNaN(lon) &&
      lat >= -90 && lat <= 90 &&
      lon >= -180 && lon <= 180
    ) {
      setLocationCoords({ lat, lon });
      setCoordInput(`${lat}, ${lon}`); // legacy mirror for any consumer
      setMapKey(prev => prev + 1);
      return;
    }
    Alert.alert(
      'Invalid Coordinates',
      'Latitude must be between −90 and 90; longitude between −180 and 180. Use a minus sign (−) for South / West.',
    );
  };

  // Toggle the sign of whatever is currently in a coord input. Lets
  // the user enter negatives without needing the punctuation keyboard
  // (decimal-pad on Android does not surface "−").
  const toggleSign = (which: 'lat' | 'lon') => {
    const cur = which === 'lat' ? latInput : lonInput;
    if (!cur.trim()) return;
    const next = cur.startsWith('-') ? cur.slice(1) : `-${cur}`;
    if (which === 'lat') setLatInput(next);
    else setLonInput(next);
  };

  // --- Location ---
  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is needed for weather data.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;
      setLocationCoords({ lat, lon });
      setLatInput(lat.toFixed(6));
      setLonInput(lon.toFixed(6));
      setCoordInput(`${lat.toFixed(6)}, ${lon.toFixed(6)}`); // legacy mirror
      setMapKey(prev => prev + 1);
      // Try to get location name via reverse geocode
      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (geocode[0]) {
          const g = geocode[0];
          setLocationName(`${g.city || g.name || ''}, ${g.region || ''}`);
          // Auto-pick the state from the geocoded `region` field.
          // expo-location returns the full state name on iOS and on
          // most Android geocoders ("Oklahoma"), but occasionally a
          // 2-letter code — resolveStateFromGeocode handles both.
          const matched = resolveStateFromGeocode(g.region);
          if (matched) {
            setStateCode(matched.code);
            setHuntingRegion(defaultRegionForState(matched.code));
          }
        }
      } catch {}
    } catch (err) {
      Alert.alert('Location Error', 'Could not get your location. Try again or enter manually.');
    }
  };

  // --- Weather Fetch ---
  const fetchWeather = useCallback(async () => {
    if (!locationCoords || !isConnected) return;
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/weather`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          lat: locationCoords.lat,
          lon: locationCoords.lon,
          date: huntDate,
          time_window: timeWindow,
        }),
      });
      const data = await resp.json();
      if (data.success && data.data) {
        const w: WeatherData = data.data;
        setWeatherData(w);
        setLastWeatherFetch(new Date().toISOString());
        // Auto-fill fields (only if still in 'auto' mode or first fill)
        applyWeatherData(w);
        // Cache for offline
        await AsyncStorage.setItem('last_weather', JSON.stringify(w));
      } else {
        setWeatherError(data.error || 'Failed to fetch weather');
      }
    } catch {
      setWeatherError('Connection error');
      // Try cached weather
      const cached = await AsyncStorage.getItem('last_weather');
      if (cached) {
        const w: WeatherData = JSON.parse(cached);
        setWeatherData(w);
        applyWeatherData(w);
        setWeatherError('Using cached weather data');
      }
    } finally {
      setWeatherLoading(false);
    }
  }, [locationCoords, huntDate, timeWindow, isConnected]);

  const applyWeatherData = (w: WeatherData) => {
    const newSources: Record<string, FieldSource> = { ...fieldSources };

    if (fieldSources.wind_direction !== 'manual' || !windDirection || windDirection === 'N') {
      setWindDirection(w.wind_direction);
      newSources.wind_direction = 'auto';
    }
    if (fieldSources.wind_speed !== 'manual' || !windSpeed) {
      setWindSpeed(`${w.wind_speed_mph} mph`);
      newSources.wind_speed = 'auto';
    }
    if (fieldSources.temperature !== 'manual' || !temperature) {
      setTemperature(`${w.temperature_f}°F`);
      newSources.temperature = 'auto';
    }
    if (fieldSources.precipitation !== 'manual' || precipitation === 'none') {
      if (w.precipitation_chance > 60) setPrecipitation('heavy rain');
      else if (w.precipitation_chance > 30) setPrecipitation('light rain');
      else setPrecipitation('none');
      newSources.precipitation = 'auto';
    }
    if (fieldSources.cloud_cover !== 'manual' || !cloudCover) {
      setCloudCover(`${w.cloud_cover}%`);
      newSources.cloud_cover = 'auto';
    }
    if (w.location_name && !region) {
      setRegion(w.location_name);
    }
    setFieldSources(newSources);
  };

  const markManual = (field: string) => {
    setFieldSources(prev => ({ ...prev, [field]: 'manual' }));
  };

  // Auto-fetch weather when location + date + time changes
  useEffect(() => {
    if (locationCoords && step === 2) {
      fetchWeather();
    }
  }, [locationCoords, huntDate, timeWindow, step]);

  const submitAnalysis = async () => {
    if (mapImages.length === 0) return;
    if (!isConnected) {
      Alert.alert('Offline', 'Map analysis requires an internet connection.');
      return;
    }
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }
      const response = await fetch(`${BACKEND_URL}/api/analyze-hunt`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conditions: {
            animal: selectedSpecies,
            hunt_date: huntDate,
            time_window: timeWindow,
            wind_direction: windDirection,
            temperature: temperature || null,
            precipitation: precipitation !== 'none' ? precipitation : null,
            property_type: propertyType,
            // Build the legacy free-form `region` string from the
            // structured state + region picker so older backends and
            // analysis prompts continue to work. Fall back to the
            // raw legacy `region` value (unused in current UI) if no
            // state was picked.
            region: stateCode
              ? region.trim() || `${HUNTING_REGION_LABELS[huntingRegion as HuntingRegionId] || ''}${stateCode ? ` (${stateCode})` : ''}`.trim()
              : (region || null),
            state_code: stateCode || null,
            hunting_region: huntingRegion || null,
            // Canonical id only — never display text. Method takes
            // precedence over weapon for back-compat with existing
            // prompt packs that key on saddle / blind / stalk.
            hunt_style: huntStyle,
            // New structured weapon + method ride alongside; backend
            // can read these once prompt packs split shotgun out.
            hunt_weapon: huntWeapon,
            hunt_method: huntMethod,
          },
          map_image_base64: mapImages[primaryMapIndex],
          additional_images: isPaidTier && user?.tier === 'pro'
            ? mapImages.filter((_, i) => i !== primaryMapIndex)
            : undefined,
          // Task 7: pass any user-provided GPS assets the hunter
          // pinned in the New Hunt flow so the LLM can reference
          // them as anchor points. The hunt itself doesn't have a
          // server row yet at this point — assets are sent inline
          // and persisted post-finalize via /api/hunts/{id}/assets
          // (Task 4 drain).
          location_assets: pendingAssets.length > 0
            ? pendingAssets.map((a) => ({
                asset_id: a.localId,
                type: a.type,
                name: a.name,
                latitude: a.latitude,
                longitude: a.longitude,
                notes: a.notes ?? null,
              }))
            : undefined,
        }),
      });

      if (response.status === 401) {
        Alert.alert('Session Expired', 'Please sign in again.');
        setLoading(false);
        router.replace('/login');
        return;
      }

      // 402 Payment Required → user is out of analytics. Auto-open
      // the OutOfCreditsModal so they can either upgrade to Pro or
      // top off with an extra-credit pack right where they are.
      // Refresh usage first so the modal renders with accurate
      // monthly + extra balance.
      if (response.status === 402) {
        setLoading(false);
        try {
          await refreshAnalyticsUsage();
        } catch {
          // Modal can still render with stale/null usage; OutOfCreditsModal
          // tolerates a null payload.
        }
        setCreditsModalOpen(true);
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        Alert.alert('Error', errData.detail || errData.error || `Server error (${response.status})`);
        setLoading(false);
        return;
      }

      const data = await response.json();
      if (data.success && data.result) {
        const overlaysWithIds = (data.result.overlays || []).map((o: any, i: number) => ({
          ...o, id: `ai-${i}-${Date.now()}`, isCustom: false,
        }));
        const enrichedResult = { ...data.result, overlays: overlaysWithIds };

        // Capture the natural dimensions of the EXACT image the user
        // chose as the primary analyzed image. We bake these, along
        // with the GPS that was active at analyze time, into the
        // AnalysisContext so overlays never drift on reload even if
        // the user later shuffles the image list or edits the hunt.
        //
        // HARD TIMEOUT: Image.getSize can silently hang on web with
        // data URIs (no callback ever fires). Never let this block
        // the post-analyze save + navigation — fall back to 0/0 dims
        // after 2s. The UI falls back to measured on-screen dims
        // in that case; the analysis context still correctly locks
        // the imageId + GPS, which is the critical invariant.
        const primaryBase64 = mapImages[primaryMapIndex];
        const primaryDims: { width: number; height: number } = await Promise.race([
          new Promise<{ width: number; height: number }>(resolve => {
            try {
              Image.getSize(
                primaryBase64,
                (w, h) => resolve({ width: w, height: h }),
                () => resolve({ width: 0, height: 0 }),
              );
            } catch {
              resolve({ width: 0, height: 0 });
            }
          }),
          new Promise<{ width: number; height: number }>(resolve =>
            setTimeout(() => resolve({ width: 0, height: 0 }), 2000),
          ),
        ]);

        // ─────────────────────────────────────────────────────────
        // CRITICAL PATH — seat the provisional entry BEFORE navigating
        // and BEFORE the heavier saveHunt pipeline. On mobile Chrome
        // the setup.tsx runtime can be torn down during the long LLM
        // wait; the full saveHunt pipeline has been observed to
        // hang / stall on device after `save_hunt_started` fires.
        // This minimal write (analysis + base64 displayUris) is all
        // /results needs to hydrate. If it fails we still navigate
        // so the user at least sees a clear error state.
        //
        // seatProvisionalFromAnalyze is synchronous up to the
        // AsyncStorage write (~10-50ms on web) and returns even
        // when the write fails (ok=false, mode='lite').
        // ─────────────────────────────────────────────────────────
        try {
          const seatResult = await seatProvisionalFromAnalyze({
            huntId: enrichedResult.id,
            analysisResult: enrichedResult,
            metadata: {
              species: selectedSpecies,
              speciesName: speciesCatalog.findSpecies(selectedSpecies)?.name || selectedSpecies,
              date: huntDate,
              timeWindow,
              windDirection,
              temperature,
              propertyType,
              region,
              huntStyle,
              weatherData,
              locationCoords,
            },
            base64Images: mapImages,
            primaryMediaIndex: primaryMapIndex,
            tier: (user as any)?.tier,
            analysisContext: {
              imageNaturalWidth: primaryDims.width,
              imageNaturalHeight: primaryDims.height,
              gps: locationCoords,
            },
            locationCoords,
          });
          logClientEvent({
            event: 'analyze_provisional_seated',
            data: {
              hunt_id: enrichedResult.id,
              ok: seatResult.ok,
              mode: seatResult.mode,
              bytes: seatResult.bytes,
              error: seatResult.error ?? null,
            },
          });
        } catch (seatErr: any) {
          logClientEvent({
            event: 'analyze_provisional_seated',
            data: {
              hunt_id: enrichedResult.id,
              ok: false,
              threw: true,
              error: seatErr?.message || String(seatErr),
            },
          });
        }

        // Navigate IMMEDIATELY after the critical-path seat. We do
        // NOT fire the full saveHunt pipeline here — on mobile
        // Chrome it's been observed to OOM the tab by allocating
        // a second ~1.3MB base64 copy alongside the provisional
        // entry + React state + Image element. The provisional
        // hot-cache is sufficient for /results to render; deeper
        // persistence (S3 upload, analysisStore write) can be run
        // lazily from /results or deferred to a background step
        // once /results is confirmed visible.
        if (refreshUser) refreshUser();

        // Stash any user-entered GPS assets so /results.tsx can
        // POST them to /api/hunts/{id}/assets after the parent hunt
        // is upserted. Best-effort — failures here don't block the
        // analyze flow; the user can still re-add assets later from
        // the hunt detail screen (future task).
        if (pendingAssets.length > 0) {
          try {
            await savePendingAssets(enrichedResult.id, pendingAssets);
          } catch {
            // Storage failures are non-fatal here; UI will not
            // surface this to the user.
          }
        }

        // Stash the per-image geo metadata captured at upload /
        // capture time. /results.tsx zips this with hunt.mediaRefs
        // by INDEX once the MediaAssets are persisted, so the
        // SavedMapImage rows go in keyed by the same image_ids the
        // app's media store uses everywhere else.
        if (mapImagesMeta.length > 0) {
          try {
            await saveMapImageMetaList(enrichedResult.id, mapImagesMeta);
          } catch {
            // ditto — best-effort.
          }
        }
        // REPLACE (not push) so /setup unmounts IMMEDIATELY and its
        // ~2MB base64 payload + bitmap allocations are released
        // BEFORE /results begins decoding its own primary image.
        // Mobile Chrome OOM-kills the tab otherwise when both
        // screens are in memory during the brief overlap window.
        router.replace({ pathname: '/results', params: { huntId: enrichedResult.id } });
      } else {
        const msg = data.error || data.message || 'Analysis failed. Please try again.';
        const isLimitError = msg.toLowerCase().includes('limit') || msg.toLowerCase().includes('upgrade');
        if (isLimitError) {
          setLoading(false);
          setLimitReached(true);
          if (refreshUser) refreshUser();
          return;
        }
        Alert.alert('Analysis Failed', msg);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not connect to the server. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <RavenSpinner size={140} />
          <Text style={styles.loadingTitle}>ANALYZING TERRAIN</Text>
          <Text style={styles.loadingSubtitle}>
            AI is evaluating your map for{'\n'}
            {speciesCatalog.findSpecies(selectedSpecies)?.name || 'game'} patterns...
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

  // Limit Reached Screen — shown when user has exhausted their analyses
  if (limitReached) {
    const tierName = user?.tier?.toUpperCase() || 'TRIAL';
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.limitContainer}>
          <View style={styles.limitIconCircle}>
            <Ionicons name="lock-closed" size={40} color={COLORS.accent} />
          </View>
          <Text style={styles.limitTitle}>ANALYSIS LIMIT{'\n'}REACHED</Text>
          <Text style={styles.limitSubtitle}>
            You've used all {user?.usage?.limit || 3} analyses on your {tierName} plan.
            {user?.tier === 'trial'
              ? '\n\nUpgrade to Core or Pro for monthly analyses, or top off with an extra-credit pack.'
              : '\n\nYour limit resets next billing cycle. Top off with extra credits to keep scouting now — they never expire.'}
          </Text>

          <TouchableOpacity
            testID="limit-upgrade-button"
            style={styles.limitUpgradeButton}
            onPress={() => router.push('/subscription')}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up-circle" size={22} color={COLORS.primary} />
            <Text style={styles.limitUpgradeText}>VIEW PLANS & UPGRADE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="limit-buy-extra-button"
            style={styles.limitBuyExtraButton}
            onPress={async () => {
              try { await refreshAnalyticsUsage(); } catch {}
              setCreditsModalOpen(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={20} color={COLORS.accent} />
            <Text style={styles.limitBuyExtraText}>BUY EXTRA ANALYTICS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="limit-home-button"
            style={styles.limitHomeButton}
            onPress={() => router.replace('/')}
            activeOpacity={0.8}
          >
            <Ionicons name="home-outline" size={18} color={COLORS.textSecondary} />
            <Text style={styles.limitHomeText}>BACK TO HOME</Text>
          </TouchableOpacity>

          <View style={styles.limitTierInfo}>
            <Text style={styles.limitTierLabel}>AVAILABLE PLANS</Text>
            <View style={styles.limitTierRow}>
              <Ionicons name="flash" size={14} color={COLORS.accent} />
              <Text style={styles.limitTierText}>Core: 10 analyses/month — $7.99/mo</Text>
            </View>
            <View style={styles.limitTierRow}>
              <Ionicons name="rocket" size={14} color={COLORS.accent} />
              <Text style={styles.limitTierText}>Pro: 40 analyses/month — $14.99/mo</Text>
            </View>
          </View>
        </View>

        {/* Out-of-credits modal mounted here too so users hitting
            this gate can buy a pack without leaving the screen. */}
        <OutOfCreditsModal
          visible={creditsModalOpen}
          usage={analyticsUsage}
          onClose={async () => {
            setCreditsModalOpen(false);
            // After the modal closes, refresh user + usage so a fresh
            // credit balance is reflected. If the user actually got
            // some credits, drop them out of the limit gate so they
            // can re-tap ANALYZE.
            try {
              if (refreshUser) await refreshUser();
              const fresh = await refreshAnalyticsUsage();
              if (fresh && fresh.totalRemaining > 0) {
                setLimitReached(false);
              }
            } catch {}
          }}
          onUpgradePress={() => router.push('/subscription')}
          onPackPurchase={handleAnalyzePackPurchase}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {!isConnected && (
          <View testID="offline-banner-setup" style={styles.offlineBanner}>
            <Ionicons name="cloud-offline" size={16} color={COLORS.accent} />
            <Text style={styles.offlineBannerText}>OFFLINE — Analysis requires connection</Text>
          </View>
        )}

        <View style={styles.topBar}>
          <TouchableOpacity testID="setup-back-button" onPress={() => step > 0 ? setStep(step - 1) : router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>NEW HUNT</Text>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>{step + 1}/{STEPS.length}</Text>
          </View>
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
        </View>
        <View style={styles.stepLabels}>
          {STEPS.map((s, i) => (
            <Text key={s} style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>{s}</Text>
          ))}
        </View>

        <ScrollView ref={scrollRef} style={styles.scrollContent} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Step 0: Species */}
          {step === 0 && (
            <View>
              <Text style={styles.stepTitle}>SELECT SPECIES</Text>
              <Text style={styles.stepDescription}>Choose the game you&apos;re targeting</Text>
              {speciesCatalog.loading && speciesCatalog.species.length === 0 ? (
                <ActivityIndicator color={COLORS.accent} style={{ marginTop: 20 }} />
              ) : (
                groupSpeciesByCategory(speciesCatalog.species, speciesCatalog.categories).map(group => (
                  <View key={group.category.id} style={{ marginBottom: 18 }}>
                    <Text style={styles.categoryHeader}>{group.category.label.toUpperCase()}</Text>
                    <View style={styles.speciesGrid}>
                      {group.species.map((species) => {
                        const isActive = selectedSpecies === species.id;
                        const isLocked = species.locked;
                        const onPress = () => {
                          if (isLocked) {
                            Alert.alert(
                              `${species.name} — ${species.min_tier.charAt(0).toUpperCase() + species.min_tier.slice(1)} feature`,
                              `Upgrade to ${species.min_tier.charAt(0).toUpperCase() + species.min_tier.slice(1)} to analyze ${species.name.toLowerCase()} hunts.`,
                              [
                                { text: 'Not now', style: 'cancel' },
                                { text: 'Upgrade', onPress: () => router.push('/subscription') },
                              ],
                            );
                            return;
                          }
                          setSelectedSpecies(species.id);
                        };
                        return (
                          <TouchableOpacity
                            key={species.id}
                            testID={`species-${species.id}`}
                            style={[
                              styles.speciesCard,
                              isActive && styles.speciesCardActive,
                              isLocked && styles.speciesCardLocked,
                            ]}
                            onPress={onPress}
                            activeOpacity={0.7}
                          >
                            <View style={styles.speciesIconContainer}>
                              {(() => {
                                // Per-species custom illustration (e.g. the
                                // gold/white deer pair). Falls back to the
                                // Ionicons glyph from the backend catalog
                                // when no custom image is registered.
                                const iconImage = getSpeciesIconImage(species.id);
                                if (iconImage) {
                                  return (
                                    <Image
                                      source={isActive ? iconImage.active : iconImage.inactive}
                                      style={[
                                        styles.speciesIconImage,
                                        isLocked && styles.speciesIconImageLocked,
                                      ]}
                                      resizeMode="contain"
                                      accessibilityLabel={species.name}
                                    />
                                  );
                                }
                                return (
                                  <Ionicons
                                    name={(species.icon as any) || 'paw'}
                                    size={32}
                                    color={isActive ? COLORS.accent : isLocked ? COLORS.fogGray : COLORS.fogGray}
                                  />
                                );
                              })()}
                            </View>
                            <View style={styles.speciesHeaderRow}>
                              <Text style={[styles.speciesName, isActive && styles.speciesNameActive]}>
                                {species.name}
                              </Text>
                              {isLocked && (
                                <View style={styles.lockBadge}>
                                  <Ionicons name="lock-closed" size={12} color={COLORS.accent} />
                                  <Text style={styles.lockBadgeText}>{species.min_tier.toUpperCase()}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.speciesDesc}>{species.description}</Text>
                            {isActive && (
                              <View style={styles.selectedCheck}>
                                <Ionicons name="checkmark-circle" size={24} color={COLORS.accent} />
                              </View>
                            )}
                            {isLocked && (
                              <View style={styles.upgradeHintRow}>
                                <Text style={styles.upgradeHintText}>Tap to upgrade</Text>
                                <Ionicons name="chevron-forward" size={14} color={COLORS.accent} />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Step 1: Maps — Upload or Interactive Map */}
          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>SELECT MAP AREA</Text>
              <Text style={styles.stepDescription}>
                {isPaidTier ? 'Upload a map image or use the interactive map' : 'Upload satellite, aerial, or topo maps'} ({mapImages.length}/{MAX_MAPS})
              </Text>

              {/* Mode Toggle — only for Core/Pro */}
              {isPaidTier && (
                <View style={styles.mapModeToggle}>
                  <TouchableOpacity
                    testID="map-mode-upload"
                    style={[styles.mapModeOption, mapInputMode === 'upload' && styles.mapModeOptionActive]}
                    onPress={() => { setMapInputMode('upload'); setShowInteractiveMap(false); }}
                  >
                    <Ionicons name="cloud-upload-outline" size={18} color={mapInputMode === 'upload' ? COLORS.primary : COLORS.fogGray} />
                    <Text style={[styles.mapModeText, mapInputMode === 'upload' && styles.mapModeTextActive]}>UPLOAD</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="map-mode-interactive"
                    style={[styles.mapModeOption, mapInputMode === 'interactive' && styles.mapModeOptionActive]}
                    onPress={() => { setMapInputMode('interactive'); setShowInteractiveMap(true); }}
                  >
                    <Ionicons name="globe-outline" size={18} color={mapInputMode === 'interactive' ? COLORS.primary : COLORS.fogGray} />
                    <Text style={[styles.mapModeText, mapInputMode === 'interactive' && styles.mapModeTextActive]}>MAP</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Upload Mode */}
              {mapInputMode === 'upload' && (
                <View>
                  {mapImages.length < MAX_MAPS && (
                    <TouchableOpacity testID="upload-map-button" style={[styles.uploadArea, mapImages.length > 0 && styles.uploadAreaCompact]} onPress={pickImage} activeOpacity={0.7}>
                      <Ionicons name="cloud-upload" size={mapImages.length > 0 ? 32 : 48} color={COLORS.accent} />
                      <Text style={styles.uploadTitle}>{mapImages.length === 0 ? 'TAP TO UPLOAD MAP' : 'ADD ANOTHER MAP'}</Text>
                      {mapImages.length === 0 && <Text style={styles.uploadSubtitle}>Satellite, aerial, or topo map{'\n'}PNG, JPG supported</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Interactive Map Mode — Core/Pro only */}
              {mapInputMode === 'interactive' && showInteractiveMap && (
                <View>
                  {/* Use Current Location — primary CTA */}
                  <TouchableOpacity
                    testID="use-current-location-button"
                    style={styles.useLocationButton}
                    onPress={getLocation}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="navigate" size={18} color={COLORS.primary} />
                    <Text style={styles.useLocationText}>USE MY CURRENT LOCATION</Text>
                  </TouchableOpacity>

                  <Text style={styles.coordSeparator}>OR ENTER GPS MANUALLY</Text>

                  {/* GPS Coordinate Inputs — Lat / Lon side-by-side, decimal-pad keyboard. */}
                  <View style={styles.coordPairRow}>
                    {/* LAT */}
                    <View style={styles.coordField}>
                      <Text style={styles.coordFieldLabel}>LAT</Text>
                      <View style={styles.coordFieldInputRow}>
                        <TouchableOpacity
                          testID="lat-sign-toggle"
                          style={styles.signToggle}
                          onPress={() => toggleSign('lat')}
                          accessibilityLabel="Toggle latitude sign"
                        >
                          <Text style={styles.signToggleText}>
                            {latInput.startsWith('-') ? '−' : '+'}
                          </Text>
                        </TouchableOpacity>
                        <TextInput
                          testID="lat-input"
                          style={styles.coordFieldInput}
                          placeholder="38.573"
                          placeholderTextColor={COLORS.fogGray}
                          value={latInput}
                          onChangeText={setLatInput}
                          keyboardType="decimal-pad"
                          returnKeyType="next"
                          maxLength={12}
                        />
                      </View>
                    </View>

                    {/* LON */}
                    <View style={styles.coordField}>
                      <Text style={styles.coordFieldLabel}>LON</Text>
                      <View style={styles.coordFieldInputRow}>
                        <TouchableOpacity
                          testID="lon-sign-toggle"
                          style={styles.signToggle}
                          onPress={() => toggleSign('lon')}
                          accessibilityLabel="Toggle longitude sign"
                        >
                          <Text style={styles.signToggleText}>
                            {lonInput.startsWith('-') ? '−' : '+'}
                          </Text>
                        </TouchableOpacity>
                        <TextInput
                          testID="lon-input"
                          style={styles.coordFieldInput}
                          placeholder="-96.726"
                          placeholderTextColor={COLORS.fogGray}
                          value={lonInput}
                          onChangeText={setLonInput}
                          keyboardType="decimal-pad"
                          returnKeyType="go"
                          onSubmitEditing={goToCoordinates}
                          maxLength={12}
                        />
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    testID="go-to-coords-button"
                    style={[
                      styles.goButtonFull,
                      (!latInput.trim() || !lonInput.trim()) && styles.goButtonDisabled,
                    ]}
                    onPress={goToCoordinates}
                    disabled={!latInput.trim() || !lonInput.trim()}
                  >
                    <Ionicons name="locate" size={16} color={COLORS.primary} />
                    <Text style={styles.goButtonFullText}>GO TO COORDINATES</Text>
                  </TouchableOpacity>

                  {locationCoords && (
                    <Text style={styles.currentCoordsText}>
                      Current: {locationCoords.lat.toFixed(4)}°, {locationCoords.lon.toFixed(4)}°
                    </Text>
                  )}

                  <View
                    style={styles.interactiveMapContainer}
                    // Claim touches at the earliest responder phase so the
                    // parent ScrollView doesn't steal pinch / pan from the
                    // WebView. The chip switcher is now rendered OUTSIDE
                    // this wrapper (right below it) so it never has to
                    // compete with these capture handlers — that was the
                    // original Android chip-tap-no-op bug.
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onStartShouldSetResponderCapture={() => true}
                    onMoveShouldSetResponderCapture={() => true}
                  >
                    <TacticalMapView
                      key={mapKey}
                      center={locationCoords || { lat: 39.8283, lon: -98.5795 }}
                      zoom={locationCoords ? 14 : 5}
                      height={300}
                      captureRequested={captureCount}
                      onCapture={handleMapCapture}
                      onUpgradePress={() => router.push('/subscription')}
                      // Controlled-mode: parent owns the style state so
                      // MapStyleSwitcher (rendered below, OUTSIDE this
                      // touch-stealing wrapper) can drive it.
                      controlledStyleId={mapStyleId}
                      onControlledStyleChange={setMapStyleId}
                      showStyleSwitcher={false}
                    />
                  </View>

                  {/* Map style picker — rendered OUTSIDE the WebView wrapper
                      so its Pressable taps are never intercepted by the
                      responder-capture handlers above. Free tier sees the
                      upsell, Core/Pro see their tier-allowed chips. */}
                  <MapStyleSwitcher
                    styleId={mapStyleId}
                    onChange={setMapStyleId}
                    onUpgradePress={() => router.push('/subscription')}
                  />

                  <Text style={styles.interactiveMapHint}>
                    Pan & zoom to your hunting area, then capture
                  </Text>

                  {/* Capture / Use GPS buttons */}
                  <View style={styles.interactiveActions}>
                    <TouchableOpacity
                      testID="capture-map-button"
                      style={styles.captureMapButton}
                      onPress={captureMapView}
                    >
                      <Ionicons name="camera" size={20} color={COLORS.primary} />
                      <Text style={styles.captureMapText}>CAPTURE MAP VIEW</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Show captured maps */}
                  {mapImages.length > 0 && (
                    <MapImageList images={mapImages} onRemove={removeMap} primaryIndex={primaryMapIndex} onSetPrimary={setPrimary} />
                  )}
                </View>
              )}

              {/* Shared: Show all maps with delete — both modes */}
              {mapInputMode === 'upload' && mapImages.length > 0 && (
                <MapImageList images={mapImages} onRemove={removeMap} primaryIndex={primaryMapIndex} onSetPrimary={setPrimary} />
              )}

              {/* Tip */}
              <View style={[styles.tipCard, { marginTop: 16 }]}>
                <Ionicons name="bulb" size={18} color={COLORS.accent} />
                <Text style={styles.tipText}>
                  {mapInputMode === 'interactive'
                    ? 'Navigate the map to your hunting area, then capture the view. You can also upload additional images.'
                    : mapImages.length === 0
                      ? 'Best results with satellite or aerial imagery showing terrain features, tree lines, and water sources.'
                      : 'Upload multiple maps to compare views. The first map is used for AI analysis.'}
                </Text>
              </View>

              {/* Upsell for trial users */}
              {!isPaidTier && (
                <TouchableOpacity
                  testID="map-upsell"
                  style={styles.mapUpsellCard}
                  onPress={() => router.push('/subscription')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="globe" size={20} color={COLORS.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mapUpsellTitle}>Interactive Map</Text>
                    <Text style={styles.mapUpsellDesc}>Upgrade to Core or Pro for live map browsing</Text>
                  </View>
                  <View style={styles.mapUpsellBadge}><Text style={styles.mapUpsellBadgeText}>PRO</Text></View>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Step 2: Conditions with Weather Auto-Fill */}
          {step === 2 && (
            <View>
              <Text style={styles.stepTitle}>HUNT CONDITIONS</Text>
              <Text style={styles.stepDescription}>Set environmental parameters</Text>

              {/* Hunt Date Picker */}
              <Text style={styles.fieldLabel}>HUNT DATE</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.datePicker}
                contentContainerStyle={styles.datePickerContent}
              >
                {Array.from({ length: 14 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() + i);
                  const dateStr = d.toISOString().split('T')[0];
                  const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayNum = d.getDate();
                  const month = d.toLocaleDateString('en-US', { month: 'short' });
                  const isSelected = huntDate === dateStr;
                  return (
                    <TouchableOpacity
                      key={dateStr}
                      testID={`date-${dateStr}`}
                      style={[styles.dateChip, isSelected && styles.dateChipActive]}
                      onPress={() => setHuntDate(dateStr)}
                    >
                      <Text style={[styles.dateDayName, isSelected && styles.dateDayNameActive]}>{dayName}</Text>
                      <Text style={[styles.dateDayNum, isSelected && styles.dateDayNumActive]}>{dayNum}</Text>
                      <Text style={[styles.dateMonth, isSelected && styles.dateMonthActive]}>{month}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Location Section */}
              <View style={styles.locationSection}>
                <Text style={styles.fieldLabel}>LOCATION</Text>
                {locationCoords ? (
                  <View style={styles.locationCard}>
                    <Ionicons name="location" size={20} color={COLORS.stands} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.locationText}>{locationName || `${locationCoords.lat.toFixed(4)}, ${locationCoords.lon.toFixed(4)}`}</Text>
                      <Text style={styles.locationCoords}>{locationCoords.lat.toFixed(4)}°, {locationCoords.lon.toFixed(4)}°</Text>
                    </View>
                    <TouchableOpacity testID="refresh-location-button" onPress={getLocation} style={styles.refreshIconBtn}>
                      <Ionicons name="refresh" size={18} color={COLORS.fogGray} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity testID="get-location-button" style={styles.getLocationButton} onPress={getLocation} activeOpacity={0.7}>
                    <Ionicons name="navigate" size={20} color={COLORS.primary} />
                    <Text style={styles.getLocationText}>USE GPS LOCATION</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Weather Card */}
              {weatherData && (
                <View testID="weather-card" style={styles.weatherCard}>
                  <View style={styles.weatherCardHeader}>
                    <Ionicons name="partly-sunny" size={20} color={COLORS.accent} />
                    <Text style={styles.weatherCardTitle}>{weatherData.condition}</Text>
                    <View style={styles.autoLabel}><Text style={styles.autoLabelText}>LIVE</Text></View>
                  </View>
                  <View style={styles.weatherRow}>
                    {weatherData.sunrise && <Text style={styles.weatherMeta}>☀ {weatherData.sunrise}</Text>}
                    {weatherData.sunset && <Text style={styles.weatherMeta}>🌙 {weatherData.sunset}</Text>}
                    <Text style={styles.weatherMeta}>{weatherData.humidity}% humid</Text>
                  </View>
                </View>
              )}
              {weatherLoading && (
                <View style={styles.weatherLoadingRow}>
                  <ActivityIndicator size="small" color={COLORS.accent} />
                  <Text style={styles.weatherLoadingText}>Fetching weather data...</Text>
                </View>
              )}
              {weatherError && !weatherLoading && (
                <View style={styles.weatherErrorRow}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.accent} />
                  <Text style={styles.weatherErrorText}>{weatherError}</Text>
                </View>
              )}

              {/* Refresh Weather */}
              {locationCoords && !weatherLoading && (
                <TouchableOpacity testID="refresh-weather-button" style={styles.refreshWeatherButton} onPress={fetchWeather} disabled={!isConnected}>
                  <Ionicons name="refresh" size={16} color={isConnected ? COLORS.accent : COLORS.fogGray} />
                  <Text style={[styles.refreshWeatherText, !isConnected && { color: COLORS.fogGray }]}>REFRESH WEATHER</Text>
                </TouchableOpacity>
              )}

              {/* Time Window */}
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

              {/* Wind Direction */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>WIND DIRECTION</Text>
                {fieldSources.wind_direction === 'auto' && <View style={styles.autoTag}><Text style={styles.autoTagText}>Auto</Text></View>}
              </View>
              <View style={styles.windGrid}>
                {WIND_DIRECTIONS.map((dir) => (
                  <TouchableOpacity key={dir} testID={`wind-${dir}`} style={[styles.windChip, windDirection === dir && styles.windChipActive]} onPress={() => { setWindDirection(dir); markManual('wind_direction'); }}>
                    <Text style={[styles.windText, windDirection === dir && styles.windTextActive]}>{dir}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Wind Speed */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>WIND SPEED</Text>
                {fieldSources.wind_speed === 'auto' && <View style={styles.autoTag}><Text style={styles.autoTagText}>Auto</Text></View>}
              </View>
              <TextInput testID="wind-speed-input" style={styles.textInput} placeholder="e.g., 12 mph" placeholderTextColor={COLORS.fogGray} value={windSpeed} onChangeText={(v) => { setWindSpeed(v); markManual('wind_speed'); }} />

              {/* Temperature */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>TEMPERATURE</Text>
                {fieldSources.temperature === 'auto' && <View style={styles.autoTag}><Text style={styles.autoTagText}>Auto</Text></View>}
              </View>
              <TextInput testID="temperature-input" style={styles.textInput} placeholder="e.g., 45°F" placeholderTextColor={COLORS.fogGray} value={temperature} onChangeText={(v) => { setTemperature(v); markManual('temperature'); }} />

              {/* Precipitation */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>PRECIPITATION</Text>
                {fieldSources.precipitation === 'auto' && <View style={styles.autoTag}><Text style={styles.autoTagText}>Auto</Text></View>}
              </View>
              <View style={styles.precipGrid}>
                {['none', 'light rain', 'heavy rain', 'snow'].map((p) => (
                  <TouchableOpacity key={p} testID={`precip-${p.replace(' ', '-')}`} style={[styles.precipChip, precipitation === p && styles.precipChipActive]} onPress={() => { setPrecipitation(p); markManual('precipitation'); }}>
                    <Text style={[styles.precipText, precipitation === p && styles.precipTextActive]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cloud Cover */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>CLOUD COVER</Text>
                {fieldSources.cloud_cover === 'auto' && <View style={styles.autoTag}><Text style={styles.autoTagText}>Auto</Text></View>}
              </View>
              <TextInput testID="cloud-cover-input" style={styles.textInput} placeholder="e.g., 50%" placeholderTextColor={COLORS.fogGray} value={cloudCover} onChangeText={(v) => { setCloudCover(v); markManual('cloud_cover'); }} />

              {/* Property Type */}
              <Text style={styles.fieldLabel}>PROPERTY TYPE</Text>
              <View style={styles.propGrid}>
                {['public', 'private'].map((pt) => (
                  <TouchableOpacity key={pt} testID={`property-${pt}`} style={[styles.propChip, propertyType === pt && styles.propChipActive]} onPress={() => setPropertyType(pt)}>
                    <Ionicons name={pt === 'public' ? 'globe' : 'lock-closed'} size={18} color={propertyType === pt ? COLORS.accent : COLORS.fogGray} />
                    <Text style={[styles.propText, propertyType === pt && styles.propTextActive]}>{pt.charAt(0).toUpperCase() + pt.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* State + Hunting Region picker. State drives the
                  hunting region so the AI prompt can lean on regional
                  patterns. Auto-filled from GPS reverse-geocode. */}
              <StateRegionPicker
                stateCode={stateCode}
                onStateChange={setStateCode}
                regionId={huntingRegion}
                onRegionChange={setHuntingRegion}
              />

              {/* Hunt Style — natural 2-step progression: WEAPON, then METHOD.
                  Both are optional and canonical-only. The method
                  section unlocks once a weapon is picked so the flow
                  reads top-to-bottom like a real prep checklist. */}

              {/* STEP 1: WEAPON */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>WEAPON (OPTIONAL)</Text>
                {huntWeapon && (
                  <TouchableOpacity
                    testID="hunt-weapon-clear"
                    onPress={() => setHuntWeapon(null)}
                    hitSlop={8}
                  >
                    <Text style={styles.huntStyleClear}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.huntStyleGrid}>
                {HUNT_WEAPONS.map((opt) => {
                  const active = huntWeapon === opt.id;
                  const iconImage = getHuntStyleIconImage(opt.id);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      testID={`hunt-weapon-${opt.id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[styles.huntStyleChip, active && styles.huntStyleChipActive]}
                      onPress={() => setHuntWeapon(active ? null : (opt.id as HuntWeaponId))}
                      activeOpacity={0.8}
                    >
                      {iconImage ? (
                        <Image
                          source={active ? iconImage.active : iconImage.inactive}
                          style={styles.huntStyleChipIconImage}
                          resizeMode="contain"
                          accessibilityLabel={opt.shortLabel}
                        />
                      ) : (
                        <Ionicons
                          name={opt.icon as any}
                          size={18}
                          color={active ? COLORS.accent : COLORS.fogGray}
                        />
                      )}
                      <Text
                        style={[styles.huntStyleText, active && styles.huntStyleTextActive]}
                        numberOfLines={1}
                      >
                        {opt.shortLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {huntWeapon && (
                <Text testID="hunt-weapon-hint" style={styles.huntStyleHint}>
                  {HUNT_WEAPONS.find(s => s.id === huntWeapon)?.hint}
                </Text>
              )}

              {/* STEP 2: METHOD — appears only after a weapon is picked */}
              {huntWeapon && (
                <>
                  <View style={[styles.fieldRow, styles.huntMethodRow]}>
                    <Text style={styles.fieldLabel}>METHOD (OPTIONAL)</Text>
                    {huntMethod && (
                      <TouchableOpacity
                        testID="hunt-method-clear"
                        onPress={() => setHuntMethod(null)}
                        hitSlop={8}
                      >
                        <Text style={styles.huntStyleClear}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.huntStyleGrid}>
                    {HUNT_METHODS.map((opt) => {
                      const active = huntMethod === opt.id;
                      const iconImage = getHuntStyleIconImage(opt.id);
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          testID={`hunt-method-${opt.id}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={[styles.huntStyleChip, active && styles.huntStyleChipActive]}
                          onPress={() => setHuntMethod(active ? null : (opt.id as HuntMethodId))}
                          activeOpacity={0.8}
                        >
                          {iconImage ? (
                            <Image
                              source={active ? iconImage.active : iconImage.inactive}
                              style={styles.huntStyleChipIconImage}
                              resizeMode="contain"
                              accessibilityLabel={opt.shortLabel}
                            />
                          ) : (
                            <Ionicons
                              name={opt.icon as any}
                              size={18}
                              color={active ? COLORS.accent : COLORS.fogGray}
                            />
                          )}
                          <Text
                            style={[styles.huntStyleText, active && styles.huntStyleTextActive]}
                            numberOfLines={1}
                          >
                            {opt.shortLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {huntMethod && (
                    <Text testID="hunt-method-hint" style={styles.huntStyleHint}>
                      {HUNT_METHODS.find(s => s.id === huntMethod)?.hint}
                    </Text>
                  )}
                </>
              )}

              {/* Optional: known hunt locations (GPS assets). Stored
                  to AsyncStorage at submit time and posted to
                  /api/hunts/{id}/assets after the hunt is upserted
                  (see /results.tsx drain hook). */}
              <HuntLocationsSection
                assets={pendingAssets}
                onChange={setPendingAssets}
              />
            </View>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <View>
              <Text style={styles.stepTitle}>REVIEW & ANALYZE</Text>
              <Text style={styles.stepDescription}>Confirm your hunt parameters</Text>
              <View style={styles.reviewCard}>
                <ReviewRow label="Species" value={speciesCatalog.findSpecies(selectedSpecies)?.name || ''} />
                <ReviewRow label="Date" value={huntDate} />
                <ReviewRow label="Time" value={TIME_WINDOWS.find(t => t.id === timeWindow)?.label || ''} />
                <ReviewRow label="Wind" value={`${windDirection}${windSpeed ? ' · ' + windSpeed : ''}`} />
                {temperature ? <ReviewRow label="Temp" value={temperature} /> : null}
                <ReviewRow label="Precip" value={precipitation.charAt(0).toUpperCase() + precipitation.slice(1)} />
                {cloudCover ? <ReviewRow label="Cloud" value={cloudCover} /> : null}
                <ReviewRow label="Property" value={propertyType.charAt(0).toUpperCase() + propertyType.slice(1)} />
                {region ? <ReviewRow label="Region" value={region} /> : null}
                {huntStyle ? <ReviewRow label="Hunt Style" value={getHuntStyleLabel(huntStyle) || huntStyle} /> : null}
                <ReviewRow label="Maps" value={`${mapImages.length} uploaded`} />
                {pendingAssets.length > 0 ? (
                  <ReviewRow
                    label="Locations"
                    value={`${pendingAssets.length} marked${
                      pendingAssets.length <= 3
                        ? ` · ${pendingAssets.map(a => a.name).join(', ')}`
                        : ''
                    }`}
                  />
                ) : null}
                {weatherData && <ReviewRow label="Weather" value={`${weatherData.condition} (Live)`} />}
              </View>
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
                <Text style={styles.disclaimerText}>Recommendations are AI-generated. Always verify regulations and property boundaries.</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          {step < 3 ? (
            <TouchableOpacity testID="next-step-button" style={[styles.nextButton, !canProceed() && styles.nextButtonDisabled]} onPress={() => canProceed() && setStep(step + 1)} disabled={!canProceed()} activeOpacity={0.8}>
              <Text style={[styles.nextButtonText, !canProceed() && styles.nextButtonTextDisabled]}>CONTINUE</Text>
              <Ionicons name="arrow-forward" size={20} color={canProceed() ? COLORS.primary : COLORS.fogGray} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity testID="analyze-button" style={[styles.analyzeButton, !isConnected && styles.analyzeButtonDisabled]} onPress={submitAnalysis} activeOpacity={0.8} disabled={!isConnected}>
              {!isConnected ? <Ionicons name="cloud-offline" size={20} color={COLORS.fogGray} /> : <Ionicons name="navigate" size={22} color={COLORS.primary} />}
              <Text style={[styles.analyzeButtonText, !isConnected && styles.analyzeButtonTextDisabled]}>{isConnected ? 'ANALYZE HUNT' : 'OFFLINE'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Out-of-credits modal — auto-opens when /api/analyze-hunt
          returns 402 (monthly + extra both empty). User can upgrade
          to Pro or top off with an extra-credit pack here. */}
      <OutOfCreditsModal
        visible={creditsModalOpen}
        usage={analyticsUsage}
        onClose={() => setCreditsModalOpen(false)}
        onUpgradePress={() => router.push('/subscription')}
        onPackPurchase={handleAnalyzePackPurchase}
      />
    </SafeAreaView>
  );
}

function MapImageList({ images, onRemove, primaryIndex, onSetPrimary }: { images: string[]; onRemove: (idx: number) => void; primaryIndex: number; onSetPrimary?: (idx: number) => void }) {
  return (
    <View style={styles.mapListContainer}>
      <Text style={styles.mapListTitle}>MAPS READY ({images.length})</Text>
      {images.map((img, idx) => {
        const isPrimary = idx === primaryIndex;
        return (
          <View key={idx} style={[styles.mapListItem, isPrimary && styles.mapListItemPrimary]}>
            <Image source={{ uri: img }} style={styles.mapListImage} resizeMode="cover" />
            <View style={styles.mapListInfo}>
              <Text style={styles.mapListLabel}>Map {idx + 1}</Text>
              {isPrimary ? (
                <Text style={styles.mapListPrimary}>Overlays applied here</Text>
              ) : onSetPrimary ? (
                <TouchableOpacity testID={`set-primary-${idx}`} onPress={() => onSetPrimary(idx)}>
                  <Text style={styles.mapListSetPrimary}>Tap to set as primary</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.mapListRef}>Reference image</Text>
              )}
            </View>
            <TouchableOpacity
              testID={`delete-map-${idx}`}
              style={styles.mapListDelete}
              onPress={() => onRemove(idx)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={20} color={COLORS.avoidZones} />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
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
  offlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, backgroundColor: 'rgba(200, 155, 60, 0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(200, 155, 60, 0.3)' },
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
  speciesCardLocked: {
    opacity: 0.72,
    borderColor: 'rgba(200, 155, 60, 0.25)',
  },
  speciesIconContainer: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(58, 74, 82, 0.6)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  // Custom species icon image (e.g. the gold/white deer pair). Sized
  // to match the 32 px Ionicons glyph footprint inside the circular
  // container so the layout doesn't shift when a species swaps from
  // a glyph to an image.
  speciesIconImage: { width: 40, height: 40 },
  speciesIconImageLocked: { opacity: 0.45 },
  speciesHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  speciesName: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  speciesNameActive: { color: COLORS.accent },
  speciesDesc: { color: COLORS.fogGray, fontSize: 13, marginTop: 6, lineHeight: 20 },
  categoryHeader: {
    color: COLORS.fogGray, fontSize: 11, fontWeight: '800',
    letterSpacing: 2, marginBottom: 10, marginTop: 4,
  },
  lockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: 'rgba(200, 155, 60, 0.12)',
    borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.35)',
  },
  lockBadgeText: { color: COLORS.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  upgradeHintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10,
  },
  upgradeHintText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },
  selectedCheck: { position: 'absolute', top: 20, right: 20 },
  // Map Upload
  mapsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  mapThumbContainer: { position: 'relative', width: (width - 70) / 3, height: 90, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)' },
  mapThumb: { width: '100%', height: '100%' },
  mapThumbBadge: { position: 'absolute', top: 4, left: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center' },
  mapThumbBadgeText: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '800' },
  removeMapButton: { position: 'absolute', top: 2, right: 2 },
  primaryMapBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(200, 155, 60, 0.85)', paddingVertical: 2, alignItems: 'center' },
  primaryMapText: { color: COLORS.primary, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  uploadArea: { backgroundColor: 'rgba(58, 74, 82, 0.3)', borderRadius: 16, borderWidth: 2, borderColor: COLORS.accent, borderStyle: 'dashed', padding: 40, alignItems: 'center', justifyContent: 'center', minHeight: 220, marginBottom: 20 },
  uploadAreaCompact: { padding: 20, minHeight: 100 },
  uploadTitle: { color: COLORS.accent, fontSize: 16, fontWeight: '800', letterSpacing: 1.5, marginTop: 12 },
  uploadSubtitle: { color: COLORS.fogGray, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(200, 155, 60, 0.08)', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.2)' },
  tipText: { color: COLORS.fogGray, fontSize: 13, lineHeight: 20, flex: 1 },
  // Location
  locationSection: { marginBottom: 8 },
  locationCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(46, 125, 50, 0.1)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(46, 125, 50, 0.3)' },
  locationText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  locationCoords: { color: COLORS.fogGray, fontSize: 11, marginTop: 2 },
  refreshIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(58, 74, 82, 0.5)', alignItems: 'center', justifyContent: 'center' },
  getLocationButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 14, minHeight: 52 },
  getLocationText: { color: COLORS.primary, fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  // Weather
  weatherCard: { backgroundColor: 'rgba(200, 155, 60, 0.08)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.2)', marginTop: 12 },
  weatherCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  weatherCardTitle: { flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  autoLabel: { backgroundColor: 'rgba(46, 125, 50, 0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  autoLabelText: { color: COLORS.stands, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  weatherRow: { flexDirection: 'row', gap: 16 },
  weatherMeta: { color: COLORS.fogGray, fontSize: 12 },
  weatherLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  weatherLoadingText: { color: COLORS.fogGray, fontSize: 13 },
  weatherErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  weatherErrorText: { color: COLORS.accent, fontSize: 12 },
  refreshWeatherButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 8 },
  refreshWeatherText: { color: COLORS.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  // Conditions
  fieldLabel: { color: COLORS.fogGray, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 20 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 },
  autoTag: { backgroundColor: 'rgba(46, 125, 50, 0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  autoTagText: { color: COLORS.stands, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
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
  // Hunt Style (optional) — 3-col grid mirroring wind/precip chip aesthetics.
  huntStyleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  huntMethodRow: { marginTop: 16 },
  huntStyleChip: {
    width: (width - 72) / 3, // 3 per row with ~16 page padding + 10 gap
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 48,
  },
  huntStyleChipActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(200, 155, 60, 0.08)' },
  // Custom chip icon image (gold/white pair). Sized to match the
  // 18 px Ionicons glyph footprint so chip width stays stable when
  // a style swaps from a glyph to an image.
  huntStyleChipIconImage: { width: 22, height: 22 },
  huntStyleText: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },
  huntStyleTextActive: { color: COLORS.accent },
  huntStyleClear: { color: COLORS.fogGray, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  huntStyleHint: {
    color: COLORS.fogGray,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    fontStyle: 'italic',
  },
  // Review
  reviewCard: { backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.2)', marginBottom: 20 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(154, 164, 169, 0.1)' },
  reviewLabel: { color: COLORS.fogGray, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  reviewValue: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
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
  // Limit Reached
  limitContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  limitIconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(200, 155, 60, 0.12)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(200, 155, 60, 0.3)',
    marginBottom: 24,
  },
  limitTitle: { color: COLORS.textPrimary, fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: 2, lineHeight: 34 },
  limitSubtitle: { color: COLORS.fogGray, fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 24 },
  limitUpgradeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 18, paddingHorizontal: 32,
    minHeight: 60, width: '100%', marginTop: 32,
  },
  limitUpgradeText: { color: COLORS.primary, fontSize: 16, fontWeight: '800', letterSpacing: 1.5 },
  // Secondary "Buy Extra Analytics" CTA on the limit-reached screen.
  // Outline-style so the gold "Upgrade" button stays visually primary.
  limitBuyExtraButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, paddingHorizontal: 20, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.accent,
    backgroundColor: 'rgba(200, 155, 60, 0.10)',
    marginTop: 10, marginBottom: 4,
  },
  limitBuyExtraText: {
    color: COLORS.accent, fontSize: 13, fontWeight: '900', letterSpacing: 1,
  },
  limitHomeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, marginTop: 14, width: '100%', borderRadius: 10,
    backgroundColor: 'rgba(58, 74, 82, 0.4)', borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.2)',
  },
  limitHomeText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  limitTierInfo: {
    marginTop: 32, padding: 16, borderRadius: 12, width: '100%',
    backgroundColor: 'rgba(58, 74, 82, 0.3)', borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.1)',
  },
  limitTierLabel: { color: COLORS.fogGray, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },
  limitTierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  limitTierText: { color: COLORS.textSecondary, fontSize: 13 },
  // Map mode toggle
  mapModeToggle: { flexDirection: 'row', backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 10, padding: 3, marginBottom: 16 },
  mapModeOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8 },
  mapModeOptionActive: { backgroundColor: COLORS.accent },
  mapModeText: { color: COLORS.fogGray, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  mapModeTextActive: { color: COLORS.primary },
  // Interactive map
  interactiveMapContainer: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  interactiveMapHint: { color: COLORS.fogGray, fontSize: 12, textAlign: 'center', marginBottom: 12 },
  interactiveActions: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  mapLocationButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(58, 74, 82, 0.5)', borderRadius: 10, paddingVertical: 14, minHeight: 52,
    borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)',
  },
  mapLocationText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  captureMapButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 14, minHeight: 52,
  },
  captureMapText: { color: COLORS.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  // Coordinate input
  coordInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(58, 74, 82, 0.5)', borderRadius: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)', marginBottom: 6, minHeight: 52,
  },
  coordInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14, paddingVertical: 12 },
  goButton: {
    backgroundColor: COLORS.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10,
  },
  goButtonDisabled: { backgroundColor: 'rgba(58, 74, 82, 0.5)' },
  goButtonText: { color: COLORS.primary, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  currentCoordsText: { color: COLORS.fogGray, fontSize: 11, marginBottom: 8, marginLeft: 2 },
  // GPS coordinate inputs (lat / lon split, decimal-pad keyboards)
  useLocationButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 10, paddingVertical: 14,
    marginBottom: 12, minHeight: 48,
  },
  useLocationText: {
    color: COLORS.primary, fontSize: 13, fontWeight: '900', letterSpacing: 1,
  },
  coordSeparator: {
    color: COLORS.fogGray, fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textAlign: 'center', marginBottom: 10,
  },
  coordPairRow: {
    flexDirection: 'row', gap: 10, marginBottom: 10,
  },
  coordField: { flex: 1 },
  coordFieldLabel: {
    color: COLORS.fogGray, fontSize: 10, fontWeight: '800',
    letterSpacing: 1, marginBottom: 4, marginLeft: 2,
  },
  coordFieldInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(58, 74, 82, 0.5)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)',
    minHeight: 48, overflow: 'hidden',
  },
  signToggle: {
    width: 40, minHeight: 48,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(200, 155, 60, 0.18)',
    borderRightWidth: 1, borderRightColor: 'rgba(154, 164, 169, 0.25)',
  },
  signToggleText: {
    color: COLORS.accent, fontSize: 20, fontWeight: '900', lineHeight: 22,
  },
  coordFieldInput: {
    flex: 1, color: COLORS.textPrimary, fontSize: 15,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  goButtonFull: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 12,
    marginBottom: 8, minHeight: 44,
  },
  goButtonFullText: {
    color: COLORS.primary, fontSize: 13, fontWeight: '900', letterSpacing: 1,
  },
  // Date Picker
  datePicker: { marginBottom: 16, marginHorizontal: -20 },
  datePickerContent: { paddingHorizontal: 20, gap: 8 },
  dateChip: {
    alignItems: 'center', justifyContent: 'center', width: 68, paddingVertical: 10,
    borderRadius: 12, backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderWidth: 2, borderColor: 'transparent',
  },
  dateChipActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(200, 155, 60, 0.1)' },
  dateDayName: { color: COLORS.fogGray, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  dateDayNameActive: { color: COLORS.accent },
  dateDayNum: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '900', marginVertical: 2 },
  dateDayNumActive: { color: COLORS.accent },
  dateMonth: { color: COLORS.fogGray, fontSize: 10, fontWeight: '600' },
  dateMonthActive: { color: COLORS.accent },
  // Map upsell
  mapUpsellCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16,
    backgroundColor: 'rgba(200, 155, 60, 0.06)', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.2)',
  },
  mapUpsellTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  mapUpsellDesc: { color: COLORS.fogGray, fontSize: 12, marginTop: 2 },
  mapUpsellBadge: { backgroundColor: 'rgba(200, 155, 60, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  mapUpsellBadgeText: { color: COLORS.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  // Map Image List (delete-friendly)
  mapListContainer: { marginTop: 16, marginBottom: 8 },
  mapListTitle: { color: COLORS.fogGray, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  mapListItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 12,
    padding: 10, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.15)',
  },
  mapListImage: { width: 64, height: 48, borderRadius: 8, backgroundColor: COLORS.secondary },
  mapListInfo: { flex: 1 },
  mapListLabel: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  mapListPrimary: { color: COLORS.accent, fontSize: 11, fontWeight: '600', marginTop: 2 },
  mapListSetPrimary: { color: COLORS.accessRoutes, fontSize: 11, fontWeight: '600', marginTop: 2, textDecorationLine: 'underline' },
  mapListRef: { color: COLORS.fogGray, fontSize: 11, marginTop: 2 },
  mapListItemPrimary: { borderColor: COLORS.accent, borderWidth: 2 },
  mapListDelete: {
    width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(198, 40, 40, 0.12)', borderWidth: 1, borderColor: 'rgba(198, 40, 40, 0.25)',
  },
});
