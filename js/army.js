// Numbers derived from a save: squad stats, equipment and talent bonuses, the lord's skills,
// and the setup object a battle starts from.

import {
  TROOPS, TROOP_KEYS, TROOP_UNLOCK, LORDS, SKILLS, equipFx, cmdPower,
  leadership, troopLevelMult, startFood, ITEM_KEYS, diffOf,
  GENERALS, GEN_SPECIALS, GENERAL_PICKS, GENERAL_HP, GENERAL_ATK, generalsOf, weatherKey, stageChallenge,
} from './data.js';
import { stageLayout } from './maps.js';
import { stageField } from './field.js';
import { talentFx, skillLevel } from './talents.js';
import { buildWaves } from './waves.js';

// Equipment and talents add up into one set of bonuses.
export function equipTotals(save) {
  const tot = talentFx(save);
  for (const slot of ['weapon', 'armor', 'treasure']) {
    const key = save.equipped[slot];
    const it = key && save.equips.find(e => e.key === key);
    if (!it) continue;
    for (const [k, v] of Object.entries(equipFx(key, it.up))) tot[k] = (tot[k] || 0) + v;
  }
  return tot;
}


export function troopStats(save, type) {
  const T = TROOPS[type];
  const tf = LORDS[save.lord].traitFx;
  const fx = equipTotals(save);
  const lv = save.troops[type] || 1;
  const m = troopLevelMult(lv);
  let hpM = 1 + (tf.troopHp || 0) + (fx.troopHp || 0) + (fx[`hp_${type}`] || 0);
  let atkM = 1 + (fx.troopAtk || 0) + (fx[`atk_${type}`] || 0);
  let rangeM = 1 + (fx[`range_${type}`] || 0);
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

export const lordLeadership = save => leadership(save.level) + (equipTotals(save).lead || 0);
export const rosterLead = roster => TROOP_KEYS.reduce((s, t) => s + (roster[t] || 0) * TROOPS[t].lead, 0);
export const troopUnlocked = (save, t) => save.progress >= TROOP_UNLOCK[t];
export const unlockedTroops = save => TROOP_KEYS.filter(t => troopUnlocked(save, t));

// The lord's three skills: { key, lv, cd, power } or null while still locked.
export function skillList(save) {
  const fx = equipTotals(save);
  return LORDS[save.lord].skills.map((key, i) => {
    const lv = skillLevel(save, i);
    if (!lv) return null;
    const def = SKILLS[key];
    return { key, lv, cd: def.cd * (1 - Math.min(0.5, fx.skillCd || 0)), power: def.power(lv) * (1 + (fx.skillDmg || 0)) };
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
    level: save.level,
    weather: weatherKey(stage),
    challenge: stageChallenge(stage, n),
    diff: diffOf(save),
    lordKey: save.lord,
    layout,
    field: stageField(stage, layout),
    waves,
    power: cmdPower(save.level), // damage base for the lord's orders
    troops,
    roster: fitRoster(save, save.roster),
    items,
    skills: skillList(save),
    generals: pickedGenerals(save).map(k => generalStats(save, k)),
    startFood: startFood(n) + (fx.startFood || 0),
    mods: {
      food: (tf.food || 0) + (fx.food || 0),
      starCost: (tf.starCost || 0) + (fx.starCost || 0),
      skillDur: fx.skillDur || 0,
      regen: tf.regen || 1,
      counter: fx.counter || 0,
      genSpec: Math.min(0.5, fx.genSpec || 0),
      genRecover: fx.genRecover || 0,
      troopDef: Math.min(0.5, fx.troopDef || 0),
      aura: fx.aura || 0,
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
    hp: Math.round(base.hp * GENERAL_HP * (1 + (equipTotals(save).genPower || 0))),
    atk: base.atk * GENERAL_ATK * (1 + (equipTotals(save).genPower || 0)),
    cd: base.cd,
    range: Math.round(base.range * 1.15),
    block: TROOPS[G.type].melee ? (G.kind === 'guard' ? sp.block : 3) : 0,
    dr: G.kind === 'guard' ? sp.dr : 0,
  };
}
