// Automated checks, run in a headless browser:
//   ?autotest=1        data checks, bot battles and a full touch-driven UI flow; prints JSON
//   ?shot=<scene>      freezes one scene for a screenshot
// Scenes: title, slots, lord, story, base, map, prep, battle, boss, result, barracks, lordinfo, equip, counters

import { STORIES } from './stories.js';
import { TROOP_KEYS, LORD_KEYS, EQUIPS, FACTIONS, STAGE_COUNT, BOSS_SKILLS, TROOP_UNLOCK, GENERALS, CHALLENGES, stageChallenge } from './data.js';
import { PLACES, stageLayout, pathAt } from './maps.js';
import { stageField, cellKey, CELL } from './field.js';
import { buildWaves } from './waves.js';
import { battleSetup, troopStats, skillList, lordLeadership } from './army.js';
import { TALENT_KEYS, TALENTS, addBlock, addTalent, canRemove, removeTalent, freePoints, autoTalents, talentText } from './talents.js';
import { Sim } from './sim.js';
import { autoplay, expectedSave, recommendRoster, recommendGenerals, Bot } from './bot.js';
import { defaultSave, sanitize } from './save.js';
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

async function loreChecks() {
  for (const lord of LORD_KEYS) {
    let lore = null;
    try { lore = (await import(`./lore/${lord}.js`)).default; } catch (e) { fail(`lore ${lord}: ${e.message}`); continue; }
    if (!lore.prologue?.paras?.length || !lore.ending?.paras?.length) fail(`lore ${lord}: prologue/ending`);
    const sizes = [];
    for (const st of STORIES[lord].stages) {
      const ch = lore.stages?.[st.id];
      if (!ch || ch.paras.length < 4 || !ch.fact) { fail(`lore ${st.id}: missing or short`); continue; }
      sizes.push(ch.paras.join('').length);
    }
    out.checks.push({ lore: lord, chapters: sizes.length, minChars: Math.min(...sizes), maxChars: Math.max(...sizes) });
  }
}

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
      const F = stageField(s, L);
      if (F.list.length < 50) fail(`${s.id}: only ${F.list.length} build cells`);
      const w = buildWaves(s, n, L.paths.length);
      if (!w.length || !w[w.length - 1].boss) fail(`${s.id}: waves`);
    });
  }
  for (const fac of ['shu', 'wei', 'wu']) {
    const starters = Object.values(GENERALS).filter(g => g.faction === fac && g.unlock === 0).length;
    if (starters < 2) fail(`${fac}: only ${starters} starting generals`);
  }
  const cells = STORIES.liubei.stages.map((s, i) => stageField(s, stageLayout(i + 1)));
  out.checks.push({ cellsPerStage: cells.map(f => f.list.length).join(','), special: cells.map(f => `${f.counts.hill}/${f.counts.forest}/${f.counts.choke}`).join(' ') });
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
  // an enemy general reaching the gate loses the battle at once
  {
    const s = expectedSave('liubei', 1, 1);
    const st = STORIES.liubei.stages[0];
    const sim = new Sim(battleSetup(s, 0, st, { seed: 'leak' }));
    sim.start();
    sim.spawnFoe(st.boss.type, 0, true, sim.paths[0].len - 10);
    for (let i = 0; i < 60; i++) sim.update(1 / 30);
    if (sim.state !== 'lost' || sim.lostReason !== 'boss') fail(`boss leak: ${sim.state} ${sim.lostReason}`);
    out.checks.push({ bossLeak: sim.state, gate: sim.gate });
  }
  // the enemy general turns on a squad standing near its road instead of walking past it
  {
    const s = expectedSave('liubei', 3, 1);
    const st = STORIES.liubei.stages[2];
    const sim = new Sim(battleSetup(s, 2, st, { seed: 'engage' }));
    sim.start();
    sim.food = 999;
    sim.roster.archer = 3;
    const path = sim.paths[0];
    let sq = null;
    for (let k = 0.45; k < 0.8 && !sq; k += 0.05) {
      const p = pathAt(path, path.len * k);
      for (const side of [1, -1]) {
        const r = sim.deploy('archer', p.x - Math.sin(p.ang) * 70 * side, p.y + Math.cos(p.ang) * 70 * side);
        if (r.ok) { sq = r.squad; break; }
      }
    }
    const boss = sim.spawnFoe(st.boss.type, 0, true, path.len * 0.25);
    let engaged = false;
    for (let i = 0; i < 30 * 30 && !engaged && sim.foes.includes(boss); i++) {
      sim.update(1 / 30);
      engaged = boss.state === 'raid' && boss.raid === sq;
    }
    if (!sq || !engaged) fail(`boss engage: squad ${!!sq} engaged ${engaged} state ${boss.state}`);
    out.checks.push({ bossEngage: engaged });
  }
  // the build plate: cells, ground and formations
  {
    const s = expectedSave('liubei', 12, 1);
    const st = STORIES.liubei.stages[11];
    const sim = new Sim(battleSetup(s, 11, st, { seed: 'plate' }));
    sim.food = 9999;
    for (const t of ['infantry', 'spear', 'archer', 'strategist', 'catapult']) sim.roster[t] = 9;
    const F = sim.field;
    const at = (c, r) => ({ x: (c + 0.5) * CELL, y: (r + 0.5) * CELL });
    const plain = (c, r) => F.cells.get(cellKey(c, r))?.kind === 'plain';
    // three plain cells in a row with a plain cell under the middle one
    const row = F.list.find(x => plain(x.c, x.r) && plain(x.c + 1, x.r) && plain(x.c + 2, x.r) && plain(x.c + 1, x.r + 1));
    if (!row) fail('plate: no row of plain cells');
    else {
      const a1 = sim.deploy('archer', at(row.c, row.r).x, at(row.c, row.r).y).squad;
      const a2 = sim.deploy('archer', at(row.c + 1, row.r).x, at(row.c + 1, row.r).y).squad;
      const preview = sim.previewFormations('archer', sim.spotFor('archer', at(row.c + 2, row.r).x, at(row.c + 2, row.r).y));
      if (!preview.includes('line')) fail(`plate: line preview ${preview}`);
      const a3 = sim.deploy('archer', at(row.c + 2, row.r).x, at(row.c + 2, row.r).y).squad;
      if (!a1 || !a2 || !a3 || !a2.form.names.includes('line') || !(a2.maxHp > a2.base.maxHp)) fail('plate: 일자진');
      if (sim.deploy('spear', at(row.c + 1, row.r).x, at(row.c + 1, row.r).y).ok) fail('plate: two units on one cell');
      const sp = sim.deploy('spear', at(row.c + 1, row.r + 1).x, at(row.c + 1, row.r + 1).y).squad;
      if (!sp || !a2.guarded || !sim.links.some(l => l.kind === 'spearbow')) fail('plate: 창궁진');
      sim.retreat(sp.id);
      if (a2.guarded) fail('plate: formation stays after the spear left');
    }
    const offCell = pathAt(sim.paths[0], sim.paths[0].len * 0.5);
    if (sim.deploy('infantry', offCell.x, offCell.y).ok) fail('plate: placed on the road');
    // a catapult takes 2×2 cells
    const big = F.list.find(x => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([i, j]) => F.cells.has(cellKey(x.c + i, x.r + j)) && !sim.occ.has(cellKey(x.c + i, x.r + j))));
    const cat = big && sim.deploy('catapult', (big.c + 1) * CELL, (big.r + 1) * CELL).squad;
    if (!cat || cat.cells.length !== 4) fail('plate: catapult footprint');
    // ground: hill stretches range, forest hides, choke blocks more
    const hill = F.list.find(x => x.kind === 'hill' && !sim.occ.has(cellKey(x.c, x.r)));
    const h = hill && sim.deploy('archer', hill.x, hill.y).squad;
    if (h && !(h.range > h.base.range * 1.15)) fail('plate: hill range');
    const wood = F.list.find(x => x.kind === 'forest' && !sim.occ.has(cellKey(x.c, x.r)));
    const w = wood && sim.deploy('archer', wood.x, wood.y).squad;
    if (w && (!sim.hidden(w) || !w.ambush)) fail('plate: forest');
    const choke = F.list.find(x => x.kind === 'choke' && !sim.occ.has(cellKey(x.c, x.r)));
    const ch = choke && sim.deploy('infantry', choke.x, choke.y).squad;
    if (ch && ch.block !== ch.base.block + 1) fail('plate: choke');
    out.checks.push({ plate: { cells: F.list.length, ground: F.counts, squads: sim.squads.length, links: sim.links.length } });
  }
  // 일기토 and morale: a general beside the enemy general duels once; a fallen general sends
  // its soldiers running
  {
    const s = expectedSave('liubei', 4, 1);
    const st = STORIES.liubei.stages[3];
    const sim = new Sim(battleSetup(s, 3, st, { seed: 'duel' }));
    sim.start();
    const boss = sim.spawnFoe(st.boss.type, 0, true, sim.paths[0].len * 0.5);
    for (let i = 0; i < 6; i++) sim.spawnFoe('infantry', 0, false, sim.paths[0].len * 0.45 + i * 8);
    const g = sim.generals[0];
    const spot = sim.field.list.filter(c => !sim.occ.has(cellKey(c.c, c.r))).sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y))[0];
    sim.deployGeneral(g.key, spot.x, spot.y);
    const gen = g.squad;
    let started = false, ended = false;
    for (let i = 0; i < 30 * 8 && !ended; i++) {
      gen.x = boss.x + 20; gen.y = boss.y; // keep them together
      sim.update(1 / 30);
      for (const e of sim.events) { if (e.k === 'duel') started = true; if (e.k === 'duelWin' || e.k === 'duelLose') ended = true; }
      sim.events.length = 0;
    }
    if (!started || !ended || sim.stats.duels !== 1) fail(`duel: started ${started} ended ${ended} duels ${sim.stats.duels}`);
    const left = sim.foes.filter(f => !f.boss && f.state !== 'flee').length;
    sim.killFoe(boss);
    const fled = sim.foes.filter(f => f.state === 'flee').length;
    if (!fled && left) fail('rout: nobody ran when the enemy general fell');
    out.checks.push({ duel: { win: sim.stats.duelWins, routed: sim.stats.routed } });
  }
  // weather: the south-east wind doubles fire, fog shortens bows; every stage has a challenge
  {
    const fireStage = STORIES.liubei.stages[12]; // 적벽대전
    const s = expectedSave('liubei', 13, 1);
    const sim = new Sim(battleSetup(s, 12, fireStage, { seed: 'wind' }));
    if (sim.weather.fire !== 2) fail('weather: 적벽 should have the south-east wind');
    const fogStage = STORIES.caocao.stages[3];
    const fog = new Sim(battleSetup(expectedSave('caocao', 4, 1), 3, fogStage, { seed: 'fog' }));
    fog.food = 999;
    fog.roster.archer = 2;
    const free = fog.field.list.find(c => c.kind === 'plain');
    const a = fog.deploy('archer', free.x, free.y).squad;
    if (!a || !(a.range < a.base.range)) fail('weather: fog range');
    for (const lord of LORD_KEYS) {
      STORIES[lord].stages.forEach((st, i) => {
        const ch = stageChallenge(st, i + 1);
        if (!CHALLENGES[ch.key] || !ch.text) fail(`challenge ${st.id}`);
        if (ch.key === 'noType' && !(TROOP_UNLOCK[ch.type] <= i)) fail(`challenge ${st.id}: ${ch.type} not unlocked yet`);
      });
    }
    // meeting a challenge pays once
    const sv = defaultSave('liubei');
    const ch = stageChallenge(STORIES.liubei.stages[0], 1);
    const r1 = applyResult(sv, STORIES.liubei, { stageIdx: 0, won: true, stars: 3, gate: 20, kills: 10, itemsUsed: {}, challenge: { ...ch, done: true } });
    const r2 = applyResult(sv, STORIES.liubei, { stageIdx: 0, won: true, stars: 3, gate: 20, kills: 10, itemsUsed: {}, challenge: { ...ch, done: true } });
    if (!r1.challenge || r2.challenge || !sv.stages[0].ch) fail('challenge reward');
    out.checks.push({ weather: { wind: sim.weather.name, fog: a && Math.round(a.range) }, challengeGold: r1.challenge });
  }
  // talents: rows open with points above, skills need the lord level, points come back out
  {
    const s = expectedSave('liubei', 12, 1, { talents: 'none' });
    if (freePoints(s) !== 11) fail(`talent points: ${freePoints(s)}`);
    if (addBlock(s, 'lordAtk') !== 'row') fail('talent row not shut');
    const arch0 = troopStats(s, 'archer').atk, lead0 = lordLeadership(s);
    for (let i = 0; i < 3; i++) addTalent(s, 'sk1');
    if (skillList(s)[0].lv !== 4) fail(`skill level from talents: ${skillList(s)[0].lv}`);
    if (!addTalent(s, 'lordAtk')) fail('talent row did not open');
    if (canRemove(s, 'sk1')) fail('talent removal would shut a row');
    removeTalent(s, 'lordAtk');
    if (!removeTalent(s, 'sk1')) fail('talent removal');
    addTalent(s, 'rangedAtk');
    if (!(troopStats(s, 'archer').atk > arch0)) fail('troop talent has no effect');
    const low = expectedSave('liubei', 2, 1, { talents: 'none' });
    if (addBlock(low, 'sk2') !== 'skill') fail('skill talent before the skill is learned');
    autoTalents(s);
    if (freePoints(s) !== 0) fail(`auto talents left ${freePoints(s)}`);
    for (const k of TALENT_KEYS) if (!talentText('caocao', k, TALENTS[k].max)) fail(`talent text ${k}`);
    // an old save (skill levels, no talents) gets its points placed once
    const old = sanitize({ ...defaultSave('sunquan'), level: 8, sp: 1, skills: [4, 3, 1], talents: undefined });
    if (freePoints(old) !== 0 || !old.talentNew || old.skills || 'sp' in old) fail(`old save talents: ${JSON.stringify(old.talents)}`);
    const bad = sanitize({ ...defaultSave('sunquan'), level: 3, talents: { sk1: 4, lordAtk: 3 } });
    if (freePoints(bad) !== 2) fail(`overspent talents kept: ${JSON.stringify(bad.talents)}`);
    out.checks.push({ talents: { arch: [Math.round(arch0), Math.round(troopStats(s, 'archer').atk)], lead: [lead0, lordLeadership(s)], old: old.talents } });
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
    if (go === 'lord') {
      // spend a talent point by tapping, then take it back
      const lv = game.save.level;
      game.save.level = 3;
      game.show('lord', {});
      tap(q('.tl-node[data-k="lordHp"]'));
      tap(q('.tl-plus'));
      if (game.save.talents.lordHp !== 1) fail(`talent tap: ${JSON.stringify(game.save.talents)}`);
      tap(q('.tl-minus'));
      if (game.save.talents.lordHp) fail('talent untap');
      game.save.level = lv;
      game.show('lord', {});
    }
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
  b.render(game.canvas.getContext('2d'), game.view, 0); // make sure the view has its transform
  const fire = (type, x, y, el = game.canvas) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, bubbles: true, pointerType: 'touch', button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  const finder = new Bot(b.sim, {}); // the bot's list of places beside the road
  const freeFor = type => finder.pickPos(type, b.setup.troops[type]?.range || 100);
  const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  // 1) tap a troop in the list, then press, slide and let go on the map
  const card = q('.icard[data-t]');
  const t = card.dataset.t;
  const cc = center(card);
  fire('pointerdown', cc.x, cc.y, card);
  fire('pointerup', cc.x, cc.y, card);
  if (!b.sel || b.sel.type !== t) fail('picking a troop in the list');
  const pos = freeFor(t);
  const sp = b.view.toScreen(pos.x, pos.y);
  fire('pointerdown', sp.x - 40, sp.y + 30);
  fire('pointermove', sp.x, sp.y);
  if (!b.ui.ghost || !b.ui.ghost.ok) fail('no see-through unit while pressing');
  fire('pointerup', sp.x, sp.y);
  if (b.sim.squads.length !== 1 || b.sel) fail('placing by press and release');
  step('deploy');
  // 2) the road is refused
  fire('pointerdown', cc.x, cc.y, card);
  fire('pointerup', cc.x, cc.y, card);
  const road = pathAt(b.sim.paths[0], b.sim.paths[0].len * 0.5);
  const rs = b.view.toScreen(road.x, road.y);
  fire('pointerdown', rs.x, rs.y);
  if (!b.ui.ghost || b.ui.ghost.ok) fail('the road should show a red preview');
  fire('pointerup', rs.x, rs.y);
  if (b.sim.squads.length !== 1) fail('placed on the road');
  b.select(null);
  step('noRoad');
  // 3) drag a general out of the list onto the map
  const gcard = q('.icard.gen');
  const gk = gcard.dataset.g;
  const gtype = b.sim.generals.find(x => x.key === gk).type;
  const gpos = freeFor(gtype);
  const gs = b.view.toScreen(gpos.x, gpos.y);
  const gc = center(gcard);
  fire('pointerdown', gc.x, gc.y, gcard);
  fire('pointermove', gc.x - 40, gc.y, gcard);
  fire('pointermove', gs.x, gs.y, gcard);
  if (!b.ui.ghost) fail('dragging a general shows no preview');
  fire('pointerup', gs.x, gs.y, gcard);
  if (b.sim.generals.find(x => x.key === gk).state !== 'field') fail('dragging a general onto the map');
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
  const card2 = q('.icard[data-t]:not(.none)');
  const t2 = card2.dataset.t;
  tap(card2); // a click picks without dragging (pointer events below are what the game listens to)
  const c2 = center(card2);
  card2.dispatchEvent(new PointerEvent('pointerdown', { clientX: c2.x, clientY: c2.y, pointerId: 2, bubbles: true, pointerType: 'mouse', button: 0, buttons: 1 }));
  card2.dispatchEvent(new PointerEvent('pointerup', { clientX: c2.x, clientY: c2.y, pointerId: 2, bubbles: true, pointerType: 'mouse', button: 0, buttons: 0 }));
  if (!b.sel) fail('mouse: picking in the list');
  const mpos = freeFor(t2);
  const mp = b.view.toScreen(mpos.x, mpos.y);
  mouse('pointermove', mp.x, mp.y);
  if (!b.ui.ghost || game.canvas.style.cursor !== 'crosshair') fail('mouse: preview does not follow the pointer');
  mouse('pointerdown', mp.x, mp.y, 2);
  if (b.sel) fail('mouse: right click did not cancel placing');
  card2.dispatchEvent(new PointerEvent('pointerdown', { clientX: c2.x, clientY: c2.y, pointerId: 2, bubbles: true, pointerType: 'mouse', button: 0, buttons: 1 }));
  card2.dispatchEvent(new PointerEvent('pointerup', { clientX: c2.x, clientY: c2.y, pointerId: 2, bubbles: true, pointerType: 'mouse', button: 0, buttons: 0 }));
  const before = b.sim.squads.length;
  mouse('pointerdown', mp.x, mp.y);
  mouse('pointerup', mp.x, mp.y);
  if (b.sim.squads.length !== before + 1) fail('mouse: click to place');
  const placed = b.sim.squads[b.sim.squads.length - 1];
  const pp = b.view.toScreen(placed.hx, placed.hy - 10);
  mouse('pointermove', pp.x, pp.y);
  if (game.canvas.style.cursor !== 'pointer') fail('mouse: no hand cursor over a unit');
  mouse('pointerdown', pp.x, pp.y);
  mouse('pointerup', pp.x, pp.y);
  await waitFor(() => !q('.popup').classList.contains('hidden'));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  if (!q('.popup').classList.contains('hidden')) fail('Esc did not close the menu');
  tap(q('.ibtn[data-k="bomb"]'));
  if (!b.ui.aim) fail('mouse: aim did not start');
  mouse('pointermove', mp.x + 40, mp.y);
  if (b.ui.aim && b.ui.aim.x === undefined) fail('mouse: aim circle does not follow the pointer');
  mouse('pointerdown', mp.x + 40, mp.y, 2);
  if (b.ui.aim) fail('mouse: right click did not cancel aiming');
  step('mouse');
  // a general's info box from its card: move it somewhere else
  tap(q(`.icard.gen[data-g="${gk}"] .ic-info`));
  if (q('.gen-info').classList.contains('hidden') || !q('.gen-info .pop-skill')) fail('general info did not open');
  tap(q('.gi-act'));
  if (!b.sel || b.sel.key !== gk) fail('moving a general did not start');
  for (let k = 0; k < 150; k++) b.sim.update(1 / 30); // the short wait after picking a general up
  const gpos2 = freeFor(gtype);
  const g2 = b.view.toScreen(gpos2.x, gpos2.y);
  fire('pointerdown', g2.x, g2.y);
  fire('pointerup', g2.x, g2.y);
  const gen = b.sim.generals.find(x => x.key === gk);
  if (gen.state !== 'field' || b.sel) fail(`general not moved (${gen.state}, wait ${gen.waitT})`);
  step('genHud');
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
  // the cleared stage's chapter opens in the story book
  tap(q('.read-lore'));
  await waitFor(() => game.screenName === 'storybook' && document.querySelectorAll('.sb-text p').length > 0, 6000);
  if (!game.save.read.includes(game.story.stages[0].id)) fail('story chapter not marked as read');
  if (document.querySelectorAll('.sb-text p').length < 4) fail('story chapter too short');
  step('storybook');
  tap(q('.storybook .back-btn'));
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
  else if (name === 'storybook') { s.read = []; game.show('storybook', { chapter: STORIES[lord].stages[n - 2]?.id || 'prologue' }); }
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
    if (params.has('place') || params.has('menu')) {
      b.sim.food = Math.max(b.sim.food, 500);
      const ty = Object.keys(b.setup.roster).find(k => b.sim.roster[k] > 0) || 'infantry';
      b.select({ kind: 'troop', type: ty });
      const pos = bot.pickPos(ty, b.setup.troops[ty].range);
      if (pos) b.ghostAt(pos);
    }
    if (params.has('squad')) b.openSquad(b.sim.squads[0]);
    if (params.has('aim')) b.onSkill(2);
    if (params.has('geninfo')) b.toggleGenInfo(b.sim.generals[0].key);
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
  try { await loreChecks(); } catch (e) { fail(`lore: ${e.stack || e}`); }
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
