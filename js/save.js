// Save data lives in this device's localStorage: three fixed save slots plus
// device-wide preferences (sound, last used slot).

import { TROOP_KEYS, ITEM_KEYS, STAGE_COUNT, LORDS, EQUIPS, MAX_ENHANCE, MAX_TROOP_LEVEL, MAX_SKILL_LEVEL, MAX_LORD_LEVEL, GENERALS, GENERAL_PICKS, generalsOf } from './data.js';

export const SLOT_COUNT = 3;
export const SAVE_VERSION = 1;
let prefix = 'samgukTD.';
const slotKey = n => `${prefix}slot.${n}`;
const prefsKey = () => `${prefix}prefs`;

// Tests use separate keys so they never touch real saves.
export function useTestStorage() { prefix = 'samgukTD.test.'; }

export function defaultSave(lord = null) {
  return {
    v: SAVE_VERSION,
    lord, // 'liubei' | 'caocao' | 'sunquan'; null until chosen
    diff: 1, // index into DIFFS: 0 쉬움, 1 보통, 2 어려움, 3 지옥
    level: 1,
    exp: 0,
    gold: 150,
    sp: 0, // unspent skill points
    skills: [1, 0, 0],
    troops: Object.fromEntries(TROOP_KEYS.map(t => [t, 1])),
    equips: [{ key: 'w_iron', up: 0 }, { key: 'a_leather', up: 0 }],
    equipped: { weapon: 'w_iron', armor: 'a_leather', treasure: null },
    newEquips: [], // keys not looked at yet (badge in the base)
    items: { potion: 2, bomb: 1, wall: 1 },
    carry: { potion: 2, bomb: 1, wall: 1 },
    roster: { infantry: 3, archer: 2 },
    picks: lord ? generalsOf(LORDS[lord].faction).filter(k => GENERALS[k].unlock === 0).slice(0, GENERAL_PICKS) : [], // generals to bring
    stages: Array.from({ length: STAGE_COUNT }, () => ({ stars: 0, clears: 0 })),
    progress: 0, // stages cleared at least once, in order
    seen: { prologue: false, ending: false, tutorial: false, counters: false },
    kills: 0,
    playSec: 0,
    updatedAt: 0,
  };
}

const int = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d);

// Drops anything broken so a damaged save can still be played.
export function sanitize(raw) {
  const d = defaultSave(raw && LORDS[raw.lord] ? raw.lord : null);
  if (!raw || typeof raw !== 'object') return d;
  const s = { ...d, ...raw };
  s.diff = int(s.diff, 0, 3, 1);
  s.level = int(s.level, 1, MAX_LORD_LEVEL, 1);
  s.exp = int(s.exp, 0, 1e9, 0);
  s.gold = int(s.gold, 0, 1e9, 0);
  s.sp = int(s.sp, 0, 999, 0);
  s.skills = [0, 1, 2].map(i => int(Array.isArray(raw.skills) ? raw.skills[i] : 0, 0, MAX_SKILL_LEVEL, i === 0 ? 1 : 0));
  if (!s.skills[0]) s.skills[0] = 1;
  s.troops = Object.fromEntries(TROOP_KEYS.map(t => [t, int(raw.troops?.[t], 1, MAX_TROOP_LEVEL, 1)]));
  const seenKeys = new Set();
  s.equips = (Array.isArray(raw.equips) ? raw.equips : d.equips)
    .filter(e => e && EQUIPS[e.key] && !seenKeys.has(e.key) && seenKeys.add(e.key))
    .map(e => ({ key: e.key, up: int(e.up, 0, MAX_ENHANCE, 0) }));
  const eq = { weapon: null, armor: null, treasure: null, ...(raw.equipped || {}) };
  for (const slot of Object.keys(eq)) {
    if (!['weapon', 'armor', 'treasure'].includes(slot)) { delete eq[slot]; continue; }
    if (eq[slot] && (!seenKeys.has(eq[slot]) || EQUIPS[eq[slot]].slot !== slot)) eq[slot] = null;
  }
  s.equipped = eq;
  s.newEquips = Array.isArray(raw.newEquips) ? raw.newEquips.filter(k => seenKeys.has(k)) : [];
  s.items = Object.fromEntries(ITEM_KEYS.map(k => [k, int(raw.items?.[k], 0, 99, 0)]));
  s.carry = Object.fromEntries(ITEM_KEYS.map(k => [k, int(raw.carry?.[k], 0, 3, 0)]));
  s.roster = Object.fromEntries(TROOP_KEYS.map(t => [t, int(raw.roster?.[t], 0, 30, 0)]).filter(([, n]) => n > 0));
  const fac = LORDS[s.lord]?.faction;
  s.picks = (Array.isArray(raw.picks) ? raw.picks : d.picks).filter((k, i, a) => GENERALS[k] && GENERALS[k].faction === fac && a.indexOf(k) === i).slice(0, GENERAL_PICKS);
  s.stages = Array.from({ length: STAGE_COUNT }, (_, i) => {
    const st = Array.isArray(raw.stages) ? raw.stages[i] : null;
    return { stars: int(st?.stars, 0, 3, 0), clears: int(st?.clears, 0, 1e6, 0) };
  });
  s.progress = int(s.progress, 0, STAGE_COUNT, 0);
  s.seen = { ...d.seen, ...(raw.seen || {}) };
  s.kills = int(s.kills, 0, 1e9, 0);
  s.playSec = int(s.playSec, 0, 1e9, 0);
  s.v = SAVE_VERSION;
  return s;
}

export function loadSlot(n) {
  try {
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return null;
    const s = sanitize(JSON.parse(raw));
    return s.lord ? s : null;
  } catch {
    return null;
  }
}

export function writeSlot(n, save) {
  try {
    save.updatedAt = Date.now();
    localStorage.setItem(slotKey(n), JSON.stringify(save));
  } catch { /* storage full or private mode: keep playing */ }
}

export function deleteSlot(n) {
  try { localStorage.removeItem(slotKey(n)); } catch { /* ignore */ }
}

export const listSlots = () => Array.from({ length: SLOT_COUNT }, (_, i) => loadSlot(i + 1));

export const defaultPrefs = () => ({ sound: true, music: true, lastSlot: 1, speed: 1, endingSeen: false });

export function loadPrefs() {
  try {
    return { ...defaultPrefs(), ...(JSON.parse(localStorage.getItem(prefsKey())) || {}) };
  } catch {
    return defaultPrefs();
  }
}

export function writePrefs(p) {
  try { localStorage.setItem(prefsKey(), JSON.stringify(p)); } catch { /* ignore */ }
}
