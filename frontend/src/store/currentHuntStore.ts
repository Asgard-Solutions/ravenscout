// Raven Scout — In-memory current hunt store.
//
// A module-level singleton that keeps the most recently analyzed hunt
// available across route transitions within the same JS runtime.
// This is the first-tier fallback when AsyncStorage / localStorage
// persistence fails (common on web previews that hit the ~5 MB
// localStorage quota with multi-image Pro hunts).
//
// This store is intentionally NOT reactive — it is only read once on
// mount in the `results` screen; if you need pub/sub behavior later,
// promote it to zustand or context.

export interface CurrentHuntEntry<T = unknown> {
  id: string;
  record: T;
  /** When true, persistence to AsyncStorage failed — surface a warning */
  persistFailed: boolean;
  /** Optional diagnostic string (error message summary) */
  persistError?: string | null;
}

let currentHunt: CurrentHuntEntry | null = null;

export function setCurrentHunt<T>(
  id: string,
  record: T,
  opts: { persistFailed?: boolean; persistError?: string | null } = {},
): void {
  currentHunt = {
    id,
    record,
    persistFailed: !!opts.persistFailed,
    persistError: opts.persistError ?? null,
  };
}

export function getCurrentHuntEntry(id: string): CurrentHuntEntry | null {
  if (!currentHunt) return null;
  return currentHunt.id === id ? currentHunt : null;
}

export function getCurrentHunt<T = unknown>(id: string): T | null {
  const entry = getCurrentHuntEntry(id);
  return entry ? (entry.record as T) : null;
}

export function clearCurrentHunt(): void {
  currentHunt = null;
}

export function hasCurrentHunt(id: string): boolean {
  return !!currentHunt && currentHunt.id === id;
}
