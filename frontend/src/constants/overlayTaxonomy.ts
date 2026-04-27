/**
 * Canonical overlay taxonomy — frontend single source of truth.
 *
 * Every overlay type that the LLM may emit has a fixed color, icon,
 * and label. The legend, the in-card overlay renderer, and the
 * backend prompt/validator all read from this same shape.
 *
 * The COLOR values here are mirrored from
 * `/app/backend/overlay_taxonomy.py`. If you change one, change the
 * other in the SAME PR — the backend validator overwrites every
 * overlay's `color` with its canonical hex on the way out, so a
 * mismatch will cause the legend and the rendered overlay to diverge.
 */

import { COLORS } from './theme';

export interface OverlayTypeInfo {
  /** Slug emitted by the LLM — stable on the wire. */
  type: string;
  /** Human-readable label shown in the legend / detail card. */
  label: string;
  /** Canonical hex matching `overlay_taxonomy.OverlayType.color`. */
  color: string;
  /** Ionicons glyph used for the marker / chip icon. */
  icon: string;
}

export const OVERLAY_TAXONOMY: readonly OverlayTypeInfo[] = [
  { type: 'stand',        label: 'Stand / Blind',    color: COLORS.stands,       icon: 'pin' },
  { type: 'corridor',     label: 'Travel Corridor',  color: COLORS.corridors,    icon: 'trail-sign' },
  { type: 'access_route', label: 'Access Route',     color: COLORS.accessRoutes, icon: 'walk' },
  { type: 'avoid',        label: 'Avoid Zone',       color: COLORS.avoidZones,   icon: 'warning' },
  { type: 'bedding',      label: 'Bedding Area',     color: '#8D6E63',           icon: 'bed' },
  { type: 'food',         label: 'Food Source',      color: '#66BB6A',           icon: 'nutrition' },
  { type: 'water',        label: 'Water Source',     color: '#29B6F6',           icon: 'water' },
  { type: 'trail',        label: 'Trail / Path',     color: '#FFCA28',           icon: 'footsteps' },
] as const;

const _BY_TYPE: Record<string, OverlayTypeInfo> = OVERLAY_TAXONOMY.reduce(
  (acc, info) => { acc[info.type] = info; return acc; },
  {} as Record<string, OverlayTypeInfo>,
);

export const OVERLAY_COLORS: Record<string, string> = OVERLAY_TAXONOMY.reduce(
  (acc, info) => { acc[info.type] = info.color; return acc; },
  {} as Record<string, string>,
);

export const OVERLAY_ICONS: Record<string, string> = OVERLAY_TAXONOMY.reduce(
  (acc, info) => { acc[info.type] = info.icon; return acc; },
  {} as Record<string, string>,
);

export const OVERLAY_LABELS: Record<string, string> = OVERLAY_TAXONOMY.reduce(
  (acc, info) => { acc[info.type] = info.label; return acc; },
  {} as Record<string, string>,
);

/**
 * Resolve the color to render an overlay with. Always prefers the
 * canonical color carried on the overlay payload (the backend
 * validator stamps every overlay with its canonical hex on the way
 * out, so this is the ground truth). Falls back to the static map
 * for any legacy payload that pre-dated the color field, then to a
 * neutral fallback.
 */
export function resolveOverlayColor(overlay: { type?: string; color?: string }): string {
  if (overlay?.color && /^#?[0-9A-Fa-f]{3,8}$/.test(overlay.color)) {
    return overlay.color.startsWith('#') ? overlay.color : `#${overlay.color}`;
  }
  if (overlay?.type && OVERLAY_COLORS[overlay.type]) {
    return OVERLAY_COLORS[overlay.type];
  }
  return '#FFFFFF';
}

export function getOverlayInfo(type: string | null | undefined): OverlayTypeInfo | null {
  if (!type) return null;
  return _BY_TYPE[type] || null;
}
