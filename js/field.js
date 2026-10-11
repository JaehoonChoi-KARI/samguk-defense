// The ground of a battle: a plate of build cells along the roads (units snap onto them like
// bricks on a baseplate), special cells (hill, forest, choke) and the river on river maps.
// Everything is seeded by the stage, so a stage always has the same field.

import { WORLD_W, WORLD_H, HUD_ZONES, nearestOnPath, nearestOnPaths, pathAt } from './maps.js';
import { rng } from './waves.js';

export const CELL = 48;
export const COLS = Math.floor(WORLD_W / CELL);
export const ROWS = Math.floor(WORLD_H / CELL);
const ROAD_MIN = 44; // cell centre to road centre line
const ROAD_MAX = 170;

export const cellKey = (c, r) => c * 100 + r;
export const sizeOf = type => (type === 'catapult' ? 2 : 1); // catapults take 2×2 cells

// Anchor (top-left cell) of a footprint whose centre is nearest to (x, y).
export function anchorAt(x, y, size) {
  if (size === 1) return { c: Math.floor(x / CELL), r: Math.floor(y / CELL) };
  return { c: Math.round(x / CELL) - 1, r: Math.round(y / CELL) - 1 };
}

export const footCenter = (c, r, size) => ({ x: (c + size / 2) * CELL, y: (r + size / 2) * CELL });

export function footCells(c, r, size) {
  const out = [];
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) out.push(cellKey(c + i, r + j));
  return out;
}

// The four cells beside a footprint.
export function footNeighbours(c, r, size) {
  const out = [];
  for (let i = 0; i < size; i++) {
    out.push(cellKey(c + i, r - 1), cellKey(c + i, r + size));
    out.push(cellKey(c - 1, r + i), cellKey(c + size, r + i));
  }
  return out;
}

function makeRiver(stage) {
  const r = rng(stage.id + ':river');
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

export const inWater = (water, x, y, pad = 0) => !!water && nearestOnPath(water.path, x, y).dist < water.width / 2 + pad;

// How many special cells each kind of country gets: [hill clusters, forest clusters, choke points].
const SPECIALS = {
  plain: [2, 2, 2], forest: [1, 4, 2], mountain: [4, 1, 3], river: [1, 2, 3],
  castle: [2, 0, 3], snow: [2, 2, 2], desert: [3, 0, 2],
};

const cache = new Map();

// { cells: Map(key → { c, r, x, y, kind, road }), list, water, counts }
export function stageField(stage, layout) {
  if (cache.has(stage.id)) return cache.get(stage.id);
  const paths = layout.paths;
  const water = stage.terrain === 'river' ? makeRiver(stage) : null;
  const gate = layout.gate;
  const cells = new Map();
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const x = (c + 0.5) * CELL, y = (r + 0.5) * CELL;
      const x0 = c * CELL, y0 = r * CELL, x1 = x0 + CELL, y1 = y0 + CELL;
      if (HUD_ZONES.some(z => x1 > z.x0 && x0 < z.x1 && y1 > z.y0 && y0 < z.y1)) continue;
      if (Math.hypot(x - gate.x, y - gate.y) < 110) continue;
      if (inWater(water, x, y, 14)) continue;
      const near = nearestOnPaths(paths, x, y);
      if (near.dist < ROAD_MIN || near.dist > ROAD_MAX) continue;
      cells.set(cellKey(c, r), { c, r, x, y, kind: 'plain', road: near.dist, path: near.path, d: near.d });
    }
  }
  const r = rng(stage.id + ':field');
  const [hills, forests, chokes] = SPECIALS[stage.terrain] || SPECIALS.plain;
  const special = [];
  const farFromSpecial = (cell, gap) => special.every(s => Math.hypot(s.x - cell.x, s.y - cell.y) > gap);

  // choke points: the two cells flanking the road at a few places along it
  const chokeAt = [];
  for (let k = 0; k < chokes; k++) {
    const p = paths[k % paths.length];
    const f = 0.32 + (0.4 * (k + r() * 0.5)) / Math.max(1, chokes);
    chokeAt.push({ p, d: p.len * f });
  }
  for (const { p, d } of chokeAt) {
    const q = pathAt(p, d);
    const nx = -Math.sin(q.ang), ny = Math.cos(q.ang);
    for (const side of [-1, 1]) {
      let best = null, bd = 90;
      for (const cell of cells.values()) {
        if (cell.kind !== 'plain' || cell.road > 80) continue;
        const dx = cell.x - q.x, dy = cell.y - q.y;
        if ((dx * nx + dy * ny) * side <= 0) continue;
        const dd = Math.hypot(dx, dy);
        if (dd < bd) { bd = dd; best = cell; }
      }
      if (best) { best.kind = 'choke'; special.push(best); }
    }
  }

  // hills and woods: small clusters of 3-4 cells
  const grow = (kind, count, ok) => {
    for (let k = 0; k < count; k++) {
      const seeds = [...cells.values()].filter(cell => cell.kind === 'plain' && ok(cell) && farFromSpecial(cell, CELL * 2.6));
      if (!seeds.length) return;
      const seed = seeds[Math.floor(r() * seeds.length)];
      const group = [seed];
      seed.kind = kind;
      const size = 3 + (r() < 0.5 ? 1 : 0);
      while (group.length < size) {
        const next = [];
        for (const g of group) {
          for (const key of [cellKey(g.c + 1, g.r), cellKey(g.c - 1, g.r), cellKey(g.c, g.r + 1), cellKey(g.c, g.r - 1)]) {
            const n = cells.get(key);
            if (n && n.kind === 'plain' && !next.includes(n)) next.push(n);
          }
        }
        if (!next.length) break;
        const n = next[Math.floor(r() * next.length)];
        n.kind = kind;
        group.push(n);
      }
      special.push(...group);
    }
  };
  grow('hill', hills, cell => cell.road > 70);
  grow('forest', forests, () => true);

  const list = [...cells.values()];
  const counts = { hill: 0, forest: 0, choke: 0 };
  for (const cell of list) if (counts[cell.kind] !== undefined) counts[cell.kind]++;
  const field = { cells, list, water, counts };
  cache.set(stage.id, field);
  return field;
}
