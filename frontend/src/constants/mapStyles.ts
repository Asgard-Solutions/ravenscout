/**
 * Raven Scout — centralized MapTiler style catalog.
 *
 * Single source of truth for every base map the app can render. The
 * map screen and any future scouting / overlay viewer should import
 * from here — do NOT hardcode MapTiler URLs anywhere else.
 *
 * Adding a new style: append a new entry to RAVEN_SCOUT_MAP_STYLES,
 * pick a unique `id`, point `styleUrl` at the MapTiler GL style.json
 * (NOT the cloud preview HTML page), and update RavenScoutMapStyleId.
 */

export type RavenScoutMapStyleId =
  | 'outdoor'
  | 'satelliteHybrid'
  | 'satellitePlain'
  | 'topo';

export interface RavenScoutMapStyle {
  id: RavenScoutMapStyleId;
  /** Short label rendered on the in-map style chip (4-7 chars works). */
  label: string;
  /** Sentence-length human description for tooltips / sheet rows. */
  description: string;
  /**
   * Ionicons glyph name used by the chip and the (future) settings
   * row. Keep it semantically meaningful for the style.
   */
  icon: string;
  /**
   * MapTiler GL style.json URL with `${EXPO_PUBLIC_MAPTILER_KEY}`
   * already substituted at module load. Empty string when the key
   * is missing — callers MUST handle that branch (see
   * `getActiveMapStyles()` and `hasMapTilerKey()`).
   */
  styleUrl: string;
}

// EXPO_PUBLIC_* env vars are inlined into the JS bundle at build time.
// Keep this read at module scope so both the app and the tests can
// observe the exact same value.
const MAPTILER_KEY: string =
  (process.env.EXPO_PUBLIC_MAPTILER_KEY as string | undefined) || '';

/**
 * Build a MapTiler style URL with the configured key already injected.
 * Returns an empty string when the key is missing so call-sites can
 * detect missing-config and route to the offline fallback raster.
 */
function buildStyleUrl(slug: string): string {
  if (!MAPTILER_KEY) return '';
  return `https://api.maptiler.com/maps/${slug}/style.json?key=${MAPTILER_KEY}`;
}

/**
 * The canonical Raven Scout map catalog. Order here is the order the
 * style switcher renders. Outdoor first — it is the default for new
 * users and matches our spec.
 */
export const RAVEN_SCOUT_MAP_STYLES: ReadonlyArray<RavenScoutMapStyle> = [
  {
    id: 'outdoor',
    label: 'OUTDOOR',
    description: 'Best default scouting map for trails, terrain, parks, and outdoor context.',
    icon: 'trail-sign',
    styleUrl: buildStyleUrl('outdoor-v4'),
  },
  {
    id: 'satelliteHybrid',
    label: 'HYBRID',
    description: 'Satellite imagery with labels and road / place context.',
    icon: 'globe',
    styleUrl: buildStyleUrl('hybrid-v4'),
  },
  {
    id: 'satellitePlain',
    label: 'SAT',
    description: 'Clean satellite imagery without extra label clutter.',
    icon: 'earth',
    styleUrl: buildStyleUrl('satellite-v4'),
  },
  {
    id: 'topo',
    label: 'TOPO',
    description: 'Topographic map for elevation, contours, and terrain planning.',
    icon: 'analytics',
    styleUrl: buildStyleUrl('topo-v4'),
  },
] as const;

/** Default style for a brand-new install. */
export const DEFAULT_MAP_STYLE_ID: RavenScoutMapStyleId = 'outdoor';

/**
 * AsyncStorage key for the user's persisted style preference.
 * Versioned so we can migrate cleanly later (e.g. if we drop a style
 * id, old persisted values fall back to the default automatically).
 */
export const MAP_STYLE_STORAGE_KEY = 'raven_scout_map_style_v1';

// ---------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------

/** True when the runtime has a MapTiler key baked into the bundle. */
export function hasMapTilerKey(): boolean {
  return !!MAPTILER_KEY;
}

/**
 * Active styles for the UI. Returns an empty array when the key is
 * missing so the switcher knows to hide itself; the map screen still
 * renders via the offline fallback raster.
 */
export function getActiveMapStyles(): ReadonlyArray<RavenScoutMapStyle> {
  if (!hasMapTilerKey()) return [];
  return RAVEN_SCOUT_MAP_STYLES;
}

/**
 * Resolve a style id to its full config. Falls back to the default
 * style when the id is unknown / disabled, so persisted preferences
 * from older builds never crash the map screen.
 */
export function resolveMapStyle(
  id: RavenScoutMapStyleId | string | null | undefined,
): RavenScoutMapStyle {
  if (id) {
    const match = RAVEN_SCOUT_MAP_STYLES.find(s => s.id === id);
    if (match) return match;
  }
  // Default is guaranteed to be in the catalog — the cast is safe.
  return RAVEN_SCOUT_MAP_STYLES.find(s => s.id === DEFAULT_MAP_STYLE_ID)!;
}

/** Type-guard for runtime values that may be unknown strings. */
export function isRavenScoutMapStyleId(v: unknown): v is RavenScoutMapStyleId {
  return (
    typeof v === 'string' &&
    RAVEN_SCOUT_MAP_STYLES.some(s => s.id === v)
  );
}

/**
 * Tiny self-check fired at module load. Logs (does not throw) when
 * the bundle is missing the MapTiler key so developers see a clear
 * signal in Metro / device logs without breaking the app.
 */
if (typeof __DEV__ !== 'undefined' && __DEV__ && !MAPTILER_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[mapStyles] EXPO_PUBLIC_MAPTILER_KEY is empty — the map switcher ' +
      'will be hidden and the map will fall back to the offline raster. ' +
      'Set EXPO_PUBLIC_MAPTILER_KEY in .env (and eas.json for builds) to enable MapTiler styles.',
  );
}
