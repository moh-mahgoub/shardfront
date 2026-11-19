// Persistent settings (localStorage, always guarded: private mode / file:// may throw).
const SETTINGS_KEY = 'shardfront.settings.v1';
const SETTINGS_DEFAULTS = { volume: 0.6, uiScale: 1, debug: false, difficulty: 'normal', faction: 'compact' };

export function loadSettings() {
  const s = Object.assign({}, SETTINGS_DEFAULTS);
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      for (const k in SETTINGS_DEFAULTS) if (typeof o[k] === typeof SETTINGS_DEFAULTS[k]) s[k] = o[k];
    }
  } catch (e) { /* storage unavailable: run with defaults */ }
  s.volume = Math.min(1, Math.max(0, s.volume));
  s.uiScale = Math.min(1.4, Math.max(0.8, s.uiScale));
  return s;
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
