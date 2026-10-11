// A simple commander: picks a roster that counters the scouting report, and can play a
// battle (deploy, promote, skills, items). Used by the "추천 편성" button, the automated
// tests and the balance tool.

import { TROOPS, TROOP_KEYS, SKILLS, counterMult, FOES, GENERALS, GENERAL_PICKS, GROUND, HORDE, GATE_HP } from './data.js';
import { lordLeadership, troopUnlocked, unlockedGenerals } from './army.js';
import { stageSummary, waveSummary, rng } from './waves.js';
import { pathAt, nearestOnPath, nearestOnPaths } from './maps.js';
import { sizeOf, footCells, footCenter } from './field.js';

// How useful a troop type is against a mix of enemies (1 = even, higher = better).
function typeScore(t, counts) {
  let s = 0, n = 0;
  for (const [e, c] of Object.entries(counts)) {
    const w = c * (e === 'catapult' ? 2 : e === 'cavalry' ? 1.3 : 1);
    // dealing damage matters most; taking less from them helps too
    s += w * (counterMult(t, e) * 0.75 + (1 / counterMult(e, t)) * 0.25);
    n += w;
  }
  return n ? s / n : 1;
}

export function recommendRoster(save, waves) {
  const counts = stageSummary(waves);
  const types = TROOP_KEYS.filter(t => troopUnlocked(save, t));
  const room0 = lordLeadership(save);
  let room = room0;
  const roster = {};
  const score = t => typeScore(t, counts) * (TROOPS[t].melee ? 1 : 1.05) / Math.sqrt(TROOPS[t].lead / 2) * 0.88 ** (roster[t] || 0);
  const add = t => { roster[t] = (roster[t] || 0) + 1; room -= TROOPS[t].lead; };
  // a couple of squads that can block the road come first
  const melee = types.filter(t => TROOPS[t].melee).sort((a, b) => score(b) - score(a));
  const meleeWanted = Math.max(2, Math.round(room0 / 2 / 2 * 0.4));
  for (let i = 0; i < meleeWanted && melee.length; i++) {
    const t = melee.slice().sort((a, b) => score(b) - score(a))[0];
    if (TROOPS[t].lead > room) break;
    add(t);
  }
  for (;;) {
    const fits = types.filter(t => TROOPS[t].lead <= room);
    if (!fits.length) break;
    fits.sort((a, b) => score(b) - score(a));
    add(fits[0]);
  }
  return roster;
}

// The generals that best counter this stage's army.
export function recommendGenerals(save, waves) {
  const counts = stageSummary(waves);
  const score = k => typeScore(GENERALS[k].type, counts) + (GENERALS[k].kind === 'food' ? -0.15 : 0) + GENERALS[k].unlock * 0.01;
  return unlockedGenerals(save).sort((a, b) => score(b) - score(a)).slice(0, GENERAL_PICKS);
}

// ---- battle autopilot -------------------------------------------------------------

export class Bot {
  // strategy: place like a player who plans (holds the road where roads join, uses choke and
  // hill cells and formations); false = a player without a plan, who puts each unit on any
  // free cell it can fight from.
  constructor(sim, { callEarly = false, useSkills = true, useItems = true, bossFocus = true, strategy = true } = {}) {
    this.bossFocus = bossFocus;
    this.strategy = strategy;
    this.rand = rng(`naive:${sim.setup.seed}:${sim.setup.stage.id}`);
    this.sim = sim;
    this.t = 0;
    this.callEarly = callEarly;
    this.useSkills = useSkills;
    this.useItems = useItems;
    this.posted = false;
    // how much road each spot sees, per range
    this.cover = new Map();
  }

  coverage(spot, range) {
    const k = `${Math.round(spot.x)},${Math.round(spot.y)}:${Math.round(range)}`;
    if (this.cover.has(k)) return this.cover.get(k);
    let c = 0;
    for (const p of this.sim.paths) {
      for (let d = 0; d < p.len; d += 15) {
        const q = pathAt(p, d);
        if (Math.hypot(q.x - spot.x, q.y - spot.y) < range) c += 1 + d / p.len; // later road counts more
      }
    }
    this.cover.set(k, c);
    return c;
  }

  threats() {
    const sim = this.sim;
    const counts = {};
    for (const f of sim.foes) counts[f.type] = (counts[f.type] || 0) + 1;
    const next = sim.nextWave();
    if (next) for (const [t, c] of Object.entries(waveSummary(next))) counts[t] = (counts[t] || 0) + c * 0.6;
    return counts;
  }

  pickType() {
    const sim = this.sim;
    const counts = this.threats();
    const avail = TROOP_KEYS.filter(t => sim.roster[t] > 0 && sim.food >= TROOPS[t].cost);
    if (!avail.length) return null;
    const meleeOut = sim.squads.filter(s => TROOPS[s.type].melee).length;
    const rangedOut = sim.squads.length - meleeOut;
    avail.sort((a, b) => {
      const need = t => (TROOPS[t].melee ? (meleeOut < 2 ? 0.6 : meleeOut > rangedOut ? -0.2 : 0) : (rangedOut < meleeOut ? 0.15 : 0));
      return typeScore(b, counts) + need(b) - (typeScore(a, counts) + need(a));
    });
    return avail[0];
  }

  // Every footprint of this size that fits on the build cells (worked out once), minus the
  // ones taken right now: { c, r, size, keys, x, y, ground, road, frac }.
  freeSpots(type) {
    const sim = this.sim;
    const size = sizeOf(type);
    this.anchors = this.anchors || {};
    if (!this.anchors[size]) {
      const list = [];
      for (const cell of sim.field.list) {
        const keys = footCells(cell.c, cell.r, size);
        if (keys.some(k => !sim.field.cells.has(k))) continue;
        const p = footCenter(cell.c, cell.r, size);
        const near = nearestOnPaths(sim.paths, p.x, p.y);
        list.push({
          c: cell.c, r: cell.r, size, keys, x: p.x, y: p.y, ground: sim.groundOf(keys), road: near.dist, frac: near.d / sim.paths[near.path].len,
          roads: sim.paths.map(pp => nearestOnPath(pp, p.x, p.y).dist), // how far each road is
        });
      }
      this.anchors[size] = list;
    }
    return this.anchors[size].filter(a => a.keys.every(k => !sim.occ.has(k)));
  }

  // Melee units go where their guard circle covers the later road (a choke is best, and where
  // roads join one squad holds them all), ranged units where they see the most road (hills
  // stretch that); formations are a bonus.
  pickPos(type, range) {
    const sim = this.sim;
    const melee = TROOPS[type].melee;
    if (!this.strategy) {
      const ok = this.freeSpots(type).filter(a => a.road <= range * (melee ? 0.75 : 0.8));
      return ok.length ? ok[Math.floor(this.rand() * ok.length)] : null;
    }
    let best = null, bs = -Infinity;
    for (const a of this.freeSpots(type)) {
      const G = GROUND[a.ground];
      let score;
      if (melee) {
        if (a.road > range * 0.75) continue; // must reach the road from its post
        const roads = a.roads.filter(d => d <= range * 0.75).length;
        score = 1 - Math.abs(a.frac - 0.62) + this.coverage(a, range) * 0.002 + (a.ground === 'choke' ? 0.3 : 0) + 0.4 * (roads - 1);
      } else {
        score = this.coverage(a, range * (1 + (G.range || 0))) * (1 + (G.atk || 0) + (a.ground === 'forest' ? 0.08 : 0));
      }
      score *= 1 + 0.06 * sim.previewFormations(type, a).length;
      if (score > bs) { bs = score; best = a; }
    }
    return best;
  }

  decide() {
    const sim = this.sim;
    // generals first: they are free
    for (const g of sim.generals) {
      if (g.state !== 'hand' || g.waitT > 0) continue;
      const pos = this.pickPos(g.type, g.range);
      if (pos) sim.deployGeneral(g.key, pos.x, pos.y);
    }
    // deploy while there is food and room
    for (let k = 0; k < 4; k++) {
      const t = this.pickType();
      if (!t) break;
      const pos = this.pickPos(t, sim.setup.troops[t].range);
      if (!pos) break;
      if (!sim.deploy(t, pos.x, pos.y).ok) break;
    }
    // promote the most useful squad we can afford
    const free = TROOP_KEYS.some(t => sim.roster[t] > 0);
    const reserve = free ? 90 : 0;
    const cands = sim.squads.filter(q => q.star < 3).map(q => ({ q, cost: sim.starCost(q) }))
      .filter(c => c.cost !== null && sim.food - reserve >= c.cost)
      .sort((a, b) => (TROOPS[b.q.type].melee ? 0 : 1) - (TROOPS[a.q.type].melee ? 0 : 1) || a.q.star - b.q.star);
    if (cands.length) sim.promote(cands[0].q.id);

    if (this.useSkills) this.skills();
    if (this.useItems) this.items();

    if (sim.state === 'ready') sim.start();
    else if (this.callEarly && sim.nextT !== null && sim.foes.length < 3) sim.callWave();
  }

  cluster(r) {
    let best = null, bn = 0;
    for (const f of this.sim.foes) {
      let n = 0;
      for (const g of this.sim.foes) if (Math.hypot(f.x - g.x, f.y - g.y) < r) n += g.boss ? 4 : 1;
      if (n > bn) { bn = n; best = f; }
    }
    return { at: best, n: bn };
  }

  // The lord's orders come back slowly (3 minutes, about four waves), so the bot keeps them for
  // the enemy general's wave unless one used now would be back in time, or the gate is in danger.
  skills() {
    const sim = this.sim;
    const boss = this.bossFocus ? sim.boss() : null;
    const bossNear = boss && boss.state !== 'flee' && boss.d > sim.paths[boss.path].len * 0.35;
    const fighting = sim.foes.filter(f => f.state !== 'flee').length / HORDE;
    const spare = sim.totalWaves - 1 - sim.waveIdx >= 4; // it comes back before the last wave
    const danger = sim.gate <= GATE_HP * 0.6 || sim.foes.filter(f => f.state === 'walk' && f.d > sim.paths[f.path].len * 0.85).length >= 5 * HORDE;
    const busy = bossNear || danger || (spare && fighting >= 10 + sim.n * 0.4);
    sim.skills.forEach((s, i) => {
      if (!s || s.cdT > 0) return;
      const def = SKILLS[s.key];
      switch (s.key) {
        case 'lb_heal': {
          const hurt = sim.squads.filter(q => q.hp < q.maxHp * 0.5).length;
          if ((hurt >= 3 && (spare || danger)) || (bossNear && hurt >= 1)) sim.castSkill(i, 0, 0);
          return;
        }
        case 'lb_oath': {
          const down = sim.generals.some(g => g.state === 'hand' && g.waitT > 6);
          const near = boss && sim.squads.some(q => q.gen && Math.hypot(q.x - boss.x, q.y - boss.y) < 300);
          if ((down && (spare || bossNear)) || near) sim.castSkill(i, 0, 0);
          return;
        }
        case 'cc_supply': {
          const want = TROOP_KEYS.some(t => sim.roster[t] > 0) || sim.squads.some(q => sim.starCost(q) !== null);
          if (sim.waveIdx >= 0 && want && sim.food < 80) sim.castSkill(i, 0, 0);
          return;
        }
        default:
          break;
      }
      if (def.target === 'self') {
        if (busy) sim.castSkill(i, 0, 0);
        return;
      }
      if (bossNear) {
        if (def.target === 'path') { const q = pathAt(sim.paths[boss.path], boss.d + 40); sim.castSkill(i, q.x, q.y); }
        else sim.castSkill(i, boss.x, boss.y);
        return;
      }
      if (!spare && !danger) return;
      if (def.target === 'path') {
        const close = sim.foes.filter(f => f.state === 'walk' && f.d > sim.paths[f.path].len * 0.75);
        if (close.length >= 4 * HORDE) { const f = close[0]; const q = pathAt(sim.paths[f.path], f.d + 50); sim.castSkill(i, q.x, q.y); }
        return;
      }
      const c = this.cluster(def.radius || 80);
      if (c.at && c.n >= 8 * HORDE) sim.castSkill(i, c.at.x, c.at.y);
    });
  }

  items() {
    const sim = this.sim;
    const boss = this.bossFocus ? sim.boss() : null;
    if (boss) {
      const p = sim.paths[boss.path];
      const k = boss.d / p.len;
      if (sim.items.bomb > 0 && k > 0.5) sim.useItem('bomb', boss.x, boss.y);
      if (sim.items.wall > 0 && k > 0.6 && !sim.walls.length) { const q = pathAt(p, Math.min(p.len - 40, boss.d + 60)); sim.useItem('wall', q.x, q.y); }
    }
    if (sim.items.bomb > 0) {
      const c = this.cluster(100);
      if (c.at && c.n >= 7 * HORDE) sim.useItem('bomb', c.at.x, c.at.y);
    }
    if (sim.items.potion > 0) {
      const hurt = sim.squads.filter(q => q.hp < q.maxHp * 0.4);
      if (hurt.length >= 2) sim.useItem('potion', hurt[0].x, hurt[0].y);
    }
    if (sim.items.wall > 0) {
      const p = sim.paths[0];
      const close = sim.foes.filter(f => f.d > this.sim.paths[f.path].len * 0.8 && f.state === 'walk');
      if (close.length >= 3 * HORDE) {
        const q = pathAt(p, p.len * 0.88);
        sim.useItem('wall', q.x, q.y);
      }
    }
  }

  update(dt) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.5;
      this.decide();
    }
  }
}

// Runs a whole battle as fast as possible; returns the sim at the end.
export function autoplay(sim, opts = {}) {
  const bot = new Bot(sim, opts);
  const dt = 1 / 30;
  let guard = 0;
  while (sim.state !== 'won' && sim.state !== 'lost' && guard < 30 * 60 * 20) {
    bot.update(dt);
    sim.update(dt);
    sim.events.length = 0;
    guard++;
  }
  return sim;
}

export { FOES };

// ---- a typical save for stage n (1..20), for tests and balance measurements -----------

import { defaultSave } from './save.js';
import { stageGold, troopUpCost, TROOP_UNLOCK, MAX_TROOP_LEVEL, EQUIPS, DIFFS } from './data.js';
import { autoTalents } from './talents.js';
import { STORIES } from './stories.js';

// A player who cleared stages 1..n-1 once with about 2.5 stars, kept a few items and spent
// the rest of the gold evenly on the troop types they have.
export function expectedSave(lord, n, diff = 1, { levelBonus = 0, troopBonus = 0, talents = 'plan' } = {}) {
  const s = defaultSave(lord);
  s.diff = diff;
  s.level = Math.max(1, n + levelBonus);
  s.progress = n - 1;
  s.talents = {};
  if (talents !== 'none') autoTalents(s, talents === 'plan' ? undefined : talents);
  let gold = 150;
  for (let k = 1; k < n; k++) gold += stageGold(k) * DIFFS[diff].gold * 1.62;
  gold -= (n - 1) * 110; // items
  gold *= 0.88; // a bit goes to equipment
  const types = Object.keys(TROOP_UNLOCK).filter(t => TROOP_UNLOCK[t] <= s.progress);
  for (;;) {
    types.sort((a, b) => s.troops[a] - s.troops[b]);
    const t = types[0];
    if (s.troops[t] >= MAX_TROOP_LEVEL) break;
    const c = troopUpCost(s.troops[t]);
    if (c > gold) break;
    gold -= c;
    s.troops[t]++;
  }
  for (const t of types) s.troops[t] = Math.min(MAX_TROOP_LEVEL, s.troops[t] + troopBonus);
  const stages = STORIES[lord].stages;
  for (let k = 0; k < n - 1; k++) {
    const key = stages[k].reward;
    if (key && !s.equips.some(e => e.key === key)) s.equips.push({ key, up: 0 });
  }
  for (const e of s.equips) e.up = Math.min(5, Math.floor(n / 3));
  for (const slot of ['weapon', 'armor', 'treasure']) {
    const best = s.equips.filter(e => EQUIPS[e.key].slot === slot).sort((a, b) => EQUIPS[b.key].g - EQUIPS[a.key].g)[0];
    s.equipped[slot] = best ? best.key : null;
  }
  s.items = { potion: 2, bomb: 2, wall: 1 };
  s.carry = { potion: 2, bomb: 2, wall: 1 };
  s.stages.forEach((st, i) => { if (i < n - 1) { st.clears = 1; st.stars = 2; } });
  s.gold = Math.max(0, Math.round(gold));
  return s;
}
