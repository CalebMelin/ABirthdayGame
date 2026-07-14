// Typed wrapper over localStorage for all persistent game state.
// See CLAUDE.md / NORTH_STAR.md: progress lives in localStorage ONLY
// (key prefix "gabby22."), there is no backend, and save failures must
// be invisible to the player — every method here is total and never throws.

import { TOTAL_LEVELS } from './constants';

/** Structural subset of DOM `Storage` — lets tests inject a fake/throwing
 * implementation without jsdom, and lets production code use the real
 * `window.localStorage`. */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Character customization choices. Values are string swatch ids; the
 * actual swatch sets are defined in PLAN-04. */
export interface CharacterConfig {
  hairColor: string;
  eyeColor: string;
  bikeColor: string;
  outfit: string;
}

/** Level unlock/completion state. `completed` always has exactly
 * TOTAL_LEVELS entries. */
export interface LevelProgress {
  highestUnlocked: number;
  completed: boolean[];
}

/** Typed save API. Every method is total: bad input is ignored/normalized
 * rather than throwing, and storage failures degrade silently. */
export interface SaveSystem {
  loadCharacter(): CharacterConfig | null;
  saveCharacter(character: CharacterConfig): void;
  loadProgress(): LevelProgress;
  markLevelCompleted(level: number): void;
  getTulips(): number;
  addTulips(count: number): void;
  getNotesSeen(): number[];
  markNoteSeen(index: number): void;
  resetAll(): void;
}

/** Current save schema version. Bump this and extend `migrate()` whenever
 * a later plan changes the shape of any stored key. */
export const SAVE_VERSION = 1;

const KEY_CHARACTER = 'gabby22.character';
const KEY_PROGRESS = 'gabby22.progress';
const KEY_TULIPS = 'gabby22.tulips';
const KEY_NOTES_SEEN = 'gabby22.notesSeen';
const KEY_SAVE_VERSION = 'gabby22.saveVersion';

const ALL_KEYS = [KEY_CHARACTER, KEY_PROGRESS, KEY_TULIPS, KEY_NOTES_SEEN, KEY_SAVE_VERSION];

// ---------------------------------------------------------------------------
// Storage plumbing: in-memory fallback + resilient wrapper + default probe.
// ---------------------------------------------------------------------------

/** A trivial Map-backed KVStorage, used both as the SSR/unavailable-storage
 * fallback and as the safety net inside `makeResilient`. */
function createInMemoryStorage(): KVStorage {
  const map = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
  };
}

/** Write-read-remove roundtrip used to detect storage that is present but
 * unusable (e.g. Safari private browsing, where localStorage exists but
 * every call throws). */
function probeWritable(storage: KVStorage): boolean {
  const PROBE_KEY = 'gabby22.__probe';
  try {
    storage.setItem(PROBE_KEY, '1');
    const ok = storage.getItem(PROBE_KEY) === '1';
    storage.removeItem(PROBE_KEY);
    return ok;
  } catch {
    return false;
  }
}

/** Resolves the default backing storage when the caller doesn't inject one:
 * `window.localStorage` if present and writable, else an in-memory store.
 * Guards `typeof window` so this is safe to import under Vite/SSR. */
function resolveDefaultStorage(): KVStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage && probeWritable(window.localStorage)) {
      return window.localStorage;
    }
  } catch {
    // Touching window.localStorage itself threw — fall through to memory.
  }
  return createInMemoryStorage();
}

/** Wraps any KVStorage so it can never throw. Successful reads/writes are
 * mirrored into an in-memory map; the first failure (e.g. quota exceeded
 * mid-session) permanently swaps all subsequent calls to that mirror, which
 * already carries every value this wrapper has seen. */
function makeResilient(storage: KVStorage): KVStorage {
  const fallback = createInMemoryStorage();
  let degraded = false;

  return {
    getItem(key: string): string | null {
      if (degraded) return fallback.getItem(key);
      try {
        const value = storage.getItem(key);
        if (value === null) {
          fallback.removeItem(key);
        } else {
          fallback.setItem(key, value);
        }
        return value;
      } catch {
        degraded = true;
        return fallback.getItem(key);
      }
    },
    setItem(key: string, value: string): void {
      if (degraded) {
        fallback.setItem(key, value);
        return;
      }
      try {
        storage.setItem(key, value);
        fallback.setItem(key, value);
      } catch {
        degraded = true;
        fallback.setItem(key, value);
      }
    },
    removeItem(key: string): void {
      if (degraded) {
        fallback.removeItem(key);
        return;
      }
      try {
        storage.removeItem(key);
        fallback.removeItem(key);
      } catch {
        degraded = true;
        fallback.removeItem(key);
      }
    },
  };
}

function readRaw(storage: KVStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(storage: KVStorage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // makeResilient already prevents this; defense in depth only.
  }
}

function removeRaw(storage: KVStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // makeResilient already prevents this; defense in depth only.
  }
}

// ---------------------------------------------------------------------------
// JSON parsing + shape validation. Corrupt/legacy data always resolves to a
// safe default instead of throwing.
// ---------------------------------------------------------------------------

function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCharacterConfig(value: unknown): value is CharacterConfig {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.hairColor === 'string' &&
    typeof value.eyeColor === 'string' &&
    typeof value.bikeColor === 'string' &&
    typeof value.outfit === 'string'
  );
}

function defaultProgress(): LevelProgress {
  return { highestUnlocked: 1, completed: Array<boolean>(TOTAL_LEVELS).fill(false) };
}

function normalizeProgress(value: unknown): LevelProgress {
  if (!isPlainObject(value)) return defaultProgress();

  const completed = Array<boolean>(TOTAL_LEVELS).fill(false);
  if (Array.isArray(value.completed)) {
    for (let i = 0; i < TOTAL_LEVELS; i++) {
      completed[i] = value.completed[i] === true;
    }
  }

  let highestUnlocked =
    typeof value.highestUnlocked === 'number' && Number.isFinite(value.highestUnlocked)
      ? Math.trunc(value.highestUnlocked)
      : 1;
  if (highestUnlocked < 1) highestUnlocked = 1;
  if (highestUnlocked > TOTAL_LEVELS) highestUnlocked = TOTAL_LEVELS;

  return { highestUnlocked, completed };
}

function normalizeTulips(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  return 0;
}

function normalizeNotesSeen(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const result: number[] = [];
  for (const entry of value) {
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      result.push(Math.trunc(entry));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Versioning / migration scaffold.
// ---------------------------------------------------------------------------

/** Migration scaffold. There is only ever been version 1 so far, so there
 * is nothing to transform yet. When a future plan changes a stored shape:
 * bump SAVE_VERSION, then add a case here, e.g.:
 *   switch (fromVersion) {
 *     case 1:
 *       // upgrade v1 -> v2 shape for some key
 *       break;
 *   }
 */
function migrate(_store: KVStorage, _fromVersion: number): void {
  // No-op today; real migrations land in later plans.
}

function ensureVersion(store: KVStorage): void {
  const raw = readRaw(store, KEY_SAVE_VERSION);
  if (raw === null) {
    writeRaw(store, KEY_SAVE_VERSION, String(SAVE_VERSION));
    return;
  }
  const parsed = Number(raw);
  const fromVersion = Number.isFinite(parsed) ? parsed : 0;
  if (fromVersion < SAVE_VERSION) {
    migrate(store, fromVersion);
    writeRaw(store, KEY_SAVE_VERSION, String(SAVE_VERSION));
  }
  // fromVersion >= SAVE_VERSION: leave data alone.
}

// ---------------------------------------------------------------------------
// Factory.
// ---------------------------------------------------------------------------

/** Creates a SaveSystem. Pass a KVStorage (e.g. a fake) for tests; omit it
 * in production to use `window.localStorage` with an automatic in-memory
 * fallback when storage is unavailable or fails. */
export function createSaveSystem(storage?: KVStorage): SaveSystem {
  const store = makeResilient(storage ?? resolveDefaultStorage());

  ensureVersion(store);

  function loadCharacter(): CharacterConfig | null {
    const parsed = parseJson(readRaw(store, KEY_CHARACTER));
    return isCharacterConfig(parsed) ? parsed : null;
  }

  function saveCharacter(character: CharacterConfig): void {
    writeRaw(store, KEY_CHARACTER, JSON.stringify(character));
  }

  function loadProgress(): LevelProgress {
    return normalizeProgress(parseJson(readRaw(store, KEY_PROGRESS)));
  }

  function saveProgress(progress: LevelProgress): void {
    writeRaw(store, KEY_PROGRESS, JSON.stringify(progress));
  }

  function markLevelCompleted(level: number): void {
    if (!Number.isInteger(level) || level < 1 || level > TOTAL_LEVELS) return;
    const progress = loadProgress();
    progress.completed[level - 1] = true;
    const unlocked = Math.min(level + 1, TOTAL_LEVELS);
    if (unlocked > progress.highestUnlocked) {
      progress.highestUnlocked = unlocked;
    }
    saveProgress(progress);
  }

  function getTulips(): number {
    return normalizeTulips(parseJson(readRaw(store, KEY_TULIPS)));
  }

  function addTulips(count: number): void {
    if (!Number.isFinite(count) || count <= 0) return;
    writeRaw(store, KEY_TULIPS, JSON.stringify(getTulips() + Math.trunc(count)));
  }

  function getNotesSeen(): number[] {
    return normalizeNotesSeen(parseJson(readRaw(store, KEY_NOTES_SEEN)));
  }

  function markNoteSeen(index: number): void {
    if (!Number.isInteger(index)) return;
    const notes = getNotesSeen();
    if (!notes.includes(index)) {
      notes.push(index);
      writeRaw(store, KEY_NOTES_SEEN, JSON.stringify(notes));
    }
  }

  function resetAll(): void {
    for (const key of ALL_KEYS) {
      removeRaw(store, key);
    }
  }

  return {
    loadCharacter,
    saveCharacter,
    loadProgress,
    markLevelCompleted,
    getTulips,
    addTulips,
    getNotesSeen,
    markNoteSeen,
    resetAll,
  };
}

let singleton: SaveSystem | undefined;

/** Lazily-created shared SaveSystem for scenes. Does not touch
 * localStorage at module import time (Vite/SSR-safety + testability) —
 * the real storage probe only runs on first call. */
export function getSave(): SaveSystem {
  if (!singleton) {
    singleton = createSaveSystem();
  }
  return singleton;
}
