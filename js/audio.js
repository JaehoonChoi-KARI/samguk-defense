// Tiny synthesized sound effects (no audio files needed).

let ctx = null;
let master = null;
let enabled = true;
let noiseBuf = null;
const lastPlay = {};

const readyFns = [];
let primed = false;
let silentEl = null;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Called once the audio context is really running (the music waits for this).
export function onAudioReady(fn) { readyFns.push(fn); }
function fireReady() {
  if (ctx && ctx.state === 'running') for (const fn of readyFns) { try { fn(); } catch { /* ignore */ } }
}

// An endless silent <audio> element: on older iPadOS this moves the page into the
// "playback" audio session so the silent/mute setting does not silence the game.
function silentLoop() {
  if (silentEl) { if (silentEl.paused) silentEl.play().catch(() => {}); return; }
  const rate = 8000, n = rate; // one second of 8-bit silence
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  silentEl = document.createElement('audio');
  silentEl.setAttribute('playsinline', '');
  silentEl.setAttribute('x-webkit-airplay', 'deny');
  silentEl.loop = true;
  silentEl.preload = 'auto';
  silentEl.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  silentEl.play().catch(() => {});
}

// Must run inside a touch/click handler: creates or wakes the audio context.
export function unlockAudio() {
  try {
    // iPad/iPhone: play like a game or video app, even with the silent/mute setting on.
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    else if (isIOS && !navigator.audioSession) silentLoop();
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      ctx.onstatechange = fireReady;
    }
    // 'suspended' before the first touch, 'interrupted' on iOS after leaving the app
    if (ctx.state !== 'running') ctx.resume().then(fireReady).catch(() => {});
    if (!primed) {
      // a one-sample sound inside the touch fully opens the output on iOS
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
      primed = true;
    }
    fireReady();
  } catch { /* sound is optional */ }
}

// iOS stops the context when the app goes to the background; this lets it be woken again.
export const audioState = () => (ctx ? ctx.state : 'none');

export function setSoundEnabled(on) { enabled = on; }

// The background music shares this AudioContext (created on the first touch).
export const audioCtx = () => ctx;

function ready(name, gap = 0) {
  if (!enabled || !ctx || ctx.state !== 'running') return false;
  const now = ctx.currentTime;
  if (gap && lastPlay[name] !== undefined && now - lastPlay[name] < gap) return false;
  lastPlay[name] = now;
  return true;
}

function tone(freq, dur, { type = 'square', vol = 0.2, to = null, delay = 0 } = {}) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = 0.25, freq = 1200, to = null, q = 0.8, delay = 0 } = {}) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const arp = (notes, step, opts) => notes.forEach((f, i) => tone(f, step * 1.8, { ...opts, delay: i * step }));

export const sfx = {
  swing() { if (ready('swing', 0.05)) noise(0.09, { vol: 0.16, freq: 2600, to: 900 }); },
  hit() { if (ready('hit', 0.04)) { tone(240, 0.07, { vol: 0.1, to: 110 }); noise(0.05, { vol: 0.14, freq: 1800 }); } },
  crit() { if (ready('crit', 0.06)) { tone(700, 0.1, { vol: 0.1, to: 300 }); noise(0.08, { vol: 0.2, freq: 3200 }); } },
  coin() { if (ready('coin', 0.05)) { tone(988, 0.06, { vol: 0.07 }); tone(1319, 0.12, { vol: 0.07, delay: 0.05 }); } },
  heal() { if (ready('heal', 0.1)) arp([523, 784, 1047], 0.06, { type: 'triangle', vol: 0.15 }); },
  hurt() { if (ready('hurt', 0.1)) tone(170, 0.2, { type: 'sawtooth', vol: 0.16, to: 70 }); },
  levelUp() { if (ready('lv', 0.2)) arp([523, 659, 784, 1047, 1319], 0.08, { type: 'triangle', vol: 0.2 }); },
  spin() { if (ready('spin', 0.1)) noise(0.32, { vol: 0.25, freq: 600, to: 3000, q: 1.5 }); },
  dash() { if (ready('dash', 0.1)) noise(0.22, { vol: 0.25, freq: 3000, to: 500, q: 1.2 }); },
  fireball() { if (ready('fire', 0.08)) { tone(320, 0.18, { type: 'sawtooth', vol: 0.1, to: 140 }); noise(0.2, { vol: 0.12, freq: 900 }); } },
  explode() { if (ready('boom', 0.06)) noise(0.4, { vol: 0.32, freq: 500, to: 70, q: 0.6 }); },
  thunder() { if (ready('thunder', 0.2)) { noise(0.7, { vol: 0.45, freq: 1500, to: 60, q: 0.5 }); tone(70, 0.6, { type: 'sawtooth', vol: 0.16, to: 40 }); } },
  smash() { if (ready('smash', 0.1)) { noise(0.22, { vol: 0.3, freq: 300, to: 80, q: 0.7 }); tone(90, 0.18, { type: 'sine', vol: 0.25, to: 50 }); } },
  bow() { if (ready('bow', 0.05)) { tone(320, 0.08, { type: 'triangle', vol: 0.12, to: 180 }); noise(0.06, { vol: 0.1, freq: 3000 }); } },
  magic() { if (ready('magic', 0.08)) arp([880, 1175, 1568], 0.03, { type: 'sine', vol: 0.07 }); },
  tired() { if (ready('tired', 0.5)) { tone(330, 0.12, { type: 'triangle', vol: 0.1, to: 220 }); tone(260, 0.16, { type: 'triangle', vol: 0.1, to: 170, delay: 0.12 }); } },
  zap() { if (ready('zap', 0.15)) noise(0.25, { vol: 0.22, freq: 2600, to: 300, q: 0.7 }); },
  shoot() { if (ready('shoot', 0.12)) tone(500, 0.08, { type: 'triangle', vol: 0.05, to: 250 }); },
  select() { if (ready('select', 0.03)) tone(660, 0.05, { vol: 0.07 }); },
  confirm() { if (ready('confirm', 0.05)) { tone(784, 0.07, { vol: 0.09 }); tone(1175, 0.12, { vol: 0.09, delay: 0.06 }); } },
  denied() { if (ready('denied', 0.15)) tone(200, 0.12, { type: 'square', vol: 0.06, to: 150 }); },
  error() { if (ready('error', 0.15)) { tone(180, 0.12, { type: 'sawtooth', vol: 0.12 }); tone(140, 0.16, { type: 'sawtooth', vol: 0.12, delay: 0.1 }); } },
  upgrade() { if (ready('upgrade', 0.1)) { noise(0.1, { vol: 0.25, freq: 4000 }); arp([660, 880, 1320], 0.07, { type: 'square', vol: 0.09 }); } },
  boss() { if (ready('boss', 1)) arp([110, 104, 98, 92], 0.22, { type: 'sawtooth', vol: 0.18 }); },
  clear() { if (ready('clear', 1)) arp([523, 659, 784, 1047, 784, 1047, 1319], 0.1, { type: 'square', vol: 0.12 }); },
  death() { if (ready('death', 1)) arp([440, 392, 330, 262, 196], 0.16, { type: 'triangle', vol: 0.18 }); },
  deploy() { if (ready('deploy', 0.05)) { noise(0.12, { vol: 0.18, freq: 700, to: 300 }); tone(330, 0.1, { type: 'triangle', vol: 0.1, to: 440 }); } },
  gateHit() { if (ready('gate', 0.15)) { noise(0.3, { vol: 0.35, freq: 260, to: 60, q: 0.6 }); tone(80, 0.3, { type: 'sine', vol: 0.3, to: 45 }); } },
  drum() { if (ready('drum', 0.5)) { for (let i = 0; i < 3; i++) { tone(95, 0.25, { type: 'sine', vol: 0.35, to: 55, delay: i * 0.22 }); noise(0.08, { vol: 0.15, freq: 300, delay: i * 0.22 }); } } },
  horn() { if (ready('horn', 1)) { tone(196, 0.7, { type: 'sawtooth', vol: 0.12 }); tone(147, 0.9, { type: 'sawtooth', vol: 0.1, delay: 0.25 }); } },
  squadDown() { if (ready('sdown', 0.2)) arp([392, 330, 262], 0.08, { type: 'triangle', vol: 0.12 }); },
  stone() { if (ready('stone', 0.12)) noise(0.15, { vol: 0.12, freq: 500, to: 200 }); },
};

// For the automated test: exercises the silent-loop fallback used on older iPadOS.
export function testSilentLoop() { silentLoop(); return !!silentEl; }
