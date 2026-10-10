// Numbers derived from a save: lord stats, squad stats, equipment bonuses, skills,
// and the setup object a battle starts from.

import {
  TROOPS, TROOP_KEYS, TROOP_UNLOCK, LORDS, SKILLS, SKILL_UNLOCK, EQUIPS, equipFx,
  lordBase, leadership, troopLevelMult, startFood, ITEM_KEYS, diffOf,
  GENERALS, GEN_SPECIALS, GENERAL_PICKS, GENERAL_HP, GENERAL_ATK, generalsOf,
} from './data.js';
import { stageLayout } from './maps.js';
import { buildWaves } from './waves.js';

export function equipTotals(save) {
  const tot = {};
  for (const slot of ['weapon', 'armor', 'treasure']) {
    const key = save.equipped[slot];
    const it = key && save.equips.find(e => e.key === key);
    if (!it) continue;
    for (const [k, v] of Object.entries(equipFx(key, it.up))) tot[k] = (tot[k] || 0) + v;
  }
  return tot;
}

export function lordStats(save) {
  const L = LORDS[save.lord];
  const b = lordBase(save.level, L.ranged);
  const fx = equipTotals(save);
  return {
    hp: Math.round((b.hp + (fx.hp || 0)) * (1 + (fx.lordHp || 0))),
    atk: Math.round((b.atk + (fx.atk || 0) * (L.ranged ? 0.75 : 1)) * (1 + (fx.lordAtk || 0))),
    cd: b.cd / (1 + (fx.attackSpeed || 0)),
    range: b.range,
    speed: Math.round(b.speed * (1 + (fx.lordSpeed || 0))),
    def: Math.min(0.5, fx.def || 0),
    ranged: L.ranged,
    block: b.block,
  };
}

export function troopStats(save, type) {
  const T = TROOPS[type];
  const tf = LORDS[save.lord].traitFx;
  const fx = equipTotals(save);
  const lv = save.troops[type] || 1;
  const m = troopLevelMult(lv);
  let hpM = 1 + (tf.troopHp || 0) + (fx.troopHp || 0);
  let atkM = 1 + (fx.troopAtk || 0);
  let rangeM = 1;
  if (!T.melee) {
    atkM += tf.rangedAtk || 0;
    rangeM += tf.rangedRange || 0;
  }
  if (type === 'strategist') atkM += fx.stratAtk || 0;
  return {
    hp: Math.round(T.hp * m * hpM),
    atk: T.atk * m * atkM,
    cd: T.cd,
    range: Math.round(T.range * rangeM),
    block: T.block || 0,
    lv,
  };
}

export const lordLeadership = save => leadership(save.level);
export const rosterLead = roster => TROOP_KEYS.reduce((s, t) => s + (roster[t] || 0) * TROOPS[t].lead, 0);
export const troopUnlocked = (save, t) => save.progress >= TROOP_UNLOCK[t];
export const unlockedTroops = save => TROOP_KEYS.filter(t => troopUnlocked(save, t));

// The lord's three skills: { key, lv, cd, power } or null while still locked.
export function skillList(save) {
  const fx = equipTotals(save);
  return LORDS[save.lord].skills.map((key, i) => {
    const lv = save.skills[i] || 0;
    if (!lv || save.level < SKILL_UNLOCK[i]) return null;
    const def = SKILLS[key];
    return { key, lv, cd: def.cd * (1 - Math.min(0.5, fx.skillCd || 0)), power: def.power(lv) };
  });
}

// Keeps a roster legal: unlocked types only and within the lord's leadership.
export function fitRoster(save, roster) {
  const out = {};
  let room = lordLeadership(save);
  for (const t of TROOP_KEYS) {
    if (!troopUnlocked(save, t)) continue;
    const n = Math.max(0, Math.min(roster[t] | 0, Math.floor(room / TROOPS[t].lead)));
    if (n) out[t] = n;
    room -= n * TROOPS[t].lead;
  }
  return out;
}

export function battleSetup(save, stageIdx, stage, opts = {}) {
  const n = stageIdx + 1;
  const layout = stageLayout(n);
  const waves = buildWaves(stage, n, layout.paths.length);
  const fx = equipTotals(save);
  const tf = LORDS[save.lord].traitFx;
  const troops = {};
  for (const t of TROOP_KEYS) troops[t] = troopStats(save, t);
  const items = {};
  for (const k of ITEM_KEYS) items[k] = Math.min(save.items[k] || 0, save.carry[k] || 0);
  return {
    n,
    stage,
    stageIdx,
    seed: opts.seed || 'play',
    diff: diffOf(save),
    lordKey: save.lord,
    layout,
    waves,
    lord: lordStats(save),
    troops,
    roster: fitRoster(save, save.roster),
    items,
    skills: skillList(save),
    generals: pickedGenerals(save).map(k => generalStats(save, k)),
    startFood: startFood(n) + (fx.startFood || 0),
    mods: {
      food: (tf.food || 0) + (fx.food || 0),
      starCost: (tf.starCost || 0) + (fx.starCost || 0),
      skillDmg: fx.skillDmg || 0,
      regen: tf.regen || 1,
    },
  };
}

// ---- generals ---------------------------------------------------------------------

export const generalUnlocked = (save, key) => GENERALS[key].faction === LORDS[save.lord].faction && save.progress >= GENERALS[key].unlock;
export const unlockedGenerals = save => generalsOf(LORDS[save.lord].faction).filter(k => generalUnlocked(save, k));
export const pickedGenerals = save => (save.picks || []).filter(k => GENERALS[k] && generalUnlocked(save, k)).slice(0, GENERAL_PICKS);

// A general fights like a very strong squad of its troop type and grows with the lord's level.
export function generalStats(save, key) {
  const G = GENERALS[key];
  const base = troopStats({ ...save, troops: { ...save.troops, [G.type]: save.level } }, G.type);
  const sp = GEN_SPECIALS[G.kind];
  return {
    key,
    type: G.type,
    kind: G.kind,
    hp: Math.round(base.hp * GENERAL_HP),
    atk: base.atk * GENERAL_ATK,
    cd: base.cd,
    range: Math.round(base.range * 1.15),
    block: TROOPS[G.type].melee ? (G.kind === 'guard' ? sp.block : 3) : 0,
    dr: G.kind === 'guard' ? sp.dr : 0,
  };
}
