// Battle rules, with no drawing or DOM: enemies march along the roads, our squads and the
// lord fight them, and the player's commands (deploy, promote, retreat, move the lord,
// skills, items, call the next wave) change the state. The renderer reads `events`.

import {
  TROOPS, FOES, STAR_MULT, STAR_RANGE, STAR_COST, RETREAT_REFUND, GATE_HP, counterMult, counterLevel, BOSS,
  SKILLS, ITEMS, stageHpMult, stageAtkMult, killFood, PASSIVE_FOOD, TROOP_KEYS, diffScale, lateEase,
  GENERALS, GEN_SPECIALS, GENERAL_RECOVER, GENERAL_MOVE_WAIT, PLACE_GAP, ROAD_CLEAR,
} from './data.js';
import { pathAt, nearestOnPaths, WORLD_W, WORLD_H } from './maps.js';
import { rng } from './waves.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const REGEN_DELAY = 4; // seconds without being hit before resting
const REGEN_RATE = 0.02; // of max HP per second
const NEXT_WAVE_WAIT = 18;
const EARLY_BONUS = 2; // 군량 per second skipped
const LORD_REVIVE = 12;
const MAX_RAIDERS = 2;
const BOSS_ENGAGE = 150; // an enemy general stops to fight our units this close to it

export class Sim {
  constructor(setup) {
    this.setup = setup;
    this.n = setup.n;
    this.layout = setup.layout;
    this.paths = setup.layout.paths;
    this.waves = setup.waves;
    this.r = rng(`${setup.seed || 'battle'}:${setup.stage.id}`);
    const D = setup.diff || { hp: 1, atk: 1 };
    const ease = lateEase(D, this.n);
    this.hpMult = stageHpMult(this.n) * diffScale(D.hp, this.n) * ease;
    this.atkMult = stageAtkMult(this.n) * diffScale(D.atk, this.n) * ease;
    this.mods = setup.mods;

    this.state = 'ready'; // ready → play → won | lost
    this.time = 0;
    this.gate = GATE_HP;
    this.food = setup.startFood;
    this.roster = { ...setup.roster };
    this.items = { ...setup.items };
    this.itemsUsed = { potion: 0, bomb: 0, wall: 0 };

    this.spots = setup.layout.spots; // good places along the roads (the bot uses them)
    this.isWater = null; // set by the view on river maps
    this.squads = [];
    this.foes = [];
    this.militia = [];
    this.walls = [];
    this.projectiles = [];
    this.zones = [];
    this.events = [];
    this.nextId = 1;

    this.waveIdx = -1;
    this.spawnQueue = [];
    this.waveT = 0;
    this.nextT = null; // countdown to the next wave, once the current one has fully marched in
    this.buffs = { atk: 0, atkT: 0, guard: 0, guardT: 0 };
    this.stats = { kills: 0, lost: 0, deployed: 0, promoted: 0, skills: 0, items: 0, leaked: 0 };

    const L = setup.lord;
    const start = pathAt(this.paths[0], Math.max(0, this.paths[0].len - 170));
    this.lord = {
      kind: 'lord', id: this.nextId++, key: setup.lordKey, type: null,
      x: start.x, y: start.y, hx: start.x, hy: start.y,
      hp: L.hp, maxHp: L.hp, atk: L.atk, cd: L.cd, cdT: 0, range: L.range, speed: L.speed,
      def: L.def, ranged: L.ranged, block: L.block, blocking: [],
      dead: false, reviveT: 0, lastHit: -99, face: 1, moving: false, atkAnim: 0, dashT: 0,
    };
    this.skills = setup.skills.map(s => s && { ...s, cdT: 0 });
    // generals: 'hand' (can be placed once waitT is 0) or 'field' (on the battlefield)
    this.generals = (setup.generals || []).map(g => ({ ...g, state: 'hand', waitT: 0, squad: null, hpLeft: null }));
    this.rallies = [];
  }

  // ---- queries --------------------------------------------------------------------

  get totalWaves() { return this.waves.length; }
  get alive() { return this.foes.length; }
  boss() { return this.foes.find(f => f.boss) || null; }
  emit(e) { this.events.push(e); }

  allies() {
    const out = [...this.squads, ...this.militia, ...this.walls];
    if (!this.lord.dead) out.push(this.lord);
    return out;
  }

  blockers() {
    const out = [];
    for (const s of this.squads) if (TROOPS[s.type].melee) out.push(s);
    out.push(...this.militia, ...this.walls);
    if (!this.lord.dead && !this.lord.moving) out.push(this.lord);
    return out;
  }

  starCost(squad) {
    if (squad.gen || squad.star >= 3) return null;
    return Math.round(TROOPS[squad.type].cost * STAR_COST[squad.star - 1] * (1 - (this.mods.starCost || 0)));
  }

  nextWave() { return this.waves[this.waveIdx + 1] || null; }

  stars() { return this.gate >= 18 ? 3 : this.gate >= 10 ? 2 : 1; }

  // ---- commands --------------------------------------------------------------------

  start() {
    if (this.state !== 'ready') return;
    this.state = 'play';
    this.startWave(0);
  }

  callWave() {
    if (this.state === 'ready') { this.start(); return { ok: true, bonus: 0 }; }
    if (this.state !== 'play' || this.nextT === null) return { ok: false };
    const bonus = Math.ceil(this.nextT * EARLY_BONUS);
    this.food += bonus;
    this.startWave(this.waveIdx + 1);
    return { ok: true, bonus };
  }

  // Where a unit may be put down: inside the field, off the road (every type: melee units walk
  // onto the road from there), not on top of another unit, not at the gate or in water.
  canPlace(x, y, ignore = null, units = true) {
    if (x < 26 || x > WORLD_W - 26 || y < 74 || y > WORLD_H - 22) return { ok: false, reason: 'edge' };
    const g = this.layout.gate;
    if (Math.hypot(x - g.x, y - g.y) < 80) return { ok: false, reason: 'gate' };
    if (this.isWater && this.isWater(x, y)) return { ok: false, reason: 'water' };
    if (nearestOnPaths(this.paths, x, y).dist < ROAD_CLEAR) return { ok: false, reason: 'road' };
    for (const q of units ? this.squads : []) {
      if (q === ignore) continue;
      if (Math.hypot(q.hx - x, q.hy - y) < PLACE_GAP) return { ok: false, reason: 'overlap' };
    }
    return { ok: true };
  }

  newSquad(fields, x, y) {
    return {
      kind: 'squad', id: this.nextId++, star: 1, x, y, hx: x, hy: y,
      cdT: 0.3, blocking: [], lastHit: -99, atkAnim: 0, face: 1, target: null, chase: null, moving: false, walkT: 0,
      ...fields,
    };
  }

  deploy(type, x, y) {
    const T = this.setup.troops[type];
    if (!T) return { ok: false, reason: 'type' };
    if (!(this.roster[type] > 0)) return { ok: false, reason: 'roster' };
    if (this.food < TROOPS[type].cost) return { ok: false, reason: 'food' };
    const can = this.canPlace(x, y);
    if (!can.ok) return can;
    this.food -= TROOPS[type].cost;
    this.roster[type]--;
    const s = this.newSquad({ type, spent: TROOPS[type].cost, hp: T.hp, maxHp: T.hp }, x, y);
    this.applyStar(s);
    s.hp = s.maxHp;
    this.squads.push(s);
    this.stats.deployed++;
    this.emit({ k: 'deploy', x, y, type });
    return { ok: true, squad: s };
  }

  applyStar(s) {
    const T = this.setup.troops[s.type];
    const m = STAR_MULT[s.star - 1];
    const oldMax = s.maxHp;
    s.maxHp = T.hp * m;
    s.atk = T.atk * m;
    s.cd = T.cd;
    s.range = T.range * STAR_RANGE[s.star - 1];
    s.block = T.block || 0;
    if (oldMax) s.hp = Math.min(s.maxHp, s.hp + (s.maxHp - oldMax));
  }

  // Generals cost no food; one that was picked up keeps its health.
  deployGeneral(key, x, y) {
    const g = this.generals.find(q => q.key === key);
    if (!g) return { ok: false, reason: 'type' };
    if (g.state === 'field') return { ok: false, reason: 'field' };
    if (g.waitT > 0) return { ok: false, reason: 'wait' };
    const can = this.canPlace(x, y);
    if (!can.ok) return can;
    const s = this.newSquad({
      type: g.type, general: g.key, gen: g, spent: 0,
      hp: g.hpLeft ?? g.hp, maxHp: g.hp, atk: g.atk, cd: g.cd, range: g.range, block: g.block, dr: g.dr,
      specT: (GEN_SPECIALS[g.kind].cd || 0) * 0.4,
    }, x, y);
    this.squads.push(s);
    g.state = 'field';
    g.squad = s;
    g.hpLeft = null;
    this.emit({ k: 'deploy', x, y, type: s.type, general: g.key });
    return { ok: true, squad: s };
  }

  promote(squadId) {
    const s = this.squads.find(q => q.id === squadId);
    if (!s) return { ok: false, reason: 'gone' };
    if (s.gen) return { ok: false, reason: 'general' };
    const cost = this.starCost(s);
    if (cost === null) return { ok: false, reason: 'max' };
    if (this.food < cost) return { ok: false, reason: 'food' };
    this.food -= cost;
    s.spent += cost;
    s.star++;
    this.applyStar(s);
    this.stats.promoted++;
    this.emit({ k: 'promote', x: s.x, y: s.y, star: s.star });
    return { ok: true };
  }

  retreat(squadId) {
    const s = this.squads.find(q => q.id === squadId);
    if (!s) return { ok: false };
    if (s.gen) {
      // picking a general up to place it somewhere else
      const g = s.gen;
      g.state = 'hand';
      g.waitT = GENERAL_MOVE_WAIT;
      g.hpLeft = s.hp;
      g.squad = null;
      this.removeSquad(s);
      this.emit({ k: 'genMove', x: s.x, y: s.y });
      return { ok: true, refund: 0 };
    }
    const refund = Math.floor(s.spent * RETREAT_REFUND);
    this.food += refund;
    this.roster[s.type]++;
    this.removeSquad(s);
    this.emit({ k: 'retreat', x: s.x, y: s.y, refund });
    return { ok: true, refund };
  }

  moveLord(x, y) {
    const L = this.lord;
    if (L.dead) return false;
    L.hx = Math.max(20, Math.min(WORLD_W - 20, x));
    L.hy = Math.max(60, Math.min(WORLD_H - 20, y));
    L.engage = null;
    if (Math.hypot(L.hx - L.x, L.hy - L.y) > 30) this.releaseAll(L);
    return true;
  }

  // Skill i (0..2) at world point (x, y) for targeted skills.
  castSkill(i, x, y) {
    const s = this.skills[i];
    const L = this.lord;
    if (!s) return { ok: false, reason: 'locked' };
    if (L.dead) return { ok: false, reason: 'dead' };
    if (s.cdT > 0) return { ok: false, reason: 'cooldown' };
    const def = SKILLS[s.key];
    const dmgMult = 1 + (this.mods.skillDmg || 0);
    const p = s.power;
    if (def.target === 'path') {
      const g = nearestOnPaths(this.paths, x, y);
      if (g.dist > 150) return { ok: false, reason: 'path' };
      x = g.x; y = g.y;
      s.pathHit = g;
    }
    switch (s.key) {
      case 'lb_whirl':
        for (const f of this.foes.slice()) if (dist(f, L) < def.radius) this.hitFoe(f, L.atk * p * dmgMult, null);
        this.emit({ k: 'whirl', x: L.x, y: L.y, r: def.radius });
        break;
      case 'lb_heal': {
        for (const a of this.allies()) {
          if (a.kind !== 'wall' && dist(a, L) < def.radius) this.healAlly(a, a.maxHp * p);
        }
        this.emit({ k: 'healwave', x: L.x, y: L.y, r: def.radius });
        break;
      }
      case 'lb_militia': {
        const T = this.setup.troops.infantry;
        const g = s.pathHit;
        for (let k = 0; k < def.count; k++) {
          const q = pathAt(this.paths[g.path], g.d + (k - 1) * 26);
          this.militia.push({
            kind: 'militia', id: this.nextId++, type: 'infantry', x: q.x, y: q.y,
            hp: T.hp * p, maxHp: T.hp * p, atk: T.atk * p, cd: 1, cdT: 0.3, range: 50, block: 2,
            blocking: [], t: def.dur, lastHit: -99, atkAnim: 0, face: 1,
          });
        }
        this.emit({ k: 'summon', x, y });
        break;
      }
      case 'cc_dash': {
        let dx = x - L.x, dy = y - L.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, def.maxDist / d);
        const ex = L.x + dx * k, ey = L.y + dy * k;
        for (const f of this.foes.slice()) {
          if (segDist(f.x, f.y, L.x, L.y, ex, ey) < def.width) this.hitFoe(f, L.atk * p * dmgMult, null);
        }
        this.emit({ k: 'dash', x: L.x, y: L.y, x2: ex, y2: ey });
        this.releaseAll(L);
        L.x = L.hx = ex; L.y = L.hy = ey;
        L.dashT = 0.25;
        break;
      }
      case 'cc_roar':
        this.buffs.atk = p;
        this.buffs.atkT = def.dur;
        this.emit({ k: 'roar', x: L.x, y: L.y });
        break;
      case 'cc_cavalry':
        for (const f of this.foes.slice()) {
          if (dist(f, { x, y }) < def.radius) {
            f.stunT = Math.max(f.stunT, def.stun);
            this.hitFoe(f, L.atk * p * dmgMult, null);
          }
        }
        this.emit({ k: 'charge', x, y, r: def.radius });
        break;
      case 'sq_rain':
        this.zones.push({ kind: 'rain', x, y, r: def.radius, t: def.dur, tick: 0, every: def.dur / def.hits, dmg: L.atk * p * dmgMult });
        break;
      case 'sq_fire':
        this.zones.push({ kind: 'fire', x, y, r: def.radius, t: def.dur, tick: 0, every: 0.5, dmg: L.atk * p * dmgMult, slow: def.slow });
        break;
      case 'sq_guard':
        this.buffs.guard = p;
        this.buffs.guardT = def.dur;
        this.gate = Math.min(GATE_HP, this.gate + 1);
        this.emit({ k: 'guard', x: L.x, y: L.y });
        break;
      default:
        return { ok: false, reason: 'unknown' };
    }
    s.cdT = s.cd;
    this.stats.skills++;
    this.emit({ k: 'skill', key: s.key });
    return { ok: true };
  }

  useItem(key, x, y) {
    if (!(this.items[key] > 0)) return { ok: false, reason: 'none' };
    const def = ITEMS[key];
    if (key === 'potion') {
      for (const a of this.allies()) {
        if (a.kind !== 'wall' && Math.hypot(a.x - x, a.y - y) < def.radius) this.healAlly(a, a.maxHp * def.heal);
      }
      this.emit({ k: 'healwave', x, y, r: def.radius });
    } else if (key === 'bomb') {
      const dmg = def.dmg * this.hpMult;
      for (const f of this.foes.slice()) if (Math.hypot(f.x - x, f.y - y) < def.radius) this.hitFoe(f, dmg, null);
      this.emit({ k: 'boom', x, y, r: def.radius, big: true });
    } else if (key === 'wall') {
      const g = nearestOnPaths(this.paths, x, y);
      if (g.dist > 150) return { ok: false, reason: 'path' };
      const hp = def.hp * this.atkMult;
      const q = pathAt(this.paths[g.path], g.d);
      this.walls.push({
        kind: 'wall', id: this.nextId++, type: null, x: g.x, y: g.y, ang: q.ang,
        hp, maxHp: hp, t: def.dur, block: 99, blocking: [], lastHit: -99,
      });
      this.emit({ k: 'wall', x: g.x, y: g.y });
    }
    this.items[key]--;
    this.itemsUsed[key]++;
    this.stats.items++;
    return { ok: true };
  }

  // ---- waves -------------------------------------------------------------------------

  startWave(i) {
    const w = this.waves[i];
    if (!w) return;
    this.waveIdx = i;
    this.waveT = 0;
    this.nextT = null;
    const q = [];
    for (const g of w.groups) {
      for (let k = 0; k < g.count; k++) q.push({ t: g.at + k * g.gap, type: g.type, path: Math.min(g.path, this.paths.length - 1) });
    }
    if (w.boss) q.push({ t: Math.max(4, w.length * 0.45), type: this.setup.stage.boss.type, path: 0, boss: true });
    q.sort((a, b) => a.t - b.t);
    this.spawnQueue = q;
    this.emit({ k: 'wave', i, boss: w.boss });
  }

  spawnFoe(type, pathIdx, boss = false, d = 0) {
    const F = FOES[type];
    const path = this.paths[pathIdx];
    const f = {
      kind: 'foe', id: this.nextId++, type, boss, path: pathIdx, d,
      off: (this.r() - 0.5) * 20, x: 0, y: 0,
      hp: F.hp * this.hpMult, atk: F.atk * this.atkMult, cd: F.cd, cdT: 0.5 + this.r() * 0.5,
      speed: F.speed * (0.93 + this.r() * 0.14), range: F.range || 0,
      gate: F.gate, reward: killFood(type, this.n),
      state: 'walk', blocker: null, raid: null, raidCd: 0,
      slowT: 0, slow: 0, burnT: 0, burnDps: 0, stunT: 0, rallyT: 0, healT: 1 + this.r() * 2,
      cmT: 0, face: 1, walkT: this.r() * 10, atkAnim: 0, chargeT: 0,
    };
    if (boss) {
      const B = this.setup.stage.boss;
      f.name = B.name;
      f.title = B.title;
      f.skill = B.skill;
      f.skillT = 5;
      f.hp *= BOSS.hp * (this.setup.bossHp || 1);
      f.atk *= BOSS.atk;
      f.speed = F.speed * BOSS.speed;
      f.gate = BOSS.gate;
      f.reward *= 10;
      f.off = 0;
    }
    f.maxHp = f.hp;
    const p = pathAt(path, d);
    f.x = p.x; f.y = p.y;
    this.foes.push(f);
    if (boss) this.emit({ k: 'boss', name: f.name });
    return f;
  }

  // ---- main update -----------------------------------------------------------------

  update(dt) {
    for (const g of this.generals) if (g.waitT > 0) g.waitT = Math.max(0, g.waitT - dt);
    if (this.state !== 'play') { this.updateLord(dt, true); return; }
    this.time += dt;
    this.rallies = this.squads.filter(q => q.gen && q.gen.kind === 'rally');

    // waves
    this.waveT += dt;
    while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveT) {
      const s = this.spawnQueue.shift();
      this.spawnFoe(s.type, s.path, !!s.boss);
    }
    const lastWave = this.waveIdx >= this.waves.length - 1;
    if (!this.spawnQueue.length && !lastWave) {
      if (this.nextT === null) this.nextT = NEXT_WAVE_WAIT;
      this.nextT -= dt;
      if (this.nextT <= 0) this.startWave(this.waveIdx + 1);
    }
    this.food += PASSIVE_FOOD * (1 + (this.mods.food || 0)) * dt;

    // buffs
    if (this.buffs.atkT > 0 && (this.buffs.atkT -= dt) <= 0) this.buffs.atk = 0;
    if (this.buffs.guardT > 0 && (this.buffs.guardT -= dt) <= 0) this.buffs.guard = 0;
    for (const s of this.skills) if (s && s.cdT > 0) s.cdT = Math.max(0, s.cdT - dt);

    this.updateFoes(dt);
    this.updateBlocking();
    this.updateSquads(dt);
    this.updateMilitia(dt);
    this.updateWalls(dt);
    this.updateLord(dt, false);
    this.updateProjectiles(dt);
    this.updateZones(dt);

    if (this.bossLeaked) {
      this.state = 'lost';
      this.emit({ k: 'lost' });
    } else if (this.gate <= 0) {
      this.gate = 0;
      this.lostReason = 'gate';
      this.state = 'lost';
      this.emit({ k: 'lost' });
    } else if (lastWave && !this.spawnQueue.length && !this.foes.length) {
      this.state = 'won';
      this.emit({ k: 'won' });
    }
  }

  updateFoes(dt) {
    for (const f of this.foes.slice()) {
      if (f.hp <= 0) continue;
      f.cmT -= dt;
      f.atkAnim = Math.max(0, f.atkAnim - dt);
      if (f.burnT > 0) {
        f.burnT -= dt;
        f.hp -= f.burnDps * dt;
        if (f.hp <= 0) { this.killFoe(f); continue; }
      }
      if (f.slowT > 0 && (f.slowT -= dt) <= 0) f.slow = 0;
      if (f.rallyT > 0) f.rallyT -= dt;
      if (f.stunT > 0) { f.stunT -= dt; continue; }
      const rally = f.rallyT > 0 ? 1.35 : 1;
      f.cdT -= dt * rally;
      if (f.type === 'strategist') f.healT -= dt;
      if (f.boss) this.bossSkill(f, dt);

      const speed = f.speed * (1 - f.slow) * rally * (f.chargeT > 0 ? 3 : 1);
      if (f.state === 'walk') {
        f.d += speed * dt;
        f.walkT += dt;
        const path = this.paths[f.path];
        if (f.d >= path.len - 4) { this.leak(f); continue; }
        const p = pathAt(path, f.d);
        const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
        f.x = p.x + nx * f.off;
        f.y = p.y + ny * f.off;
        f.face = Math.cos(p.ang) >= 0 ? 1 : -1;
        if (f.chargeT > 0) {
          f.chargeT -= dt;
          // the charge ends on the first thing it rams, which then holds the general
          const b = this.blockers().find(o => dist(f, o) < 34);
          if (b) {
            f.chargeT = 0;
            this.hitAlly(b, f.atk * 2, f.type);
            this.emit({ k: 'slam', x: b.x, y: b.y });
            if (b.hp > 0 && this.blockers().includes(b)) {
              f.state = 'blocked';
              f.blocker = b;
              b.blocking.push(f);
            }
          }
        }
        // Enemy cavalry rides off the road to hit our ranged squads.
        if (f.type === 'cavalry' && !f.boss) {
          f.raidCd -= dt;
          if (f.raidCd <= 0) {
            f.raidCd = 0.5;
            const t = this.squads.find(s => !TROOPS[s.type].melee && dist(s, f) < FOES.cavalry.raid &&
              this.foes.filter(o => o.raid === s).length < MAX_RAIDERS);
            if (t) { f.state = 'raid'; f.raid = t; }
          }
        }
        // The enemy general does not walk past our units: it turns on the nearest one.
        if (f.boss && f.chargeT <= 0) {
          f.raidCd -= dt;
          if (f.raidCd <= 0) {
            f.raidCd = 0.5;
            const t = this.bossPrey(f);
            if (t) { f.state = 'raid'; f.raid = t; }
          }
        }
      } else if (f.state === 'raid' || f.state === 'return') {
        if (f.state === 'raid' && f.boss && (f.raidCd -= dt) <= 0) {
          // keep fighting whatever is nearest; go back to the road when nothing is left near
          f.raidCd = 0.5;
          f.raid = this.bossPrey(f);
        }
        if (f.state === 'raid' && !this.allyAlive(f.raid)) {
          f.raid = f.boss ? this.bossPrey(f) : null;
          if (!f.raid) { f.state = 'return'; continue; }
        }
        const tgt = f.state === 'raid' ? f.raid : pathAt(this.paths[f.path], f.d);
        const dx = tgt.x - f.x, dy = tgt.y - f.y;
        const d = Math.hypot(dx, dy);
        const reach = f.state === 'raid' ? (f.boss && f.range ? f.range * 0.9 : 24) : 3;
        if (d > reach + 0.5) {
          const step = Math.min(d - reach, speed * dt);
          f.x += dx / d * step;
          f.y += dy / d * step;
          f.face = dx >= 0 ? 1 : -1;
          f.walkT += dt;
        } else if (f.state === 'return') {
          f.state = 'walk';
          f.raidCd = f.boss ? 0.5 : 3;
        } else if (f.cdT <= 0) {
          f.cdT = f.cd;
          f.atkAnim = 0.25;
          f.face = tgt.x >= f.x ? 1 : -1;
          if (f.boss && f.range) this.shootAt(f, f.raid);
          else this.hitAlly(f.raid, f.atk, f.type);
        }
        continue;
      }

      // attacks
      if (f.cdT > 0) continue;
      if (f.state === 'blocked' && f.blocker) {
        f.cdT = f.cd;
        f.atkAnim = 0.25;
        f.face = f.blocker.x >= f.x ? 1 : -1;
        if (f.range) this.shootAt(f, f.blocker);
        else this.hitAlly(f.blocker, f.atk, f.type);
        continue;
      }
      if (f.type === 'strategist') {
        if (this.foeHeal(f)) continue;
      }
      if (f.range) {
        const t = this.nearestAlly(f, f.range);
        if (t) {
          f.cdT = f.cd;
          f.atkAnim = 0.3;
          this.shootAt(f, t);
        }
      }
    }
  }

  allyAlive(a) {
    if (!a || a.hp <= 0 || a.gone) return false;
    if (a.kind === 'lord') return !a.dead;
    return this.squads.includes(a) || this.militia.includes(a);
  }

  // The nearest of our squads, militia or the lord within reach of the enemy general.
  bossPrey(f) {
    const reach = Math.max(BOSS_ENGAGE, f.range || 0);
    let best = null, bd = reach;
    for (const a of this.allies()) {
      if (a.kind === 'wall') continue;
      const d = dist(a, f);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  foeHeal(f) {
    if (f.healT > 0) return false;
    const hurt = this.foes.filter(o => o !== f && o.hp < o.maxHp * 0.85 && dist(o, f) < 130);
    if (!hurt.length) return false;
    f.healT = FOES.strategist.healCd;
    f.cdT = f.cd;
    hurt.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    for (const o of hurt.slice(0, 3)) {
      o.hp = Math.min(o.maxHp, o.hp + o.maxHp * FOES.strategist.heal * (o.boss ? 0.25 : 1));
      this.emit({ k: 'foeheal', x: o.x, y: o.y });
    }
    return true;
  }

  bossSkill(f, dt) {
    f.skillT -= dt;
    if (f.skillT > 0) return;
    f.skillT = BOSS.skillCd;
    switch (f.skill) {
      case 'charge':
        if (f.state !== 'walk' && f.state !== 'blocked') { f.skillT = 1; return; }
        this.releaseFoe(f);
        f.chargeT = 1.3;
        this.emit({ k: 'bossSkill', skill: 'charge', x: f.x, y: f.y, name: f.name });
        break;
      case 'summon': {
        const types = Object.keys(this.setup.stage.mix || { infantry: 1 });
        const count = this.n <= 5 ? 2 : this.n <= 12 ? 3 : 4; // early generals call fewer helpers
        for (let k = 0; k < count; k++) {
          const t = types[Math.floor(this.r() * types.length)];
          this.spawnFoe(t, f.path, false, Math.max(0, f.d - 20 - k * 22));
        }
        this.emit({ k: 'bossSkill', skill: 'summon', x: f.x, y: f.y, name: f.name });
        break;
      }
      case 'heal':
        f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.06);
        for (const o of this.foes) {
          if (o !== f && dist(o, f) < 170) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.25);
        }
        this.emit({ k: 'bossSkill', skill: 'heal', x: f.x, y: f.y, name: f.name, r: 170 });
        break;
      case 'rally':
        for (const o of this.foes) if (dist(o, f) < 210) o.rallyT = 6;
        this.emit({ k: 'bossSkill', skill: 'rally', x: f.x, y: f.y, name: f.name, r: 210 });
        break;
      case 'volley': {
        const cands = this.allies().filter(a => a.kind !== 'wall' && dist(a, f) < 340);
        if (!cands.length) { f.skillT = 1.5; return; }
        const t = cands[Math.floor(this.r() * cands.length)];
        this.zones.push({ kind: 'volley', x: t.x, y: t.y, r: 85, t: 1.1, dmg: f.atk * 1.6, att: 'archer', warn: true });
        this.emit({ k: 'bossSkill', skill: 'volley', x: f.x, y: f.y, name: f.name });
        break;
      }
      default:
        break;
    }
  }

  // Walking enemies get stopped by melee squads, militia, walls and the lord.
  updateBlocking() {
    const blockers = this.blockers();
    for (const b of blockers) b.blocking = b.blocking.filter(f => f.hp > 0 && f.blocker === b);
    for (const f of this.foes) {
      if (f.state !== 'walk' || f.chargeT > 0) continue;
      for (const b of blockers) {
        if (b.blocking.length >= b.block) continue;
        const reach = b.kind === 'wall' ? 30 : b.kind === 'lord' ? 30 : 28;
        if (dist(f, b) < reach) {
          f.state = 'blocked';
          f.blocker = b;
          b.blocking.push(f);
          break;
        }
      }
    }
  }

  // Static bonuses (level, lord trait, equipment) are already in setup.troops; this adds the
  // lord's roar and a nearby rally general.
  troopAtkMult(u = null) {
    let m = 1 + this.buffs.atk;
    if (u && this.rallies.length) {
      const R = GEN_SPECIALS.rally;
      if (this.rallies.some(q => q !== u && Math.hypot(q.x - u.x, q.y - u.y) < R.radius)) m += R.atk;
    }
    return m;
  }

  // The n best targets in range (multishot generals hit several at once).
  pickTargets(s, range, n, from = s) {
    const list = [];
    for (const f of this.foes) {
      if (f.hp <= 0 || dist(f, from) > range) continue;
      const len = this.paths[f.path].len;
      list.push([f, f.d / len + Math.max(0, counterLevel(s.type, f.type)) * 0.18 + (f.boss ? 0.1 : 0)]);
    }
    list.sort((a, b) => b[1] - a[1]);
    return list.slice(0, n).map(x => x[0]);
  }

  // A general's special, used when it is ready and something is in reach.
  generalSpecial(s, dt) {
    const g = s.gen;
    const sp = GEN_SPECIALS[g.kind];
    if (!sp.cd) return;
    s.specT -= dt;
    if (s.specT > 0) return;
    const melee = TROOPS[s.type].melee;
    const pos = { x: s.x, y: s.y };
    void melee;
    const atk = s.atk * this.troopAtkMult(s);
    const near = r => this.foes.filter(f => f.hp > 0 && Math.hypot(f.x - pos.x, f.y - pos.y) < r);
    let used = false;
    switch (g.kind) {
      case 'cleave': {
        const hits = near(sp.radius);
        for (const f of hits) this.hitFoe(f, atk * sp.power, s.type);
        used = hits.length > 0;
        if (used) this.emit({ k: 'whirl', x: pos.x, y: pos.y, r: sp.radius });
        break;
      }
      case 'stun': {
        const hits = near(sp.radius);
        for (const f of hits) { f.stunT = Math.max(f.stunT, sp.stun); this.hitFoe(f, atk * sp.power, s.type); }
        used = hits.length > 0;
        if (used) this.emit({ k: 'genStun', x: pos.x, y: pos.y, r: sp.radius });
        break;
      }
      case 'snipe': {
        const cands = near(s.range * sp.rangeMult);
        if (cands.length) {
          const t = cands.sort((a, b) => (b.boss - a.boss) || b.hp - a.hp)[0];
          this.projectiles.push({ kind: 'arrow', side: 'p', x: pos.x, y: pos.y - 18, target: t, tx: t.x, ty: t.y, speed: 900, dmg: atk * sp.power, att: s.type, big: true });
          this.emit({ k: 'bow', x: pos.x, y: pos.y });
          used = true;
        }
        break;
      }
      case 'fire': {
        const cands = near(s.range);
        let best = null, bn = 0;
        for (const f of cands) {
          const k = cands.filter(o => Math.hypot(o.x - f.x, o.y - f.y) < sp.radius).length;
          if (k > bn) { bn = k; best = f; }
        }
        if (best) {
          this.zones.push({ kind: 'fire', x: best.x, y: best.y, r: sp.radius, t: sp.dur, tick: 0, every: 0.5, dmg: atk * sp.power, slow: sp.slow });
          used = true;
        }
        break;
      }
      case 'slow': {
        const hits = near(s.range);
        for (const f of hits) { f.slow = Math.max(f.slow, sp.slow); f.slowT = Math.max(f.slowT, sp.dur); this.hitFoe(f, atk * sp.power, s.type); }
        used = hits.length > 0;
        if (used) this.emit({ k: 'genSlow', x: pos.x, y: pos.y, r: s.range });
        break;
      }
      case 'charge': {
        const near = nearestOnPaths(this.paths, s.x, s.y);
        if (near.dist > s.range + 20) break; // too far from the road to charge along it
        const p = near.path, gd = near.d;
        const hits = this.foes.filter(f => f.hp > 0 && f.path === p && f.d > gd - sp.length && f.d < gd + 30 && f.state !== 'raid');
        if (hits.length) {
          for (const f of hits) this.hitFoe(f, atk * sp.power, s.type);
          const a = pathAt(this.paths[p], gd), b = pathAt(this.paths[p], Math.max(0, gd - sp.length));
          this.emit({ k: 'dash', x: a.x, y: a.y, x2: b.x, y2: b.y });
          used = true;
        }
        break;
      }
      case 'food': {
        const amount = Math.round(sp.amount * (1 + 0.04 * (this.n - 1)));
        this.food += amount;
        this.emit({ k: 'genFood', x: pos.x, y: pos.y, amount });
        used = true;
        break;
      }
      case 'barrage': {
        const ts = this.pickTargets(s, s.range, sp.shots, pos);
        ts.forEach((t, i) => {
          this.projectiles.push({ kind: 'stone', side: 'p', sx: pos.x, sy: pos.y - 14, x: pos.x, y: pos.y, tx: t.x + (i % 2 ? 12 : -12), ty: t.y, t: 0, dur: 0.9 + i * 0.12, dmg: atk * sp.power, att: 'catapult', splash: TROOPS.catapult.splash });
        });
        used = ts.length > 0;
        if (used) this.emit({ k: 'launch', x: pos.x, y: pos.y });
        break;
      }
      default:
        break;
    }
    s.specT = used ? sp.cd : 0.5;
    if (used) this.emit({ k: 'genSkill', x: pos.x, y: pos.y, name: GENERALS[g.key].skill });
  }

  // Ranged squads pick the enemy furthest along the road, preferring ones they beat.
  pickTarget(s, range, from = s) {
    let best = null, bestScore = -1;
    for (const f of this.foes) {
      if (f.hp <= 0 || dist(f, from) > range) continue;
      const len = this.paths[f.path].len;
      let score = f.d / len + Math.max(0, counterLevel(s.type, f.type)) * 0.18 + (f.raid === s ? 2 : 0) + (f.boss ? 0.1 : 0);
      if (f.state === 'raid' || f.state === 'return') score += 0.2;
      if (score > bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  updateSquads(dt) {
    for (const s of this.squads.slice()) {
      s.atkAnim = Math.max(0, s.atkAnim - dt);
      this.regen(s, dt);
      if (TROOPS[s.type].melee) this.moveMelee(s, dt);
      if (s.gen) {
        this.generalSpecial(s, dt);
        if (s.gone) continue;
      }
      s.cdT -= dt;
      if (s.cdT > 0) continue;
      const T = TROOPS[s.type];
      const atk = s.atk * this.troopAtkMult(s);
      const multi = s.gen && s.gen.kind === 'multishot' ? GEN_SPECIALS.multishot.targets : 1;
      let t = null;
      if (T.melee) {
        t = s.blocking.find(f => f.hp > 0) || this.pickTarget(s, T.reach + 6);
        if (!t) continue;
        s.cdT = s.cd;
        s.atkAnim = 0.3;
        s.target = { x: t.x, y: t.y };
        s.face = t.x >= s.x ? 1 : -1;
        const extra = multi > 1 ? this.pickTargets(s, T.reach + 30, multi).filter(f => f !== t).slice(0, multi - 1) : [];
        for (const f of [t, ...extra]) {
          this.hitFoe(f, atk, s.type, s);
          this.emit({ k: 'slash', x: f.x, y: f.y, type: s.type });
        }
      } else {
        t = this.pickTarget(s, s.range);
        if (!t) continue;
        s.cdT = s.cd;
        s.atkAnim = 0.3;
        s.face = t.x >= s.x ? 1 : -1;
        const from = { x: s.x, y: s.y - 14 };
        if (multi > 1) {
          for (const f of this.pickTargets(s, s.range, multi)) {
            this.projectiles.push({ kind: 'arrow', side: 'p', x: from.x, y: from.y, target: f, tx: f.x, ty: f.y, speed: 650, dmg: atk, att: s.type });
          }
          this.emit({ k: 'bow', x: from.x, y: from.y });
        } else if (s.type === 'archer') {
          this.projectiles.push({ kind: 'arrow', side: 'p', x: from.x, y: from.y, target: t, tx: t.x, ty: t.y, speed: 650, dmg: atk, att: 'archer' });
          this.emit({ k: 'bow', x: from.x, y: from.y });
        } else if (s.type === 'strategist') {
          const T2 = TROOPS.strategist;
          this.projectiles.push({ kind: 'fire', side: 'p', x: from.x, y: from.y, target: t, tx: t.x, ty: t.y, speed: 380, dmg: atk, att: 'strategist', splash: T2.splash, burn: T2.burn, slow: T2.slow });
          this.emit({ k: 'cast', x: from.x, y: from.y });
        } else if (s.type === 'catapult') {
          const flight = 1.0;
          const lead = this.foeVelocity(t);
          const tx = t.x + lead.x * flight * 0.85, ty = t.y + lead.y * flight * 0.85;
          this.projectiles.push({ kind: 'stone', side: 'p', sx: from.x, sy: from.y, x: from.x, y: from.y, tx, ty, t: 0, dur: flight, dmg: atk, att: 'catapult', splash: TROOPS.catapult.splash });
          this.emit({ k: 'launch', x: from.x, y: from.y });
        }
      }
    }
  }

  // Melee squads guard a circle (their range) around where they were put: they run to
  // enemies inside it, stop them, and walk back home when it is clear.
  moveMelee(s, dt) {
    const T = TROOPS[s.type];
    if (s.blocking.length) { s.moving = false; s.chase = null; return; }
    const leash = s.range;
    const inArea = f => f.hp > 0 && !f.gone && Math.hypot(f.x - s.hx, f.y - s.hy) < leash + 6;
    if (s.chase && !inArea(s.chase)) s.chase = null;
    if (!s.chase) {
      let best = null, bs = -Infinity;
      for (const f of this.foes) {
        if (!inArea(f)) continue;
        const free = f.state === 'walk' || f.state === 'raid' || f.state === 'return';
        const sc = (free ? 2 : 0) + counterLevel(s.type, f.type) * 0.4 - Math.hypot(f.x - s.x, f.y - s.y) / 120 + (f.boss ? 0.5 : 0);
        if (sc > bs) { bs = sc; best = f; }
      }
      s.chase = best;
    }
    const goal = s.chase || { x: s.hx, y: s.hy };
    const stop = s.chase ? T.reach * 0.6 : 1;
    const dx = goal.x - s.x, dy = goal.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d > stop + 0.5) {
      const step = Math.min(d - stop, T.speed * dt);
      let nx = s.x + dx / d * step, ny = s.y + dy / d * step;
      const hx = nx - s.hx, hy = ny - s.hy, hd = Math.hypot(hx, hy);
      if (hd > leash) { nx = s.hx + hx / hd * leash; ny = s.hy + hy / hd * leash; }
      s.x = nx;
      s.y = ny;
      s.face = dx >= 0 ? 1 : -1;
      s.moving = true;
      s.walkT += dt;
    } else {
      s.moving = false;
    }
  }

  foeVelocity(f) {
    if (f.state !== 'walk' || f.stunT > 0) return { x: 0, y: 0 };
    const p = pathAt(this.paths[f.path], f.d);
    const v = f.speed * (1 - f.slow) * (f.rallyT > 0 ? 1.35 : 1);
    return { x: Math.cos(p.ang) * v, y: Math.sin(p.ang) * v };
  }

  updateMilitia(dt) {
    for (const m of this.militia.slice()) {
      m.t -= dt;
      m.atkAnim = Math.max(0, m.atkAnim - dt);
      if (m.t <= 0) { this.removeAlly(m); continue; }
      m.cdT -= dt;
      if (m.cdT > 0) continue;
      const t = m.blocking.find(f => f.hp > 0) || this.pickTarget(m, m.range);
      if (!t) continue;
      m.cdT = m.cd;
      m.atkAnim = 0.3;
      m.face = t.x >= m.x ? 1 : -1;
      this.hitFoe(t, m.atk * this.troopAtkMult(m), 'infantry', m);
    }
  }

  updateWalls(dt) {
    for (const w of this.walls.slice()) {
      w.t -= dt;
      if (w.t <= 0) this.removeAlly(w);
    }
  }

  updateLord(dt, idle) {
    const L = this.lord;
    L.atkAnim = Math.max(0, L.atkAnim - dt);
    if (L.dashT > 0) L.dashT -= dt;
    if (L.dead) {
      if (idle) return;
      L.reviveT -= dt;
      if (L.reviveT <= 0) {
        const p = pathAt(this.paths[0], Math.max(0, this.paths[0].len - 90));
        L.dead = false;
        L.hp = L.maxHp;
        L.x = L.hx = p.x;
        L.y = L.hy = p.y;
        this.emit({ k: 'revive', x: L.x, y: L.y });
      }
      return;
    }
    // Melee lords step out to fight enemies walking past their post.
    let goal = { x: L.hx, y: L.hy };
    if (!L.ranged && !idle) {
      if (L.engage && (L.engage.hp <= 0 || !this.foes.includes(L.engage) || dist(L.engage, goal) > 140)) L.engage = null;
      if (!L.engage && !L.blocking.length) {
        let best = null, bd = 110;
        for (const f of this.foes) {
          const d = dist(f, goal);
          if (d < bd && (f.state === 'walk' || f.state === 'raid')) { bd = d; best = f; }
        }
        L.engage = best;
      }
      if (L.blocking.length) goal = { x: L.x, y: L.y };
      else if (L.engage) goal = L.engage;
    }
    const dx = goal.x - L.x, dy = goal.y - L.y;
    const d = Math.hypot(dx, dy);
    const stopAt = L.engage && goal === L.engage ? 20 : 2;
    const speed = L.speed;
    if (d > stopAt + 0.5) {
      const step = Math.min(d - stopAt, speed * dt);
      L.x += dx / d * step;
      L.y += dy / d * step;
      L.face = dx >= 0 ? 1 : -1;
      L.moving = !(L.engage && goal === L.engage) || d > 40;
      if (L.moving && L.blocking.length) this.releaseAll(L);
    } else {
      L.moving = false;
    }
    if (idle) return;
    this.regen(L, dt);
    L.cdT -= dt;
    if (L.cdT > 0) return;
    const t = L.blocking.find(f => f.hp > 0) || this.pickTarget(L, L.range);
    if (!t) return;
    L.cdT = L.cd;
    L.atkAnim = 0.3;
    L.face = t.x >= L.x ? 1 : -1;
    if (L.ranged) {
      this.projectiles.push({ kind: 'arrow', side: 'p', x: L.x, y: L.y - 18, target: t, tx: t.x, ty: t.y, speed: 700, dmg: L.atk, att: null, big: true });
      this.emit({ k: 'bow', x: L.x, y: L.y });
    } else {
      this.hitFoe(t, L.atk, null, L);
      this.emit({ k: 'slash', x: t.x, y: t.y, type: 'lord' });
    }
  }

  regen(u, dt) {
    if (u.hp < u.maxHp && this.time - u.lastHit > REGEN_DELAY) {
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * REGEN_RATE * (this.mods.regen || 1) * (u.dr ? 2 : 1) * dt);
    }
  }

  nearestAlly(f, range) {
    let best = null, bd = range;
    for (const a of this.allies()) {
      const d = dist(a, f);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  shootAt(f, t) {
    if (f.type === 'catapult') {
      this.projectiles.push({ kind: 'stone', side: 'f', sx: f.x, sy: f.y - 10, x: f.x, y: f.y, tx: t.x, ty: t.y, t: 0, dur: 1.1, dmg: f.atk, att: 'catapult', splash: FOES.catapult.splash });
      this.emit({ k: 'launch', x: f.x, y: f.y });
    } else if (f.type === 'strategist') {
      this.projectiles.push({ kind: 'bolt', side: 'f', x: f.x, y: f.y - 10, target: t, tx: t.x, ty: t.y, speed: 400, dmg: f.atk, att: 'strategist' });
    } else {
      this.projectiles.push({ kind: 'arrow', side: 'f', x: f.x, y: f.y - 10, target: t, tx: t.x, ty: t.y, speed: 600, dmg: f.atk, att: f.type === 'archer' ? 'archer' : f.type });
    }
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles.slice()) {
      if (p.kind === 'stone') {
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k;
        p.h = Math.sin(k * Math.PI) * 90;
        if (k >= 1) {
          this.removeProj(p);
          this.splash(p, p.tx, p.ty);
          this.emit({ k: 'boom', x: p.tx, y: p.ty, r: p.splash });
        }
        continue;
      }
      const alive = p.target && p.target.hp > 0 && !p.target.gone && !p.target.dead;
      if (alive) { p.tx = p.target.x; p.ty = p.target.y - (p.side === 'f' ? 8 : 6); }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      p.ang = Math.atan2(dy, dx);
      if (d <= step + 4) {
        this.removeProj(p);
        if (!alive) continue;
        if (p.side === 'p') {
          if (p.kind === 'fire') {
            this.splash(p, p.tx, p.ty);
            this.emit({ k: 'fireHit', x: p.tx, y: p.ty, r: p.splash });
          } else {
            this.hitFoe(p.target, p.dmg, p.att);
          }
        } else {
          this.hitAlly(p.target, p.dmg, p.att);
        }
      } else {
        p.x += dx / d * step;
        p.y += dy / d * step;
      }
    }
  }

  splash(p, x, y) {
    if (p.side === 'p') {
      for (const f of this.foes.slice()) {
        const d = Math.hypot(f.x - x, f.y - y);
        if (d > p.splash) continue;
        const k = d < p.splash * 0.4 ? 1 : 0.6;
        this.hitFoe(f, p.dmg * k, p.att);
        if (p.burn && f.hp > 0) {
          f.burnT = 2.5;
          f.burnDps = (p.dmg * p.burn) / 2.5;
          f.slow = Math.max(f.slow, p.slow);
          f.slowT = 2;
        }
      }
    } else {
      for (const a of this.allies()) {
        if (Math.hypot(a.x - x, a.y - y) <= p.splash) this.hitAlly(a, p.dmg, p.att);
      }
    }
  }

  updateZones(dt) {
    for (const z of this.zones.slice()) {
      z.t -= dt;
      if (z.kind === 'volley') {
        if (z.t <= 0) {
          for (const a of this.allies()) if (Math.hypot(a.x - z.x, a.y - z.y) < z.r) this.hitAlly(a, z.dmg, z.att);
          this.emit({ k: 'volleyHit', x: z.x, y: z.y, r: z.r });
          this.zones.splice(this.zones.indexOf(z), 1);
        }
        continue;
      }
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick += z.every;
        for (const f of this.foes.slice()) {
          if (Math.hypot(f.x - z.x, f.y - z.y) > z.r) continue;
          this.hitFoe(f, z.dmg, null);
          if (z.slow && f.hp > 0) { f.slow = Math.max(f.slow, z.slow); f.slowT = 0.7; }
        }
        if (z.kind === 'rain') this.emit({ k: 'rainHit', x: z.x, y: z.y, r: z.r });
      }
      if (z.t <= 0) this.zones.splice(this.zones.indexOf(z), 1);
    }
  }

  // ---- damage ----------------------------------------------------------------------

  hitFoe(f, dmg, att, src = null) {
    if (f.hp <= 0) return 0;
    const lv = counterLevel(att, f.type);
    const m = counterMult(att, f.type);
    const v = dmg * m;
    f.hp -= v;
    if (lv && f.cmT <= 0) {
      f.cmT = 1.2;
      this.emit({ k: 'counter', x: f.x, y: f.y - 22, lv });
    }
    if (src && src.kind === 'lord' && f.boss) this.emit({ k: 'hitBoss' });
    if (f.hp <= 0) this.killFoe(f);
    return v;
  }

  killFoe(f) {
    if (f.gone) return;
    f.gone = true;
    f.hp = 0;
    this.releaseFoe(f);
    this.foes.splice(this.foes.indexOf(f), 1);
    const food = f.reward * (1 + (this.mods.food || 0));
    this.food += food;
    this.stats.kills++;
    this.emit({ k: 'die', x: f.x, y: f.y, type: f.type, boss: f.boss, food: Math.round(food), faction: this.setup.stage.enemy });
  }

  leak(f) {
    f.gone = true;
    this.releaseFoe(f);
    this.foes.splice(this.foes.indexOf(f), 1);
    this.stats.leaked++;
    if (f.boss) {
      // the enemy general got through: the battle is lost at once
      this.bossLeaked = true;
      this.lostReason = 'boss';
      this.emit({ k: 'bossLeak', x: f.x, y: f.y, name: f.name });
      return;
    }
    this.gate -= f.gate;
    this.emit({ k: 'leak', x: f.x, y: f.y, n: f.gate });
  }

  releaseFoe(f) {
    if (f.blocker) {
      f.blocker.blocking = f.blocker.blocking.filter(o => o !== f);
      f.blocker = null;
    }
    if (f.state === 'blocked') f.state = 'walk';
  }

  releaseAll(b) {
    for (const f of b.blocking) { f.blocker = null; if (f.state === 'blocked') f.state = 'walk'; }
    b.blocking = [];
  }

  hitAlly(a, dmg, att) {
    if (!a || a.hp <= 0) return;
    let v = dmg * counterMult(att, a.type);
    if (a.kind === 'lord') v *= 1 - (a.def || 0);
    if (a.dr) v *= 1 - a.dr;
    if (a.kind !== 'wall') v *= 1 - this.buffs.guard;
    a.hp -= v;
    a.lastHit = this.time;
    if (a.hp > 0) return;
    if (a.kind === 'lord') {
      this.releaseAll(a);
      a.dead = true;
      a.hp = 0;
      a.engage = null;
      a.reviveT = LORD_REVIVE;
      this.emit({ k: 'lordDown', x: a.x, y: a.y });
    } else if (a.kind === 'squad' && a.gen) {
      const g = a.gen;
      g.state = 'hand';
      g.waitT = GENERAL_RECOVER;
      g.hpLeft = null;
      g.squad = null;
      this.stats.genDown = (this.stats.genDown || 0) + 1;
      this.removeSquad(a);
      this.emit({ k: 'generalDown', x: a.x, y: a.y, name: GENERALS[g.key].name });
    } else if (a.kind === 'squad') {
      this.stats.lost++;
      this.removeSquad(a);
      this.emit({ k: 'squadDown', x: a.x, y: a.y, type: a.type });
    } else {
      this.removeAlly(a);
      this.emit({ k: a.kind === 'wall' ? 'wallDown' : 'squadDown', x: a.x, y: a.y });
    }
  }

  healAlly(a, amount) {
    if (a.hp <= 0) return;
    a.hp = Math.min(a.maxHp, a.hp + amount);
    this.emit({ k: 'heal', x: a.x, y: a.y });
  }

  removeSquad(s) {
    s.gone = true;
    this.releaseAll(s);
    const i = this.squads.indexOf(s);
    if (i >= 0) this.squads.splice(i, 1);
    for (const f of this.foes) if (f.raid === s && !f.boss) { f.raid = null; f.state = 'return'; }
  }

  removeAlly(a) {
    a.gone = true;
    this.releaseAll(a);
    const list = a.kind === 'wall' ? this.walls : this.militia;
    const i = list.indexOf(a);
    if (i >= 0) list.splice(i, 1);
  }

  removeProj(p) {
    const i = this.projectiles.indexOf(p);
    if (i >= 0) this.projectiles.splice(i, 1);
  }

  // For the next-wave counter hints: the types in a wave, most numerous first.
  waveTypes(wave) {
    const c = {};
    for (const g of wave.groups) c[g.type] = (c[g.type] || 0) + g.count;
    return TROOP_KEYS.filter(t => c[t]).sort((a, b) => c[b] - c[a]).map(t => [t, c[t]]);
  }
}

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}
