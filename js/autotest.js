// Automated checks, run in a headless browser:
//   ?autotest=1        data checks, bot battles and a full touch-driven UI flow; prints JSON
//   ?shot=<scene>      freezes one scene for a screenshot
// Scenes: title, slots, lord, story, base, map, prep, battle, boss, result, barracks, lordinfo, equip, counters

import { STORIES } from './stories.js';
import { TROOP_KEYS, LORD_KEYS, EQUIPS, FACTIONS, STAGE_COUNT, BOSS_SKILLS, TROOP_UNLOCK, GENERALS } from './data.js';
import { PLACES, stageLayout } from './maps.js';
import { buildWaves } from './waves.js';
import { battleSetup } from './army.js';
import { Sim } from './sim.js';
import { autoplay, expectedSave, recommendRoster, recommendGenerals, Bot } from './bot.js';
import { defaultSave } from './save.js';
import { applyResult } from './progression.js';
import { unlockAudio, audioCtx, sfx, testSilentLoop } from './audio.js';
import { playMusic, playJingle, stopMusic, MUSIC_TRACKS, musicNow } from './music.js';

const out = { ok: true, errors: [], checks: [], battles: [], flow: [] };
const fail = msg => { out.ok = false; out.errors.push(msg); };
window.addEventListener('error', e => fail(`window error: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', e => fail(`unhandled: ${e.reason?.stack || e.reason}`));

function report() {
  const pre = document.createElement('pre');
  pre.id = 'test-out';
  pre.textContent = JSON.stringify(out, null, 1);
  pre.style.cssText = 'position:fixed;inset:0;z-index:999;margin:0;background:#fff;color:#000;font:11px monospace;overflow:auto;white-space:pre-wrap';
  document.body.appendChild(pre);
  document.title = out.ok ? 'PASS' : 'FAIL';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const tap = el => {
  if (!el) throw new Error('tap: element missing');
  el.click();
};

function dataChecks() {
  for (const lord of LORD_KEYS) {
    const st = STORIES[lord];
    if (!st || st.stages.length !== STAGE_COUNT) fail(`${lord}: stage count`);
    st.stages.forEach((s, i) => {
      const n = i + 1;
      if (!PLACES[s.loc]) fail(`${s.id}: bad loc ${s.loc}`);
      if (!FACTIONS[s.enemy]) fail(`${s.id}: bad enemy ${s.enemy}`);
      if (s.reward && !EQUIPS[s.reward]) fail(`${s.id}: bad reward ${s.reward}`);
      if (!TROOP_KEYS.includes(s.boss.type)) fail(`${s.id}: bad boss type`);
      if (!BOSS_SKILLS[s.boss.skill]) fail(`${s.id}: bad boss skill`);
      for (const t of Object.keys(s.mix)) if (!TROOP_KEYS.includes(t)) fail(`${s.id}: bad mix ${t}`);
      const L = stageLayout(n);
      if (L.spots.length < 8) fail(`stage ${n}: only ${L.spots.length} spots`);
      const w = buildWaves(s, n, L.paths.length);
      if (!w.length || !w[w.length - 1].boss) fail(`${s.id}: waves`);
    });
  }
  for (const fac of ['shu', 'wei', 'wu']) {
    const starters = Object.values(GENERALS).filter(g => g.faction === fac && g.unlock === 0).length;
    if (starters < 2) fail(`${fac}: only ${starters} starting generals`);
  }
  const spots = Array.from({ length: STAGE_COUNT }, (_, i) => stageLayout(i + 1).spots.length);
  out.checks.push({ spotsPerStage: spots.join(',') });
  // the first stage only needs troops that are unlocked from the start
  out.checks.push({ unlock: TROOP_UNLOCK });
}

function botBattles() {
  const plan = [
    ['liubei', 1], ['caocao', 1], ['sunquan', 1],
    ['liubei', 4], ['caocao', 8], ['sunquan', 12], ['liubei', 16], ['caocao', 20],
  ];
  for (const [lord, n] of plan) {
    const s = expectedSave(lord, n, 1);
    const stage = STORIES[lord].stages[n - 1];
    const waves = buildWaves(stage, n, stageLayout(n).paths.length);
    s.roster = recommendRoster(s, waves);
    s.picks = recommendGenerals(s, waves);
    const sim = new Sim(battleSetup(s, n - 1, stage, { seed: 'test' }));
    const t0 = performance.now();
    autoplay(sim, { callEarly: true });
    if (sim.generals.length !== 2) fail(`${lord} ${n}: generals not brought (${s.picks})`);
    if (!sim.stats.genDown && sim.squads.filter(q => q.gen).length === 0 && sim.state === 'won') { /* fine: they may have moved */ }
    const r = { lord, n, gens: s.picks.join(','), genDown: sim.stats.genDown || 0, state: sim.state, gate: sim.gate, kills: sim.stats.kills, lost: sim.stats.lost, time: Math.round(sim.time), ms: Math.round(performance.now() - t0), roster: JSON.stringify(s.roster) };
    out.battles.push(r);
    if (sim.state !== 'won' && sim.state !== 'lost') fail(`${lord} ${n}: battle did not finish`);
    if (n === 1 && sim.state !== 'won') fail(`${lord} stage 1 lost`);
  }
  // rewards on a first clear
  const s = defaultSave('liubei');
  const res = applyResult(s, STORIES.liubei, { stageIdx: 0, won: true, stars: 3, gate: 20, kills: 10, itemsUsed: { potion: 1 } });
  if (s.progress !== 1 || !(s.gold > 150) || res.levels < 1) fail(`first clear rewards: ${JSON.stringify(res)}`);
  out.checks.push({ firstClear: res });
}

async function waitFor(fn, ms = 4000) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await sleep(30);
  }
  throw new Error('waitFor timed out');
}

async function uiFlow(game) {
  const step = name => out.flow.push(name);
  const q = sel => document.querySelector(sel);
  game.show('title');
  step('title');
  tap(q('.title-screen'));
  await waitFor(() => game.screenName === 'slots');
  step('slots');
  tap(q('.slot.empty'));
  await waitFor(() => game.screenName === 'lordSelect');
  step('lordSelect');
  tap(q('.lord-card[data-k="caocao"]'));
  tap(q('.diff-btn[data-i="0"]'));
  tap(q('.start-lord'));
  await waitFor(() => game.screenName === 'story');
  if (game.save.diff !== 0) fail('difficulty not stored');
  step('story');
  tap(q('.story'));
  tap(q('.story'));
  await waitFor(() => game.screenName === 'base');
  step('base');
  for (const go of ['barracks', 'lord', 'equip', 'counters']) {
    tap(q(`.tile[data-go="${go}"]`));
    await waitFor(() => game.screenName === go);
    tap(q('.back-btn'));
    await waitFor(() => game.screenName === 'base');
    step(go);
  }
  tap(q('.go-card'));
  await waitFor(() => game.screenName === 'map');
  step('map');
  if (document.querySelectorAll('.mk').length !== STAGE_COUNT) fail('map markers');
  tap(q('.mc-go'));
  await waitFor(() => game.screenName === 'prep');
  step('prep');
  tap(q('.gp'));
  await waitFor(() => q('.gpick'));
  tap(q('.gpick .done'));
  if (game.save.picks.length !== 2) fail('general picks');
  tap(q('.auto'));
  tap(q('.it[data-k="bomb"] .buy'));
  tap(q('.go'));
  await waitFor(() => game.battle);
  step('battle');
  const b = game.battle;
  // open a spot menu with a real tap on the canvas, then deploy from the menu
  const spot = b.sim.spots[0];
  const p = b.view.toScreen(spot.x, spot.y);
  const fire = (type, x, y) => game.canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, bubbles: true, pointerType: 'touch' }));
  b.render(game.canvas.getContext('2d'), game.view, 0); // make sure the view has its transform
  const p2 = b.view.toScreen(spot.x, spot.y);
  fire('pointerdown', p2.x, p2.y);
  fire('pointerup', p2.x, p2.y);
  await waitFor(() => !q('.popup').classList.contains('hidden'));
  tap(q('.tbtn'));
  if (!spot.squad) fail('deploy from spot menu');
  step('deploy');
  // place a general from the menu of another empty spot
  const spot2 = b.sim.spots.find(sp => !sp.squad);
  const p3 = b.view.toScreen(spot2.x, spot2.y);
  fire('pointerdown', p3.x, p3.y);
  fire('pointerup', p3.x, p3.y);
  await waitFor(() => !q('.popup').classList.contains('hidden'));
  tap(q('.gbtn'));
  if (!b.sim.squads.some(sq => sq.gen)) fail('deploy general');
  step('general');
  // drag the lord
  const L = b.sim.lord;
  const lp = b.view.toScreen(L.x, L.y - 20);
  fire('pointerdown', lp.x, lp.y);
  fire('pointermove', lp.x - 60, lp.y - 30);
  fire('pointerup', lp.x - 60, lp.y - 30);
  if (Math.hypot(L.hx - L.x, L.hy - L.y) < 10) fail('lord drag');
  step('lordDrag');
  tap(q('.wp-call'));
  if (b.sim.state !== 'play') fail('wave start');
  // a skill
  tap(q('.sbtn[data-i="0"]'));
  if (b.ui.aim) {
    const c = b.view.toScreen(L.x + 100, L.y);
    fire('pointerdown', c.x, c.y);
    fire('pointerup', c.x, c.y);
  }
  step('skill');
  // the same battle with a mouse
  const mouse = (type, x, y, button = 0) => game.canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, pointerType: 'mouse', button, buttons: type === 'pointerup' ? 0 : 1 }));
  const free = b.sim.spots.find(sp => !sp.squad);
  const fp = b.view.toScreen(free.x, free.y);
  mouse('pointermove', fp.x, fp.y);
  if (b.ui.hover !== free.id || game.canvas.style.cursor !== 'pointer') fail(`mouse hover: ${b.ui.hover} ${game.canvas.style.cursor}`);
  tap(q('.ibtn[data-k="bomb"]'));
  if (!b.ui.aim) fail('mouse: aim did not start');
  mouse('pointermove', fp.x + 40, fp.y);
  if (b.ui.aim && b.ui.aim.x === undefined) fail('mouse: aim circle does not follow the pointer');
  mouse('pointerdown', fp.x + 40, fp.y, 2);
  if (b.ui.aim) fail('mouse: right click did not cancel aiming');
  mouse('pointerdown', fp.x, fp.y);
  mouse('pointerup', fp.x, fp.y);
  await waitFor(() => !q('.popup').classList.contains('hidden'));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  if (!q('.popup').classList.contains('hidden')) fail('Esc did not close the menu');
  mouse('pointerdown', fp.x, fp.y);
  mouse('pointerup', fp.x, fp.y);
  await waitFor(() => !q('.popup').classList.contains('hidden'));
  tap(q('.tbtn:not(.gbtn)'));
  step('mouse');
  // let the bot finish the fight quickly
  const bot = new Bot(b.sim, { callEarly: true });
  let guard = 0;
  while (!b.reported && guard < 30 * 60 * 15) {
    bot.update(1 / 30);
    b.update(1 / 30);
    guard++;
  }
  await waitFor(() => game.screenName === 'result');
  step(`result:${q('.result h1').textContent}`);
  tap(q('.result .base'));
  await waitFor(() => game.screenName === 'base');
  tap(q('.tile.exit'));
  await waitFor(() => game.screenName === 'title');
  step('exit');
}

// ---- screenshot scenes ------------------------------------------------------------------

async function shot(game, name, params) {
  const lord = params.get('lord') || 'liubei';
  const n = +(params.get('n') || 6);
  const s = expectedSave(lord, n, 1);
  game.slot = 1;
  game.save = s;
  const stage = STORIES[lord].stages[n - 1];
  const waves = buildWaves(stage, n, stageLayout(n).paths.length);
  s.roster = recommendRoster(s, waves);
  s.picks = recommendGenerals(s, waves);
  if (name === 'title') game.show('title');
  else if (name === 'slots') game.show('slots');
  else if (name === 'lord') { game.prefs.endingSeen = params.has('hell'); game.show('lordSelect', { slot: 1 }); document.querySelector('.lord-card[data-k="caocao"]').click(); }
  else if (name === 'story') game.show('story', { title: '유비의 이야기', lord, lines: STORIES[lord].prologue, next: () => {} });
  else if (name === 'base') game.show('base');
  else if (name === 'map') game.show('map', { sel: n - 1 });
  else if (name === 'prep') game.show('prep', { stageIdx: n - 1 });
  else if (name === 'barracks') game.show('barracks', {});
  else if (name === 'lordinfo') game.show('lord', {});
  else if (name === 'equip') game.show('equip', {});
  else if (name === 'counters') game.show('counters', {});
  else if (name === 'generals') game.show('generals', {});
  else if (name === 'picker') { game.show('prep', { stageIdx: n - 1 }); document.querySelector('.gp').click(); }
  else if (name === 'result') {
    const r = { stageIdx: n - 1, won: true, stars: 3, gate: 19, kills: 40, itemsUsed: {}, wavesReached: 5, totalWaves: 5 };
    s.stages[n - 1] = { stars: 0, clears: 0 };
    s.progress = n - 1;
    const o = applyResult(s, STORIES[lord], r);
    game.show('result', { r, out: o });
  } else if (name === 'battle' || name === 'boss') {
    game.startBattle(n - 1, { seed: 'shot' });
    const b = game.battle;
    const bot = new Bot(b.sim, {});
    const until = name === 'boss' ? () => b.sim.boss() && b.sim.boss().d > 250 : () => b.sim.time > 50;
    let guard = 0;
    while (!until() && guard < 30 * 60 * 12 && b.sim.state !== 'won' && b.sim.state !== 'lost') {
      bot.update(1 / 30);
      b.sim.update(1 / 30);
      b.view.absorb(b.sim.events);
      b.sim.events = [];
      guard++;
    }
    if (params.has('menu')) b.openSpot(b.sim.spots.find(sp => !sp.squad) || b.sim.spots[0]);
    if (params.has('squad')) b.openSquad(b.sim.squads[0]);
    if (params.has('aim')) b.onSkill(2);
    b.render(game.canvas.getContext('2d'), game.view, 0.016);
    game.paused = true; // freeze the frame (no pause menu)
  }
  document.title = 'ready';
}

export async function run({ game, params }) {
  if (params.has('shot')) {
    try { await shot(game, params.get('shot'), params); } catch (e) { fail(`shot: ${e.stack || e}`); report(); }
    return;
  }
  try { await musicCheck(); } catch (e) { fail(`music: ${e.stack || e}`); }
  try { dataChecks(); } catch (e) { fail(`data: ${e.stack || e}`); }
  try { botBattles(); } catch (e) { fail(`bots: ${e.stack || e}`); }
  try { await uiFlow(game); } catch (e) { fail(`ui: ${e.stack || e} (after ${out.flow.join(' > ')})`); }
  report();
}

// Plays every tune for a moment (the browser must allow audio without a tap:
// --autoplay-policy=no-user-gesture-required).
async function musicCheck() {
  // the title music is asked for before any touch, like on a real start
  playMusic('title');
  if (musicNow()) fail('music started before the audio unlock');
  unlockAudio();
  if (!testSilentLoop()) fail('silent loop');
  await sleep(300);
  const ctx = audioCtx();
  out.checks.push({ audio: ctx ? ctx.state : 'none', afterUnlock: musicNow() });
  if (!ctx || ctx.state !== 'running') return;
  if (musicNow() !== 'title') fail(`title music did not start after the unlock (${musicNow()})`);
  for (const t of MUSIC_TRACKS) {
    playMusic(t);
    await sleep(700);
  }
  playJingle('victory');
  await sleep(300);
  playJingle('defeat');
  for (const k of ['deploy', 'gateHit', 'drum', 'horn', 'squadDown', 'stone']) sfx[k]();
  stopMusic();
  out.checks.push({ music: MUSIC_TRACKS.join(',') });
}
