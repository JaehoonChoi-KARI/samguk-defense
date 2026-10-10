// A battle on screen: owns the Sim and its BattleView, the DOM HUD (top bar, wave panel,
// skill and item buttons, spot/squad menus) and all touch input on the battlefield.

import {
  TROOPS, TROOP_KEYS, LORDS, SKILLS, ITEMS, ITEM_KEYS, SKILL_UNLOCK, GATE_HP, FACTIONS, fmt, counterMult,
  COUNTER_MARK, bestLevel, relations, GENERALS, GEN_SPECIALS,
} from './data.js';
import { Sim } from './sim.js';
import { BattleView } from './render.js';
import { battleSetup } from './army.js';
import { troopIcon, generalIcon } from './sprites.js';
import { sfx } from './audio.js';
import { waveSummary } from './waves.js';
import { tapWord, dragHow } from './device.js';

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const LORD_TAP = 48;
const SPOT_TAP = 40;

export class BattleController {
  constructor(game, stageIdx, stage, opts = {}) {
    this.game = game;
    this.stageIdx = stageIdx;
    this.stage = stage;
    this.setup = battleSetup(game.save, stageIdx, stage, opts);
    this.sim = new Sim(this.setup);
    this.view = new BattleView(this.sim);
    this.us = FACTIONS[LORDS[game.save.lord].faction];
    this.ui = { spot: null, squad: null, aim: null, lordDrag: null, preview: null };
    this.speed = game.prefs.speed === 2 ? 2 : 1;
    this.ended = false;
    this.endT = 0;
    this.tutorial = stageIdx === 0 && !game.save.seen.tutorial ? 1 : 0;
    this.hudCache = {};
    this.root = game.hudRoot;
    this.buildHud();
    this.bindInput();
    this.refreshTutorial();
  }

  // ---- HUD ----------------------------------------------------------------------------

  buildHud() {
    const sim = this.sim;
    const skills = LORDS[this.game.save.lord].skills;
    this.root.innerHTML = '';
    this.el = h(`
      <div class="bhud">
        <div class="tb-left">
          <div class="pill gate" title="성문 내구도">🏯 <b class="v-gate">${GATE_HP}</b></div>
          <div class="pill food" title="군량">🌾 <b class="v-food">0</b></div>
          <div class="pill wave">⚑ <b class="v-wave">0/${sim.totalWaves}</b></div>
        </div>
        <div class="tb-center">
          <div class="stage-name">${this.stage.title}</div>
          <div class="boss-bar hidden"><span class="boss-name"></span><div class="bar"><i></i></div></div>
        </div>
        <div class="tb-right">
          <button class="hbtn speed" type="button">▶ ${this.speed}배</button>
          <button class="hbtn pause" type="button">⏸</button>
        </div>
        <div class="wave-panel hidden">
          <div class="wp-title"></div>
          <div class="wp-icons"></div>
          <button class="wp-call" type="button"></button>
        </div>
        <div class="items">
          ${ITEM_KEYS.map(k => `
            <button class="ibtn" data-k="${k}" type="button">
              <span class="ico">${ITEMS[k].icon}</span><span class="nm">${ITEMS[k].name}</span><b class="cnt">0</b>
            </button>`).join('')}
        </div>
        <div class="skills">
          ${skills.map((key, i) => `
            <button class="sbtn" data-i="${i}" type="button">
              <span class="ico">${SKILLS[key].icon}</span><span class="nm">${SKILLS[key].name}</span>
              <i class="cd"></i><span class="lock">🔒 Lv${SKILL_UNLOCK[i]}</span>
            </button>`).join('')}
        </div>
        <div class="aim-hint hidden"><span class="txt"></span><button type="button" class="aim-cancel">취소</button></div>
        <div class="banner hidden"></div>
        <div class="toast hidden"></div>
        <div class="tut hidden"></div>
        <div class="popup hidden"></div>
      </div>`);
    this.root.appendChild(this.el);
    this.$ = sel => this.el.querySelector(sel);
    this.popup = this.$('.popup');

    this.$('.pause').addEventListener('click', () => { sfx.select(); this.closePopup(); this.game.pause(); });
    this.$('.speed').addEventListener('click', () => {
      this.speed = this.speed === 1 ? 2 : 1;
      this.$('.speed').textContent = `▶ ${this.speed}배`;
      this.$('.speed').classList.toggle('on', this.speed === 2);
      this.game.prefs.speed = this.speed;
      this.game.savePrefs();
      sfx.select();
    });
    this.$('.speed').classList.toggle('on', this.speed === 2);
    this.$('.wp-call').addEventListener('click', () => this.callWave());
    this.$('.aim-cancel').addEventListener('click', () => { this.setAim(null); sfx.select(); });
    for (const b of this.el.querySelectorAll('.sbtn')) {
      b.addEventListener('click', () => this.onSkill(+b.dataset.i));
    }
    for (const b of this.el.querySelectorAll('.ibtn')) {
      b.addEventListener('click', () => this.onItem(b.dataset.k));
    }
  }

  set(key, sel, value, prop = 'textContent') {
    if (this.hudCache[key] === value) return;
    this.hudCache[key] = value;
    const el = this.$(sel);
    if (el) el[prop] = value;
  }

  updateHud() {
    const sim = this.sim;
    this.set('gate', '.v-gate', String(Math.max(0, sim.gate)));
    this.set('food', '.v-food', fmt(Math.floor(sim.food)));
    this.set('wave', '.v-wave', `${Math.max(0, sim.waveIdx + 1)}/${sim.totalWaves}`);
    const gatePill = this.$('.pill.gate');
    gatePill.classList.toggle('low', sim.gate <= 6);

    // boss bar
    const boss = sim.boss();
    this.$('.boss-bar').classList.toggle('hidden', !boss);
    this.$('.stage-name').classList.toggle('hidden', !!boss);
    if (boss) {
      this.set('bossName', '.boss-name', `${boss.title ? boss.title + ' ' : ''}${boss.name}`);
      this.$('.boss-bar .bar i').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
    }

    // wave panel
    const panel = this.$('.wave-panel');
    const showPanel = sim.state === 'ready' || (sim.state === 'play' && sim.nextT !== null);
    panel.classList.toggle('hidden', !showPanel);
    if (showPanel) {
      const next = sim.nextWave();
      const idx = sim.waveIdx + 1;
      const title = sim.state === 'ready'
        ? `첫 웨이브 · 준비가 되면 출격!`
        : `다음 웨이브 ${idx + 1}/${sim.totalWaves} · ${Math.ceil(sim.nextT)}초`;
      this.set('wpTitle', '.wp-title', title);
      const key = `${idx}`;
      if (this.hudCache.wpIcons !== key && next) {
        this.hudCache.wpIcons = key;
        const sum = waveSummary(next);
        const them = FACTIONS[this.stage.enemy] || FACTIONS.yellow;
        this.$('.wp-icons').innerHTML = TROOP_KEYS.filter(t => sum[t]).map(t => `
          <span class="wpi"><img src="${troopIcon(t, them, 56)}" alt=""><b>${TROOPS[t].short}</b><i>×${sum[t]}</i></span>`).join('')
          + (next.boss ? `<span class="wpi boss"><b>적장</b><i>${this.stage.boss.name}</i></span>` : '')
          + (this.sim.paths.length > 1 ? `<span class="wpi paths">길 ${this.sim.paths.length}개</span>` : '');
      }
      const call = sim.state === 'ready' ? '⚔ 전투 시작!' : `⚔ 바로 출격 +${Math.ceil(sim.nextT * 2)}🌾`;
      this.set('wpCall', '.wp-call', call);
    }

    // skills
    const L = sim.lord;
    sim.skills.forEach((s, i) => {
      const b = this.el.querySelector(`.sbtn[data-i="${i}"]`);
      const locked = !s;
      b.classList.toggle('locked', locked);
      if (locked) return;
      const frac = s.cdT > 0 ? s.cdT / s.cd : 0;
      b.querySelector('.cd').style.height = `${frac * 100}%`;
      b.classList.toggle('ready', frac === 0 && !L.dead);
      b.classList.toggle('dim', L.dead);
      b.classList.toggle('aiming', this.ui.aim?.kind === 'skill' && this.ui.aim.i === i);
    });
    for (const b of this.el.querySelectorAll('.ibtn')) {
      const k = b.dataset.k;
      const n = sim.items[k] || 0;
      this.set(`item${k}`, `.ibtn[data-k="${k}"] .cnt`, String(n));
      b.classList.toggle('empty', n <= 0);
      b.classList.toggle('aiming', this.ui.aim?.kind === 'item' && this.ui.aim.k === k);
    }

    if (this.popupKind === 'spot' || this.popupKind === 'squad') this.refreshPopupCosts();
  }

  banner(text, cls = '', ms = 1800) {
    const b = this.$('.banner');
    b.className = `banner ${cls}`;
    b.textContent = text;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.add('hidden'), ms);
  }

  toast(text) {
    const t = this.$('.toast');
    t.textContent = text;
    t.classList.remove('hidden');
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.add('hidden'), 1600);
  }

  // ---- tutorial (first stage only) ------------------------------------------------------

  refreshTutorial() {
    const el = this.$('.tut');
    if (!this.tutorial) { el.classList.add('hidden'); return; }
    const sim = this.sim;
    let text = '';
    if (this.tutorial === 1) text = '👆 <b>＋ 깃발</b> 자리를 눌러 부대를 배치하세요. 부대는 군량🌾이 들고, <b>장수</b>는 무료예요.';
    else if (this.tutorial === 2) text = '좋아요! 부대를 하나 더 배치하고, 준비가 되면 위의 <b>⚔ 전투 시작!</b>을 누르세요.';
    else if (this.tutorial === 3) text = `👆 <b>군주</b>를 ${dragHow()} 끌어서 옮길 수 있어요. 군주도 직접 싸워요!`;
    else if (this.tutorial === 4) text = `오른쪽 아래 <b>스킬</b>, 왼쪽 아래 <b>아이템</b>을 눌러 보세요. 위치를 고르는 건 화면을 ${tapWord()}!`;
    else if (this.tutorial === 5) text = '배치한 부대를 누르면 <b>승급</b>(더 강하게)하거나 <b>철수</b>할 수 있어요.';
    el.innerHTML = text;
    el.classList.toggle('hidden', !text);
    void sim;
  }

  advanceTutorial(step) {
    if (!this.tutorial || this.tutorial !== step) return;
    this.tutorial++;
    if (this.tutorial > 5) {
      this.tutorial = 0;
      this.game.save.seen.tutorial = true;
      this.game.persist();
    }
    this.refreshTutorial();
  }

  // ---- input -----------------------------------------------------------------------------

  bindInput() {
    const cv = this.game.canvas;
    this.ptr = null;
    this.cursor = '';
    this.onDown = e => {
      if (this.game.paused || this.ended) return;
      if (e.pointerType === 'mouse') {
        // right click backs out of aiming or a menu; only the left button plays
        if (e.button === 2) { e.preventDefault(); this.cancelAction(); return; }
        if (e.button !== 0) return;
        this.ptr = null; // a mouse has one pointer: drop a press whose release was missed
      }
      if (this.ptr) return;
      e.preventDefault();
      const w = this.view.toWorld(e.clientX, e.clientY);
      this.ptr = { id: e.pointerId, sx: e.clientX, sy: e.clientY, w, moved: false, mode: null };
      try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      if (this.ui.aim) {
        this.ptr.mode = 'aim';
        this.ui.aim.x = w.x;
        this.ui.aim.y = w.y;
        return;
      }
      const L = this.sim.lord;
      if (!L.dead && Math.hypot(w.x - L.x, w.y - (L.y - 20)) < LORD_TAP) {
        this.ptr.mode = 'lord';
        this.closePopup();
        this.ui.lordDrag = { x: L.x, y: L.y };
        this.setCursor('grabbing');
      }
    };
    this.onMove = e => {
      const p = this.ptr;
      if (!p || p.id !== e.pointerId) {
        if (!p && e.pointerType === 'mouse') this.hover(e);
        return;
      }
      const w = this.view.toWorld(e.clientX, e.clientY);
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 10) p.moved = true;
      p.w = w;
      if (p.mode === 'aim' && this.ui.aim) { this.ui.aim.x = w.x; this.ui.aim.y = w.y; }
      if (p.mode === 'lord') this.ui.lordDrag = { x: w.x, y: w.y };
    };
    this.onUp = e => {
      const p = this.ptr;
      if (!p || p.id !== e.pointerId) return;
      this.ptr = null;
      if (e.type === 'pointercancel') { this.ui.lordDrag = null; return; }
      const w = this.view.toWorld(e.clientX, e.clientY);
      if (p.mode === 'aim') { this.fireAim(w); return; }
      if (p.mode === 'lord') {
        this.ui.lordDrag = null;
        this.setCursor('grab');
        if (p.moved) {
          this.sim.moveLord(w.x, w.y);
          sfx.select();
          this.advanceTutorial(3);
        }
        return;
      }
      this.tap(w);
    };
    this.onLeave = () => {
      this.ui.hover = null;
      if (this.ui.aim && !this.ptr) { this.ui.aim.x = undefined; this.ui.aim.y = undefined; }
    };
    // Esc on a PC keyboard: back out of aiming or a menu, otherwise pause
    this.onKey = e => {
      if (e.key !== 'Escape' || this.ended) return;
      if (this.ui.aim || this.popupKind) this.cancelAction();
      else if (!this.game.paused) this.game.pause();
    };
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointercancel', this.onUp);
    cv.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('keydown', this.onKey);
  }

  // Mouse only: the aiming circle follows the pointer, things you can click get a hand cursor.
  hover(e) {
    if (this.game.paused || this.ended) return;
    const w = this.view.toWorld(e.clientX, e.clientY);
    let cursor = 'default';
    let hov = null;
    if (this.ui.aim) {
      this.ui.aim.x = w.x;
      this.ui.aim.y = w.y;
      cursor = 'crosshair';
    } else {
      const L = this.sim.lord;
      if (!L.dead && Math.hypot(w.x - L.x, w.y - (L.y - 20)) < LORD_TAP) cursor = 'grab';
      else {
        const sq = this.squadAt(w);
        const spot = sq ? this.sim.spots[sq.spot] : this.spotAt(w);
        if (spot) { cursor = 'pointer'; hov = spot.id; }
      }
    }
    this.ui.hover = hov;
    this.setCursor(cursor);
  }

  setCursor(c) {
    if (this.cursor === c) return;
    this.cursor = c;
    this.game.canvas.style.cursor = c;
  }

  cancelAction() {
    if (this.ui.aim) { this.setAim(null); sfx.select(); }
    else if (this.popupKind) { this.closePopup(); sfx.select(); }
  }

  destroy() {
    const cv = this.game.canvas;
    cv.removeEventListener('pointerdown', this.onDown);
    cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('pointercancel', this.onUp);
    cv.removeEventListener('pointerleave', this.onLeave);
    window.removeEventListener('keydown', this.onKey);
    cv.style.cursor = '';
    clearTimeout(this.bannerT);
    clearTimeout(this.toastT);
    this.root.innerHTML = '';
  }

  spotAt(w) {
    let best = null, bd = SPOT_TAP;
    for (const s of this.sim.spots) {
      const d = Math.hypot(s.x - w.x, s.y - (w.y + 6));
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  squadAt(w) {
    let best = null, bd = 34;
    for (const q of this.sim.squads) {
      const melee = TROOPS[q.type].melee;
      const x = melee ? q.x : q.sx, y = melee ? q.y : q.sy;
      const d = Math.hypot(x - w.x, y - 12 - w.y);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  tap(w) {
    const spot = this.spotAt(w);
    const squad = this.squadAt(w) || (spot && spot.squad);
    if (squad) { this.openSquad(squad); return; }
    if (spot && !spot.squad) { this.openSpot(spot); return; }
    if (this.popupKind) { this.closePopup(); return; }
    // tapping open ground sends the lord there
    if (this.sim.moveLord(w.x, w.y)) {
      sfx.select();
      this.advanceTutorial(3);
    }
  }

  // ---- spot / squad menus ---------------------------------------------------------------

  placePopup(x, y) {
    const p = this.popup;
    this.view.fit(this.game.view);
    const s = this.view.toScreen(x, y);
    p.classList.remove('hidden');
    const r = p.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    let left = s.x - r.width / 2;
    let top = s.y + 36;
    if (top + r.height > H - 8) top = s.y - r.height - 40;
    left = Math.max(8, Math.min(W - r.width - 8, left));
    top = Math.max(60, Math.min(H - r.height - 8, top));
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
  }

  closePopup() {
    this.popup.classList.add('hidden');
    this.popup.innerHTML = '';
    this.popupKind = null;
    this.ui.spot = null;
    this.ui.squad = null;
    this.ui.preview = null;
  }

  // Types the coming wave has, for ▲ marks on troop buttons.
  threatTypes() {
    const w = this.sim.state === 'ready' || this.sim.nextT !== null ? this.sim.nextWave() : this.sim.waves[this.sim.waveIdx];
    return w ? Object.keys(waveSummary(w)) : [];
  }

  openSpot(spot) {
    sfx.select();
    this.closePopup();
    this.popupKind = 'spot';
    this.ui.spot = spot.id;
    const sim = this.sim;
    const types = TROOP_KEYS.filter(t => (this.setup.roster[t] || 0) > 0);
    const threats = this.threatTypes();
    const mark = t => {
      const lv = bestLevel(t, threats);
      return lv > 0 ? `<em class="up${lv > 1 ? ' very' : ''}">${COUNTER_MARK[lv]}</em>` : '';
    };
    const gens = sim.generals;
    if (!types.length && !gens.length) {
      this.popup.innerHTML = '<div class="pop-title">데려온 부대가 없어요</div>';
    } else {
      this.popup.innerHTML = `
        <div class="pop-title">어떤 부대를 배치할까요?</div>
        ${gens.length ? `<div class="gen-row">${gens.map(g => `
          <button class="tbtn gbtn" data-g="${g.key}" type="button">
            <img src="${generalIcon(g.type, GENERALS[g.key].letter, this.us, 64)}" alt="">
            <span class="tn">${GENERALS[g.key].name}${mark(g.type)}</span>
            <span class="tcost free">무료</span>
            <span class="tleft"></span>
          </button>`).join('')}</div>` : ''}
        <div class="troop-grid">
          ${types.map(t => `
            <button class="tbtn" data-t="${t}" type="button">
              <img src="${troopIcon(t, this.us, 64)}" alt="">
              <span class="tn">${TROOPS[t].name}${mark(t)}</span>
              <span class="tcost">🌾${TROOPS[t].cost}</span>
              <span class="tleft">남은 ${sim.roster[t] || 0}</span>
            </button>`).join('')}
        </div>
        <div class="pop-note">▲▲ 아주 강함 · ▲ 강함 (이번 웨이브 적에게)</div>`;
      for (const b of this.popup.querySelectorAll('.tbtn')) {
        b.addEventListener('click', e => {
          e.stopPropagation();
          if (b.dataset.g) this.deployGeneral(spot, b.dataset.g);
          else this.deploy(spot, b.dataset.t);
        });
      }
    }
    this.placePopup(spot.x, spot.y);
    this.refreshPopupCosts();
  }

  deployGeneral(spot, key) {
    const r = this.sim.deployGeneral(spot.id, key);
    if (!r.ok) {
      sfx.denied();
      const g = this.sim.generals.find(x => x.key === key);
      this.toast(r.reason === 'field' ? '이미 전장에 있어요' : r.reason === 'wait' ? `${Math.ceil(g.waitT)}초 뒤에 배치할 수 있어요` : '여기에는 배치할 수 없어요');
      return;
    }
    sfx.horn();
    this.closePopup();
    if (this.tutorial === 1) this.advanceTutorial(1);
  }

  deploy(spot, t) {
    const r = this.sim.deploy(spot.id, t);
    if (!r.ok) {
      sfx.denied();
      this.toast(r.reason === 'food' ? '군량🌾이 모자라요' : r.reason === 'roster' ? '남은 부대가 없어요' : '여기에는 배치할 수 없어요');
      return;
    }
    sfx.deploy();
    this.closePopup();
    if (this.tutorial === 1) this.advanceTutorial(1);
    else if (this.tutorial === 2 && this.sim.squads.length >= 2) this.refreshTutorial();
  }

  relHtml(type) {
    const name = t => TROOPS[t].short;
    const R = relations(type);
    return `<div class="pop-rel"><span class="good">${R.good.map(([t, lv]) => `${COUNTER_MARK[lv]} ${name(t)}`).join(' · ')}</span><span class="bad">${R.bad.map(([t, lv]) => `${COUNTER_MARK[lv]} ${name(t)}`).join(' · ')}</span></div>`;
  }

  openSquad(q) {
    sfx.select();
    this.closePopup();
    this.popupKind = 'squad';
    this.ui.squad = q;
    const T = TROOPS[q.type];
    if (q.gen) {
      const G = GENERALS[q.general];
      this.popup.innerHTML = `
        <div class="pop-title"><img src="${generalIcon(q.type, G.letter, this.us, 48)}" alt=""> ${G.name} <small>${T.name} 장수</small></div>
        <div class="pop-hp"><div class="bar"><i style="width:${(q.hp / q.maxHp) * 100}%"></i></div></div>
        <div class="pop-skill">✨ <b>${G.skill}</b>: ${GEN_SPECIALS[G.kind].text}</div>
        ${this.relHtml(q.type)}
        <div class="pop-btns"><button class="pbtn retreat" type="button">↩ 다른 자리로 옮기기</button></div>`;
    } else {
      const lv = this.setup.troops[q.type].lv;
      this.popup.innerHTML = `
        <div class="pop-title"><img src="${troopIcon(q.type, this.us, 48)}" alt=""> ${T.name} <span class="stars">${'★'.repeat(q.star)}</span> <small>Lv${lv}</small></div>
        <div class="pop-hp"><div class="bar"><i style="width:${(q.hp / q.maxHp) * 100}%"></i></div></div>
        ${this.relHtml(q.type)}
        <div class="pop-btns">
          <button class="pbtn promote" type="button"></button>
          <button class="pbtn retreat" type="button"></button>
        </div>`;
      this.popup.querySelector('.promote').addEventListener('click', e => {
        e.stopPropagation();
        const r = this.sim.promote(q.id);
        if (r.ok) {
          sfx.upgrade();
          this.advanceTutorial(5);
          this.openSquad(q);
        } else {
          sfx.denied();
          this.toast(r.reason === 'food' ? '군량🌾이 모자라요' : '이미 최고 등급이에요');
        }
      });
    }
    this.popup.querySelector('.retreat').addEventListener('click', e => {
      e.stopPropagation();
      this.sim.retreat(q.id);
      sfx.select();
      this.closePopup();
      if (q.gen) this.toast(`${GENERALS[q.general].name}: 깃발 자리를 눌러 다시 세우세요`);
    });
    this.placePopup(T.melee ? q.x : q.sx, T.melee ? q.y : q.sy);
    this.refreshPopupCosts();
  }

  refreshPopupCosts() {
    const sim = this.sim;
    if (this.popupKind === 'spot') {
      for (const b of this.popup.querySelectorAll('.tbtn')) {
        const tl = b.querySelector('.tleft');
        let s;
        if (b.dataset.g) {
          const g = sim.generals.find(x => x.key === b.dataset.g);
          const busy = g.state === 'field' || g.waitT > 0;
          b.classList.toggle('none-left', busy);
          s = g.state === 'field' ? '전장에 있음' : g.waitT > 0 ? `${Math.ceil(g.waitT)}초 뒤` : '배치 가능';
        } else {
          const t = b.dataset.t;
          const left = sim.roster[t] || 0;
          b.classList.toggle('no-food', sim.food < TROOPS[t].cost);
          b.classList.toggle('none-left', left <= 0);
          s = `남은 ${left}`;
        }
        if (tl.textContent !== s) tl.textContent = s;
      }
    } else if (this.popupKind === 'squad') {
      const q = this.ui.squad;
      if (!q || !sim.squads.includes(q)) { this.closePopup(); return; }
      const bar = this.popup.querySelector('.pop-hp i');
      if (bar) bar.style.width = `${(q.hp / q.maxHp) * 100}%`;
      if (q.gen) return;
      const cost = sim.starCost(q);
      const pb = this.popup.querySelector('.promote');
      const ptxt = cost === null ? '★ 최고 등급' : `⬆ 승급 ★${q.star + 1} · 🌾${cost}`;
      if (pb.textContent !== ptxt) pb.textContent = ptxt;
      pb.disabled = cost === null;
      pb.classList.toggle('no-food', cost !== null && sim.food < cost);
      const rb = this.popup.querySelector('.retreat');
      const rtxt = `↩ 철수 +🌾${Math.floor(q.spent * 0.5)}`;
      if (rb.textContent !== rtxt) rb.textContent = rtxt;
    }
  }

  // ---- skills, items, waves --------------------------------------------------------------

  onSkill(i) {
    const s = this.sim.skills[i];
    if (!s) { sfx.denied(); this.toast(`군주 레벨 ${SKILL_UNLOCK[i]}에 배워요`); return; }
    if (this.ui.aim?.kind === 'skill' && this.ui.aim.i === i) { this.setAim(null); sfx.select(); return; }
    if (this.sim.lord.dead) { sfx.denied(); this.toast('군주가 돌아오면 쓸 수 있어요'); return; }
    if (s.cdT > 0) { sfx.denied(); this.toast(`${Math.ceil(s.cdT)}초 뒤에 쓸 수 있어요`); return; }
    const def = SKILLS[s.key];
    if (def.target === 'self') {
      this.castSkill(i, 0, 0);
      return;
    }
    this.closePopup();
    this.setAim({ kind: 'skill', i, r: def.radius || def.width || 60, label: `${def.icon} ${def.name}: ${def.target === 'path' ? '길 위를' : '위치를'} ${tapWord()}하세요` });
    sfx.select();
  }

  castSkill(i, x, y) {
    const r = this.sim.castSkill(i, x, y);
    if (!r.ok) {
      sfx.denied();
      this.toast(r.reason === 'path' ? '길 위를 골라 주세요' : '지금은 쓸 수 없어요');
      return false;
    }
    const key = this.sim.skills[i].key;
    ({ lb_whirl: sfx.spin, lb_heal: sfx.heal, lb_militia: sfx.drum, cc_dash: sfx.dash, cc_roar: sfx.horn, cc_cavalry: sfx.smash, sq_rain: sfx.bow, sq_fire: sfx.fireball, sq_guard: sfx.upgrade }[key] || sfx.confirm)();
    this.advanceTutorial(4);
    return true;
  }

  onItem(k) {
    if (this.ui.aim?.kind === 'item' && this.ui.aim.k === k) { this.setAim(null); sfx.select(); return; }
    if (!(this.sim.items[k] > 0)) { sfx.denied(); this.toast(`${ITEMS[k].name}이(가) 없어요. 정비에서 챙겨 오세요`); return; }
    this.closePopup();
    const def = ITEMS[k];
    this.setAim({ kind: 'item', k, r: def.radius || 40, label: `${def.icon} ${def.name}: ${k === 'wall' ? '길 위를' : '위치를'} ${tapWord()}하세요` });
    sfx.select();
  }

  setAim(aim) {
    this.ui.aim = aim;
    const hint = this.$('.aim-hint');
    hint.classList.toggle('hidden', !aim);
    if (aim) hint.querySelector('.txt').textContent = aim.label;
  }

  fireAim(w) {
    const aim = this.ui.aim;
    if (!aim) return;
    let ok;
    if (aim.kind === 'skill') ok = this.castSkill(aim.i, w.x, w.y);
    else {
      const r = this.sim.useItem(aim.k, w.x, w.y);
      ok = r.ok;
      if (!ok) { sfx.denied(); this.toast(r.reason === 'path' ? '길 위를 골라 주세요' : '쓸 수 없어요'); }
      else {
        ({ potion: sfx.heal, bomb: sfx.explode, wall: sfx.deploy })[aim.k]();
        this.advanceTutorial(4);
      }
    }
    if (ok) this.setAim(null);
    else { this.ui.aim.x = undefined; }
  }

  callWave() {
    const sim = this.sim;
    const r = sim.callWave();
    if (!r.ok) return;
    sfx.drum();
    if (r.bonus) this.toast(`일찍 출격! +${r.bonus}🌾`);
    if (this.tutorial === 2) this.advanceTutorial(2);
  }

  // ---- frame -----------------------------------------------------------------------------

  update(dt) {
    const sim = this.sim;
    const steps = this.speed === 2 ? 2 : 1;
    for (let i = 0; i < steps; i++) sim.update(dt);
    this.game.save.playSec += dt;
    this.handleEvents();
    if (!this.ended && (sim.state === 'won' || sim.state === 'lost')) {
      this.ended = true;
      this.endT = 1.6;
      this.closePopup();
      this.setAim(null);
      if (sim.state === 'won') { sfx.clear(); this.banner('승리!', 'win', 3000); }
      else { sfx.death(); this.banner('성문이 뚫렸다...', 'lose', 3000); }
    }
    if (this.ended) {
      this.endT -= dt;
      if (this.endT <= 0 && !this.reported) {
        this.reported = true;
        this.game.onBattleEnd(this.result());
      }
    }
  }

  result() {
    const sim = this.sim;
    return {
      stageIdx: this.stageIdx,
      won: sim.state === 'won',
      stars: sim.state === 'won' ? sim.stars() : 0,
      gate: sim.gate,
      kills: sim.stats.kills,
      lost: sim.stats.lost,
      itemsUsed: { ...sim.itemsUsed },
      wavesReached: sim.waveIdx + 1,
      totalWaves: sim.totalWaves,
      time: sim.time,
    };
  }

  handleEvents() {
    const ev = this.sim.events;
    if (!ev.length) return;
    this.view.absorb(ev);
    for (const e of ev) {
      switch (e.k) {
        case 'wave':
          sfx.horn();
          this.banner(e.boss ? `마지막 웨이브! 적장 ${this.stage.boss.name}이(가) 온다!` : `웨이브 ${e.i + 1}`, e.boss ? 'boss' : '', 2000);
          if (this.tutorial === 2) this.advanceTutorial(2);
          break;
        case 'boss': sfx.boss(); break;
        case 'leak': sfx.gateHit(); break;
        case 'die': if (e.boss) sfx.crit(); else sfx.hit(); break;
        case 'squadDown': sfx.squadDown(); break;
        case 'generalDown': sfx.hurt(); break;
        case 'lordDown': sfx.hurt(); break;
        case 'bow': sfx.bow(); break;
        case 'launch': sfx.stone(); break;
        case 'boom': if (!e.big) sfx.smash(); break;
        case 'cast': sfx.magic(); break;
        case 'promote': break;
        case 'bossSkill':
          this.banner(`${e.name}: ${{ charge: '돌격!', summon: '지원군을 불렀다!', heal: '요술로 병사를 치료!', rally: '호령! 병사들이 강해졌다!', volley: '일제 사격!' }[e.skill]}`, 'boss', 1500);
          break;
        default: break;
      }
    }
    this.sim.events = [];
    if (this.tutorial === 3 && this.sim.waveIdx >= 0 && this.sim.time > 25) this.advanceTutorial(3);
    if (this.tutorial === 4 && this.sim.time > 60) this.advanceTutorial(4);
  }

  render(ctx, view, dt) {
    this.view.render(ctx, view, this.ui, dt);
    this.updateHud();
  }
}

export { counterMult };
