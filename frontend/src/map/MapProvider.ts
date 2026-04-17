/**
 * MapProvider - Provider-agnostic map configuration
 * 
 * Current: MapTiler (satellite, outdoor, streets)
 * Renderer: MapLibre GL JS
 * 
 * To swap to Mapbox later: update ACTIVE_PROVIDER and add Mapbox token
 */

export type MapStyle = 'streets' | 'satellite' | 'outdoor';

export type MapProviderType = 'maptiler' | 'osm-carto' | 'mapbox';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY || '';

interface MapStyleConfig {
  id: MapStyle;
  label: string;
  icon: string;
  styleUrl: string;
}

// MapTiler vector style URLs (used by MapLibre GL JS)
const MAPTILER_STYLES: Record<MapStyle, MapStyleConfig> = {
  streets: {
    id: 'streets',
    label: 'STREETS',
    icon: 'map-outline',
    styleUrl: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
  },
  satellite: {
    id: 'satellite',
    label: 'SATELLITE',
    icon: 'earth',
    styleUrl: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
  },
  outdoor: {
    id: 'outdoor',
    label: 'OUTDOOR',
    icon: 'trail-sign',
    styleUrl: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`,
  },
};

// Fallback: free CartoDB Voyager (no key needed)
const FALLBACK_STYLE = {
  version: 8,
  name: 'Fallback',
  sources: {
    'carto-voyager': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 18,
    },
  },
  layers: [{ id: 'carto-layer', type: 'raster', source: 'carto-voyager', minzoom: 0, maxzoom: 22 }],
};

export function getMapStyles(): MapStyleConfig[] {
  if (!MAPTILER_KEY) return [];
  return [MAPTILER_STYLES.outdoor, MAPTILER_STYLES.satellite, MAPTILER_STYLES.streets];
}

export function getStyleUrl(style: MapStyle): string {
  if (!MAPTILER_KEY) return '';
  return MAPTILER_STYLES[style].styleUrl;
}

export function getFallbackStyleJSON(): object {
  return FALLBACK_STYLE;
}

export function hasMaptilerKey(): boolean {
  return !!MAPTILER_KEY;
}

// Keep for backward compat
export function getDarkStyleJSON(): object {
  return FALLBACK_STYLE;
}
