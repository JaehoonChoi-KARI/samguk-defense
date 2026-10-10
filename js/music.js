// Background music, synthesized on the fly. All tunes are original melodies written for
// this game on the Chinese pentatonic scale (no recordings, no borrowed songs).
//
// Notation: one token per step (an eighth note). 'C5' plays a note, '-' holds the
// previous note one more step, '.' is a rest. Drum lines: K kick, T taiko, S rim/snare,
// h hi-hat, '.' nothing.

import { audioCtx, onAudioReady } from './audio.js';

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = tok => {
  const m = /^([A-G])(#?)(\d)$/.exec(tok);
  return m ? 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] ? 1 : 0) : null;
};
const freq = m => 440 * 2 ** ((m - 69) / 12);

function parse(str) {
  const toks = str.replace(/\|/g, ' ').trim().split(/\s+/);
  const events = [];
  toks.forEach((t, i) => {
    if (t === '-') { if (events.length && events[events.length - 1].end === i) events[events.length - 1].end = i + 1; return; }
    const m = midi(t);
    if (m !== null) events.push({ step: i, m, end: i + 1 });
  });
  return { len: toks.length, events: events.map(e => ({ step: e.step, m: e.m, len: e.end - e.step })) };
}

function drums(str) {
  const toks = str.replace(/[|\s]/g, '').split('');
  return { len: toks.length, events: toks.map((c, i) => ({ step: i, d: c })).filter(e => e.d !== '.') };
}

// Arpeggio bars from a list of roots: r, fifth, octave, fifth (twice per bar).
function arp(roots, pattern = [0, 7, 12, 7, 0, 7, 12, 7]) {
  const out = [];
  for (const r of roots) {
    const base = midi(r);
    for (const k of pattern) out.push(k === null ? '.' : nameOf(base + k));
  }
  return out.join(' ');
}
function bassLine(roots, pattern) {
  const out = [];
  for (const r of roots) {
    const base = midi(r);
    for (const k of pattern) out.push(k === null ? '.' : k === '-' ? '-' : nameOf(base + k));
  }
  return out.join(' ');
}
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = m => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

const TRACKS = {
  // calm and grand: flute over a slow zither
  title: {
    bpm: 80,
    voices: [
      { inst: 'flute', vol: 0.5, ...parse(`
        E5 - - G5 A5 - G5 E5 | D5 - - E5 D5 C5 A4 - | C5 - D5 E5 G5 - E5 D5 | E5 - - - - - . . |
        A5 - - G5 E5 - G5 A5 | C6 - A5 G5 E5 - D5 - | E5 - G5 E5 D5 C5 D5 E5 | C5 - - - - - . .`) },
      { inst: 'pluck', vol: 0.28, ...parse(arp(['C3', 'A2', 'C3', 'G2', 'A2', 'C3', 'G2', 'C3'])) },
    ],
  },
  // the camp between battles: light and friendly
  base: {
    bpm: 96,
    voices: [
      { inst: 'pluck', vol: 0.5, ...parse(`
        G4 A4 C5 . A4 G4 E4 . | D4 E4 G4 A4 G4 - - . | G4 A4 C5 D5 E5 D5 C5 A4 | G4 - - - . . . . |
        E5 D5 C5 . D5 C5 A4 . | G4 A4 C5 A4 G4 - E4 . | D4 E4 G4 A4 C5 - D5 . | C5 - - - . . . .`) },
      { inst: 'bass', vol: 0.4, ...parse(bassLine(['C3', 'G2', 'A2', 'C3', 'A2', 'C3', 'G2', 'C3'], [0, '-', null, 7, 0, '-', null, 7])) },
      { inst: 'drum', vol: 0.25, ...drums('h.h.h.h.'.repeat(8)) },
    ],
  },
  // marching across the map
  map: {
    bpm: 108,
    voices: [
      { inst: 'flute', vol: 0.45, ...parse(`
        C5 . C5 D5 E5 . G5 . | A5 . G5 E5 D5 - - . | E5 . E5 G5 A5 . C6 . | A5 G5 E5 D5 E5 - - . |
        D5 . D5 E5 G5 . E5 . | D5 C5 A4 C5 D5 - - . | E5 G5 A5 G5 E5 D5 C5 D5 | C5 - - - . . . .`) },
      { inst: 'bass', vol: 0.4, ...parse(bassLine(['C3', 'A2', 'C3', 'A2', 'G2', 'A2', 'C3', 'C3'], [0, null, 7, null, 0, null, 7, null])) },
      { inst: 'drum', vol: 0.4, ...drums('K.S.K.S.'.repeat(3) + 'K.S.KSSS' + 'K.S.K.S.'.repeat(3) + 'K.S.SSSS') },
    ],
  },
  // battle: driving drums, minor (yu mode) melody
  battle: {
    bpm: 136,
    voices: [
      { inst: 'lead', vol: 0.38, ...parse(`
        A4 . A4 C5 D5 . E5 . | G5 . E5 D5 E5 - - . | A4 . A4 C5 D5 . E5 G5 | A5 . G5 E5 D5 - - . |
        E5 . G5 . A5 . G5 E5 | D5 . E5 D5 C5 . A4 . | C5 D5 E5 G5 E5 D5 C5 D5 | A4 - - - . . . . |
        . . . . . . . . | . . . . . . . . | C5 . D5 . E5 . G5 . | A5 - - - G5 - E5 - |
        . . . . . . . . | . . . . . . . . | D5 . E5 . G5 . E5 D5 | E5 - - - . . . .`) },
      { inst: 'bass', vol: 0.5, ...parse(bassLine(['A2', 'A2', 'G2', 'A2', 'C3', 'G2', 'E2', 'A2', 'A2', 'G2', 'A2', 'A2', 'C3', 'D3', 'G2', 'A2'], [0, null, 0, 12, null, 0, 7, null])) },
      { inst: 'pluck', vol: 0.18, ...parse(arp(['A3', 'A3', 'G3', 'A3', 'C4', 'G3', 'E3', 'A3', 'A3', 'G3', 'A3', 'A3', 'C4', 'D4', 'G3', 'A3'], [12, 7, 3, 7, 12, 7, 3, 7].map(k => (k === 3 ? 0 : k)))) },
      { inst: 'drum', vol: 0.55, ...drums('T.hKS.hK'.repeat(7) + 'T.hKSSSS' + 'T.hKS.hK'.repeat(7) + 'TTTTSSSS') },
    ],
  },
  // a general has arrived: faster and darker
  boss: {
    bpm: 150,
    voices: [
      { inst: 'lead', vol: 0.4, ...parse(`
        A4 A4 . G4 A4 . C5 . | D5 . C5 A4 G4 . E4 . | A4 A4 . G4 A4 . C5 D5 | E5 - D5 C5 D5 - - . |
        E5 E5 . D5 E5 . G5 . | A5 . G5 E5 D5 . C5 . | D5 E5 D5 C5 A4 . G4 . | A4 - - - A3 - - .`) },
      { inst: 'bass', vol: 0.55, ...parse(bassLine(['A1', 'A1', 'G1', 'A1', 'C2', 'D2', 'G1', 'A1'], [0, 0, 12, 0, 0, 12, 0, 7])) },
      { inst: 'drum', vol: 0.6, ...drums('T.KTS.KT'.repeat(3) + 'T.KTSSTT' + 'T.KTS.KT'.repeat(3) + 'TTTTTTTT') },
    ],
  },
};

const JINGLES = {
  victory: { bpm: 150, voices: [{ inst: 'lead', vol: 0.45, ...parse('C5 E5 G5 C6 - . A5 - C6 - - - - - . .') }, { inst: 'pluck', vol: 0.3, ...parse('C4 . G4 . C5 . E4 . G4 - - - - - . .') }] },
  defeat: { bpm: 90, voices: [{ inst: 'flute', vol: 0.45, ...parse('A4 - G4 - E4 - D4 - C4 - - - - - . .') }, { inst: 'bass', vol: 0.4, ...parse('A2 - - - G2 - - - A1 - - - - - . .') }] },
};

// ---- player --------------------------------------------------------------------------

let enabled = true;
let wanted = null; // track name the game wants playing
let cur = null; // { name, gain, t0, step, spb, track }
let timer = null;
let noiseBuf = null;
const LOOKAHEAD = 0.25;

export function setMusicEnabled(on) {
  enabled = on;
  if (!on) stopNow();
  else if (wanted) start(wanted);
}

export function playMusic(name) {
  if (wanted === name && cur && cur.name === name) return;
  wanted = name;
  if (enabled) start(name);
}

export function stopMusic() {
  wanted = null;
  stopNow();
}

export function playJingle(name) {
  const ctx = audioCtx();
  if (!enabled || !ctx || ctx.state !== 'running') return;
  wanted = null;
  stopNow();
  const j = JINGLES[name];
  const g = ctx.createGain();
  g.gain.value = 0.2;
  g.connect(ctx.destination);
  const spb = 60 / j.bpm / 2;
  const t0 = ctx.currentTime + 0.05;
  for (const v of j.voices) for (const e of v.events) note(ctx, g, v.inst, e.m, t0 + e.step * spb, e.len * spb, v.vol);
}

// Called when the audio context becomes available (first touch) or the app comes back.
export function resumeMusic() {
  if (enabled && wanted && (!cur || cur.name !== wanted)) start(wanted);
}
onAudioReady(resumeMusic);

function stopNow() {
  if (!cur) return;
  const ctx = audioCtx();
  const old = cur;
  cur = null;
  try {
    old.gain.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
    old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    setTimeout(() => old.gain.disconnect(), 600);
  } catch { /* context gone */ }
}

function start(name) {
  const ctx = audioCtx();
  if (!ctx || ctx.state !== 'running') return; // resumeMusic() retries after the first touch
  stopNow();
  const track = TRACKS[name];
  if (!track) return;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.8);
  g.connect(ctx.destination);
  const len = Math.max(...track.voices.map(v => v.len));
  cur = { name, gain: g, t0: ctx.currentTime + 0.1, step: 0, spb: 60 / track.bpm / 2, track, len };
  if (!timer) timer = setInterval(tick, 60);
  tick();
}

function tick() {
  const ctx = audioCtx();
  if (!cur || !ctx) return;
  if (document.hidden) return;
  // fell far behind (tab was asleep): jump ahead instead of playing a burst of notes
  const now = ctx.currentTime;
  if (cur.t0 + cur.step * cur.spb < now - 0.5) cur.step = Math.ceil((now - cur.t0) / cur.spb);
  while (cur.t0 + cur.step * cur.spb < now + LOOKAHEAD) {
    const t = cur.t0 + cur.step * cur.spb;
    for (const v of cur.track.voices) {
      const s = cur.step % v.len;
      for (const e of v.events) {
        if (e.step !== s) continue;
        if (v.inst === 'drum') drum(ctx, cur.gain, e.d, t, v.vol);
        else note(ctx, cur.gain, v.inst, e.m, t, e.len * cur.spb, v.vol);
      }
    }
    cur.step++;
  }
}

function note(ctx, out, inst, m, t, dur, vol) {
  const f = freq(m);
  const g = ctx.createGain();
  g.connect(out);
  if (inst === 'pluck') {
    // zither-like: bright attack, quick fade
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'triangle'; o2.type = 'square';
    o1.frequency.value = f; o2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 8, t);
    lp.frequency.exponentialRampToValueAtTime(f * 2, t + 0.4);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
    const end = t + Math.max(0.35, dur + 0.25);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, end);
    o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
  } else if (inst === 'flute' || inst === 'lead') {
    // flute: soft sine with vibrato; lead: a brighter reed
    const o = ctx.createOscillator();
    o.type = inst === 'flute' ? 'sine' : 'square';
    o.frequency.value = f;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = f * 0.008;
    lfo.connect(lg); lg.connect(o.frequency);
    let src = o;
    if (inst === 'lead') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = f * 3;
      o.connect(lp);
      src = lp;
    }
    src.connect(g);
    const a = inst === 'flute' ? 0.06 : 0.015;
    const end = t + dur;
    const v = inst === 'lead' ? vol * 0.55 : vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, Math.max(t + a, end - 0.06));
    g.gain.exponentialRampToValueAtTime(0.001, end + 0.08);
    o.start(t); lfo.start(t); o.stop(end + 0.1); lfo.stop(end + 0.1);
  } else {
    // bass
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(g);
    const end = t + dur;
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol * 0.8, Math.max(t + 0.02, end - 0.05));
    g.gain.exponentialRampToValueAtTime(0.001, end + 0.05);
    o.start(t);
    o.stop(end + 0.08);
  }
}

function drum(ctx, out, d, t, vol) {
  if (d === 'K' || d === 'T') {
    const big = d === 'T';
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(big ? 110 : 140, t);
    o.frequency.exponentialRampToValueAtTime(big ? 42 : 55, t + (big ? 0.35 : 0.15));
    g.gain.setValueAtTime(vol * (big ? 1.2 : 0.9), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.45 : 0.2));
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.5);
    if (big) hit(ctx, out, t, 0.12, vol * 0.35, 'lowpass', 400);
  } else if (d === 'S') {
    hit(ctx, out, t, 0.09, vol * 0.45, 'bandpass', 1800);
  } else if (d === 'h') {
    hit(ctx, out, t, 0.035, vol * 0.18, 'highpass', 7000);
  }
}

function hit(ctx, out, t, dur, vol, type, f) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

export const MUSIC_TRACKS = Object.keys(TRACKS);

// Name of the tune playing now, or null (for the automated test).
export const musicNow = () => (cur ? cur.name : null);
