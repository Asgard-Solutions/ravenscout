/**
 * Raven Scout — AnalysisOverlayItem taxonomy.
 *
 * Visual styling (icon + color + human label) for the new persisted
 * overlay-item shape (see /app/backend/models/analysis_overlay_item.py
 * and src/types/geo.ts > ANALYSIS_OVERLAY_ITEM_TYPES).
 *
 * This is intentionally separate from `overlayTaxonomy.ts`, which
 * supports the legacy AI-only overlay shape (x_percent / y_percent
 * with a smaller type set). The two will eventually converge but
 * for Task 9 we only render saved AnalysisOverlayItems and need a
 * mapping that covers every type the backend can persist.
 *
 * NOTE: Colors are inlined as hex literals (mirrored from
 * `src/constants/theme.ts`) so this module can be imported by the
 * `node:test` runner without dragging in `react-native`.
 */
import type { AnalysisOverlayItemType, CoordinateSource } from '../types/geo';

// Mirrors COLORS in theme.ts. Inlined here to keep this module
// importable by node-only test runners.
const _T = {
  stands: '#2E7D32',
  corridors: '#F57C00',
  accessRoutes: '#42A5F5',
  avoidZones: '#C62828',
  accent: '#C89B3C',
};

export interface OverlayItemTypeInfo {
  type: AnalysisOverlayItemType;
  /** Human-readable label shown in the detail card / legend. */
  label: string;
  /** Hex color for the marker dot + label badge. */
  color: string;
  /** Ionicons glyph for the marker. */
  icon: string;
}

const _ITEMS: ReadonlyArray<OverlayItemTypeInfo> = [
  { type: 'stand',             label: 'Stand',              color: _T.stands,       icon: 'pin' },
  { type: 'blind',             label: 'Blind',              color: _T.stands,       icon: 'home' },
  { type: 'feeder',            label: 'Feeder',             color: '#66BB6A',       icon: 'leaf' },
  { type: 'camera',            label: 'Trail Camera',       color: '#29B6F6',       icon: 'camera' },
  { type: 'parking',           label: 'Parking',            color: '#9AA4A9',       icon: 'car' },
  { type: 'access_point',      label: 'Access Point',       color: _T.accessRoutes, icon: 'walk' },
  { type: 'water',             label: 'Water Source',       color: '#29B6F6',       icon: 'water' },
  { type: 'scrape',            label: 'Scrape',             color: '#8D6E63',       icon: 'paw' },
  { type: 'rub',               label: 'Rub',                color: '#A1887F',       icon: 'git-branch' },
  { type: 'bedding',           label: 'Bedding Area',       color: '#8D6E63',       icon: 'bed' },
  { type: 'route',             label: 'Travel Route',       color: _T.corridors,    icon: 'trail-sign' },
  { type: 'wind',              label: 'Wind Note',          color: '#90A4AE',       icon: 'navigate' },
  { type: 'funnel',            label: 'Funnel',             color: _T.corridors,    icon: 'git-merge' },
  { type: 'travel_corridor',   label: 'Travel Corridor',    color: _T.corridors,    icon: 'trail-sign' },
  { type: 'recommended_setup', label: 'Recommended Setup',  color: _T.accent,       icon: 'star' },
  { type: 'avoid_area',        label: 'Avoid Area',         color: _T.avoidZones,   icon: 'warning' },
  { type: 'custom',            label: 'Custom Marker',      color: _T.accent,       icon: 'flag' },
];

const _BY_TYPE: Record<string, OverlayItemTypeInfo> = _ITEMS.reduce(
  (acc, info) => {
    acc[info.type] = info;
    return acc;
  },
  {} as Record<string, OverlayItemTypeInfo>,
);

const _FALLBACK: OverlayItemTypeInfo = {
  type: 'custom',
  label: 'Marker',
  color: _T.accent,
  icon: 'flag',
};

export function getOverlayItemTypeInfo(
  type: string | null | undefined,
): OverlayItemTypeInfo {
  if (!type) return _FALLBACK;
  return _BY_TYPE[type] || _FALLBACK;
}

export const OVERLAY_ITEM_TYPES_LIST: ReadonlyArray<OverlayItemTypeInfo> = _ITEMS;

/** Pretty label for the coordinate source field on the detail card. */
const COORD_SOURCE_LABELS: Record<CoordinateSource, string> = {
  user_provided: 'User provided',
  ai_estimated_from_image: 'AI estimated from image',
  derived_from_saved_map_bounds: 'Derived from saved map bounds',
  pixel_only: 'Pixel-only image placement',
};

export function coordinateSourceLabel(
  source: CoordinateSource | string | null | undefined,
): string {
  if (!source) return 'Unknown';
  return COORD_SOURCE_LABELS[source as CoordinateSource] || String(source);
}
