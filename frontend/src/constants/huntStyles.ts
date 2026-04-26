/**
 * Canonical hunt-style inventory for Raven Scout.
 *
 * MUST stay in lockstep with backend `species_prompts/hunt_styles.py`.
 * The picker UI selects a canonical id; only that canonical id is
 * ever sent to the backend or persisted in local storage. Display
 * labels are rendered from this module so freeform text never leaks
 * into the prompt pipeline.
 */

export type HuntStyleId =
  | 'archery'
  | 'rifle'
  | 'shotgun'
  | 'blind'
  | 'saddle'
  | 'public_land'
  | 'spot_and_stalk';

/** Subset of HuntStyleId representing weapons (Step 1 of the hunt-style flow). */
export type HuntWeaponId = Extract<HuntStyleId, 'archery' | 'rifle' | 'shotgun'>;

/** Subset of HuntStyleId representing setup methods (Step 2 of the flow). */
export type HuntMethodId = Extract<HuntStyleId, 'blind' | 'saddle' | 'spot_and_stalk'>;

export interface HuntStyleOption {
  id: HuntStyleId;
  label: string;
  shortLabel: string;
  /** One-line explanation shown beneath the picker when selected. */
  hint: string;
  /** Ionicons glyph — mirrors other setup chip icons. */
  icon: string;
}

export const HUNT_STYLES: HuntStyleOption[] = [
  {
    id: 'archery',
    label: 'Archery',
    shortLabel: 'Archery',
    hint: 'Bow / crossbow — close-range setups, cover-line sensitive.',
    icon: 'locate',
  },
  {
    id: 'rifle',
    label: 'Rifle',
    shortLabel: 'Rifle',
    hint: 'Centerfire / muzzleloader — long sightlines, glassing-friendly.',
    icon: 'flash',
  },
  {
    id: 'shotgun',
    label: 'Shotgun',
    shortLabel: 'Shotgun',
    hint: 'Shotgun / slug gun — short-to-mid range, dense-cover capable.',
    icon: 'thunderstorm',
  },
  {
    id: 'blind',
    label: 'Ground Blind',
    shortLabel: 'Blind',
    hint: 'Enclosed blind — high concealment, narrow shot arc.',
    icon: 'cube-outline',
  },
  {
    id: 'saddle',
    label: 'Tree Saddle',
    shortLabel: 'Saddle',
    hint: 'Mobile tree-saddle — wind-adaptive, narrow shooting window.',
    icon: 'trail-sign',
  },
  {
    id: 'public_land',
    label: 'Public Land',
    shortLabel: 'Public',
    hint: 'Pressured public ground — quiet access and refuge pockets dominate.',
    icon: 'people',
  },
  {
    id: 'spot_and_stalk',
    label: 'Spot & Stalk',
    shortLabel: 'Stalk',
    hint: 'Active glassing / stalking — no fixed stand, thermal-aware approach.',
    icon: 'eye',
  },
];

/**
 * Two-step hunt-style flow — Step 1 (Weapon) is shown first, Step 2
 * (Method) appears after a weapon is picked. Both surfaces resolve
 * to canonical HuntStyleId values from HUNT_STYLES so the existing
 * persistence + AI-prompt pipeline keeps working unchanged.
 */
export const HUNT_WEAPONS: HuntStyleOption[] = HUNT_STYLES.filter(s =>
  ['archery', 'rifle', 'shotgun'].includes(s.id),
);

export const HUNT_METHODS: HuntStyleOption[] = HUNT_STYLES.filter(s =>
  ['blind', 'saddle', 'spot_and_stalk'].includes(s.id),
);

export const CANONICAL_HUNT_STYLE_IDS: ReadonlyArray<HuntStyleId> = HUNT_STYLES.map(
  s => s.id,
) as HuntStyleId[];

const _LABEL_BY_ID: Record<string, string> = HUNT_STYLES.reduce((acc, s) => {
  acc[s.id] = s.label;
  return acc;
}, {} as Record<string, string>);

export function isCanonicalHuntStyleId(value: unknown): value is HuntStyleId {
  return typeof value === 'string' && value in _LABEL_BY_ID;
}

export function getHuntStyleLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return _LABEL_BY_ID[id] ?? null;
}

/**
 * Coerce any input to either a canonical hunt-style id or null.
 *
 * This is the ONLY layer in the frontend allowed to accept
 * freeform text; everything downstream (saved hunt records,
 * analyze-hunt request body, re-opened history views) operates on
 * canonical ids only. Matches the backend normalizer semantics.
 */
export function normalizeHuntStyleId(value: unknown): HuntStyleId | null {
  if (typeof value !== 'string') return null;
  const key = value
    .trim()
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/[.']/g, '')
    .replace(/\s+/g, ' ');
  if (!key) return null;

  // Canonical id check (underscored form).
  const underscored = key.replace(/\s+/g, '_');
  if (isCanonicalHuntStyleId(underscored)) return underscored;

  // Alias table (small — display-label friendly only).
  const aliases: Record<string, HuntStyleId> = {
    archery: 'archery',
    bow: 'archery',
    'bow hunting': 'archery',
    bowhunting: 'archery',
    compound: 'archery',
    'compound bow': 'archery',
    recurve: 'archery',
    traditional: 'archery',
    crossbow: 'archery',

    rifle: 'rifle',
    gun: 'rifle',
    firearm: 'rifle',
    centerfire: 'rifle',
    muzzleloader: 'rifle',
    'muzzle loader': 'rifle',
    'black powder': 'rifle',
    blackpowder: 'rifle',
    shotgun: 'shotgun',
    'slug gun': 'shotgun',
    slug: 'shotgun',

    blind: 'blind',
    'ground blind': 'blind',
    'box blind': 'blind',
    'pop up blind': 'blind',
    'popup blind': 'blind',
    'tower blind': 'blind',
    'elevated blind': 'blind',

    saddle: 'saddle',
    'tree saddle': 'saddle',
    'saddle hunting': 'saddle',
    'saddle hunter': 'saddle',
    'mobile saddle': 'saddle',

    public: 'public_land',
    'public land': 'public_land',
    publicland: 'public_land',
    'public ground': 'public_land',
    'public property': 'public_land',
    'state land': 'public_land',
    'national forest': 'public_land',
    blm: 'public_land',
    wma: 'public_land',

    'spot and stalk': 'spot_and_stalk',
    'spot & stalk': 'spot_and_stalk',
    'spot n stalk': 'spot_and_stalk',
    stalk: 'spot_and_stalk',
    stalking: 'spot_and_stalk',
    'still hunt': 'spot_and_stalk',
    'still hunting': 'spot_and_stalk',
    glassing: 'spot_and_stalk',
  };

  // Normalized key (space form) — match aliases directly.
  const directKey = key.replace(/&/g, '&');
  if (directKey in aliases) return aliases[directKey];
  // Also try with spaces retained around & (already handled) and extra
  // fallback against underscored form.
  if (underscored in aliases) return aliases[underscored];
  return null;
}
