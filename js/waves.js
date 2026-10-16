// Enemy waves for a stage, generated from the story's troop mix. Seeded by the stage id,
// so the same stage always brings the same army (the scouting report stays true).

import { TROOP_KEYS, HORDE, crowdMult, waveCap } from './data.js';

export function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  s = s || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// How much of the wave budget one soldier uses up.
const WEIGHT = { infantry: 1, spear: 1, archer: 1, cavalry: 1.5, strategist: 1.6, catapult: 3 };
// Seconds between soldiers of one group.
const GAP = { infantry: 1.0, spear: 1.0, archer: 1.1, cavalry: 0.8, strategist: 1.4, catapult: 2.6 };

export const waveCount = n => 6 + Math.floor((n - 1) / 8); // 6..8
// The army grows through the story (6..12 waves' worth of soldiers); later stages pack it into
// fewer, bigger waves that march in tighter, so a battle stays within about eight minutes.
const armyWaves = n => 1.5 * (4 + Math.floor((n - 1) / 4));
export const wavePack = n => armyWaves(n) / waveCount(n); // ≥ 1
// Exponents on wavePack: how much bigger a wave gets and how much tighter it marches.
export const WAVE_TUNE = { size: 0.6, tight: 1 };
export const waveBudget = (n, i, w) => (5 + 1.0 * n) * wavePack(n) ** WAVE_TUNE.size * (0.75 + 0.55 * (w > 1 ? i / (w - 1) : 1));

function pick(r, weights) {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [k, w] of weights) { x -= w; if (x <= 0) return k; }
  return weights[weights.length - 1][0];
}

// Returns [{ groups: [{ type, count, path, gap, at }], boss: bool }]
// `at` = seconds after the wave starts when the group begins marching. crowd (from the
// difficulty) brings more soldiers in bigger, a little denser groups.
// The waves of stage n on difficulty D (its crowd and its cap on the biggest waves).
export const stageWaves = (stage, n, pathCount, D) => buildWaves(stage, n, pathCount, crowdMult(D, n), waveCap(D, n));

export function buildWaves(stage, n, pathCount, crowd = 1, cap = Infinity) {
  const r = rng(stage.id);
  const mix = Object.entries(stage.mix || { infantry: 1 }).filter(([k, w]) => TROOP_KEYS.includes(k) && w > 0);
  const W = waveCount(n);
  const tight = wavePack(n) ** WAVE_TUNE.tight;
  const waves = [];
  for (let i = 0; i < W; i++) {
    let budget = waveBudget(n, i, W) * HORDE * crowd;
    // Each wave leans on one main type so the next-wave preview matters.
    const main = i === 0 ? mix.slice().sort((a, b) => b[1] - a[1])[0][0] : pick(r, mix);
    const counts = {};
    while (budget > 0.5) {
      const t = r() < 0.55 ? main : pick(r, mix);
      counts[t] = (counts[t] || 0) + 1;
      budget -= WEIGHT[t];
    }

    const groups = [];
    let at = 0;
    const order = Object.keys(counts).sort((a, b) => (a === main ? -1 : b === main ? 1 : 0));
    let gi = 0;
    for (const t of order) {
      let left = counts[t];
      while (left > 0) {
        // a group is HORDE times bigger and marches HORDE times closer, so a wave takes as long
        const size = Math.min(left, Math.round((t === 'catapult' ? 2 : 3 + Math.floor(r() * 4)) * HORDE * crowd));
        const path = pathCount > 1 ? (gi + i) % pathCount : 0;
        const gap = GAP[t] / HORDE / Math.sqrt(crowd);
        groups.push({ type: t, count: size, path, gap: gap / tight, at: Math.round(at * 10) / 10 });
        at += (size * gap * 0.7 + 1.5 + r() * 1.5) / tight;
        left -= size;
        gi++;
      }
    }
    // a stage can thin out a type (stage.fewer = { cavalry: 0.5 }): each group of it is smaller and
    // spread over the same time, so they come fewer and further apart; the waves stay the same
    for (const g of groups) {
      const k = stage.fewer?.[g.type];
      if (k) { g.count = Math.max(1, Math.round(g.count * k)); g.gap /= k; }
    }
    // over the cap: fewer soldiers, each one tougher (boost), marching just as long
    const size = groups.reduce((a, g) => a + g.count, 0);
    let boost = 1;
    if (size > cap) {
      for (const g of groups) g.count = Math.max(1, Math.round(g.count * cap / size));
      boost = size / groups.reduce((a, g) => a + g.count, 0);
      for (const g of groups) g.gap *= boost;
    }
    waves.push({ groups, boss: i === W - 1, length: at, boost });
  }
  return waves;
}

// Soldiers per type in one wave, for the preview panel.
export function waveSummary(wave) {
  const out = {};
  for (const g of wave.groups) out[g.type] = (out[g.type] || 0) + g.count;
  return out;
}

// Soldiers per type over the whole stage, for the scouting report.
export function stageSummary(waves) {
  const out = {};
  for (const w of waves) for (const [t, c] of Object.entries(waveSummary(w))) out[t] = (out[t] || 0) + c;
  return out;
}
