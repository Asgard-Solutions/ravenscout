import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { getStyleUrl, getFallbackStyleJSON, hasMaptilerKey, type MapStyle } from '../map/MapProvider';

interface TacticalMapViewProps {
  center?: { lat: number; lon: number };
  zoom?: number;
  height?: number;
  showStyleSwitcher?: boolean;
  captureRequested?: number;
  onCapture?: (base64: string) => void;
}

const STYLES: { id: MapStyle; label: string; icon: string }[] = [
  { id: 'outdoor', label: 'TOPO', icon: 'trail-sign' },
  { id: 'satellite', label: 'SAT', icon: 'earth' },
  { id: 'streets', label: 'MAP', icon: 'map-outline' },
];

export default function TacticalMapView({
  center = { lat: 39.8283, lon: -98.5795 },
  zoom = 5,
  height = 350,
  showStyleSwitcher = true,
  captureRequested = 0,
  onCapture,
}: TacticalMapViewProps) {
  const [mapStyle, setMapStyle] = useState<MapStyle>('outdoor');
  const useMaptiler = hasMaptilerKey();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const webviewRef = useRef<any>(null);
  const lastCaptureRef = useRef(0);

  const styleSource = useMaptiler
    ? `'${getStyleUrl(mapStyle)}'`
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
      style: ${styleSource},
      center: [${center.lon}, ${center.lat}],
      zoom: ${zoom},
      attributionControl: false,
      maxZoom: 20,
      minZoom: 2,
      preserveDrawingBuffer: true
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    // Listen for capture requests
    window.addEventListener('message', function(e) {
      try {
        var data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data.type === 'capture') {
          var canvas = map.getCanvas();
          var dataUrl = canvas.toDataURL('image/png');
          var msg = JSON.stringify({ type: 'captureResult', data: dataUrl });
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(msg);
          } else {
            window.parent.postMessage(msg, '*');
          }
        }
      } catch(err) {}
    });
  </script>
</body>
</html>
  `, [center.lat, center.lon, zoom, styleSource]);

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
      } catch {}
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
    } catch {}
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
        onMessage={handleWebViewMessage}
      />
    );
  })();

  return (
    <View style={[styles.container, { height }]}>
      {mapContent}

      {showStyleSwitcher && useMaptiler && (
        <View style={styles.styleSwitcher}>
          {STYLES.map((s) => (
            <TouchableOpacity
              key={s.id}
              testID={`map-style-${s.id}`}
              style={[styles.styleButton, mapStyle === s.id && styles.styleButtonActive]}
              onPress={() => setMapStyle(s.id)}
              activeOpacity={0.7}
            >
              <Ionicons name={s.icon as any} size={14} color={mapStyle === s.id ? COLORS.primary : COLORS.fogGray} />
              <Text style={[styles.styleLabel, mapStyle === s.id && styles.styleLabelActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
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
  container: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)', backgroundColor: COLORS.primary },
  webview: { flex: 1, backgroundColor: COLORS.primary },
  styleSwitcher: {
    position: 'absolute', bottom: 24, left: 10, flexDirection: 'row', gap: 4,
    backgroundColor: 'rgba(11, 31, 42, 0.88)', borderRadius: 8, padding: 3,
    borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.25)',
  },
  styleButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  styleButtonActive: { backgroundColor: COLORS.accent },
  styleLabel: { color: COLORS.fogGray, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  styleLabelActive: { color: COLORS.primary },
  attribution: { position: 'absolute', bottom: 4, right: 8, backgroundColor: 'rgba(11, 31, 42, 0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  attributionText: { color: COLORS.fogGray, fontSize: 8, opacity: 0.6 },
});
