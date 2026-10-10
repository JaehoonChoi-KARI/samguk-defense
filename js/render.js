// Draws a battle: cached terrain + roads, then units, shots and effects every frame.

import { TROOPS, FACTIONS, LORDS, SKILLS, ITEMS, GATE_HP, COUNTER_MARK, GENERALS, GEN_SPECIALS } from './data.js';
import { WORLD_W, WORLD_H, nearestOnPath, pathAt } from './maps.js';
import { drawSoldier, drawSquad, drawLord, drawSpot, drawGate, drawWall, drawGeneral, shadow } from './sprites.js';
import { rng } from './waves.js';

const TERRAIN = {
  plain: { base: '#86ad5c', patch: ['#7aa352', '#93b866', '#a3c16f'], road: '#c9a96e', edge: '#9c7f4c', deco: 'plain' },
  forest: { base: '#5f8f45', patch: ['#557f3c', '#6b9a4f', '#4c7536'], road: '#b8995f', edge: '#7f6538', deco: 'forest' },
  mountain: { base: '#a79a74', patch: ['#968a66', '#b5a882', '#8c8060'], road: '#d2bb8a', edge: '#8c7650', deco: 'mountain' },
  river: { base: '#82ab60', patch: ['#76a055', '#90b86c', '#a0c47a'], road: '#c9a96e', edge: '#9c7f4c', deco: 'river' },
  castle: { base: '#a8a08a', patch: ['#9b937c', '#b3ab95', '#8f876f'], road: '#d8ccb0', edge: '#8a7f66', deco: 'castle' },
  snow: { base: '#e6edf2', patch: ['#d8e2ea', '#f2f6f9', '#cfdbe4'], road: '#b9b0a0', edge: '#8c8476', deco: 'snow' },
  desert: { base: '#d8b878', patch: ['#cdaa68', '#e2c48a', '#c49f5e'], road: '#b8935a', edge: '#8c6c3a', deco: 'desert' },
};

const faction = key => FACTIONS[key] || FACTIONS.yellow;
const UNIT = 1.25; // soldiers are drawn a bit larger than the map grid so they read well on an iPad

export class BattleView {
  constructor(sim) {
    this.sim = sim;
    this.stage = sim.setup.stage;
    this.terrain = TERRAIN[this.stage.terrain] || TERRAIN.plain;
    this.us = faction(LORDS[sim.setup.lordKey].faction);
    this.them = faction(this.stage.enemy);
    this.headband = this.stage.enemy === 'yellow' ? '#f2d21b' : null;
    this.fx = [];
    this.texts = [];
    this.shake = 0;
    this.cache = null;
    this.cacheKey = '';
    this.t = 0;
    this.water = this.terrain.deco === 'river' ? this.makeRiver() : null;
  }

  // ---- coordinates --------------------------------------------------------------------

  fit(view) {
    const w = view.w - (this.insetR || 0);
    const s = Math.min(w / WORLD_W, view.h / WORLD_H);
    this.scale = s;
    this.ox = (w - WORLD_W * s) / 2;
    this.oy = (view.h - WORLD_H * s) / 2;
  }

  toWorld(sx, sy) { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; }
  toScreen(x, y) { return { x: x * this.scale + this.ox, y: y * this.scale + this.oy }; }

  // ---- terrain ---------------------------------------------------------------------------

  makeRiver() {
    const r = rng(this.stage.id + ':river');
    const vertical = r() < 0.5;
    const pts = [];
    for (let i = -1; i <= 7; i++) {
      const t = i / 6;
      const wob = Math.sin(t * 5 + r() * 2) * 60;
      pts.push(vertical ? { x: 380 + r() * 440 + wob, y: -100 + t * (WORLD_H + 200) } : { x: -100 + t * (WORLD_W + 200), y: 300 + r() * 240 + wob });
    }
    const path = { pts, cum: [0] };
    for (let i = 1; i < pts.length; i++) path.cum.push(path.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    path.len = path.cum[path.cum.length - 1];
    return { path, width: 70 };
  }

  inWater(x, y) {
    return this.water && nearestOnPath(this.water.path, x, y).dist < this.water.width / 2;
  }

  buildCache(view) {
    const key = `${view.w}x${view.h}@${view.dpr}:${this.insetR || 0}`;
    if (this.cache && this.cacheKey === key) return;
    this.cacheKey = key;
    const c = this.cache || document.createElement('canvas');
    c.width = Math.round(view.w * view.dpr);
    c.height = Math.round(view.h * view.dpr);
    this.cache = c;
    const ctx = c.getContext('2d');
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = this.terrain.base;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.setTransform(view.dpr * this.scale, 0, 0, view.dpr * this.scale, view.dpr * this.ox, view.dpr * this.oy);
    this.paintTerrain(ctx);
  }

  paintTerrain(ctx) {
    const T = this.terrain;
    const r = rng(this.stage.id + ':terrain');
    const sim = this.sim;
    const X0 = -400, X1 = WORLD_W + 400, Y0 = -300, Y1 = WORLD_H + 300;
    for (let i = 0; i < 260; i++) {
      ctx.beginPath();
      ctx.ellipse(X0 + r() * (X1 - X0), Y0 + r() * (Y1 - Y0), 30 + r() * 90, 14 + r() * 40, r() * 3, 0, Math.PI * 2);
      ctx.fillStyle = T.patch[i % T.patch.length];
      ctx.globalAlpha = 0.35 + r() * 0.35;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // grass tufts / speckles
    for (let i = 0; i < 700; i++) {
      const x = X0 + r() * (X1 - X0), y = Y0 + r() * (Y1 - Y0);
      ctx.fillStyle = T.patch[(i + 1) % T.patch.length];
      ctx.fillRect(x, y, 2, 3);
    }
    if (this.water) this.paintWater(ctx);
    if (T.deco === 'castle') this.paintTiles(ctx, r);
    // roads
    const roads = sim.paths;
    for (const [w, col] of [[60, T.edge], [48, T.road]]) {
      for (const p of roads) {
        ctx.beginPath();
        p.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
    // pebbles, wheel ruts and bridges
    for (const p of roads) {
      for (let d = 0; d < p.len; d += 9) {
        const q = pathAt(p, d);
        const nx = -Math.sin(q.ang), ny = Math.cos(q.ang);
        if (this.inWater(q.x, q.y)) {
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.ang);
          ctx.fillStyle = d % 18 < 9 ? '#9a6a35' : '#86592b';
          ctx.fillRect(-5, -27, 9, 54);
          ctx.fillStyle = '#5c3a1a';
          ctx.fillRect(-5, -30, 9, 4);
          ctx.fillRect(-5, 26, 9, 4);
          ctx.restore();
          continue;
        }
        if (r() < 0.35) {
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          const o = (r() - 0.5) * 36;
          ctx.fillRect(q.x + nx * o, q.y + ny * o, 2.5, 2.5);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(q.x + nx * 10 - 1, q.y + ny * 10 - 1, 3, 3);
        ctx.fillRect(q.x - nx * 10 - 1, q.y - ny * 10 - 1, 3, 3);
      }
    }
    this.paintDeco(ctx, r);
    // enemy entrances: a dark banner where each road comes in
    const seen = new Set();
    for (const p of roads) {
      let d = 0;
      while (d < p.len) {
        const q = pathAt(p, d);
        if (q.x > 20 && q.x < WORLD_W - 20 && q.y > 20 && q.y < WORLD_H - 20) break;
        d += 5;
      }
      const q = pathAt(p, d + 16);
      const k = `${Math.round(q.x / 40)},${Math.round(q.y / 40)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.ang);
      ctx.fillStyle = 'rgba(200,40,30,0.85)';
      ctx.beginPath();
      ctx.moveTo(-8, -14); ctx.lineTo(10, 0); ctx.lineTo(-8, 14); ctx.lineTo(-2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  paintWater(ctx) {
    const p = this.water.path;
    for (const [w, col] of [[this.water.width + 14, '#6f8f4f'], [this.water.width, '#4f86c6'], [this.water.width * 0.55, '#6ba1dc']]) {
      ctx.beginPath();
      p.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let d = 20; d < p.len; d += 46) {
      const q = pathAt(p, d);
      ctx.beginPath();
      ctx.moveTo(q.x - 8, q.y);
      ctx.quadraticCurveTo(q.x, q.y - 4, q.x + 8, q.y);
      ctx.stroke();
    }
  }

  paintTiles(ctx, r) {
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let y = -300; y < WORLD_H + 300; y += 28) {
      for (let x = -400 + ((y / 28) % 2) * 20; x < WORLD_W + 400; x += 40) ctx.strokeRect(x, y, 40, 28);
    }
    void r;
  }

  clearOfRoads(x, y, pad) {
    const sim = this.sim;
    for (const p of sim.paths) if (nearestOnPath(p, x, y).dist < pad) return false;
    for (const s of sim.spots) if (Math.hypot(s.x - x, s.y - y) < 46) return false;
    const g = sim.layout.gate;
    if (Math.abs(x - g.x) < 120 && Math.abs(y - g.y) < 170) return false;
    return !this.inWater(x, y);
  }

  paintDeco(ctx, r) {
    const kind = this.terrain.deco;
    const items = [];
    const count = { plain: 60, forest: 170, mountain: 90, river: 60, castle: 40, snow: 90, desert: 50 }[kind];
    for (let i = 0; i < count * 3 && items.length < count; i++) {
      const x = -150 + r() * (WORLD_W + 300), y = -100 + r() * (WORLD_H + 200);
      if (!this.clearOfRoads(x, y, 46)) continue;
      items.push({ x, y, v: r(), s: 0.7 + r() * 0.6 });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (kind === 'forest' || (kind === 'plain' && it.v < 0.45) || (kind === 'river' && it.v < 0.4)) this.tree(ctx, it.x, it.y, it.s, it.v);
      else if (kind === 'snow') this.pine(ctx, it.x, it.y, it.s, true);
      else if (kind === 'mountain') (it.v < 0.6 ? this.rock(ctx, it.x, it.y, it.s * 1.4) : this.pine(ctx, it.x, it.y, it.s, false));
      else if (kind === 'desert') (it.v < 0.6 ? this.rock(ctx, it.x, it.y, it.s) : this.dune(ctx, it.x, it.y, it.s));
      else if (kind === 'castle') (it.v < 0.5 ? this.house(ctx, it.x, it.y, it.s) : this.tree(ctx, it.x, it.y, it.s * 0.8, it.v));
      else this.bush(ctx, it.x, it.y, it.s);
    }
  }

  tree(ctx, x, y, s, v) {
    shadow(ctx, x, y + 2, 16 * s);
    ctx.fillStyle = '#6b4520';
    ctx.fillRect(x - 2.5 * s, y - 12 * s, 5 * s, 13 * s);
    const greens = ['#3f7a33', '#4b8a3b', '#357029'];
    for (const [ox, oy, rr] of [[0, -24, 13], [-9, -17, 10], [9, -17, 10]]) {
      ctx.beginPath();
      ctx.arc(x + ox * s, y + oy * s, rr * s, 0, Math.PI * 2);
      ctx.fillStyle = greens[Math.floor(v * 3) % 3];
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x - 3 * s, y - 27 * s, 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
  }

  pine(ctx, x, y, s, snow) {
    shadow(ctx, x, y + 2, 12 * s);
    ctx.fillStyle = '#5c3a1a';
    ctx.fillRect(x - 2 * s, y - 8 * s, 4 * s, 9 * s);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x - (14 - i * 3) * s, y - (6 + i * 9) * s);
      ctx.lineTo(x, y - (24 + i * 9) * s);
      ctx.lineTo(x + (14 - i * 3) * s, y - (6 + i * 9) * s);
      ctx.closePath();
      ctx.fillStyle = '#2f5f3a';
      ctx.fill();
      if (snow) {
        ctx.beginPath();
        ctx.moveTo(x - (6 - i) * s, y - (19 + i * 9) * s);
        ctx.lineTo(x, y - (24 + i * 9) * s);
        ctx.lineTo(x + (6 - i) * s, y - (19 + i * 9) * s);
        ctx.closePath();
        ctx.fillStyle = '#f4f8fb';
        ctx.fill();
      }
    }
  }

  rock(ctx, x, y, s) {
    shadow(ctx, x, y + 1, 14 * s);
    ctx.beginPath();
    ctx.moveTo(x - 14 * s, y);
    ctx.lineTo(x - 9 * s, y - 12 * s);
    ctx.lineTo(x + 2 * s, y - 16 * s);
    ctx.lineTo(x + 12 * s, y - 7 * s);
    ctx.lineTo(x + 14 * s, y);
    ctx.closePath();
    ctx.fillStyle = '#8f877a';
    ctx.fill();
    ctx.strokeStyle = '#5f584d';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6 * s, y - 10 * s);
    ctx.lineTo(x + 2 * s, y - 14 * s);
    ctx.lineTo(x + 4 * s, y - 6 * s);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
  }

  bush(ctx, x, y, s) {
    shadow(ctx, x, y + 1, 10 * s);
    for (const [ox, oy, rr] of [[-5, -5, 6], [4, -6, 7], [0, -10, 6]]) {
      ctx.beginPath();
      ctx.arc(x + ox * s, y + oy * s, rr * s, 0, Math.PI * 2);
      ctx.fillStyle = '#4f8a3a';
      ctx.fill();
    }
    ctx.fillStyle = '#e8d24a';
    ctx.fillRect(x - 2, y - 9 * s, 2.5, 2.5);
  }

  dune(ctx, x, y, s) {
    ctx.beginPath();
    ctx.ellipse(x, y, 30 * s, 9 * s, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = '#e6cb93';
    ctx.fill();
  }

  house(ctx, x, y, s) {
    shadow(ctx, x, y + 2, 22 * s);
    ctx.fillStyle = '#d8cbb0';
    ctx.fillRect(x - 16 * s, y - 16 * s, 32 * s, 16 * s);
    ctx.strokeStyle = '#7a6a50';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - 16 * s, y - 16 * s, 32 * s, 16 * s);
    ctx.beginPath();
    ctx.moveTo(x - 22 * s, y - 15 * s);
    ctx.quadraticCurveTo(x, y - 34 * s, x + 22 * s, y - 15 * s);
    ctx.closePath();
    ctx.fillStyle = '#4a5a6a';
    ctx.fill();
    ctx.fillStyle = '#5c3a1a';
    ctx.fillRect(x - 4 * s, y - 10 * s, 8 * s, 10 * s);
  }

  // ---- events → effects ------------------------------------------------------------------

  absorb(events) {
    for (const e of events) {
      switch (e.k) {
        case 'die':
          this.fx.push({ k: 'corpse', x: e.x, y: e.y, type: e.type, t: 0, life: 0.9, face: Math.random() < 0.5 ? 1 : -1 });
          if (e.boss && e.food) this.text(e.x, e.y - 60, `+${e.food} 군량`, '#ffe08a', 20, 1.6);
          this.burst(e.x, e.y - 10, '#b33', 5);
          if (e.boss) { this.ring(e.x, e.y, 10, 140, '#ffd54f', 0.8); this.shake = 0.5; }
          break;
        case 'leak':
          this.text(e.x, e.y - 40, `성문 -${e.n}`, '#ff6b6b', 18, 1.2);
          this.shake = Math.max(this.shake, 0.35);
          this.fx.push({ k: 'flash', t: 0, life: 0.4 });
          break;
        case 'counter':
          this.text(e.x + (Math.random() - 0.5) * 10, e.y, COUNTER_MARK[e.lv], e.lv > 0 ? (e.lv > 1 ? '#ff7a00' : '#ffb020') : '#9fb6d8', e.lv > 1 ? 21 : e.lv > 0 ? 16 : 14, 0.7);
          break;
        case 'deploy':
          this.ring(e.x, e.y, 6, 40, '#fff6c8', 0.45);
          this.burst(e.x, e.y, '#d8c49a', 8);
          break;
        case 'promote':
          this.ring(e.x, e.y, 6, 50, '#ffd54f', 0.6);
          this.text(e.x, e.y - 50, `★${e.star}`, '#ffd54f', 22, 1.1);
          break;
        case 'retreat':
          this.text(e.x, e.y - 40, `+${e.refund} 군량`, '#ffe08a', 16, 1.1);
          this.burst(e.x, e.y, '#d8c49a', 8);
          break;
        case 'squadDown':
          this.burst(e.x, e.y - 8, '#666', 10);
          this.text(e.x, e.y - 40, '궤멸!', '#ff8a8a', 16, 1.1);
          break;
        case 'wallDown':
          this.burst(e.x, e.y - 8, '#8a5a2b', 12);
          break;
        case 'genSkill':
          this.text(e.x, e.y - 84, e.name + '!', '#ffe08a', 17, 1.1);
          break;
        case 'genStun':
          this.ring(e.x, e.y, 10, e.r, '#ffe14d', 0.5);
          break;
        case 'genSlow':
          this.ring(e.x, e.y, e.r * 0.3, e.r, '#9fd0ff', 0.7);
          break;
        case 'genFood':
          this.text(e.x, e.y - 60, '+' + e.amount + ' 군량', '#ffe08a', 15, 1.1);
          break;
        case 'genMove':
          this.burst(e.x, e.y, '#ffd54f', 8);
          break;
        case 'generalDown':
          this.burst(e.x, e.y - 8, '#ffd54f', 14);
          this.text(e.x, e.y - 50, e.name + ' 후퇴! 25초 뒤 다시 배치', '#ffb0a0', 16, 1.8);
          break;
        case 'lordDown':
          this.text(e.x, e.y - 60, '군주가 쓰러졌다! 12초 뒤 성문에서 돌아와요', '#ff8a8a', 16, 2);
          break;
        case 'revive':
          this.ring(e.x, e.y, 10, 60, '#fff', 0.6);
          break;
        case 'slash':
          this.fx.push({ k: 'slash', x: e.x, y: e.y - 12, t: 0, life: 0.18, a: Math.random() * 6 });
          break;
        case 'boom':
          this.ring(e.x, e.y, 6, e.r, e.big ? '#ffb347' : '#e0d2b0', e.big ? 0.6 : 0.35);
          this.burst(e.x, e.y, e.big ? '#ff8a30' : '#9a8a70', e.big ? 26 : 10);
          if (e.big) this.shake = Math.max(this.shake, 0.4);
          break;
        case 'fireHit':
          this.ring(e.x, e.y, 4, e.r, '#ff9a3d', 0.35);
          this.burst(e.x, e.y, '#ff7a20', 8);
          break;
        case 'whirl':
          this.ring(e.x, e.y, 20, e.r, '#e8f4ff', 0.4);
          this.ring(e.x, e.y, 10, e.r * 0.8, '#bfe0ff', 0.5);
          break;
        case 'healwave':
          this.ring(e.x, e.y, 10, e.r, '#7dff9a', 0.6);
          break;
        case 'heal':
          this.text(e.x, e.y - 30, '+', '#7dff9a', 18, 0.7);
          break;
        case 'foeheal':
          this.text(e.x, e.y - 30, '+', '#c9ff7d', 14, 0.6);
          break;
        case 'summon':
          this.ring(e.x, e.y, 10, 70, '#fff3b0', 0.5);
          break;
        case 'dash':
          this.fx.push({ k: 'dash', x: e.x, y: e.y, x2: e.x2, y2: e.y2, t: 0, life: 0.35 });
          break;
        case 'roar':
          this.ring(e.x, e.y, 20, 260, '#ff6b5a', 0.7);
          this.text(e.x, e.y - 70, '공격력 UP!', '#ffb0a0', 20, 1.2);
          break;
        case 'charge':
          this.ring(e.x, e.y, 10, e.r, '#ffd54f', 0.5);
          this.burst(e.x, e.y, '#c9a26a', 22);
          this.shake = Math.max(this.shake, 0.3);
          break;
        case 'guard':
          this.ring(e.x, e.y, 20, 260, '#8fd0ff', 0.7);
          this.text(e.x, e.y - 70, '철벽 방어!', '#bfe6ff', 20, 1.2);
          break;
        case 'wall':
          this.burst(e.x, e.y, '#8a5a2b', 10);
          break;
        case 'slam':
          this.burst(e.x, e.y - 10, '#fff', 10);
          break;
        case 'bossSkill':
          this.ring(e.x, e.y, 10, e.r || 90, e.skill === 'heal' ? '#c9ff7d' : '#ff5a5a', 0.6);
          break;
        case 'volleyHit':
          this.burst(e.x, e.y, '#ccc', 14);
          break;
        default:
          break;
      }
    }
  }

  text(x, y, s, color, size, life) {
    const half = Math.min(500, s.length * size * 0.45);
    x = Math.max(half + 10, Math.min(WORLD_W - half - 10, x));
    this.texts.push({ x, y: Math.max(90, y), s, color, size, t: 0, life });
  }
  ring(x, y, r0, r1, color, life) { this.fx.push({ k: 'ring', x, y, r0, r1, color, t: 0, life }); }
  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 90;
      this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, color, t: 0, life: 0.35 + Math.random() * 0.3 });
    }
  }

  // ---- frame ---------------------------------------------------------------------------------

  render(ctx, view, ui, dt) {
    this.t += dt;
    this.fit(view);
    this.buildCache(view);
    const sim = this.sim;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      this.shake -= dt;
      sx = (Math.random() - 0.5) * 10 * this.shake;
      sy = (Math.random() - 0.5) * 10 * this.shake;
    }
    ctx.drawImage(this.cache, sx * view.dpr, sy * view.dpr);
    ctx.setTransform(view.dpr * this.scale, 0, 0, view.dpr * this.scale, view.dpr * (this.ox + sx), view.dpr * (this.oy + sy));

    // gate
    const g = sim.layout.gate;
    drawGate(ctx, g.x, g.y, g.dir, this.us, sim.gate / GATE_HP);

    // zones under the units
    for (const z of sim.zones) this.drawZone(ctx, z);

    // melee squads guard the place they were put: a small banner marks it
    for (const q of sim.squads) {
      if (!TROOPS[q.type].melee) continue;
      if (Math.hypot(q.x - q.hx, q.y - q.hy) > 14) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.setLineDash([4, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(q.hx, q.hy);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      this.homeFlag(ctx, q.hx, q.hy, ui.squad === q);
    }

    // range circles for the selected squad / the lord being dragged
    if (ui.squad && sim.squads.includes(ui.squad)) {
      const q = ui.squad;
      this.rangeCircle(ctx, q.hx, q.hy, q.range, '#ffffff');
    }
    if (ui.preview) this.rangeCircle(ctx, ui.preview.x, ui.preview.y, ui.preview.r, '#ffe27a');
    if (ui.ghost && ui.ghost.x !== undefined) this.drawGhost(ctx, ui.ghost);

    // units, back to front
    const list = [];
    for (const s of sim.squads) list.push({ y: s.y, d: () => this.drawSquadUnit(ctx, s) });
    for (const f of sim.foes) list.push({ y: f.y, d: () => this.drawFoe(ctx, f) });
    for (const m of sim.militia) list.push({ y: m.y, d: () => this.drawMilitia(ctx, m) });
    for (const w of sim.walls) list.push({ y: w.y, d: () => { drawWall(ctx, w); this.hpBar(ctx, w.x, w.y - 32, 36, w.hp / w.maxHp, '#d8a25a'); } });
    if (!sim.lord.dead) list.push({ y: sim.lord.y, d: () => this.drawLordUnit(ctx, sim.lord, ui) });
    for (const c of this.fx) if (c.k === 'corpse') list.push({ y: c.y - 1, d: () => this.drawCorpse(ctx, c) });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.d();

    // lord drag line
    if (ui.lordDrag && !sim.lord.dead) {
      const L = sim.lord;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(L.x, L.y);
      ctx.lineTo(ui.lordDrag.x, ui.lordDrag.y);
      ctx.stroke();
      ctx.setLineDash([]);
      this.marker(ctx, ui.lordDrag.x, ui.lordDrag.y, '#fff');
    } else if (!sim.lord.dead && Math.hypot(sim.lord.hx - sim.lord.x, sim.lord.hy - sim.lord.y) > 12 && !sim.lord.engage) {
      this.marker(ctx, sim.lord.hx, sim.lord.hy, 'rgba(255,255,255,0.6)');
    }

    for (const p of sim.projectiles) this.drawProjectile(ctx, p);
    this.drawFx(ctx, dt);

    // targeting circle
    if (ui.aim) {
      ctx.beginPath();
      ctx.arc(ui.aim.x, ui.aim.y, ui.aim.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,220,120,0.18)';
      ctx.fill();
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // red flash when the gate is hit
    const flash = this.fx.find(f => f.k === 'flash');
    if (flash) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(255,0,0,${0.18 * (1 - flash.t / flash.life)})`;
      ctx.fillRect(0, 0, view.w * view.dpr, view.h * view.dpr);
    }
  }

  homeFlag(ctx, x, y, hl) {
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 9, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.strokeStyle = '#5c3a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 20);
    ctx.stroke();
    ctx.fillStyle = hl ? '#ffe27a' : this.us.color;
    ctx.fillRect(x, y - 20, 11, 7);
  }

  // Where a unit would go: see-through soldiers and the range (green = can place, red = cannot).
  drawGhost(ctx, g) {
    const ok = g.ok;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
    ctx.fillStyle = ok ? 'rgba(120, 255, 140, 0.13)' : 'rgba(255, 80, 60, 0.13)';
    ctx.fill();
    ctx.strokeStyle = ok ? 'rgba(140, 255, 160, 0.95)' : 'rgba(255, 90, 70, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash(g.melee ? [10, 7] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.globalAlpha = 0.55;
    if (g.gen) drawGeneral(ctx, g.type, g.x, g.y, this.us, { scale: UNIT, letter: g.letter, noBanner: true });
    else drawSquad(ctx, g.type, g.x, g.y, this.us, { scale: UNIT });
    ctx.restore();
    if (!ok) {
      ctx.strokeStyle = '#ff4a3a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(g.x - 12, g.y - 30); ctx.lineTo(g.x + 12, g.y - 6);
      ctx.moveTo(g.x + 12, g.y - 30); ctx.lineTo(g.x - 12, g.y - 6);
      ctx.stroke();
    }
  }

  rangeCircle(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  marker(ctx, x, y, color) {
    ctx.beginPath();
    ctx.ellipse(x, y, 14, 6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  hpBar(ctx, x, y, w, ratio, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, ratio)), 4);
  }

  stars(ctx, x, y, n) {
    if (n <= 1) return;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd54f';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    const s = '★'.repeat(n);
    ctx.strokeText(s, x, y);
    ctx.fillText(s, x, y);
  }

  drawSquadUnit(ctx, s) {
    const melee = TROOPS[s.type].melee;
    const atk = s.atkAnim / 0.3;
    let lunge = null;
    if (melee && s.atkAnim > 0 && s.target) {
      const dx = s.target.x - s.x, dy = s.target.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(d - 10, s.type === 'cavalry' ? 60 : 16) * Math.sin(atk * Math.PI);
      lunge = { x: dx / d * Math.max(0, k), y: dy / d * Math.max(0, k) };
    }
    if (s.moving) lunge = null;
    const x = s.x, y = s.y;
    if (s.gen) {
      const G = GENERALS[s.general];
      const lx = lunge ? lunge.x : 0, ly = lunge ? lunge.y : 0;
      drawGeneral(ctx, s.type, x + lx, y + ly, this.us, { face: s.face, atk, scale: UNIT, letter: G.letter, moving: s.moving, walk: s.walkT });
      const sp = GEN_SPECIALS[G.kind];
      if (sp.cd) {
        // special charging around the general's feet; full circle = ready
        const p = Math.max(0, Math.min(1, 1 - s.specT / sp.cd));
        ctx.beginPath();
        ctx.ellipse(x, y, 26 * UNIT, 11 * UNIT, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        ctx.strokeStyle = p >= 1 ? '#fff3a0' : 'rgba(255,200,60,0.9)';
        ctx.lineWidth = p >= 1 ? 3.5 : 2.5;
        ctx.stroke();
      }
      const gt = (s.type === 'cavalry' ? 52 : s.type === 'catapult' ? 40 : 50) * UNIT;
      this.hpBar(ctx, x, y - gt, 40, s.hp / s.maxHp, s.hp / s.maxHp > 0.35 ? '#ffd54f' : '#ff6b6b');
      ctx.font = '900 14px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(G.name, x, y - gt - 10);
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(G.name, x, y - gt - 10);
      return;
    }
    drawSquad(ctx, s.type, x, y, this.us, { face: s.face, atk, lunge, scale: UNIT, moving: s.moving, walk: s.walkT });
    const top = (s.type === 'cavalry' ? 46 : s.type === 'strategist' ? 40 : 34) * UNIT;
    this.hpBar(ctx, x, y - top, 30, s.hp / s.maxHp, s.hp / s.maxHp > 0.35 ? '#5be37d' : '#ff6b6b');
    this.stars(ctx, x, y - top - 9, s.star);
  }

  drawMilitia(ctx, m) {
    drawSoldier(ctx, 'infantry', m.x, m.y, { color: '#c8b07a', dark: '#6b5a3a' }, { face: m.face, atk: m.atkAnim / 0.3, hat: 'straw', scale: UNIT });
    this.hpBar(ctx, m.x, m.y - 40, 22, m.hp / m.maxHp, '#e0d080');
  }

  drawFoe(ctx, f) {
    const moving = f.state === 'walk' || f.state === 'raid' || f.state === 'return';
    const opt = {
      face: f.face, walk: f.walkT, moving: moving && f.stunT <= 0, atk: f.atkAnim / 0.3,
      headband: this.headband, scale: (f.boss ? 1.6 : 1) * UNIT,
    };
    if (f.boss) {
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, 26, 10, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,60,40,0.25)';
      ctx.fill();
      opt.horse = '#2b1d14';
    }
    drawSoldier(ctx, f.type, f.x, f.y, this.them, opt);
    if (f.burnT > 0) {
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(f.x + Math.sin(this.t * 20 + i * 3) * 5, f.y - 12 - i * 8 - Math.random() * 4, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = i ? 'rgba(255,200,60,0.85)' : 'rgba(255,90,20,0.85)';
        ctx.fill();
      }
    }
    if (f.stunT > 0) {
      ctx.fillStyle = '#ffe14d';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✦', f.x + Math.cos(this.t * 8) * 8, f.y - 34);
    }
    if (f.rallyT > 0) {
      ctx.strokeStyle = 'rgba(255,80,60,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, 12, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const top = (f.type === 'cavalry' ? 40 : 30) * (f.boss ? 1.6 : 1) * UNIT;
    if (f.boss) {
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(f.name, f.x, f.y - top - 14);
      ctx.fillStyle = '#ffd0c0';
      ctx.fillText(f.name, f.x, f.y - top - 14);
      this.hpBar(ctx, f.x, f.y - top - 4, 50, f.hp / f.maxHp, '#ff5a4a');
    } else if (f.hp < f.maxHp) {
      this.hpBar(ctx, f.x, f.y - top, 22, f.hp / f.maxHp, '#ff6b5a');
    }
  }

  drawLordUnit(ctx, L, ui) {
    if (L.dashT > 0) ctx.globalAlpha = 0.6;
    drawLord(ctx, L.key, L.x, L.y, {
      face: L.face, walk: this.t, moving: L.moving, atk: L.atkAnim / 0.3,
      ring: ui.lordDrag ? '#fff' : 'rgba(255,240,150,0.9)', scale: 1.15,
    });
    ctx.globalAlpha = 1;
    this.hpBar(ctx, L.x, L.y - 74, 40, L.hp / L.maxHp, '#7de3ff');
  }

  drawCorpse(ctx, c) {
    const a = 1 - c.t / c.life;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.face * Math.min(1, c.t * 6) * 1.3);
    drawSoldier(ctx, c.type, 0, 0, this.them, { alpha: a * 0.9, headband: this.headband, scale: UNIT });
    ctx.restore();
  }

  drawZone(ctx, z) {
    if (z.kind === 'fire') {
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,110,30,0.22)';
      ctx.fill();
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4 + this.t * 0.7, rr = (i % 5) / 5 * z.r * 0.9;
        const fx = z.x + Math.cos(a) * rr, fy = z.y + Math.sin(a) * rr * 0.6;
        const h = 8 + Math.sin(this.t * 12 + i) * 4;
        ctx.beginPath();
        ctx.moveTo(fx - 5, fy);
        ctx.quadraticCurveTo(fx, fy - h * 2.2, fx + 5, fy);
        ctx.fillStyle = i % 2 ? 'rgba(255,200,60,0.85)' : 'rgba(255,90,20,0.85)';
        ctx.fill();
      }
    } else if (z.kind === 'rain') {
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,40,20,0.9)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 16; i++) {
        const a = i * 1.7 + this.t * 3, rr = ((i * 37) % 100) / 100 * z.r;
        const ax = z.x + Math.cos(a) * rr, ay = z.y + Math.sin(a) * rr * 0.7;
        const fall = ((this.t * 4 + i * 0.13) % 1) * 40;
        ctx.beginPath();
        ctx.moveTo(ax - 4, ay - 40 + fall);
        ctx.lineTo(ax, ay - 30 + fall);
        ctx.stroke();
      }
    } else if (z.kind === 'volley') {
      const k = 1 - z.t / 1.1;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,40,40,${0.12 + 0.2 * k})`;
      ctx.fill();
      ctx.strokeStyle = '#ff4040';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawProjectile(ctx, p) {
    if (p.kind === 'arrow') {
      const a = p.ang || 0;
      const len = p.big ? 16 : 12;
      ctx.strokeStyle = p.side === 'p' ? '#3a2410' : '#2a1a0a';
      ctx.lineWidth = p.big ? 2.4 : 1.8;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.fillStyle = '#ddd';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'fire' || p.kind === 'bolt') {
      const c1 = p.kind === 'fire' ? 'rgba(255,170,40,0.95)' : 'rgba(190,120,255,0.95)';
      const c2 = p.kind === 'fire' ? 'rgba(255,80,20,0.35)' : 'rgba(140,60,255,0.3)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = c2;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = c1;
      ctx.fill();
    } else if (p.kind === 'stone') {
      shadow(ctx, p.x, p.y, 7);
      ctx.beginPath();
      ctx.arc(p.x, p.y - (p.h || 0), 6, 0, Math.PI * 2);
      ctx.fillStyle = '#8d8a80';
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  drawFx(ctx, dt) {
    for (const f of this.fx) {
      f.t += dt;
      const k = f.t / f.life;
      if (f.k === 'ring') {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * Math.min(1, k * 1.3), 0, Math.PI * 2);
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.k === 'spark') {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy += 260 * dt;
        ctx.fillStyle = f.color;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillRect(f.x - 2, f.y - 2, 4, 4);
        ctx.globalAlpha = 1;
      } else if (f.k === 'slash') {
        ctx.beginPath();
        ctx.arc(f.x, f.y, 12, f.a, f.a + 2.2);
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (f.k === 'dash') {
        ctx.strokeStyle = `rgba(200,230,255,${1 - k})`;
        ctx.lineWidth = 16 * (1 - k);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(f.x, f.y - 14);
        ctx.lineTo(f.x2, f.y2 - 14);
        ctx.stroke();
      }
    }
    this.fx = this.fx.filter(f => f.t < f.life);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      t.t += dt;
      const k = t.t / t.life;
      ctx.font = `900 ${t.size}px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      const y = t.y - k * 26;
      ctx.strokeText(t.s, t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.s, t.x, y);
    }
    ctx.globalAlpha = 1;
    this.texts = this.texts.filter(t => t.t < t.life);
  }
}

export { SKILLS, ITEMS };
