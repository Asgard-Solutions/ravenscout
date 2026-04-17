/**
 * MapProvider - Provider-agnostic map configuration
 * 
 * Abstracts the map tile source and style so the base map can be swapped
 * from OSM/CartoDB to Mapbox, MapTiler, or any other provider without
 * touching the map view or overlay components.
 * 
 * To add Mapbox satellite later:
 * 1. Set provider to 'mapbox'
 * 2. Add MAPBOX_ACCESS_TOKEN
 * 3. Update getStyleUrl() to return Mapbox style URL
 */

export type MapProviderType = 'osm-dark' | 'osm-bright' | 'mapbox' | 'maptiler';

interface MapProviderConfig {
  provider: MapProviderType;
  styleUrl: string;
  attribution: string;
  maxZoom: number;
  requiresApiKey: boolean;
}

const PROVIDERS: Record<MapProviderType, MapProviderConfig> = {
  'osm-dark': {
    provider: 'osm-dark',
    styleUrl: '', // Uses inline style JSON (CartoDB Dark Matter)
    attribution: '© OpenStreetMap contributors, © CARTO',
    maxZoom: 18,
    requiresApiKey: false,
  },
  'osm-bright': {
    provider: 'osm-bright',
    styleUrl: '', // Uses inline style JSON (OSM Bright)
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
    requiresApiKey: false,
  },
  'mapbox': {
    provider: 'mapbox',
    styleUrl: 'mapbox://styles/mapbox/satellite-streets-v12',
    attribution: '© Mapbox, © OpenStreetMap',
    maxZoom: 22,
    requiresApiKey: true,
  },
  'maptiler': {
    provider: 'maptiler',
    styleUrl: '', // Would use MapTiler style URL
    attribution: '© MapTiler, © OpenStreetMap',
    maxZoom: 20,
    requiresApiKey: true,
  },
};

// Current MVP provider
const ACTIVE_PROVIDER: MapProviderType = 'osm-dark';

export function getMapConfig(): MapProviderConfig {
  return PROVIDERS[ACTIVE_PROVIDER];
}

export function getProvider(): MapProviderType {
  return ACTIVE_PROVIDER;
}

// Dark style JSON using CartoDB Dark Matter raster tiles (free, no key)
export function getDarkStyleJSON(): object {
  return {
    version: 8,
    name: 'Raven Scout Tactical',
    sources: {
      'carto-dark': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors, © CARTO',
        maxzoom: 18,
      },
    },
    layers: [
      {
        id: 'carto-dark-layer',
        type: 'raster',
        source: 'carto-dark',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  };
}

/**
 * Future: To add Mapbox satellite support:
 * 
 * 1. Install @maplibre/maplibre-react-native (requires dev build, not Expo Go)
 *    OR continue using WebView approach with Mapbox GL JS
 * 
 * 2. Update ACTIVE_PROVIDER to 'mapbox'
 * 
 * 3. Add Mapbox access token to .env:
 *    EXPO_PUBLIC_MAPBOX_TOKEN=pk.xxx
 * 
 * 4. Update TacticalMapView to use Mapbox style URL:
 *    style: 'mapbox://styles/mapbox/satellite-streets-v12'
 *    with transformRequest for token auth
 * 
 * 5. For native performance: switch from WebView to @maplibre/maplibre-react-native
 *    with EAS build (not Expo Go compatible)
 */
