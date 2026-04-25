/**
 * MapProvider — legacy shim.
 *
 * The canonical Raven Scout style catalog now lives in
 * `src/constants/mapStyles.ts`. This module is preserved purely for
 * backward compatibility with older imports (`getStyleUrl(style)`,
 * `hasMaptilerKey()`, `getFallbackStyleJSON()`) and proxies through
 * to the new config.
 *
 * New code should import from `../constants/mapStyles` directly.
 */
import {
  RAVEN_SCOUT_MAP_STYLES,
  hasMapTilerKey,
  resolveMapStyle,
  type RavenScoutMapStyleId,
} from '../constants/mapStyles';

// Legacy MapStyle type — keep the old surface for callers that still
// pass 'streets' / 'satellite' / 'outdoor'. We map them to the closest
// modern equivalent so old preferences keep rendering something useful.
export type MapStyle = RavenScoutMapStyleId | 'streets' | 'satellite';

const LEGACY_MAP: Record<string, RavenScoutMapStyleId> = {
  streets: 'outdoor',
  satellite: 'satelliteHybrid',
  outdoor: 'outdoor',
};

function toCanonical(style: MapStyle | string): RavenScoutMapStyleId {
  if (style in LEGACY_MAP) return LEGACY_MAP[style];
  // Already canonical (or unknown — resolveMapStyle handles fallback)
  return resolveMapStyle(style as RavenScoutMapStyleId).id;
}

export function getMapStyles() {
  return RAVEN_SCOUT_MAP_STYLES.map(s => ({
    id: s.id,
    label: s.label,
    icon: s.icon,
    styleUrl: s.styleUrl,
  }));
}

export function getStyleUrl(style: MapStyle | string): string {
  if (!hasMapTilerKey()) return '';
  return resolveMapStyle(toCanonical(style)).styleUrl;
}

// CartoDB Voyager fallback — used when the MapTiler key is missing.
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

export function getFallbackStyleJSON(): object {
  return FALLBACK_STYLE;
}

export function hasMaptilerKey(): boolean {
  return hasMapTilerKey();
}

export function getDarkStyleJSON(): object {
  return FALLBACK_STYLE;
}
