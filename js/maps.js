// Map data: places on the China campaign map, battle road layouts and the
// deployment spots generated along those roads.

// ---- Campaign map (1200 × 800 map units) -----------------------------------------

export const PLACES = {
  zhuo: { name: '탁군', x: 835, y: 175 },
  liaodong: { name: '요동', x: 1060, y: 110 },
  bailang: { name: '백랑산', x: 930, y: 98 },
  guangzong: { name: '광종', x: 848, y: 232 },
  ye: { name: '업', x: 798, y: 262 },
  beihai: { name: '북해', x: 990, y: 262 },
  baima: { name: '백마', x: 838, y: 292 },
  puyang: { name: '복양', x: 880, y: 306 },
  guandu: { name: '관도', x: 808, y: 322 },
  chenliu: { name: '진류', x: 848, y: 346 },
  luoyang: { name: '낙양', x: 676, y: 322 },
  hulao: { name: '호뢰관', x: 706, y: 322 },
  sishui: { name: '사수관', x: 752, y: 294 },
  xingyang: { name: '형양', x: 760, y: 340 },
  changan: { name: '장안', x: 545, y: 335 },
  tongguan: { name: '동관', x: 610, y: 330 },
  tianshui: { name: '천수', x: 420, y: 330 },
  qishan: { name: '기산', x: 448, y: 380 },
  wuzhang: { name: '오장원', x: 505, y: 362 },
  yingchuan: { name: '영천', x: 742, y: 382 },
  xuchang: { name: '허창', x: 792, y: 388 },
  xiaopei: { name: '소패', x: 905, y: 345 },
  xuzhou: { name: '서주', x: 948, y: 366 },
  xiapi: { name: '하비', x: 982, y: 392 },
  wancheng: { name: '완성', x: 698, y: 432 },
  bowang: { name: '박망파', x: 728, y: 458 },
  xinye: { name: '신야', x: 700, y: 478 },
  fancheng: { name: '번성', x: 726, y: 496 },
  xiangyang: { name: '양양', x: 692, y: 514 },
  changban: { name: '장판파', x: 708, y: 546 },
  jiangling: { name: '강릉', x: 672, y: 578 },
  maicheng: { name: '맥성', x: 636, y: 552 },
  yiling: { name: '이릉', x: 600, y: 566 },
  chibi: { name: '적벽', x: 762, y: 594 },
  jiangxia: { name: '강하', x: 796, y: 562 },
  changsha: { name: '장사', x: 745, y: 658 },
  chaisang: { name: '시상', x: 862, y: 590 },
  hefei: { name: '합비', x: 905, y: 472 },
  ruxu: { name: '유수구', x: 948, y: 506 },
  shiting: { name: '석정', x: 866, y: 524 },
  jianye: { name: '건업', x: 1000, y: 524 },
  qua: { name: '곡아', x: 1032, y: 552 },
  wujun: { name: '오군', x: 1062, y: 578 },
  kuaiji: { name: '회계', x: 1050, y: 628 },
  hanzhong: { name: '한중', x: 522, y: 430 },
  yangping: { name: '양평관', x: 488, y: 442 },
  dingjun: { name: '정군산', x: 466, y: 462 },
  jiameng: { name: '가맹관', x: 470, y: 502 },
  luocheng: { name: '낙성', x: 432, y: 560 },
  chengdu: { name: '성도', x: 400, y: 588 },
  nanman: { name: '남만', x: 380, y: 722 },
};

// Faint province labels drawn on the campaign map.
export const PROVINCES = [
  ['유주', 905, 150], ['기주', 820, 210], ['청주', 1000, 300], ['연주', 900, 330], ['서주', 985, 420],
  ['사례', 640, 290], ['예주', 800, 430], ['옹주', 480, 290], ['양주', 330, 230], ['익주', 380, 520],
  ['형주', 680, 620], ['양주', 960, 600], ['교주', 640, 760],
];

// Land outline, rivers and mountains for the campaign map.
export const LAND = [
  [-600, -400], [1180, -400], [1150, 95], [1135, 150], [1080, 175],
  [1040, 200], [1005, 215], [1050, 245], [1090, 275], [1060, 300], [1015, 320], [1010, 360],
  [1050, 410], [1070, 470], [1095, 520], [1110, 580], [1085, 640], [1040, 690], [960, 730],
  [880, 760], [780, 790], [600, 800], [440, 800], [300, 820], [100, 1000], [-600, 1300],
];
export const RIVERS = [
  { name: '황하', pts: [[330, 300], [420, 280], [480, 200], [540, 130], [620, 130], [650, 200], [640, 300], [700, 300], [780, 292], [860, 268], [930, 240], [1000, 222], [1030, 218]] },
  { name: '장강', pts: [[300, 610], [380, 620], [470, 600], [560, 578], [620, 566], [680, 590], [740, 600], [800, 576], [860, 572], [920, 548], [980, 532], [1040, 540], [1100, 548]] },
  { name: '한수', pts: [[470, 440], [540, 438], [620, 450], [690, 495], [730, 530], [780, 562]] },
];
export const MOUNTAINS = [
  [330, 380], [360, 440], [300, 480], [560, 400], [600, 420], [430, 420], [520, 500], [540, 640], [460, 680],
  [600, 690], [380, 260], [330, 170], [430, 130], [700, 200], [620, 470], [880, 660], [960, 680],
];

// ---- Battle layouts (1200 × 840 world units) ------------------------------------

export const WORLD_W = 1200;
export const WORLD_H = 840;

// Screen corners covered by the battle HUD; no deployment spots there.
export const HUD_ZONES = [
  { x0: 0, y0: 0, x1: WORLD_W, y1: 78 },
  { x0: 0, y0: 690, x1: 300, y1: WORLD_H },
  { x0: 860, y0: 660, x1: WORLD_W, y1: WORLD_H },
];

// Each path runs from an enemy entrance to our gate (the last point).
const BASE_LAYOUTS = {
  gentle: [
    [[-40, 430], [200, 430], [330, 300], [520, 300], [650, 460], [820, 520], [960, 400], [1130, 400]],
  ],
  scurve: [
    [[-40, 200], [250, 200], [380, 320], [380, 470], [520, 590], [780, 590], [880, 470], [880, 330], [1000, 250], [1130, 250]],
  ],
  ushape: [
    [[180, -40], [180, 300], [260, 540], [480, 620], [720, 620], [900, 540], [960, 380], [1010, 260], [1130, 260]],
  ],
  split: [
    [[-40, 430], [210, 430], [350, 260], [700, 260], [860, 430], [1130, 430]],
    [[-40, 430], [210, 430], [350, 600], [700, 600], [860, 430], [1130, 430]],
  ],
  zigzag: [
    [[-40, 170], [620, 170], [760, 300], [620, 430], [320, 430], [210, 540], [330, 640], [820, 640], [960, 520], [1130, 520]],
  ],
  twin: [
    [[-40, 200], [300, 200], [460, 340], [700, 420], [900, 420], [1000, 330], [1130, 330]],
    [[-40, 640], [300, 640], [460, 500], [700, 420], [900, 420], [1000, 330], [1130, 330]],
  ],
  snake: [
    [[-40, 160], [930, 160], [1030, 245], [930, 330], [260, 330], [160, 420], [260, 510], [930, 510], [1040, 580], [1130, 580]],
  ],
  cross: [
    [[520, -40], [520, 240], [640, 390], [880, 390], [1000, 300], [1130, 300]],
    [[-40, 560], [300, 560], [460, 470], [640, 390], [880, 390], [1000, 300], [1130, 300]],
  ],
  triple: [
    [[-40, 170], [300, 170], [520, 300], [760, 410], [1130, 410]],
    [[-40, 430], [400, 430], [560, 420], [760, 410], [1130, 410]],
    [[-40, 680], [300, 680], [520, 540], [760, 410], [1130, 410]],
  ],
};

// Stage number (1..20) → layout name and whether it is mirrored left↔right.
const STAGE_LAYOUTS = [
  ['gentle', 0], ['scurve', 0], ['ushape', 0], ['split', 0], ['zigzag', 0],
  ['twin', 0], ['snake', 0], ['cross', 0], ['scurve', 1], ['split', 1],
  ['ushape', 1], ['twin', 1], ['zigzag', 1], ['triple', 0], ['snake', 1],
  ['cross', 1], ['twin', 0], ['triple', 1], ['split', 0], ['triple', 0],
];

// Rounds the corners of a polyline (Chaikin) so roads look smooth.
function smooth(pts, rounds = 3) {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[i + 1];
      if (i > 0) out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      if (i < p.length - 2) out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

export function makePath(pts) {
  const p = smooth(pts).map(([x, y]) => ({ x, y }));
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
  return { pts: p, cum, len: cum[cum.length - 1] };
}

// Position and heading at distance d along a path.
export function pathAt(path, d) {
  const { pts, cum } = path;
  if (d <= 0) return { x: pts[0].x, y: pts[0].y, ang: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) };
  if (d >= path.len) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    return { x: b.x, y: b.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid;
  }
  const a = pts[lo], b = pts[hi];
  const t = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}

// Closest point on a path to (x, y): { x, y, d (distance along path), dist (to the point) }.
export function nearestOnPath(path, x, y) {
  let best = null;
  const { pts, cum } = path;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y;
    const l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2));
    const px = a.x + vx * t, py = a.y + vy * t;
    const dist = Math.hypot(x - px, y - py);
    if (!best || dist < best.dist) best = { x: px, y: py, d: cum[i] + t * Math.sqrt(l2), dist };
  }
  return best;
}

export function nearestOnPaths(paths, x, y) {
  let best = null;
  paths.forEach((p, i) => {
    const r = nearestOnPath(p, x, y);
    if (!best || r.dist < best.dist) best = { ...r, path: i };
  });
  return best;
}

const inHud = (x, y, pad = 0) => HUD_ZONES.some(z => x > z.x0 - pad && x < z.x1 + pad && y > z.y0 - pad && y < z.y1 + pad);

// Candidate spots on both sides of every road, kept where they fit.
function makeSpots(paths, maxSpots) {
  const gate = paths[0].pts[paths[0].pts.length - 1];
  const cands = [];
  for (const path of paths) {
    for (let d = 120; d < path.len - 90; d += 52) {
      const p = pathAt(path, d);
      const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
      for (const side of [-1, 1]) cands.push({ x: p.x + nx * 80 * side, y: p.y + ny * 80 * side });
    }
  }
  const ok = cands.filter(c =>
    c.x > 50 && c.x < WORLD_W - 50 && c.y > 70 && c.y < WORLD_H - 40 &&
    !inHud(c.x, c.y, 22) &&
    Math.hypot(c.x - gate.x, c.y - gate.y) > 110 &&
    paths.every(p => nearestOnPath(p, c.x, c.y).dist > 60));
  // How much road each candidate can reach: the busiest spots are kept first.
  for (const c of ok) {
    let cover = 0;
    for (const p of paths) {
      for (let d = 0; d < p.len; d += 20) {
        const q = pathAt(p, d);
        if (Math.hypot(q.x - c.x, q.y - c.y) < 190) cover += 20;
      }
    }
    c.cover = cover;
  }
  ok.sort((a, b) => b.cover - a.cover);
  const spots = [];
  for (const c of ok) {
    if (spots.length >= maxSpots) break;
    if (spots.every(s => Math.hypot(s.x - c.x, s.y - c.y) > 96)) spots.push(c);
  }
  return spots.map((s, i) => {
    const g = nearestOnPaths(paths, s.x, s.y);
    return { id: i, x: Math.round(s.x), y: Math.round(s.y), guard: { x: g.x, y: g.y, path: g.path, d: g.d } };
  });
}

const layoutCache = new Map();

// Battle map for stage n (1..20): { name, paths, spots, gate, entrances }.
export function stageLayout(n) {
  if (layoutCache.has(n)) return layoutCache.get(n);
  const [name, mirror] = STAGE_LAYOUTS[(n - 1) % STAGE_LAYOUTS.length];
  const raw = BASE_LAYOUTS[name].map(pts => pts.map(([x, y]) => [mirror ? WORLD_W - x : x, y]));
  const paths = raw.map(makePath);
  const maxSpots = Math.min(18, 9 + Math.floor(n / 2));
  const spots = makeSpots(paths, maxSpots);
  const g = paths[0].pts[paths[0].pts.length - 1];
  const layout = {
    name,
    mirror: !!mirror,
    paths,
    spots,
    gate: { x: g.x, y: g.y, dir: mirror ? -1 : 1 },
    entrances: paths.map(p => p.pts[0]),
  };
  layoutCache.set(n, layout);
  return layout;
}
