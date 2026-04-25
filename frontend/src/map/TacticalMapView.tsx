import React, { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import {
  RAVEN_SCOUT_MAP_STYLES,
  resolveMapStyle,
  hasMapTilerKey,
  type RavenScoutMapStyleId,
} from '../constants/mapStyles';
import {
  getAllowedMapStylesForPlan,
  resolveAllowedStyleForPlan,
  normalizePlanId,
} from '../constants/planCapabilities';
import { getFallbackStyleJSON } from '../map/MapProvider';
import { useMapStylePreference } from '../hooks/useMapStylePreference';
import { useAuth } from '../hooks/useAuth';

interface TacticalMapViewProps {
  center?: { lat: number; lon: number };
  zoom?: number;
  height?: number;
  showStyleSwitcher?: boolean;
  captureRequested?: number;
  onCapture?: (base64: string) => void;
  /**
   * Optional initial style id. If omitted the persisted user
   * preference (or DEFAULT_MAP_STYLE_ID = "outdoor") is used.
   */
  initialStyle?: RavenScoutMapStyleId;
  /** Optional callback fired when a Free user taps the upsell. */
  onUpgradePress?: () => void;
}

export default function TacticalMapView({
  center = { lat: 39.8283, lon: -98.5795 },
  zoom = 5,
  height = 350,
  showStyleSwitcher = true,
  captureRequested = 0,
  onCapture,
  initialStyle,
  onUpgradePress,
}: TacticalMapViewProps) {
  const useMaptiler = hasMapTilerKey();
  const { user } = useAuth();
  const planId = normalizePlanId(user?.tier);
  const allowedStyleIds = useMemo(() => getAllowedMapStylesForPlan(planId), [planId]);
  const { styleId, setStyleId } = useMapStylePreference(initialStyle);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const webviewRef = useRef<any>(null);
  const lastCaptureRef = useRef(0);
  // Long-press tooltip state for the style switcher chips. Holds the
  // id of whichever chip is currently being long-pressed; null when
  // no tooltip is visible. We track long-press manually via
  // onPressIn/onPressOut so the behavior is identical on iOS, Android,
  // and react-native-web (the built-in `onLongPress` on TouchableOpacity
  // is unreliable through Pointer events on web).
  const [tooltipFor, setTooltipFor] = useState<RavenScoutMapStyleId | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armLongPress = useCallback((id: RavenScoutMapStyleId) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setTooltipFor(id);
      if (tooltipDismissTimerRef.current) clearTimeout(tooltipDismissTimerRef.current);
      tooltipDismissTimerRef.current = setTimeout(() => setTooltipFor(null), 2200);
    }, 280);
  }, []);
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (tooltipDismissTimerRef.current) clearTimeout(tooltipDismissTimerRef.current);
  }, []);

  // Tier-aware downgrade migration: if the user's persisted style is
  // not allowed by their current plan (e.g. a Pro user picked Hybrid
  // then downgraded to Core), silently snap to the first allowed style
  // for their tier. Free users have an empty allow-list and will see
  // the upsell instead — we leave their persisted value alone.
  useEffect(() => {
    if (allowedStyleIds.length === 0) return;
    if (!allowedStyleIds.includes(styleId)) {
      const fallback = resolveAllowedStyleForPlan(planId, styleId);
      if (fallback) setStyleId(fallback);
    }
  }, [planId, allowedStyleIds, styleId, setStyleId]);

  // The HTML is built ONCE (with the bootstrap style URL) so the
  // iframe / WebView never reloads on style switch — that would
  // reset the user's pan / zoom / bearing. Subsequent style changes
  // are pushed in via `map.setStyle(...)` over postMessage, which
  // MapLibre handles in-place while preserving camera state.
  const initialStyleUrl = useMemo(() => {
    const cfg = resolveMapStyle(styleId);
    return cfg.styleUrl;
    // Intentional: the initial URL is captured at first mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialStyleSource = useMaptiler && initialStyleUrl
    ? `'${initialStyleUrl}'`
    : JSON.stringify(getFallbackStyleJSON());

  const htmlContent = useMemo(() => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0B1F2A; overflow: hidden; }
    #map { width: 100%; height: 100vh; }
    .maplibregl-ctrl-attrib { display: none !important; }
    .maplibregl-ctrl-logo { display: none !important; }
    .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right { display: none !important; }
    .maplibregl-ctrl-group {
      background: rgba(11, 31, 42, 0.85) !important;
      border: 1px solid rgba(154, 164, 169, 0.3) !important;
      border-radius: 8px !important;
    }
    .maplibregl-ctrl-group button { background: transparent !important; }
    .maplibregl-ctrl-group button + button { border-top: 1px solid rgba(154, 164, 169, 0.2) !important; }
    .maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon,
    .maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon,
    .maplibregl-ctrl-compass .maplibregl-ctrl-icon { filter: invert(0.8); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = new maplibregl.Map({
      container: 'map',
      style: ${initialStyleSource},
      center: [${center.lon}, ${center.lat}],
      zoom: ${zoom},
      attributionControl: false,
      maxZoom: 20,
      minZoom: 2,
      preserveDrawingBuffer: true
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    function postToHost(payload) {
      var msg = JSON.stringify(payload);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(msg);
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, '*');
      }
    }

    window.addEventListener('message', function(e) {
      try {
        var data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!data || !data.type) return;

        if (data.type === 'capture') {
          // Wait for the next paint so any in-flight tiles land first.
          requestAnimationFrame(function() {
            try {
              var canvas = map.getCanvas();
              var dataUrl = canvas.toDataURL('image/jpeg', 0.6);
              postToHost({ type: 'captureResult', data: dataUrl });
            } catch(err) {
              postToHost({ type: 'captureError', error: String(err) });
            }
          });
        } else if (data.type === 'setStyle' && data.styleUrl) {
          // Preserve camera state across style swaps. MapLibre's
          // setStyle does this by default but we re-assert here for
          // safety on older builds.
          var beforeCenter = map.getCenter();
          var beforeZoom   = map.getZoom();
          var beforeBearing = map.getBearing();
          var beforePitch  = map.getPitch();
          map.setStyle(data.styleUrl);
          map.once('styledata', function() {
            try {
              map.jumpTo({
                center: beforeCenter,
                zoom: beforeZoom,
                bearing: beforeBearing,
                pitch: beforePitch,
              });
              postToHost({ type: 'styleApplied', styleUrl: data.styleUrl });
            } catch(err) { /* noop */ }
          });
        }
      } catch(err) {}
    });
  </script>
</body>
</html>
  `, [center.lat, center.lon, zoom, initialStyleSource]);

  // Push style changes into the live map without rebuilding the HTML.
  useEffect(() => {
    if (!useMaptiler) return;
    const cfg = resolveMapStyle(styleId);
    if (!cfg.styleUrl) return;
    const msg = JSON.stringify({ type: 'setStyle', styleUrl: cfg.styleUrl });
    if (Platform.OS === 'web' && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(msg, '*');
    } else if (webviewRef.current) {
      // Use injectJavaScript so the message lands inside the WebView's
      // JS execution context and triggers our window.message handler.
      webviewRef.current.injectJavaScript(`
        window.postMessage(${JSON.stringify(msg)}, '*'); true;
      `);
    }
  }, [styleId, useMaptiler]);

  // Handle capture requests from parent
  useEffect(() => {
    if (captureRequested > 0 && captureRequested !== lastCaptureRef.current) {
      lastCaptureRef.current = captureRequested;
      const msg = JSON.stringify({ type: 'capture' });
      if (Platform.OS === 'web' && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(msg, '*');
      } else if (webviewRef.current) {
        webviewRef.current.injectJavaScript(`
          window.postMessage('${msg}', '*'); true;
        `);
      }
    }
  }, [captureRequested]);

  // Listen for capture results (web)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data.type === 'captureResult' && data.data && onCapture) {
          onCapture(data.data);
        }
      } catch { /* noop */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onCapture]);

  // Handle WebView messages (native)
  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'captureResult' && data.data && onCapture) {
        onCapture(data.data);
      }
    } catch { /* noop */ }
  }, [onCapture]);

  const mapContent = Platform.OS === 'web' ? (
    <iframe
      ref={iframeRef as any}
      data-testid="tactical-map-iframe"
      srcDoc={htmlContent}
      style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 } as any}
      sandbox="allow-scripts allow-same-origin"
    />
  ) : (() => {
    const WebView = require('react-native-webview').WebView;
    return (
      <WebView
        ref={webviewRef}
        testID="tactical-map-webview"
        source={{ html: htmlContent }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        // Android: keep gestures inside the WebView (see setup.tsx
        // for the responder hooks that wrap the map container).
        nestedScrollEnabled={true}
        androidLayerType="hardware"
        onMessage={handleWebViewMessage}
      />
    );
  })();

  // Resolve the description for the currently visible tooltip outside JSX
  // so the conditional render is straightforward (no IIFE / fragments).
  const tooltipCfg = tooltipFor
    ? RAVEN_SCOUT_MAP_STYLES.find(s => s.id === tooltipFor)
    : null;

  // Tier-filtered switcher rows. Free => empty (we render the upsell
  // instead). Core / Pro get their plan-specific subset, in plan order.
  const switcherStyles = useMemo(
    () => RAVEN_SCOUT_MAP_STYLES.filter(s => allowedStyleIds.includes(s.id)),
    [allowedStyleIds],
  );
  const isFreeTier = planId === 'free';

  return (
    <View style={[styles.container, { height }]}>
      {mapContent}

      {showStyleSwitcher && useMaptiler && tooltipCfg && (
        <View pointerEvents="none" style={styles.tooltip}>
          <Text style={styles.tooltipText} numberOfLines={2}>
            {tooltipCfg.description}
          </Text>
        </View>
      )}

      {showStyleSwitcher && useMaptiler && isFreeTier && (
        <Pressable
          testID="map-style-upsell"
          accessibilityRole="button"
          accessibilityLabel="Upgrade to Core or Pro to unlock map styles"
          onPress={onUpgradePress}
          style={({ pressed }) => [
            styles.upsell,
            pressed && styles.upsellPressed,
          ]}
        >
          <Ionicons name="lock-closed" size={14} color={COLORS.accent} />
          <Text style={styles.upsellLabel}>UNLOCK MAP STYLES</Text>
          <Text style={styles.upsellSub}>Upgrade to Core or Pro</Text>
        </Pressable>
      )}

      {showStyleSwitcher && useMaptiler && !isFreeTier && switcherStyles.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.styleSwitcherContent}
          style={styles.styleSwitcher}
        >
          {switcherStyles.map((s) => {
            const active = styleId === s.id;
            return (
              <Pressable
                key={s.id}
                testID={`map-style-${s.id}`}
                accessibilityLabel={s.description}
                style={({ pressed }) => [
                  styles.styleButton,
                  active && styles.styleButtonActive,
                  pressed && styles.styleButtonPressed,
                ]}
                onPress={() => { cancelLongPress(); setStyleId(s.id); }}
                onPressIn={() => armLongPress(s.id)}
                onPressOut={cancelLongPress}
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
      )}

      <View style={styles.attribution}>
        <Text style={styles.attributionText}>
          {useMaptiler ? '© MapTiler · OpenStreetMap' : '© OpenStreetMap · CARTO'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)',
    backgroundColor: COLORS.primary,
  },
  webview: { flex: 1, backgroundColor: COLORS.primary },
  styleSwitcher: {
    position: 'absolute', bottom: 24, left: 10, right: 10,
    maxHeight: 36,
  },
  styleSwitcherContent: {
    flexDirection: 'row', gap: 4,
    backgroundColor: 'rgba(11, 31, 42, 0.92)',
    borderRadius: 10, padding: 3,
    borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.35)',
    alignSelf: 'flex-start',
  },
  styleButton: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 7,
  },
  styleButtonActive: {
    backgroundColor: COLORS.accent,
    // Active glow — soft gold halo so the selected chip reads as
    // "live" against the dark switcher pill, including under the
    // map's mid-tone tiles.
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 6,
    elevation: 4,
  },
  styleButtonPressed: {
    opacity: 0.75,
  },
  styleLabel: {
    color: COLORS.fogGray, fontSize: 10, fontWeight: '800',
    letterSpacing: 0.6,
  },
  styleLabelActive: { color: COLORS.primary, fontWeight: '900' },
  tooltip: {
    position: 'absolute', bottom: 64, left: 16, right: 16,
    backgroundColor: 'rgba(11, 31, 42, 0.96)',
    borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.55)',
    borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 10,
  },
  tooltipText: {
    color: '#F5EFD9',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    textAlign: 'center',
  },
  upsell: {
    position: 'absolute', bottom: 24, left: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'rgba(11, 31, 42, 0.92)',
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.55)',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 4,
  },
  upsellPressed: { opacity: 0.78 },
  upsellLabel: {
    color: COLORS.accent, fontSize: 11, fontWeight: '900', letterSpacing: 0.8,
  },
  upsellSub: {
    color: COLORS.fogGray, fontSize: 10, fontWeight: '600',
  },
  attribution: {
    position: 'absolute', bottom: 4, right: 8,
    backgroundColor: 'rgba(11, 31, 42, 0.6)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  attributionText: { color: COLORS.fogGray, fontSize: 8, opacity: 0.6 },
});
