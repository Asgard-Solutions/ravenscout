import React, { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from '../constants/theme';
import { getDarkStyleJSON } from '../map/MapProvider';

interface TacticalMapViewProps {
  center?: { lat: number; lon: number };
  zoom?: number;
  height?: number;
}

export default function TacticalMapView({
  center = { lat: 39.8283, lon: -98.5795 }, // Default: center of US
  zoom = 5,
  height = 350,
}: TacticalMapViewProps) {
  const styleJSON = JSON.stringify(getDarkStyleJSON());

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
    .maplibregl-ctrl-group { background: rgba(58, 74, 82, 0.8) !important; border: 1px solid rgba(154, 164, 169, 0.3) !important; border-radius: 8px !important; }
    .maplibregl-ctrl-group button { background: transparent !important; }
    .maplibregl-ctrl-group button + button { border-top: 1px solid rgba(154, 164, 169, 0.2) !important; }
    .maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon,
    .maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon,
    .maplibregl-ctrl-compass .maplibregl-ctrl-icon {
      filter: invert(1) brightness(0.8);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const style = ${styleJSON};
    const map = new maplibregl.Map({
      container: 'map',
      style: style,
      center: [${center.lon}, ${center.lat}],
      zoom: ${zoom},
      attributionControl: false,
      maxZoom: 18,
      minZoom: 2,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    // Listen for messages from React Native
    window.addEventListener('message', function(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'setCenter') {
          map.flyTo({ center: [data.lon, data.lat], zoom: data.zoom || 12, duration: 1500 });
        }
        if (data.type === 'setZoom') {
          map.setZoom(data.zoom);
        }
      } catch (e) {}
    });

    // Notify RN that map is ready
    map.on('load', function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
      }
    });
  </script>
</body>
</html>
  `, [center.lat, center.lon, zoom, styleJSON]);

  return (
    <View style={[styles.container, { height }]}>
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
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        allowsInlineMediaPlayback={true}
      />
      <View style={styles.attribution}>
        <Text style={styles.attributionText}>© OpenStreetMap · CARTO</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.3)',
    backgroundColor: COLORS.primary,
  },
  webview: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  attribution: {
    position: 'absolute',
    bottom: 4,
    left: 8,
    backgroundColor: 'rgba(11, 31, 42, 0.7)',
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
