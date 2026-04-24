/**
 * Raven Scout Species — frontend registry + hooks.
 *
 * Mirrors the backend `species_registry.py`. The actual catalog is
 * fetched live from `GET /api/species` so it always reflects the
 * user's current tier locks + any newly-enabled species without
 * requiring an app rebuild. The local fallback below is used when
 * the network is unreachable (cold-start offline launch), so the
 * setup flow never hard-breaks.
 *
 * To mirror a new species added on the backend, add an entry here
 * in `LOCAL_FALLBACK_SPECIES` (optional — purely for offline UX).
 */
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { BACKEND_URL } from './theme';
import { useAuth } from '../hooks/useAuth';

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type SpeciesCategory = 'big_game' | 'predator' | 'bird';

export interface SpeciesTerminology {
  male: string;
  female: string;
  young: string;
  group: string;
}

export interface SpeciesFormFields {
  group_size: boolean;
  vocalization_activity: boolean;
  calling_activity: boolean;
  aggression_indicators: boolean;
  travel_pattern: boolean;
  sign_observed: boolean;
  season_phase_hint: boolean;
}

export interface SpeciesConfig {
  id: string;
  name: string;
  description: string;
  category: SpeciesCategory;
  category_label: string;
  min_tier: 'trial' | 'core' | 'pro';
  /** Ionicons glyph name */
  icon: string;
  enabled: boolean;
  locked: boolean;
  terminology: SpeciesTerminology;
  form_fields: SpeciesFormFields;
}

export interface CategoryMeta {
  id: SpeciesCategory;
  label: string;
}

// ----------------------------------------------------------------------
// Local fallback (offline-safe subset). Only the three always-free
// species need to be here — locked species require a server call to
// know the current user's tier anyway.
// ----------------------------------------------------------------------

const _DEFAULT_FORM_FIELDS: SpeciesFormFields = {
  group_size: false, vocalization_activity: false, calling_activity: false,
  aggression_indicators: false, travel_pattern: false, sign_observed: true,
  season_phase_hint: true,
};

export const LOCAL_FALLBACK_SPECIES: SpeciesConfig[] = [
  {
    id: 'deer', name: 'Whitetail Deer',
    description: 'Bedding-to-feeding transitions. Funnels, saddles & edges.',
    category: 'big_game', category_label: 'Big Game', min_tier: 'trial',
    icon: 'leaf', enabled: true, locked: false,
    terminology: { male: 'buck', female: 'doe', young: 'fawn', group: 'group' },
    form_fields: _DEFAULT_FORM_FIELDS,
  },
  {
    id: 'turkey', name: 'Wild Turkey',
    description: 'Roost-to-strut zones. Morning open-ground setups.',
    category: 'bird', category_label: 'Bird / Wingshooting', min_tier: 'trial',
    icon: 'sunny', enabled: true, locked: false,
    terminology: { male: 'tom', female: 'hen', young: 'poult', group: 'flock' },
    form_fields: { ..._DEFAULT_FORM_FIELDS, calling_activity: true, vocalization_activity: true },
  },
  {
    id: 'hog', name: 'Wild Hog',
    description: 'Water, thick cover & trails. Dusk/dawn ambush.',
    category: 'big_game', category_label: 'Big Game', min_tier: 'trial',
    icon: 'nutrition', enabled: true, locked: false,
    terminology: { male: 'boar', female: 'sow', young: 'piglet', group: 'sounder' },
    form_fields: { ..._DEFAULT_FORM_FIELDS, group_size: true },
  },
];

export const LOCAL_FALLBACK_CATEGORIES: CategoryMeta[] = [
  { id: 'big_game', label: 'Big Game' },
  { id: 'predator', label: 'Predator' },
  { id: 'bird', label: 'Bird / Wingshooting' },
];

// ----------------------------------------------------------------------
// Context + hook
// ----------------------------------------------------------------------

interface SpeciesCatalogState {
  loading: boolean;
  error: string | null;
  species: SpeciesConfig[];
  categories: CategoryMeta[];
  refresh: () => Promise<void>;
  /** Look up a species by id. Never throws — returns null if unknown. */
  findSpecies: (id: string | null | undefined) => SpeciesConfig | null;
  /** Resolve a species-appropriate term with a safe fallback. */
  getTerm: (id: string | null | undefined, which: keyof SpeciesTerminology) => string;
}

const SpeciesContext = createContext<SpeciesCatalogState | null>(null);

export const SpeciesCatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { sessionToken } = useAuth();
  const [species, setSpecies] = useState<SpeciesConfig[]>(LOCAL_FALLBACK_SPECIES);
  const [categories, setCategories] = useState<CategoryMeta[]>(LOCAL_FALLBACK_CATEGORIES);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    try {
      setError(null);
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
      const resp = await fetch(`${BACKEND_URL}/api/species`, { headers });
      if (!resp.ok) throw new Error(`http_${resp.status}`);
      const data = await resp.json();
      if (Array.isArray(data?.species) && data.species.length) {
        setSpecies(data.species as SpeciesConfig[]);
      }
      if (Array.isArray(data?.categories) && data.categories.length) {
        setCategories(data.categories as CategoryMeta[]);
      }
    } catch (err: any) {
      // Offline? Keep the local fallback so setup never dead-ends.
      setError(err?.message || 'network_error');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const value = useMemo<SpeciesCatalogState>(() => {
    const index = new Map<string, SpeciesConfig>();
    for (const s of species) index.set(s.id, s);
    const findSpecies = (id: string | null | undefined) => (id ? index.get(id.toLowerCase()) ?? null : null);
    const getTerm = (id: string | null | undefined, which: keyof SpeciesTerminology) => {
      const s = findSpecies(id);
      const fallback: SpeciesTerminology = { male: 'male', female: 'female', young: 'young', group: 'group' };
      return (s?.terminology?.[which]) || fallback[which];
    };
    return {
      loading, error, species, categories,
      refresh: fetchCatalog,
      findSpecies, getTerm,
    };
  }, [loading, error, species, categories, fetchCatalog]);

  return <SpeciesContext.Provider value={value}>{children}</SpeciesContext.Provider>;
};

export function useSpeciesCatalog(): SpeciesCatalogState {
  const ctx = useContext(SpeciesContext);
  if (ctx) return ctx;
  // Graceful fallback so screens that render before the provider mounts
  // still get a working, non-crashing default.
  return {
    loading: false, error: null,
    species: LOCAL_FALLBACK_SPECIES, categories: LOCAL_FALLBACK_CATEGORIES,
    refresh: async () => {},
    findSpecies: (id) => LOCAL_FALLBACK_SPECIES.find(s => s.id === (id || '').toLowerCase()) || null,
    getTerm: (id, which) => LOCAL_FALLBACK_SPECIES.find(s => s.id === (id || '').toLowerCase())?.terminology?.[which] || which,
  };
}

/** Group species by their category, preserving the configured
 * category order and within-category insertion order. */
export function groupSpeciesByCategory(
  species: SpeciesConfig[],
  categories: CategoryMeta[],
): Array<{ category: CategoryMeta; species: SpeciesConfig[] }> {
  const byId = new Map<string, SpeciesConfig[]>();
  for (const s of species) {
    const list = byId.get(s.category) || [];
    list.push(s);
    byId.set(s.category, list);
  }
  return categories
    .map(cat => ({ category: cat, species: byId.get(cat.id) || [] }))
    .filter(group => group.species.length > 0);
}
