/**
 * Raven Scout — US states + state→hunting-region mapping.
 *
 * The hunting-region taxonomy is shared with the AI analysis prompt
 * pack so the model can lean on regional behavioral patterns
 * (rut timing, food sources, terrain) instead of treating every
 * lat/lon as anonymous. Keep this file as the single source of truth
 * — both the conditions form and the prompt builder import from here.
 *
 * Adding a new region: extend HUNTING_REGION_IDS, add the label to
 * HUNTING_REGION_LABELS, then update STATE_TO_HUNTING_REGION (which
 * accepts an array so a state can split across regions in the future
 * once we wire GPS-based sub-region resolution — e.g. East TX vs
 * Plains TX).
 */

// ----- Hunting region taxonomy -------------------------------------------

export const HUNTING_REGION_IDS = [
  'southeast_us',
  'midwest',
  'plains',
  'mountain_west',
  'generic_default',
] as const;

export type HuntingRegionId = (typeof HUNTING_REGION_IDS)[number];

/** Display labels rendered in the picker / review screen. */
export const HUNTING_REGION_LABELS: Record<HuntingRegionId, string> = {
  southeast_us: 'Southeast US',
  midwest: 'Midwest',
  plains: 'Plains',
  mountain_west: 'Mountain West',
  generic_default: 'General',
};

/** Short helper for prompt / debug strings. */
export function hr_label(id: HuntingRegionId | null | undefined): string {
  if (!id) return '';
  return HUNTING_REGION_LABELS[id] || id;
}

// ----- US states ---------------------------------------------------------

export interface UsState {
  code: string; // 2-letter (e.g. "OK")
  name: string; // full name (e.g. "Oklahoma")
}

/** Alphabetical, includes DC. 51 entries. */
export const US_STATES: ReadonlyArray<UsState> = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

/** Lookup helpers — both directions for reverse-geocode normalization. */
const _STATE_BY_CODE: Record<string, UsState> = Object.fromEntries(
  US_STATES.map(s => [s.code, s]),
);
const _STATE_BY_NAME: Record<string, UsState> = Object.fromEntries(
  US_STATES.map(s => [s.name.toLowerCase(), s]),
);

export function getStateByCode(code?: string | null): UsState | null {
  if (!code) return null;
  return _STATE_BY_CODE[code.toUpperCase()] || null;
}

export function getStateByName(name?: string | null): UsState | null {
  if (!name) return null;
  return _STATE_BY_NAME[name.trim().toLowerCase()] || null;
}

/**
 * Resolve a free-form region/locality string from `expo-location`'s
 * `reverseGeocodeAsync` (Apple/Google geocoder). The `region` field
 * is sometimes the full state name ("Oklahoma"), sometimes the
 * 2-letter code ("OK"). This normalizes both into a UsState entry.
 */
export function resolveStateFromGeocode(
  region: string | null | undefined,
): UsState | null {
  if (!region) return null;
  const r = region.trim();
  if (!r) return null;
  // Try 2-letter code first (matches "OK", "TX")
  if (r.length === 2) {
    const byCode = getStateByCode(r);
    if (byCode) return byCode;
  }
  return getStateByName(r);
}

// ----- State → hunting region(s) -----------------------------------------

/**
 * Forward-compatible mapping: each state maps to ONE OR MORE region
 * ids. Today every state has a single region; once GPS-based
 * sub-region resolution lands (TX → East TX vs Plains TX, etc.), the
 * relevant entries grow into arrays and the conditions form will
 * switch to the dropdown UI automatically.
 */
export const STATE_TO_HUNTING_REGIONS: Record<string, HuntingRegionId[]> = {
  // Texas (temporary unified mapping — split later by GPS)
  TX: ['southeast_us'],

  // Southeast US
  AL: ['southeast_us'],
  AR: ['southeast_us'],
  FL: ['southeast_us'],
  GA: ['southeast_us'],
  KY: ['southeast_us'],
  LA: ['southeast_us'],
  MS: ['southeast_us'],
  NC: ['southeast_us'],
  SC: ['southeast_us'],
  TN: ['southeast_us'],
  VA: ['southeast_us'],
  WV: ['southeast_us'],

  // Midwest
  IL: ['midwest'],
  IN: ['midwest'],
  IA: ['midwest'],
  MI: ['midwest'],
  MN: ['midwest'],
  MO: ['midwest'],
  OH: ['midwest'],
  WI: ['midwest'],

  // Plains
  KS: ['plains'],
  NE: ['plains'],
  ND: ['plains'],
  OK: ['plains'],
  SD: ['plains'],

  // Mountain West
  AZ: ['mountain_west'],
  CO: ['mountain_west'],
  ID: ['mountain_west'],
  MT: ['mountain_west'],
  NV: ['mountain_west'],
  NM: ['mountain_west'],
  UT: ['mountain_west'],
  WY: ['mountain_west'],

  // Generic default — less-targeted for the current species model
  AK: ['generic_default'],
  CA: ['generic_default'],
  CT: ['generic_default'],
  DE: ['generic_default'],
  HI: ['generic_default'],
  ME: ['generic_default'],
  MD: ['generic_default'],
  MA: ['generic_default'],
  NH: ['generic_default'],
  NJ: ['generic_default'],
  NY: ['generic_default'],
  OR: ['generic_default'],
  PA: ['generic_default'],
  RI: ['generic_default'],
  VT: ['generic_default'],
  WA: ['generic_default'],
  DC: ['generic_default'],
};

/**
 * Get the list of hunting regions assigned to a state. Returns []
 * for unknown / non-US locations. Today every supported state has
 * exactly one region.
 */
export function regionsForState(
  stateCode: string | null | undefined,
): HuntingRegionId[] {
  if (!stateCode) return [];
  const list = STATE_TO_HUNTING_REGIONS[stateCode.toUpperCase()];
  return list ? [...list] : [];
}

/**
 * Convenience for callers that only care about the single canonical
 * region for a state (today, that is always the first entry).
 */
export function defaultRegionForState(
  stateCode: string | null | undefined,
): HuntingRegionId | null {
  const list = regionsForState(stateCode);
  return list[0] || null;
}
