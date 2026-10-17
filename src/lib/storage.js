export const STORAGE_KEY = 'rail-dispatch-simulator-v1';
export function saveState(state, storage = globalThis.localStorage) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
export function loadState(storage = globalThis.localStorage) {
  try { const raw = storage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function clearState(storage = globalThis.localStorage) { try { storage.removeItem(STORAGE_KEY); } catch {} }
