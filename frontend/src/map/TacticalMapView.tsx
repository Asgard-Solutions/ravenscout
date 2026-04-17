import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { getStyleUrl, getFallbackStyleJSON, hasMaptilerKey, type MapStyle } from '../map/MapProvider';

interface TacticalMapViewProps {
  center?: { lat: number; lon: number };
  zoom?: number;
  height?: number;
  showStyleSwitcher?: boolean;
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
}: TacticalMapViewProps) {
  const [mapStyle, setMapStyle] = useState<MapStyle>('outdoor');
  const useMaptiler = hasMaptilerKey();

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
      backdrop-filter: blur(4px);
    }
    .maplibregl-ctrl-group button { background: transparent !important; }
    .maplibregl-ctrl-group button + button { border-top: 1px solid rgba(154, 164, 169, 0.2) !important; }
    .maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon,
    .maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon,
    .maplibregl-ctrl-compass .maplibregl-ctrl-icon {
      filter: invert(0.8);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = new maplibregl.Map({
      container: 'map',
      style: ${styleSource},
      center: [${center.lon}, ${center.lat}],
      zoom: ${zoom},
      attributionControl: false,
      maxZoom: 20,
      minZoom: 2,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
  </script>
</body>
</html>
  `, [center.lat, center.lon, zoom, styleSource]);

  const mapContent = Platform.OS === 'web' ? (
    <iframe
      data-testid="tactical-map-iframe"
      srcDoc={htmlContent}
      style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 } as any}
      sandbox="allow-scripts"
    />
  ) : (() => {
    const WebView = require('react-native-webview').WebView;
    return (
      <WebView
        testID="tactical-map-webview"
        source={{ html: htmlContent }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
      />
    );
  })();

  return (
    <View style={[styles.container, { height }]}>
      {mapContent}

      {/* Style Switcher */}
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
              <Ionicons
                name={s.icon as any}
                size={14}
                color={mapStyle === s.id ? COLORS.primary : COLORS.fogGray}
              />
              <Text style={[styles.styleLabel, mapStyle === s.id && styles.styleLabelActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Attribution */}
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
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.3)',
    backgroundColor: COLORS.primary,
  },
  webview: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  styleSwitcher: {
    position: 'absolute',
    bottom: 24,
    left: 10,
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(11, 31, 42, 0.88)',
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.25)',
  },
  styleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  styleButtonActive: {
    backgroundColor: COLORS.accent,
  },
  styleLabel: {
    color: COLORS.fogGray,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  styleLabelActive: {
    color: COLORS.primary,
  },
  attribution: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    backgroundColor: 'rgba(11, 31, 42, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  attributionText: {
    color: COLORS.fogGray,
    fontSize: 8,
    opacity: 0.6,
  },
});
