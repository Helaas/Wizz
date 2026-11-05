// Everything lives in localStorage on this device. Storage can be unavailable
// (private mode, blocked site data), so every access is guarded.

const KEY = 'wizz:v1';
const MAX_HISTORY = 200;

const defaults = () => ({
  current: null,
  history: [],
  settings: { lang: null, theme: 'auto', keepAwake: true, lastRules: null },
});

export function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return {
      current: parsed.current && Array.isArray(parsed.current.players) ? parsed.current : null,
      history: Array.isArray(parsed.history) ? parsed.history.filter((g) => g && Array.isArray(g.players)) : [],
      settings: { ...base.settings, ...(parsed.settings || {}) },
    };
  } catch {
    return base;
  }
}

export function save(data) {
  try {
    if (data.history.length > MAX_HISTORY) data.history.length = MAX_HISTORY;
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
