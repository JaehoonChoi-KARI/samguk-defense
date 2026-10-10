// Little soldiers, lords, spots and the gate, drawn with canvas shapes.
// Every figure is drawn facing right around its feet at (0, 0); `face` = -1 mirrors it.

const SKIN = '#f1c48f';
const SKIN_LINE = '#6b4422';
const WOOD = '#8a5a2b';
const WOOD_DARK = '#5c3a1a';
const STEEL = '#d9dde4';
const STEEL_DARK = '#7d8590';

function circle(ctx, x, y, r, fill, stroke, lw = 1.4) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function line(ctx, x1, y1, x2, y2, color, w = 2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.stroke();
}

export function shadow(ctx, x, y, rx, ry = rx * 0.35) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();
}

// Head with a helmet / headband / hat.
function head(ctx, x, y, r, col, opt) {
  circle(ctx, x, y, r, SKIN, SKIN_LINE, 1.1);
  ctx.beginPath();
  if (opt.hat === 'scholar') {
    // black scholar's cap
    ctx.fillStyle = '#222';
    ctx.fillRect(x - r * 0.8, y - r * 1.75, r * 1.6, r * 0.95);
    ctx.fillRect(x - r * 1.05, y - r * 0.95, r * 2.1, r * 0.35);
  } else if (opt.headband) {
    ctx.fillStyle = opt.headband;
    ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 0.5);
    line(ctx, x - r, y - r * 0.3, x - r - 4, y + r * 0.3, opt.headband, 1.6);
  } else if (opt.hat === 'straw') {
    ctx.moveTo(x - r * 1.6, y - r * 0.35);
    ctx.lineTo(x, y - r * 1.5);
    ctx.lineTo(x + r * 1.6, y - r * 0.35);
    ctx.closePath();
    ctx.fillStyle = '#d8b25a';
    ctx.fill();
    ctx.strokeStyle = '#8a6a2a';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    // helmet
    ctx.arc(x, y - r * 0.15, r * 1.05, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fillStyle = col.dark;
    ctx.fill();
    circle(ctx, x, y - r * 1.25, r * 0.28, col.color);
  }
}

function legs(ctx, walk, col) {
  const s = Math.sin(walk * 9) * 2.6;
  line(ctx, -2, -6, -2 - s, 0, col.dark, 2.4);
  line(ctx, 2, -6, 2 + s, 0, col.dark, 2.4);
}

function torso(ctx, col, long = false) {
  ctx.beginPath();
  if (long) {
    ctx.moveTo(-5, -15); ctx.lineTo(5, -15); ctx.lineTo(7, -2); ctx.lineTo(-7, -2);
  } else {
    ctx.moveTo(-5, -15); ctx.lineTo(5, -15); ctx.lineTo(6, -6); ctx.lineTo(-6, -6);
  }
  ctx.closePath();
  ctx.fillStyle = col.color;
  ctx.fill();
  ctx.strokeStyle = col.dark;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

// One soldier of the given troop type. opt: { face, walk, atk (0..1), scale, headband, alpha }
export function drawSoldier(ctx, type, x, y, col, opt = {}) {
  const sc = opt.scale || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc * (opt.face || 1), sc);
  if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha;
  const walk = opt.walk || 0;
  const atk = opt.atk || 0; // 0..1, 1 = start of a swing
  const bob = opt.moving ? Math.abs(Math.sin(walk * 9)) * 1.2 : 0;
  if (type === 'cavalry') drawRider(ctx, col, walk, atk, opt);
  else if (type === 'catapult') drawCatapult(ctx, col, atk, opt);
  else {
    shadow(ctx, 0, 0, 8);
    ctx.translate(0, -bob);
    if (opt.moving) legs(ctx, walk, col);
    else { line(ctx, -2, -6, -2.5, 0, col.dark, 2.4); line(ctx, 2, -6, 2.5, 0, col.dark, 2.4); }
    if (type === 'archer') {
      // quiver on the back
      ctx.fillStyle = WOOD;
      ctx.fillRect(-8, -17, 3.5, 9);
      line(ctx, -7, -17, -8, -20, '#e8e0c8', 1.2);
    }
    torso(ctx, col, type === 'strategist');
    head(ctx, 0, -19.5, 4.6, col, { ...opt, hat: type === 'strategist' ? 'scholar' : opt.hat });
    if (type === 'infantry') {
      const a = -0.9 + atk * 2.2;
      ctx.save();
      ctx.translate(4, -12);
      ctx.rotate(a);
      line(ctx, 0, 0, 0, -12, STEEL, 2.2);
      line(ctx, -2.5, -1, 2.5, -1, WOOD_DARK, 1.6);
      ctx.restore();
      circle(ctx, -4, -11, 4.8, WOOD, col.dark, 1.4);
      circle(ctx, -4, -11, 1.6, col.color);
    } else if (type === 'spear') {
      const thrust = atk * 6;
      ctx.save();
      ctx.translate(thrust * 0.6, 0);
      line(ctx, -6, -4, 15, -26, WOOD, 2);
      ctx.beginPath();
      ctx.moveTo(15, -26); ctx.lineTo(19.5, -32); ctx.lineTo(13, -29);
      ctx.closePath();
      ctx.fillStyle = STEEL;
      ctx.fill();
      ctx.restore();
    } else if (type === 'archer') {
      ctx.beginPath();
      ctx.arc(5, -13, 8, -1.25, 1.25);
      ctx.strokeStyle = WOOD_DARK;
      ctx.lineWidth = 2;
      ctx.stroke();
      const pull = atk > 0.5 ? 0 : 3;
      line(ctx, 5 + Math.cos(-1.25) * 8, -13 + Math.sin(-1.25) * 8, 5 - pull, -13, '#eee', 0.8);
      line(ctx, 5 - pull, -13, 5 + Math.cos(1.25) * 8, -13 + Math.sin(1.25) * 8, '#eee', 0.8);
    } else if (type === 'strategist') {
      // feather fan
      ctx.save();
      ctx.translate(6, -12);
      ctx.rotate(-0.5 - atk * 1.2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, -2, 6, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.closePath();
      ctx.fillStyle = '#fbfbf2';
      ctx.fill();
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    } else if (type === 'militia') {
      line(ctx, -4, -4, 12, -20, WOOD, 2.2); // a farm pole
    }
  }
  ctx.restore();
}

function drawRider(ctx, col, walk, atk, opt) {
  const gallop = opt.moving ? Math.sin(walk * 12) : 0;
  shadow(ctx, 0, 0, 14);
  ctx.save();
  ctx.translate(0, -Math.abs(gallop) * 1.5);
  // legs
  const lg = gallop * 3;
  line(ctx, -8, -8, -9 - lg, 0, '#5a3a20', 2.4);
  line(ctx, -5, -8, -4 + lg, 0, '#5a3a20', 2.4);
  line(ctx, 6, -8, 5 + lg, 0, '#5a3a20', 2.4);
  line(ctx, 9, -8, 10 - lg, 0, '#5a3a20', 2.4);
  // body, neck, head
  ctx.beginPath();
  ctx.ellipse(0, -11, 12, 5.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = opt.horse || '#8b5a2b';
  ctx.fill();
  ctx.strokeStyle = '#4a2c12';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8, -14); ctx.lineTo(14, -22); ctx.lineTo(18, -20); ctx.lineTo(12, -11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(17.5, -20.5, 4, 2.4, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  line(ctx, -12, -12, -16, -6, '#3a2410', 2); // tail
  // saddle cloth in army colour
  ctx.fillStyle = col.color;
  ctx.fillRect(-5, -16, 9, 6);
  // rider
  line(ctx, -1, -15, 1, -9, col.dark, 2.2);
  ctx.beginPath();
  ctx.moveTo(-4, -26); ctx.lineTo(4, -26); ctx.lineTo(4, -16); ctx.lineTo(-4, -16);
  ctx.closePath();
  ctx.fillStyle = col.color;
  ctx.fill();
  ctx.strokeStyle = col.dark;
  ctx.stroke();
  head(ctx, 0, -30, 4.2, col, opt);
  // lance
  const k = atk * 5;
  line(ctx, -6 + k, -20, 22 + k, -27, WOOD, 1.8);
  ctx.beginPath();
  ctx.moveTo(22 + k, -27); ctx.lineTo(28 + k, -29); ctx.lineTo(22 + k, -30);
  ctx.closePath();
  ctx.fillStyle = STEEL;
  ctx.fill();
  ctx.restore();
}

function drawCatapult(ctx, col, atk, opt) {
  shadow(ctx, 0, 1, 18, 5);
  ctx.fillStyle = WOOD;
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 1.4;
  ctx.fillRect(-15, -9, 30, 6);
  ctx.strokeRect(-15, -9, 30, 6);
  line(ctx, -6, -9, 0, -22, WOOD_DARK, 2.4);
  line(ctx, 6, -9, 0, -22, WOOD_DARK, 2.4);
  // throwing arm: back when loaded, forward right after a shot
  const a = -2.3 + atk * 1.7;
  const ax = Math.cos(a) * 22, ay = Math.sin(a) * 22;
  line(ctx, 0, -20, ax, -20 + ay, '#a8743c', 2.6);
  circle(ctx, 0, -20, 2.2, WOOD_DARK);
  if (atk < 0.4) circle(ctx, ax, -20 + ay, 3.4, '#8d8a80', '#555', 1);
  for (const wx of [-10, 10]) {
    circle(ctx, wx, -2, 4.5, '#6b4520', WOOD_DARK, 1.4);
    circle(ctx, wx, -2, 1.3, '#3a2410');
  }
  // banner in army colour
  line(ctx, 13, -9, 13, -26, WOOD_DARK, 1.4);
  ctx.fillStyle = col.color;
  ctx.fillRect(13, -26, 7, 6);
  if (!opt.noCrew) {
    ctx.save();
    ctx.translate(-20, 2);
    ctx.scale(0.8, 0.8);
    line(ctx, -2, -6, -2.5, 0, col.dark, 2.4);
    line(ctx, 2, -6, 2.5, 0, col.dark, 2.4);
    torso(ctx, col);
    head(ctx, 0, -19.5, 4.6, col, opt);
    ctx.restore();
  }
}

// Three soldiers standing together (one for siege engines and strategists).
export const SQUAD_OFFSETS = {
  melee: [[-9, -5], [9, -5], [0, 7]],
  archer: [[-10, -4], [10, -4], [0, 8]],
  strategist: [[0, 4]],
  catapult: [[2, 6]],
};

export function drawSquad(ctx, type, x, y, col, opt = {}) {
  const offs = type === 'archer' ? SQUAD_OFFSETS.archer
    : type === 'strategist' ? SQUAD_OFFSETS.strategist
      : type === 'catapult' ? SQUAD_OFFSETS.catapult : SQUAD_OFFSETS.melee;
  const sc = type === 'strategist' ? 1.25 : type === 'cavalry' ? 0.85 : 1;
  const order = offs.map((o, i) => [o, i]).sort((a, b) => a[0][1] - b[0][1]);
  for (const [[ox, oy], i] of order) {
    let lx = 0, ly = 0;
    if (opt.lunge && i === 0) { lx = opt.lunge.x; ly = opt.lunge.y; }
    drawSoldier(ctx, type, x + ox + lx, y + oy + ly, col, { ...opt, scale: sc * (opt.scale || 1), walk: (opt.walk || 0) + i * 0.7 });
  }
}

// ---- lords ---------------------------------------------------------------------------

const LORD_LOOK = {
  liubei: { robe: '#2f9e44', dark: '#1d6b2c', trim: '#f4d35e', hat: 'crown', weapon: 'twin', letter: '유' },
  caocao: { robe: '#2f6fd6', dark: '#1d4793', trim: '#e8e8f0', hat: 'helm', weapon: 'sword', letter: '조', cape: '#222833' },
  sunquan: { robe: '#d6402f', dark: '#922a1f', trim: '#f4d35e', hat: 'crown', weapon: 'bow', letter: '손', beard: '#b0351f' },
};

export function drawLord(ctx, key, x, y, opt = {}) {
  const L = LORD_LOOK[key];
  const sc = (opt.scale || 1) * 1.5;
  ctx.save();
  ctx.translate(x, y);
  if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha;
  // banner pole behind
  if (!opt.noBanner) {
    line(ctx, -14, 0, -14, -58, WOOD_DARK, 2);
    ctx.fillStyle = L.robe;
    ctx.fillRect(-14, -58, 16, 20);
    ctx.strokeStyle = L.trim;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-14, -58, 16, 20);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(L.letter, -6, -47.5);
  }
  ctx.scale(sc * (opt.face || 1), sc);
  const walk = opt.walk || 0;
  const atk = opt.atk || 0;
  shadow(ctx, 0, 0, 10);
  if (opt.ring) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = opt.ring;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.translate(0, opt.moving ? -Math.abs(Math.sin(walk * 9)) * 1.2 : 0);
  // cape
  ctx.beginPath();
  ctx.moveTo(-4, -16); ctx.lineTo(-11, -2 + Math.sin(walk * 6) * 1.5); ctx.lineTo(2, -3); ctx.closePath();
  ctx.fillStyle = L.cape || L.dark;
  ctx.fill();
  const col = { color: L.robe, dark: L.dark };
  if (opt.moving) legs(ctx, walk, col);
  else { line(ctx, -2, -6, -2.5, 0, L.dark, 2.6); line(ctx, 2, -6, 2.5, 0, L.dark, 2.6); }
  torso(ctx, col, true);
  line(ctx, -6, -9, 6, -9, L.trim, 1.6); // belt
  circle(ctx, 0, -19.5, 4.8, SKIN, SKIN_LINE, 1.1);
  if (L.beard) {
    ctx.beginPath();
    ctx.arc(1.5, -17, 3.2, 0.1, Math.PI - 0.4);
    ctx.fillStyle = L.beard;
    ctx.fill();
  }
  if (L.hat === 'crown') {
    ctx.fillStyle = L.trim;
    ctx.beginPath();
    ctx.moveTo(-4, -23); ctx.lineTo(-4, -28); ctx.lineTo(-1.5, -25.5); ctx.lineTo(0, -29);
    ctx.lineTo(1.5, -25.5); ctx.lineTo(4, -28); ctx.lineTo(4, -23);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, -20, 5.2, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fillStyle = '#2b3550';
    ctx.fill();
    line(ctx, 0, -25, -3, -31, '#d33', 2); // plume
  }
  if (L.weapon === 'bow') {
    ctx.beginPath();
    ctx.arc(5, -13, 9, -1.25, 1.25);
    ctx.strokeStyle = '#6b3a12';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    line(ctx, 5 + Math.cos(-1.25) * 9, -13 + Math.sin(-1.25) * 9, 5 + Math.cos(1.25) * 9, -13 + Math.sin(1.25) * 9, '#eee', 0.8);
  } else {
    const a = -0.8 + atk * 2.4;
    for (const [ox, k] of L.weapon === 'twin' ? [[4, 0], [-3, 0.5]] : [[4, 0]]) {
      ctx.save();
      ctx.translate(ox, -12);
      ctx.rotate(a + k);
      line(ctx, 0, 0, 0, -14, STEEL, 2.2);
      line(ctx, -3, -1, 3, -1, L.trim, 1.8);
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---- map furniture ------------------------------------------------------------------

export function drawSpot(ctx, x, y, opt = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.ellipse(0, 2, 25, 13, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = opt.hl ? '#f3e2a8' : '#c9b48a';
  ctx.fill();
  ctx.strokeStyle = opt.hl ? '#fff3b0' : '#8a7550';
  ctx.lineWidth = opt.hl ? 3 : 2;
  ctx.stroke();
  if (opt.flag) {
    line(ctx, 14, 0, 14, -18, WOOD_DARK, 2);
    ctx.fillStyle = opt.color || '#c33';
    ctx.fillRect(14, -18, 9, 6);
  }
  if (opt.empty) {
    line(ctx, 0, 0, 0, -22, WOOD_DARK, 2);
    ctx.fillStyle = opt.color || '#c33';
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(12, -18); ctx.lineTo(0, -14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', -9, -1);
  }
  ctx.restore();
}

// Our gate: a walled gatehouse at the end of the road. dir = 1 when the road comes from the left.
export function drawGate(ctx, x, y, dir, col, hpRatio = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  // wall running up and down
  ctx.fillStyle = '#8e8574';
  ctx.fillRect(18, -140, 34, 280);
  ctx.strokeStyle = '#5a5244';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, -140, 34, 280);
  for (let yy = -140; yy < 140; yy += 18) {
    ctx.fillStyle = '#9d9482';
    ctx.fillRect(14, yy, 10, 10);
  }
  // gatehouse
  ctx.fillStyle = '#a39a86';
  ctx.fillRect(4, -58, 60, 100);
  ctx.strokeRect(4, -58, 60, 100);
  ctx.fillStyle = '#7a3524';
  ctx.beginPath();
  ctx.moveTo(-2, -58); ctx.lineTo(34, -82); ctx.lineTo(70, -58);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // door
  ctx.fillStyle = hpRatio > 0.35 ? '#5a3216' : '#3a1c0a';
  ctx.beginPath();
  ctx.moveTo(4, 42); ctx.lineTo(4, 2); ctx.quadraticCurveTo(20, -24, 36, 2); ctx.lineTo(36, 42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // banners
  for (const by of [-50, 30]) {
    line(ctx, 50, by, 50, by - 34, WOOD_DARK, 2);
    ctx.fillStyle = col.color;
    ctx.fillRect(50, by - 34, 16, 12);
  }
  ctx.restore();
}

// Wooden palisade item on the road.
export function drawWall(ctx, w) {
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.rotate(w.ang + Math.PI / 2);
  shadow(ctx, 0, 4, 26, 6);
  for (let i = -3; i <= 3; i++) {
    ctx.fillStyle = i % 2 ? '#9a6a35' : '#8a5a2b';
    ctx.fillRect(i * 7 - 3, -18, 6, 22);
    ctx.beginPath();
    ctx.moveTo(i * 7 - 3, -18); ctx.lineTo(i * 7, -24); ctx.lineTo(i * 7 + 3, -18);
    ctx.fill();
  }
  line(ctx, -24, -10, 24, -10, WOOD_DARK, 2.4);
  ctx.restore();
}

// Small portrait icons for buttons (cached as data URLs).
const iconCache = new Map();
export function troopIcon(type, col, size = 64) {
  const k = `${type}|${col.color}|${size}`;
  if (iconCache.has(k)) return iconCache.get(k);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const s = size / 46;
  ctx.scale(s, s);
  if (type === 'cavalry') drawSoldier(ctx, type, 20, 40, col, { scale: 1 });
  else if (type === 'catapult') drawSoldier(ctx, type, 26, 38, col, { scale: 1, noCrew: true });
  else drawSoldier(ctx, type, 22, 42, col, { scale: 1.45 });
  const url = c.toDataURL();
  iconCache.set(k, url);
  return url;
}

export function lordIcon(key, size = 96) {
  const k = `lord|${key}|${size}`;
  if (iconCache.has(k)) return iconCache.get(k);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const s = size / 60;
  ctx.scale(s, s);
  drawLord(ctx, key, 32, 54, { noBanner: true, scale: 1.05 });
  const url = c.toDataURL();
  iconCache.set(k, url);
  return url;
}

// ---- generals --------------------------------------------------------------------

// A general: one big soldier of its troop type with a gold aura and a banner with its initial.
export function drawGeneral(ctx, type, x, y, col, opt = {}) {
  const sc = opt.scale || 1;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, 22 * sc, 9 * sc, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 210, 80, 0.28)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 210, 80, 0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (!opt.noBanner) {
    const bx = x - 16 * sc * (opt.face || 1);
    line(ctx, bx, y, bx, y - 52 * sc, WOOD_DARK, 2);
    ctx.fillStyle = col.color;
    ctx.fillRect(bx - 1, y - 52 * sc, 15 * sc, 17 * sc);
    ctx.strokeStyle = '#f4d35e';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(bx - 1, y - 52 * sc, 15 * sc, 17 * sc);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(11 * sc)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opt.letter || '', bx + 6.5 * sc, y - 43.5 * sc);
  }
  ctx.restore();
  const gold = { color: col.color, dark: '#7a5a10' };
  drawSoldier(ctx, type, x, y, gold, { ...opt, scale: sc * (type === 'cavalry' || type === 'catapult' ? 1.25 : 1.55) });
}

export function generalIcon(type, letter, col, size = 64) {
  const k = `gen|${type}|${letter}|${col.color}|${size}`;
  if (iconCache.has(k)) return iconCache.get(k);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#fff3c0');
  g.addColorStop(1, '#e0b040');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  const s = size / 46;
  ctx.save();
  ctx.scale(s, s);
  const gold = { color: col.color, dark: '#7a5a10' };
  if (type === 'cavalry') drawSoldier(ctx, type, 20, 40, gold, { scale: 1 });
  else if (type === 'catapult') drawSoldier(ctx, type, 25, 38, gold, { scale: 0.95, noCrew: true });
  else drawSoldier(ctx, type, 23, 42, gold, { scale: 1.4 });
  ctx.restore();
  ctx.fillStyle = col.color;
  ctx.beginPath();
  ctx.arc(size * 0.8, size * 0.2, size * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(size * 0.2)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, size * 0.8, size * 0.21);
  const url = c.toDataURL();
  iconCache.set(k, url);
  return url;
}
