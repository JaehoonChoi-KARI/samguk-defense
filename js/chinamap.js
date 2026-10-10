// The campaign map of China: sea, land, rivers, mountains, provinces and the route
// of the chosen lord's story. Map units are 1200 × 800.

import { LAND, RIVERS, MOUNTAINS, PROVINCES, PLACES } from './maps.js';

export const MAP_W = 1200;
export const MAP_H = 800;

// The part of China the stories happen in (map units).
const VIEW = { x0: 300, x1: 1120, y0: 60, y1: 770 };

// Fit that part into the screen rectangle (left, top, w, h): scale and offsets in CSS px.
export function mapFit(left, top, w, h) {
  const vw = VIEW.x1 - VIEW.x0, vh = VIEW.y1 - VIEW.y0;
  const s = Math.min(w / vw, h / vh);
  return { s, ox: left + (w - vw * s) / 2 - VIEW.x0 * s, oy: top + (h - vh * s) / 2 - VIEW.y0 * s };
}

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function smoothLine(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const l = pts[pts.length - 1];
  ctx.lineTo(l[0], l[1]);
}

// route: [{ loc, state: 'done' | 'next' | 'locked' }] in story order
export function drawChinaMap(canvas, w, h, dpr, fit, route, color) {
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // sea
  const sea = ctx.createLinearGradient(0, 0, w, h);
  sea.addColorStop(0, '#2c4a5e');
  sea.addColorStop(1, '#1d3446');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr * fit.s, 0, 0, dpr * fit.s, dpr * fit.ox, dpr * fit.oy);

  // waves on the sea
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let y = -200; y < MAP_H + 200; y += 34) {
    for (let x = -400 + (y % 68); x < MAP_W + 400; x += 90) {
      ctx.beginPath();
      ctx.arc(x, y, 12, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  }

  // land (parchment) with a soft coast
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 30;
  poly(ctx, LAND);
  const land = ctx.createRadialGradient(700, 400, 50, 700, 400, 700);
  land.addColorStop(0, '#efdcae');
  land.addColorStop(1, '#d6bd85');
  ctx.fillStyle = land;
  ctx.fill();
  ctx.restore();
  poly(ctx, LAND);
  ctx.strokeStyle = '#8c6d3a';
  ctx.lineWidth = 3;
  ctx.stroke();

  // great wall
  ctx.strokeStyle = 'rgba(120,90,60,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  smoothLine(ctx, [[300, 140], [420, 110], [560, 90], [700, 100], [820, 120], [940, 120], [1050, 140]]);
  ctx.stroke();
  ctx.setLineDash([]);

  // mountains
  for (const [x, y] of MOUNTAINS) {
    for (const [ox, s] of [[-14, 0.8], [0, 1], [14, 0.75]]) {
      ctx.beginPath();
      ctx.moveTo(x + ox - 16 * s, y);
      ctx.lineTo(x + ox, y - 22 * s);
      ctx.lineTo(x + ox + 16 * s, y);
      ctx.closePath();
      ctx.fillStyle = '#b39a68';
      ctx.fill();
      ctx.strokeStyle = '#7d6640';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + ox - 5 * s, y - 15 * s);
      ctx.lineTo(x + ox, y - 22 * s);
      ctx.lineTo(x + ox + 5 * s, y - 15 * s);
      ctx.fillStyle = '#f4ead2';
      ctx.fill();
    }
  }

  // rivers
  for (const r of RIVERS) {
    smoothLine(ctx, r.pts);
    ctx.strokeStyle = '#5c8fbf';
    ctx.lineWidth = r.name === '한수' ? 4 : 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    ctx.font = 'bold 15px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.fillStyle = 'rgba(40,80,130,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText(r.name, mid[0] + 20, mid[1] + 22);
  }

  // provinces
  ctx.font = '900 24px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(110,80,40,0.22)';
  for (const [name, x, y] of PROVINCES) ctx.fillText(name, x, y);

  // route of this story
  const pts = route.map(r => PLACES[r.loc]).filter(Boolean);
  for (let i = 1; i < route.length; i++) {
    const a = PLACES[route[i - 1].loc], b = PLACES[route[i].loc];
    if (!a || !b) continue;
    const st = route[i].state;
    if (st === 'locked') continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.15, my = (a.y + b.y) / 2 - (b.x - a.x) * 0.15;
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    ctx.strokeStyle = st === 'done' ? color : 'rgba(180,30,20,0.85)';
    ctx.lineWidth = st === 'done' ? 4 : 3;
    ctx.setLineDash(st === 'done' ? [] : [8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  void pts;
}
