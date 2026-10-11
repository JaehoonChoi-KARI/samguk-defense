// Battle rules, with no drawing or DOM: enemies march along the roads, our squads and
// generals fight them, and the player's commands (deploy, promote, retreat, the lord's
// orders from the castle, items, call the next wave) change the state. The renderer reads
// `events`.

import {
  TROOPS, FOES, STAR_MULT, STAR_RANGE, STAR_COST, RETREAT_REFUND, GATE_HP, counterMult, counterLevel, BOSS,
  SKILLS, ITEMS, stageHpMult, stageAtkMult, killFood, PASSIVE_FOOD, TROOP_KEYS, diffScale,
  GENERALS, GEN_SPECIALS, GENERAL_RECOVER, GENERAL_MOVE_WAIT, GROUND, FORMATIONS,
  WEATHER, DUEL, duelChance, ROUT, skillDur, startFood, AURA_R, HORDE, hordeHp, hordeAtk, holdsRoad, FOE_HP,
} from './data.js';
import { pathAt, nearestOnPaths, WORLD_W, WORLD_H } from './maps.js';
import { cellKey, sizeOf, anchorAt, footCenter, footCells, footNeighbours, inWater } from './field.js';
import { rng } from './waves.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const REGEN_DELAY = 4; // seconds without being hit before resting
const REGEN_RATE = 0.02; // of max HP per second
const NEXT_WAVE_WAIT = 25; // seconds between one wave fully marching in and the next
const EARLY_BONUS = 2; // 군량 per second skipped
const MAX_RAIDERS = 2 * HORDE;
const RETARGET = 70; // an arrow whose soldier already fell hits another this close
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
    this.hpMult = stageHpMult(this.n) * diffScale(D.hp, this.n) * FOE_HP; // the bomb item scales with it too
    this.atkMult = stageAtkMult(this.n) * diffScale(D.atk, this.n);
    this.soldier = { hp: D.shp || 1, atk: D.satk || 1 }; // a difficulty can toughen the soldiers alone
    this.mods = setup.mods;
    this.weather = WEATHER[setup.weather] || WEATHER.clear;
    this.duel = null; // a 일기토 going on: { gen, boss, t, win }
    this.duelDone = new Set(); // generals that have had their duel
    this.wavered = false;

    this.state = 'ready'; // ready → play → won | lost
    this.time = 0;
    this.gate = GATE_HP;
    this.food = setup.startFood;
    this.roster = { ...setup.roster };
    this.items = { ...setup.items };
    this.itemsUsed = { potion: 0, bomb: 0, wall: 0 };

    this.field = setup.field; // build cells, special ground and water
    this.occ = new Map(); // cell key → squad standing on it
    this.links = []; // formation links between squads, for drawing: { a, b, kind }
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
    // the lord's lasting orders: key → { v, t }; atk, guard (damage taken), regen (of max HP
    // per second), gen / genDr (generals), rate (ranged attack speed)
    this.buffs = {};
    this.stats = {
      kills: 0, lost: 0, deployed: 0, promoted: 0, skills: 0, items: 0, leaked: 0,
      duels: 0, duelWins: 0, routed: 0, early: 0, bossFrac: null,
      types: new Set(), grounds: new Set(), forms: new Set(), // for the stage challenge
    };

    // the lord stays in the castle and only gives orders (skills); activeT = order still running
    this.skills = setup.skills.map(s => s && { ...s, cdT: 0, activeT: 0 });
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
    return [...this.squads, ...this.militia, ...this.walls];
  }

  blockers() {
    const out = [];
    for (const s of this.squads) if (holdsRoad(s.type) && !s.march) out.push(s); // marching to its 배치: holds nobody
    out.push(...this.militia, ...this.walls);
    return out;
  }

  buff(k) {
    const b = this.buffs[k];
    return b && b.t > 0 ? b.v : 0;
  }

  setBuff(k, v, t) { this.buffs[k] = { v, t }; }

  // 군주의 위엄: squads put close to the castle fight harder.
  nearLord(u) {
    const g = this.layout.gate;
    return Math.hypot((u.px ?? u.x) - g.x, (u.py ?? u.y) - g.y) < AURA_R;
  }

  starCost(squad) {
    if (squad.gen || squad.star >= 3) return null;
    return Math.round(TROOPS[squad.type].cost * STAR_COST[squad.star - 1] * (1 - (this.mods.starCost || 0)));
  }

  nextWave() { return this.waves[this.waveIdx + 1] || null; }

  stars() { return this.gate >= GATE_HP * 0.9 ? 3 : this.gate >= GATE_HP * 0.5 ? 2 : 1; }

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
    this.stats.early++;
    this.startWave(this.waveIdx + 1);
    return { ok: true, bonus };
  }

  // Units snap onto the build cells along the roads like bricks on a baseplate. The cells a unit
  // of this type would take for a press at (x, y): { ok, reason, c, r, size, keys, x, y, ground }.
  spotFor(type, x, y, ignore = null) {
    const size = sizeOf(type);
    const a = anchorAt(x, y, size);
    const tries = [a];
    if (size > 1) {
      // a big unit may sit a cell over if that is where it fits
      for (const [dc, dr] of [[0, -1], [-1, 0], [-1, -1], [1, 0], [0, 1], [1, 1], [1, -1], [-1, 1]]) tries.push({ c: a.c + dc, r: a.r + dr });
    }
    let first = null;
    for (const { c, r } of tries) {
      const keys = footCells(c, r, size);
      const p = footCenter(c, r, size);
      const out = { c, r, size, keys, x: p.x, y: p.y, ground: this.groundOf(keys) };
      let reason = '';
      if (keys.some(k => !this.field.cells.has(k))) reason = 'cell';
      else if (keys.some(k => this.occ.has(k) && this.occ.get(k) !== ignore)) reason = 'overlap';
      if (!reason) return { ...out, ok: true };
      first = first || { ...out, ok: false, reason };
    }
    return first;
  }

  // A 2×2 unit counts as standing on special ground when at least half its cells are.
  groundOf(keys) {
    const n = {};
    for (const k of keys) {
      const kind = this.field.cells.get(k)?.kind || 'plain';
      n[kind] = (n[kind] || 0) + 1;
    }
    for (const kind of ['hill', 'forest', 'choke']) if ((n[kind] || 0) * 2 >= keys.length) return kind;
    return 'plain';
  }

  // Formations a unit of this type would join or make at this spot (for the placing preview).
  previewFormations(type, spot) {
    const near = new Set();
    for (const k of footNeighbours(spot.c, spot.r, spot.size)) {
      const q = this.occ.get(k);
      if (q) near.add(q);
    }
    const out = new Set();
    const ranged = !TROOPS[type].melee;
    for (const q of near) {
      if ((q.type === 'spear' && ranged) || (type === 'spear' && !TROOPS[q.type].melee)) out.add('spearbow');
      if (q.type === 'infantry' || type === 'infantry') out.add('shield');
      if (q.type === 'strategist' || type === 'strategist') out.add('command');
    }
    if (spot.size === 1) {
      const same = k => { const q = this.occ.get(k); return q && q.type === type && q.anchor.size === 1; };
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        let n = 1;
        for (let k = 1; same(cellKey(spot.c + dc * k, spot.r + dr * k)); k++) n++;
        for (let k = 1; same(cellKey(spot.c - dc * k, spot.r - dr * k)); k++) n++;
        if (n >= 3) out.add('line');
      }
    }
    return [...out];
  }

  occupy(s, spot) {
    s.cells = spot.keys;
    s.anchor = { c: spot.c, r: spot.r, size: spot.size };
    s.ground = spot.ground;
    s.ambush = spot.ground === 'forest'; // the first strike from the woods
    for (const k of spot.keys) this.occ.set(k, s);
  }

  // Forest squads at their post cannot be seen by enemy archers, catapults and raiders.
  hidden(a) {
    return a.kind === 'squad' && a.ground === 'forest' && !a.rallied && Math.hypot(a.x - a.px, a.y - a.py) < 24;
  }

  newSquad(fields, x, y) {
    return {
      // px, py = its post (the cell it was put on); hx, hy = where it stands and guards around;
      // march = on its way to a 배치
      kind: 'squad', id: this.nextId++, star: 1, x, y, hx: x, hy: y, px: x, py: y, rallied: false, march: false,
      cdT: 0.3, blocking: [], lastHit: -99, atkAnim: 0, face: 1, target: null, chase: null, moving: false, walkT: 0,
      ...fields,
    };
  }

  deploy(type, x, y) {
    const T = this.setup.troops[type];
    if (!T) return { ok: false, reason: 'type' };
    if (!(this.roster[type] > 0)) return { ok: false, reason: 'roster' };
    if (this.food < TROOPS[type].cost) return { ok: false, reason: 'food' };
    const spot = this.spotFor(type, x, y);
    if (!spot.ok) return spot;
    this.food -= TROOPS[type].cost;
    this.roster[type]--;
    const s = this.newSquad({ type, spent: TROOPS[type].cost, hp: T.hp }, spot.x, spot.y);
    this.occupy(s, spot);
    this.applyStar(s);
    s.hp = s.maxHp;
    this.squads.push(s);
    this.stats.deployed++;
    this.stats.types.add(type);
    this.stats.grounds.add(s.ground);
    this.emit({ k: 'deploy', x: s.x, y: s.y, type });
    this.updateFormations();
    return { ok: true, squad: s };
  }

  applyStar(s) {
    const T = this.setup.troops[s.type];
    const m = STAR_MULT[s.star - 1];
    s.cd = T.cd;
    s.base = { maxHp: T.hp * m, atk: T.atk * m, range: T.range * STAR_RANGE[s.star - 1], block: T.block || 0 };
    this.refreshStats(s);
  }

  // Base numbers plus the ground under the unit and its formations. Gaining max HP heals by
  // the same amount; losing it only trims.
  refreshStats(s) {
    const B = s.base, G = (!s.rallied && GROUND[s.ground]) || GROUND.plain, F = s.form || {}; // off its cell: no ground bonus
    const ranged = !TROOPS[s.type].melee;
    const oldMax = s.maxHp;
    s.maxHp = B.maxHp * (1 + (F.hp || 0));
    s.atk = B.atk * (1 + (ranged ? G.atk || 0 : 0) + (F.atk || 0));
    s.range = B.range * (1 + (ranged ? G.range || 0 : 0)) * (ranged ? this.weather.range || 1 : 1);
    s.block = B.block + (ranged ? 0 : G.block || 0);
    s.formDr = F.dr || 0;
    s.guarded = !!F.guard;
    if (oldMax) s.hp = s.maxHp > oldMax ? s.hp + (s.maxHp - oldMax) : Math.min(s.hp, s.maxHp);
  }

  // Squads side by side form formations (FORMATIONS in data.js).
  updateFormations() {
    const before = new Map(this.squads.map(s => [s, s.form?.names || []]));
    const links = [];
    const mark = (s, kind, q) => {
      if (!s.form.names.includes(kind)) s.form.names.push(kind);
      if (q && !links.some(l => l.kind === kind && ((l.a === q && l.b === s) || (l.a === s && l.b === q)))) links.push({ a: q, b: s, kind });
    };
    for (const s of this.squads) s.form = { names: [] };
    for (const s of this.squads) {
      const { c, r, size } = s.anchor;
      const near = new Set();
      for (const k of footNeighbours(c, r, size)) {
        const q = this.occ.get(k);
        if (q && q !== s) near.add(q);
      }
      for (const q of near) {
        if (q.type === 'spear' && !TROOPS[s.type].melee) mark(s, 'spearbow', q);
        if (q.type === 'infantry') mark(s, 'shield', q);
        if (q.type === 'strategist') mark(s, 'command', q);
      }
    }
    // three or more one-cell squads of one type in a row or a column
    const same = (s, q) => q && q.type === s.type && q.anchor.size === 1;
    for (const s of this.squads) {
      if (s.anchor.size !== 1) continue;
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        if (same(s, this.occ.get(cellKey(s.anchor.c - dc, s.anchor.r - dr)))) continue; // not the start of a run
        const run = [s];
        for (let k = 1; same(s, this.occ.get(cellKey(s.anchor.c + dc * k, s.anchor.r + dr * k))); k++) {
          run.push(this.occ.get(cellKey(s.anchor.c + dc * k, s.anchor.r + dr * k)));
        }
        if (run.length >= 3) run.forEach((q, i) => mark(q, 'line', i ? run[i - 1] : null));
      }
    }
    this.links = links;
    for (const s of this.squads) {
      const n = s.form.names;
      s.form.guard = n.includes('spearbow');
      s.form.dr = n.includes('shield') ? FORMATIONS.shield.dr : 0;
      s.form.atk = n.includes('command') ? FORMATIONS.command.atk : 0;
      s.form.hp = n.includes('line') ? FORMATIONS.line.hp : 0;
      this.refreshStats(s);
      for (const kind of n) {
        this.stats.forms.add(kind);
        if (!(before.get(s) || []).includes(kind)) this.emit({ k: 'formation', x: s.x, y: s.y, kind });
      }
    }
  }

  // Generals cost no food; one that was picked up keeps its health.
  deployGeneral(key, x, y) {
    const g = this.generals.find(q => q.key === key);
    if (!g) return { ok: false, reason: 'type' };
    if (g.state === 'field') return { ok: false, reason: 'field' };
    if (g.waitT > 0) return { ok: false, reason: 'wait' };
    const spot = this.spotFor(g.type, x, y);
    if (!spot.ok) return spot;
    const s = this.newSquad({
      type: g.type, general: g.key, gen: g, spent: 0, cd: g.cd, dr: g.dr,
      specCd: (GEN_SPECIALS[g.kind].cd || 0) * (1 - (this.mods.genSpec || 0)),
    }, spot.x, spot.y);
    s.specT = s.specCd * 0.4;
    s.base = { maxHp: g.hp, atk: g.atk, range: g.range, block: g.block };
    this.occupy(s, spot);
    this.refreshStats(s);
    s.hp = Math.min(s.maxHp, g.hpLeft ?? s.maxHp);
    this.squads.push(s);
    this.stats.grounds.add(s.ground);
    this.stats.types.add(s.type);
    g.state = 'field';
    g.squad = s;
    g.hpLeft = null;
    this.emit({ k: 'deploy', x: s.x, y: s.y, type: s.type, general: g.key });
    this.updateFormations();
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

  // A melee squad or general can be told where to stand (배치): any point inside its range around
  // its post, the road too. The order comes first: it lets go of the enemies it holds and walks
  // straight there, then stands there. It keeps its cell, so its formations stay, but the cell's
  // ground (choke, forest) only helps while it is on it.
  setRally(squadId, x, y) {
    const s = this.squads.find(q => q.id === squadId);
    if (!s || !TROOPS[s.type].melee) return { ok: false, reason: 'type' };
    const dx = x - s.px, dy = y - s.py, d = Math.hypot(dx, dy);
    if (d > s.range) { x = s.px + dx / d * s.range; y = s.py + dy / d * s.range; }
    x = Math.max(12, Math.min(WORLD_W - 12, x));
    y = Math.max(12, Math.min(WORLD_H - 12, y));
    if (inWater(this.field.water, x, y)) return { ok: false, reason: 'water' };
    const away = Math.hypot(x - s.px, y - s.py) > 24;
    s.hx = away ? x : s.px;
    s.hy = away ? y : s.py;
    s.rallied = away;
    if (away) s.ambush = false;
    this.releaseAll(s);
    s.march = true;
    s.chase = null;
    s.pass = null;
    s.turnT = 0;
    this.refreshStats(s);
    this.emit({ k: 'rally', x: s.hx, y: s.hy });
    return { ok: true, x: s.hx, y: s.hy };
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

  // The lord's order i (0..2), at world point (x, y) for the ones aimed at a spot. Power
  // already includes skill level and skill-effect bonuses.
  castSkill(i, x, y) {
    const s = this.skills[i];
    if (!s) return { ok: false, reason: 'locked' };
    if (s.cdT > 0) return { ok: false, reason: 'cooldown' };
    const def = SKILLS[s.key];
    const p = s.power;
    const dur = skillDur(def, this.mods);
    const gate = this.layout.gate;
    const order = extra => this.emit({ k: 'order', key: s.key, x: gate.x, y: gate.y, dir: gate.dir, ...extra });
    if (def.target === 'path') {
      const g = nearestOnPaths(this.paths, x, y);
      if (g.dist > 150) return { ok: false, reason: 'path' };
      x = g.x; y = g.y;
      s.pathHit = g;
    }
    switch (s.key) {
      case 'lb_heal':
        for (const a of [...this.squads, ...this.militia]) this.healAlly(a, a.maxHp * p);
        this.setBuff('regen', p / 15, dur);
        order();
        break;
      case 'lb_oath':
        for (const g of this.generals) if (g.state === 'hand') g.waitT = 0;
        this.setBuff('gen', p, dur);
        this.setBuff('genDr', def.dr, dur);
        order();
        break;
      case 'lb_militia': {
        const T = this.setup.troops.infantry;
        const g = s.pathHit;
        for (let k = 0; k < def.count; k++) {
          const q = pathAt(this.paths[g.path], Math.max(0, g.d + (k - 1.5) * 24));
          this.militia.push({
            kind: 'militia', id: this.nextId++, type: 'infantry', x: q.x, y: q.y,
            hp: T.hp * p, maxHp: T.hp * p, atk: T.atk * p, cd: 1, cdT: 0.3, range: 50, block: 2,
            blocking: [], t: dur, lastHit: -99, atkAnim: 0, face: 1,
          });
        }
        this.emit({ k: 'summon', x, y });
        order();
        break;
      }
      case 'cc_roar':
        this.setBuff('atk', p, dur);
        order();
        break;
      case 'cc_supply': {
        const amount = Math.round(startFood(this.n) * p);
        this.food += amount;
        order({ amount });
        break;
      }
      case 'cc_tiger':
        for (const f of this.foes.slice()) {
          if (dist(f, { x, y }) < def.radius) {
            f.stunT = Math.max(f.stunT, def.stun);
            this.hitFoe(f, this.setup.power * p, 'cavalry');
          }
        }
        this.emit({ k: 'dash', x: gate.x, y: gate.y, x2: x, y2: y });
        this.emit({ k: 'charge', x, y, r: def.radius });
        order();
        break;
      case 'sq_volley':
        this.setBuff('rate', p, dur);
        order();
        break;
      case 'sq_fire':
        this.zones.push({ kind: 'fire', x, y, r: def.radius, t: dur, tick: 0, every: 0.5, dmg: this.setup.power * p, slow: def.slow });
        order();
        break;
      case 'sq_guard':
        this.setBuff('guard', p, dur);
        this.gate = Math.min(GATE_HP, this.gate + def.gate);
        order();
        break;
      default:
        return { ok: false, reason: 'unknown' };
    }
    s.cdT = s.cd;
    s.activeT = dur;
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
      for (let k = 0; k < g.count; k++) q.push({ t: g.at + k * g.gap, type: g.type, path: Math.min(g.path, this.paths.length - 1), boost: w.boost || 1 });
    }
    if (w.boss) q.push({ t: Math.max(4, w.length * 0.45), type: this.setup.stage.boss.type, path: 0, boss: true });
    q.sort((a, b) => a.t - b.t);
    this.spawnQueue = q;
    this.emit({ k: 'wave', i, boss: w.boss });
  }

  // boost: a capped wave sends fewer soldiers, each worth this many (hp, 군량, gate damage)
  spawnFoe(type, pathIdx, boss = false, d = 0, boost = 1) {
    const F = FOES[type];
    const path = this.paths[pathIdx];
    // the horde: many weaker soldiers (the enemy general is left alone)
    const H = boss ? { hp: 1, atk: 1 } : { hp: hordeHp(this.n) * this.soldier.hp * boost, atk: hordeAtk(this.n) * this.soldier.atk };
    const f = {
      kind: 'foe', id: this.nextId++, type, boss, path: pathIdx, d,
      off: (this.r() - 0.5) * 30, x: 0, y: 0,
      hp: F.hp * this.hpMult * H.hp, atk: F.atk * this.atkMult * H.atk, cd: F.cd, cdT: 0.5 + this.r() * 0.5,
      speed: F.speed * (0.93 + this.r() * 0.14), range: (F.range || 0) * (this.weather.range || 1),
      gate: F.gate * (boss ? 1 : boost), reward: killFood(type, this.n) / (boss ? 1 : HORDE) * (boss ? 1 : boost),
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
    if (this.state !== 'play') return;
    this.time += dt;
    this.rallies = this.squads.filter(q => q.gen && q.gen.kind === 'rally');

    // waves
    this.waveT += dt;
    while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveT) {
      const s = this.spawnQueue.shift();
      this.spawnFoe(s.type, s.path, !!s.boss, 0, s.boost || 1);
    }
    const lastWave = this.waveIdx >= this.waves.length - 1;
    if (!this.spawnQueue.length && !lastWave) {
      if (this.nextT === null) this.nextT = NEXT_WAVE_WAIT;
      this.nextT -= dt;
      if (this.nextT <= 0) this.startWave(this.waveIdx + 1);
    }
    this.food += PASSIVE_FOOD * (1 + (this.mods.food || 0)) * dt;

    // the lord's orders
    for (const b of Object.values(this.buffs)) if (b.t > 0) b.t -= dt;
    for (const s of this.skills) {
      if (!s) continue;
      if (s.cdT > 0) s.cdT = Math.max(0, s.cdT - dt);
      if (s.activeT > 0) s.activeT = Math.max(0, s.activeT - dt);
    }

    this.updateFoes(dt);
    this.updateBlocking();
    this.updateSquads(dt);
    this.updateDuel(dt);
    this.updateMilitia(dt);
    this.updateWalls(dt);
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

      const speed = f.speed * (1 - f.slow) * rally * (f.chargeT > 0 ? 3 : 1) * (this.weather.speed || 1);
      if (f.state === 'flee') {
        // running back the way it came; gone once off the field
        f.d -= speed * 1.15 * dt;
        f.walkT += dt;
        if (f.d <= 0) {
          f.gone = true;
          this.foes.splice(this.foes.indexOf(f), 1);
          continue;
        }
        const p = pathAt(this.paths[f.path], f.d);
        const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
        f.x = p.x + nx * f.off;
        f.y = p.y + ny * f.off;
        f.face = Math.cos(p.ang) >= 0 ? -1 : 1;
        continue;
      }
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
            const t = this.squads.find(s => !TROOPS[s.type].melee && !s.guarded && !this.hidden(s) && dist(s, f) < FOES.cavalry.raid &&
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
    return this.squads.includes(a) || this.militia.includes(a);
  }

  // The nearest of our squads or militia within reach of the enemy general.
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

  // 일기토: the first time one of our generals and the enemy general meet, they fight one on
  // one for a moment (both stand still); the outcome is rolled when it starts.
  updateDuel(dt) {
    const d = this.duel;
    if (d) {
      d.t -= dt;
      if (d.t > 0) return;
      this.duel = null;
      const { gen, boss } = d;
      if (!this.squads.includes(gen) || !this.foes.includes(boss)) return;
      const names = { gen: GENERALS[gen.general].name, boss: boss.name };
      if (d.win) {
        this.stats.duelWins++;
        this.emit({ k: 'duelWin', x: boss.x, y: boss.y, ...names });
        this.hitFoe(boss, boss.maxHp * DUEL.bossDmg, null);
        if (boss.hp > 0) {
          boss.stunT = Math.max(boss.stunT, DUEL.bossStun);
          this.rout(boss, DUEL.rout, DUEL.routR);
        }
      } else {
        this.emit({ k: 'duelLose', x: gen.x, y: gen.y, ...names });
        this.hitAlly(gen, gen.maxHp * DUEL.genDmg, null);
      }
      return;
    }
    const boss = this.boss();
    if (!boss || boss.hp <= 0 || boss.state === 'flee') return;
    for (const s of this.squads) {
      if (!s.gen || this.duelDone.has(s.general) || dist(s, boss) > DUEL.reach) continue;
      this.duelDone.add(s.general);
      const G = GENERALS[s.general];
      const p = duelChance(G, this.setup.level || this.n, this.n, this.setup.diff?.key);
      const win = this.r() < p;
      this.duel = { gen: s, boss, t: DUEL.time, win };
      s.duelT = DUEL.time;
      boss.stunT = Math.max(boss.stunT, DUEL.time);
      this.stats.duels++;
      this.emit({ k: 'duel', x: (s.x + boss.x) / 2, y: (s.y + boss.y) / 2, gen: G.name, boss: boss.name });
      return;
    }
  }

  // Enemies lose heart: a share of the ones near `center` (all of them without one) run away.
  rout(center, share, radius = Infinity) {
    let n = 0;
    for (const f of this.foes) {
      if (f.boss || f.state === 'flee' || f.hp <= 0) continue;
      if (center && dist(f, center) > radius) continue;
      if (this.r() >= share) continue;
      this.releaseFoe(f);
      f.raid = null;
      f.chargeT = 0;
      f.state = 'flee';
      n++;
    }
    this.stats.routed += n;
    if (n) this.emit({ k: 'rout', x: center ? center.x : WORLD_W / 2, y: center ? center.y : WORLD_H / 2, n });
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
        const count = (this.n <= 5 ? 2 : this.n <= 12 ? 3 : 4) * HORDE; // early generals call fewer helpers
        for (let k = 0; k < count; k++) {
          const t = types[Math.floor(this.r() * types.length)];
          this.spawnFoe(t, f.path, false, Math.max(0, f.d - 20 - k * 22 / HORDE));
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
        const cands = this.allies().filter(a => a.kind !== 'wall' && !this.hidden(a) && dist(a, f) < 340);
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

  // Walking enemies get stopped by melee squads, militia and walls.
  updateBlocking() {
    const blockers = this.blockers();
    for (const b of blockers) b.blocking = b.blocking.filter(f => f.hp > 0 && f.blocker === b);
    for (const f of this.foes) {
      if (f.state !== 'walk' || f.chargeT > 0) continue;
      for (const b of blockers) {
        if (b.blocking.length >= b.block * (b.kind === 'wall' ? 1 : HORDE)) continue;
        const reach = b.kind === 'wall' ? 30 : 28;
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
  // lord's orders, 군주의 위엄 near the castle and a nearby rally general.
  troopAtkMult(u = null) {
    let m = 1 + this.buff('atk');
    if (u?.gen) m += this.buff('gen');
    if (u && this.mods.aura && u.kind === 'squad' && this.nearLord(u)) m += this.mods.aura;
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
    s.specT = used ? s.specCd : 0.5;
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
      if (s.duelT > 0) { s.duelT -= dt; continue; } // in a 일기토
      this.regen(s, dt);
      const pass = TROOPS[s.type].trait?.pass;
      if (pass) this.moveCavalry(s, dt);
      else if (TROOPS[s.type].melee) this.moveMelee(s, dt);
      if (s.gen) {
        this.generalSpecial(s, dt);
        if (s.gone) continue;
      }
      if (pass) continue; // 기마병 hit while riding through (moveCavalry)
      s.cdT -= dt;
      if (s.cdT > 0) continue;
      const T = TROOPS[s.type];
      let atk = s.atk * this.troopAtkMult(s);
      if (s.ambush) {
        atk *= GROUND.forest.ambush;
        s.ambush = false;
        this.emit({ k: 'ambush', x: s.x, y: s.y });
      }
      const multi = s.gen && s.gen.kind === 'multishot' ? GEN_SPECIALS.multishot.targets : 1;
      let t = null;
      if (T.melee) {
        t = s.blocking.find(f => f.hp > 0) || this.pickTarget(s, T.reach + 6);
        if (!t) continue;
        s.cdT = s.cd;
        s.atkAnim = 0.3;
        s.target = { x: t.x, y: t.y };
        s.face = t.x >= s.x ? 1 : -1;
        const tr = T.trait || {};
        const extra = multi > 1 ? this.pickTargets(s, T.reach + 30, multi).filter(f => f !== t).slice(0, multi - 1)
          : tr.pierce ? this.pickTargets(s, T.reach + 6, tr.pierce).filter(f => f !== t).slice(0, tr.pierce - 1) : [];
        for (const f of [t, ...extra]) {
          this.hitFoe(f, atk, s.type, s);
          this.emit({ k: 'slash', x: f.x, y: f.y, type: s.type });
        }
        if (tr.pierce && extra.length) {
          const far = extra.reduce((a, b) => (dist(b, s) > dist(a, s) ? b : a), t);
          this.emit({ k: 'thrust', x: s.x, y: s.y, x2: far.x, y2: far.y });
        }
      } else {
        t = this.pickTarget(s, s.range);
        if (!t) continue;
        s.cdT = s.cd / (1 + this.buff('rate'));
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

  // A melee squad (or general) never leaves the circle of its range around its post (the circle
  // 📍 배치 shows, 18차): it goes after any enemy it can reach from inside, and nothing else.
  inArea(s, f) {
    return f.hp > 0 && !f.gone && Math.hypot(f.x - s.px, f.y - s.py) < s.range + TROOPS[s.type].reach;
  }

  keepIn(s, x, y) {
    const dx = x - s.px, dy = y - s.py, d = Math.hypot(dx, dy);
    return d > s.range ? { x: s.px + dx / d * s.range, y: s.py + dy / d * s.range } : { x, y };
  }

  // The enemy a melee squad goes for: the best one (score) inside its circle; null = stay.
  holdTarget(s, score) {
    let best = null, bs = -Infinity;
    for (const f of this.foes) {
      if (!this.inArea(s, f)) continue;
      const sc = score(f);
      if (sc > bs) { bs = sc; best = f; }
    }
    return best;
  }

  // On its way to a 배치: straight there, holding nobody and chasing nobody (true once there).
  marchOn(s, speed, dt) {
    const dx = s.hx - s.x, dy = s.hy - s.y, d = Math.hypot(dx, dy);
    if (d <= speed * dt + 0.5) {
      s.x = s.hx;
      s.y = s.hy;
      s.march = false;
      s.moving = false;
      return true;
    }
    s.x += dx / d * speed * dt;
    s.y += dy / d * speed * dt;
    s.face = dx >= 0 ? 1 : -1;
    s.moving = true;
    s.walkT += dt;
    return false;
  }

  // Melee squads stand where they were put or sent: they run at enemies that come into the
  // circle around their post, stop them, and walk back to their spot when it is clear.
  moveMelee(s, dt) {
    const T = TROOPS[s.type];
    const speed = T.speed * (this.weather.speed || 1);
    if (s.march) { this.marchOn(s, speed, dt); return; }
    if (s.blocking.length) { s.moving = false; s.chase = null; return; }
    if (s.chase && !this.inArea(s, s.chase)) s.chase = null;
    if (!s.chase) {
      s.chase = this.holdTarget(s, f => {
        const free = f.state === 'walk' || f.state === 'raid' || f.state === 'return';
        return (free ? 2 : 0) + counterLevel(s.type, f.type) * 0.4 - Math.hypot(f.x - s.x, f.y - s.y) / 120 + (f.boss ? 0.5 : 0);
      });
    }
    const goal = s.chase || { x: s.hx, y: s.hy };
    const stop = s.chase ? Math.min(T.reach * 0.6, 22) : 1; // close enough that the enemy is stopped
    const dx = goal.x - s.x, dy = goal.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d > stop + 0.5) {
      const step = Math.min(d - stop, speed * dt);
      const p = this.keepIn(s, s.x + dx / d * step, s.y + dy / d * step);
      s.x = p.x;
      s.y = p.y;
      s.face = dx >= 0 ? 1 : -1;
      s.moving = true;
      s.walkT += dt;
    } else {
      s.moving = false;
    }
  }

  // 기마병 never stand and hold the road. When enemies come into the circle around their post
  // they pick a crowd, ride straight through it hitting what they pass (the first one hardest),
  // wheel round on the far side and ride through again, like a strafing run; with nothing in
  // the circle they go back to their spot. They never ride out of it.
  moveCavalry(s, dt) {
    const T = TROOPS[s.type], tr = T.trait;
    const home = { x: s.hx, y: s.hy };
    const speed = T.speed * (this.weather.speed || 1);
    if (s.march) { this.marchOn(s, speed, dt); return; }
    if (s.turnT > 0) { s.turnT -= dt; s.moving = false; return; }
    if (!s.pass) {
      const best = this.holdTarget(s, f => {
        let crowd = 0;
        for (const o of this.foes) if (o !== f && Math.abs(o.x - f.x) < 60 && Math.hypot(o.x - f.x, o.y - f.y) < 60) crowd++;
        return Math.min(crowd, 6) * 0.3 + counterLevel(s.type, f.type) * 0.5 + (f.boss ? 0.5 : 0) - Math.hypot(f.x - s.x, f.y - s.y) / 400;
      });
      if (best) {
        // aim where the enemy will be, and keep riding a bit past it
        const v = this.foeVelocity(best);
        const lead = Math.hypot(best.x - s.x, best.y - s.y) / speed;
        const aim = { x: best.x + v.x * lead, y: best.y + v.y * lead };
        let dx = aim.x - s.x, dy = aim.y - s.y, d = Math.hypot(dx, dy);
        if (d < 1) { dx = aim.x - home.x || 1; dy = aim.y - home.y; d = Math.hypot(dx, dy); }
        let end = { x: aim.x + dx / d * tr.over, y: aim.y + dy / d * tr.over };
        const clamp = p => this.keepIn(s, p.x, p.y);
        end = clamp(end);
        // at the edge of the area already: ride back through the middle instead
        if (Math.hypot(end.x - s.x, end.y - s.y) < 70) end = clamp({ x: home.x - (aim.x - home.x) * 0.6, y: home.y - (aim.y - home.y) * 0.6 });
        s.pass = { x: end.x, y: end.y, hit: new Set() };
      }
    }
    const goal = s.pass || home;
    const dx = goal.x - s.x, dy = goal.y - s.y, d = Math.hypot(dx, dy);
    const step = Math.min(d, speed * dt);
    if (d > 0.5) {
      s.x += dx / d * step;
      s.y += dy / d * step;
      s.face = dx >= 0 ? 1 : -1;
      s.moving = true;
      s.walkT += dt;
    } else {
      s.moving = false;
    }
    if (!s.pass) return;
    const cap = tr.hits * (s.gen?.kind === 'multishot' ? 2 : 1);
    for (const f of this.foes.slice()) {
      if (s.pass.hit.size >= cap) break;
      if (f.hp <= 0 || s.pass.hit.has(f) || Math.hypot(f.x - s.x, f.y - s.y) > tr.width) continue;
      s.pass.hit.add(f);
      const first = s.pass.hit.size === 1;
      let atk = s.atk * this.troopAtkMult(s) * (first ? tr.power : tr.rest);
      if (s.ambush) {
        atk *= GROUND.forest.ambush;
        s.ambush = false;
        this.emit({ k: 'ambush', x: s.x, y: s.y });
      }
      this.hitFoe(f, atk, s.type, s);
      this.emit(first ? { k: 'trample', x: f.x, y: f.y, id: s.id } : { k: 'slash', x: f.x, y: f.y, type: s.type });
      s.atkAnim = 0.3;
      // what we ride past strikes back once (a spear wall hurts the most)
      if (f.hp > 0 && f.stunT <= 0 && f.state !== 'flee') this.hitAlly(s, f.atk, f.type);
      if (s.hp <= 0) return;
    }
    if (d <= step + 0.5) {
      s.pass = null;
      s.turnT = tr.turn; // wheel the horses round
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

  nearestFoe(x, y, range) {
    let best = null, bd = range;
    for (const f of this.foes) {
      if (f.hp <= 0 || f.state === 'flee') continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  regen(u, dt) {
    if (u.hp >= u.maxHp) return;
    if (this.time - u.lastHit > REGEN_DELAY) {
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * REGEN_RATE * (this.mods.regen || 1) * (u.dr ? 2 : 1) * dt);
    }
    const r = this.buff('regen'); // 인덕의 손길 keeps healing even in a fight
    if (r) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * r * dt);
  }

  nearestAlly(f, range) {
    let best = null, bd = range;
    for (const a of this.allies()) {
      if (this.hidden(a)) continue;
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
      let alive = p.target && p.target.hp > 0 && !p.target.gone && !p.target.dead;
      if (!alive && p.side === 'p' && p.kind === 'arrow') {
        // its soldier fell to another shot: the arrow flies on into the crowd around it
        const next = this.nearestFoe(p.tx, p.ty, RETARGET);
        if (next) { p.target = next; alive = true; }
      }
      if (alive) { p.tx = p.target.x; p.ty = p.target.y - (p.side === 'f' ? 8 : 6); }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      p.ang = Math.atan2(dy, dx);
      if (d <= step + 4) {
        this.removeProj(p);
        if (!alive && !(p.side === 'p' && p.kind === 'fire')) continue; // fire still bursts where it lands
        if (p.side === 'p') {
          if (p.kind === 'fire') {
            this.splash({ ...p, dmg: p.dmg * (this.weather.fire || 1) }, p.tx, p.ty);
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
        const dmg = z.kind === 'fire' ? z.dmg * (this.weather.fire || 1) : z.dmg;
        for (const f of this.foes.slice()) {
          if (Math.hypot(f.x - z.x, f.y - z.y) > z.r) continue;
          this.hitFoe(f, dmg, null);
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
    const m = counterMult(att, f.type) * (lv > 0 ? 1 + (this.mods.counter || 0) : 1);
    const v = dmg * m;
    f.hp -= v;
    if (lv && f.cmT <= 0) {
      f.cmT = 1.2;
      this.emit({ k: 'counter', x: f.x, y: f.y - 22, lv });
    }
    if (f.hp <= 0) this.killFoe(f);
    else if (f.boss && !this.wavered && f.hp < f.maxHp * 0.5) {
      // the enemy general is badly hurt: some of the soldiers near it lose heart
      this.wavered = true;
      this.emit({ k: 'waver', x: f.x, y: f.y, name: f.name });
      this.rout(f, ROUT.waver, ROUT.waverR);
    }
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
    if (f.boss) {
      this.stats.bossFrac = f.d / this.paths[f.path].len;
      this.emit({ k: 'bossFall', x: f.x, y: f.y, name: f.name });
      this.rout(null, ROUT.fall);
    }
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
    const tr = a.kind === 'squad' ? TROOPS[a.type].trait : null;
    if (tr?.arrowDr) {
      // 방패벽: shields take some of every blow and most of the arrows
      const arrow = att === 'archer';
      v *= 1 - (arrow ? tr.arrowDr : tr.dr);
      if (arrow && !(a.parryT > this.time)) { a.parryT = this.time + 1.2; this.emit({ k: 'parry', x: a.x, y: a.y }); }
    }
    if (a.dr) v *= 1 - a.dr;
    if (a.formDr) v *= 1 - a.formDr;
    if (a.gen) v *= 1 - this.buff('genDr');
    if (a.kind !== 'wall') v *= (1 - this.buff('guard')) * (1 - (this.mods.troopDef || 0));
    a.hp -= v;
    a.lastHit = this.time;
    if (a.hp > 0) return;
    if (a.kind === 'squad' && a.gen) {
      const g = a.gen;
      g.state = 'hand';
      g.waitT = GENERAL_RECOVER - (this.mods.genRecover || 0);
      g.hpLeft = null;
      g.squad = null;
      this.stats.genDown = (this.stats.genDown || 0) + 1;
      this.removeSquad(a);
      this.emit({ k: 'generalDown', x: a.x, y: a.y, name: GENERALS[g.key].name, wait: g.waitT });
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
    for (const k of s.cells || []) if (this.occ.get(k) === s) this.occ.delete(k);
    this.updateFormations();
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
