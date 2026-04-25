import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import {
  RAVEN_SCOUT_MAP_STYLES,
  resolveMapStyle,
  hasMapTilerKey,
  type RavenScoutMapStyleId,
} from '../constants/mapStyles';
import { getFallbackStyleJSON } from '../map/MapProvider';
import { useMapStylePreference } from '../hooks/useMapStylePreference';

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
}

export default function TacticalMapView({
  center = { lat: 39.8283, lon: -98.5795 },
  zoom = 5,
  height = 350,
  showStyleSwitcher = true,
  captureRequested = 0,
  onCapture,
  initialStyle,
}: TacticalMapViewProps) {
  const useMaptiler = hasMapTilerKey();
  const { styleId, setStyleId } = useMapStylePreference(initialStyle);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const webviewRef = useRef<any>(null);
  const lastCaptureRef = useRef(0);

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

  return (
    <View style={[styles.container, { height }]}>
      {mapContent}

      {showStyleSwitcher && useMaptiler && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.styleSwitcherContent}
          style={styles.styleSwitcher}
        >
          {RAVEN_SCOUT_MAP_STYLES.map((s) => {
            const active = styleId === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                testID={`map-style-${s.id}`}
                accessibilityLabel={s.description}
                style={[styles.styleButton, active && styles.styleButtonActive]}
                onPress={() => setStyleId(s.id)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={s.icon as any}
                  size={14}
                  color={active ? COLORS.primary : COLORS.fogGray}
                />
                <Text style={[styles.styleLabel, active && styles.styleLabelActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
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
  styleButtonActive: { backgroundColor: COLORS.accent },
  styleLabel: {
    color: COLORS.fogGray, fontSize: 10, fontWeight: '800',
    letterSpacing: 0.6,
  },
  styleLabelActive: { color: COLORS.primary, fontWeight: '900' },
  attribution: {
    position: 'absolute', bottom: 4, right: 8,
    backgroundColor: 'rgba(11, 31, 42, 0.6)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  attributionText: { color: COLORS.fogGray, fontSize: 8, opacity: 0.6 },
});
