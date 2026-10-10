// A battle on screen: owns the Sim and its BattleView, the DOM HUD (top bar, wave panel,
// the unit list on the right, skill and item buttons, unit menus) and all touch input.
//
// Placing units: pick a unit in the list on the right (or drag it out of the list), then
// press on the map. While the finger is down a see-through unit and its range follow it;
// letting go puts the unit there. Units go beside the road, never on it or on each other.

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
const SQUAD_TAP = 36;
const DRAG_START = 12; // px a finger must move before a list press becomes a drag

const PLACE_ERR = {
  road: '길 위에는 놓을 수 없어요. 길 옆에 놓아 주세요',
  overlap: '다른 부대와 너무 가까워요',
  gate: '성문 바로 앞에는 놓을 수 없어요',
  water: '물 위에는 놓을 수 없어요',
  edge: '전장 안쪽에 놓아 주세요',
  food: '군량🌾이 모자라요',
  roster: '남은 부대가 없어요',
  field: '이미 전장에 있어요',
};

export class BattleController {
  constructor(game, stageIdx, stage, opts = {}) {
    this.game = game;
    this.stageIdx = stageIdx;
    this.stage = stage;
    this.setup = battleSetup(game.save, stageIdx, stage, opts);
    this.sim = new Sim(this.setup);
    this.view = new BattleView(this.sim);
    this.sim.isWater = (x, y) => this.view.inWater(x, y);
    this.us = FACTIONS[LORDS[game.save.lord].faction];
    this.ui = { squad: null, aim: null, lordDrag: null, preview: null, ghost: null };
    this.sel = null; // { kind: 'troop', type } | { kind: 'gen', key }
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
    const types = TROOP_KEYS.filter(t => (this.setup.roster[t] || 0) > 0);
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
        ${sim.generals.length ? `<div class="inv-gen">${sim.generals.map(g => `
            <div class="icard gen" data-g="${g.key}">
              <img src="${generalIcon(g.type, GENERALS[g.key].letter, this.us, 56)}" alt="">
              <div class="ic-mid"><b>${GENERALS[g.key].name}<em class="up"></em></b><small>✨ ${GENERALS[g.key].skill}</small></div>
              <i class="ic-badge"></i>
              <button class="ic-info" type="button">i</button>
            </div>`).join('')}</div>` : ''}
        <div class="inv">
          ${types.map(t => `
            <div class="icard" data-t="${t}">
              <img src="${troopIcon(t, this.us, 56)}" alt="">
              <div class="ic-mid"><b>${TROOPS[t].short}<em class="up"></em></b><small class="ic-cost">🌾${TROOPS[t].cost}</small></div>
              <i class="ic-badge"></i>
            </div>`).join('')}
          ${!types.length && !sim.generals.length ? '<div class="inv-empty">데려온 부대가 없어요</div>' : ''}
        </div>
        <div class="gen-info hidden"></div>
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
    this.inv = this.$('.inv');
    this.invGen = this.$('.inv-gen');

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
    this.$('.aim-cancel').addEventListener('click', () => { this.setAim(null); this.select(null); sfx.select(); });
    for (const b of this.el.querySelectorAll('.sbtn')) b.addEventListener('click', () => this.onSkill(+b.dataset.i));
    for (const b of this.el.querySelectorAll('.ibtn')) b.addEventListener('click', () => this.onItem(b.dataset.k));
    for (const c of this.el.querySelectorAll('.icard')) this.bindCard(c);

    // the battlefield is drawn left of the unit list
    this.measureInset = () => { this.view.insetR = this.inv.offsetWidth ? window.innerWidth - this.inv.getBoundingClientRect().left + 6 : 0; };
    this.measureInset();
    window.addEventListener('resize', this.measureInset);
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
    this.$('.pill.gate').classList.toggle('low', sim.gate <= 6);

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
        ? '첫 웨이브 · 준비가 되면 출격!'
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

    // skills and items
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

    this.updateInventory();
    if (this.genInfoKey) this.paintGenInfo(false);
    if (this.popupKind === 'squad') this.refreshPopup();
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
    let text = '';
    if (this.tutorial === 1) text = `👉 <b>오른쪽 목록</b>에서 부대를 고르고, 길 옆을 ${tapWord()}하세요. 누른 채로 움직이면 사거리를 보며 자리를 고를 수 있어요. <b>장수</b>는 무료!`;
    else if (this.tutorial === 2) text = '좋아요! 부대를 하나 더 놓고, 준비가 되면 위의 <b>⚔ 전투 시작!</b>을 누르세요.';
    else if (this.tutorial === 3) text = `👆 <b>군주</b>를 ${dragHow()} 끌어서 옮길 수 있어요. 군주도 직접 싸워요!`;
    else if (this.tutorial === 4) text = `오른쪽 아래 <b>스킬</b>, 왼쪽 아래 <b>아이템</b>을 눌러 보세요. 위치를 고르는 건 화면을 ${tapWord()}!`;
    else if (this.tutorial === 5) text = '놓은 부대를 누르면 <b>승급</b>(더 강하게)하거나 <b>철수</b>할 수 있어요.';
    el.innerHTML = text;
    el.classList.toggle('hidden', !text);
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

  // ---- the unit list (inventory) ----------------------------------------------------------

  // Types the coming wave has, for ▲ marks on the list.
  threatTypes() {
    const w = this.sim.state === 'ready' || this.sim.nextT !== null ? this.sim.nextWave() : this.sim.waves[this.sim.waveIdx];
    return w ? Object.keys(waveSummary(w)) : [];
  }

  genStatus(g) {
    if (g.state === 'field') return { cls: 'field', badge: '⚔', text: '전장에서 싸우는 중' };
    if (g.waitT > 0) return { cls: 'wait', badge: `${Math.ceil(g.waitT)}`, text: `${Math.ceil(g.waitT)}초 뒤에 다시 놓을 수 있어요` };
    return { cls: 'ready', badge: '무료', text: '놓을 수 있어요 (무료)' };
  }

  updateInventory() {
    const sim = this.sim;
    const threats = this.threatTypes();
    const tkey = threats.join(',');
    for (const c of this.el.querySelectorAll('.icard')) {
      let cls, badge, p = 0, type;
      if (c.dataset.g) {
        const g = sim.generals.find(x => x.key === c.dataset.g);
        const st = this.genStatus(g);
        const sp = GEN_SPECIALS[g.kind];
        cls = st.cls;
        badge = st.badge;
        type = g.type;
        if (g.state === 'field') p = sp.cd ? Math.max(0, Math.min(1, 1 - g.squad.specT / sp.cd)) : 1;
        if (this.sel?.kind === 'gen' && this.sel.key === g.key) cls += ' sel';
      } else {
        type = c.dataset.t;
        const left = sim.roster[type] || 0;
        cls = left <= 0 ? 'none' : sim.food < TROOPS[type].cost ? 'poor' : 'ok';
        badge = `×${left}`;
        if (this.sel?.kind === 'troop' && this.sel.type === type) cls += ' sel';
      }
      const lv = bestLevel(type, threats);
      const key = `${cls}|${badge}|${p.toFixed(2)}|${lv}|${tkey}`;
      if (c.dataset.k === key) continue;
      c.dataset.k = key;
      c.className = `icard ${c.dataset.g ? 'gen ' : ''}${cls}`;
      c.style.setProperty('--p', p.toFixed(3));
      c.querySelector('.ic-badge').textContent = badge;
      c.querySelector('.up').textContent = COUNTER_MARK[lv] || '';
      c.querySelector('.up').classList.toggle('very', lv > 1);
    }
  }

  // Press on a list card: a quick tap picks it, dragging carries it onto the map.
  bindCard(c) {
    const info = c.querySelector('.ic-info');
    if (info) {
      info.addEventListener('pointerdown', e => e.stopPropagation());
      info.addEventListener('click', e => { e.stopPropagation(); this.toggleGenInfo(c.dataset.g); });
    }
    let drag = null;
    c.addEventListener('pointerdown', e => {
      if (this.game.paused || this.ended || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
      try { c.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    });
    c.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > DRAG_START) {
        drag.moved = true;
        if (!this.pick(c, true)) { drag = null; return; }
      }
      if (drag.moved) this.ghostAtScreen(e.clientX, e.clientY);
    });
    const end = e => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag;
      drag = null;
      if (e.type === 'pointercancel') { this.ui.ghost = null; return; }
      if (!d.moved) { this.pick(c, false); return; }
      if (this.overMap(e.clientX, e.clientY)) this.tryPlace(this.view.toWorld(e.clientX, e.clientY));
      else this.ui.ghost = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  // Select the unit on a card. `forDrag` keeps it selected even if it was already.
  pick(c, forDrag) {
    const sim = this.sim;
    let sel;
    if (c.dataset.g) {
      const g = sim.generals.find(x => x.key === c.dataset.g);
      if (g.state === 'field') {
        if (!forDrag) this.toggleGenInfo(g.key);
        return false;
      }
      sel = { kind: 'gen', key: g.key };
    } else {
      const t = c.dataset.t;
      if (!(sim.roster[t] > 0)) { sfx.denied(); this.toast(PLACE_ERR.roster); return false; }
      sel = { kind: 'troop', type: t };
    }
    const same = this.sel && this.sel.kind === sel.kind && (this.sel.type === sel.type && this.sel.key === sel.key);
    if (same && !forDrag) { this.select(null); sfx.select(); return false; }
    this.select(sel);
    sfx.select();
    return true;
  }

  select(sel) {
    this.sel = sel;
    this.ui.ghost = null;
    if (sel) {
      this.setAim(null);
      this.closePopup();
      this.closeGenInfo();
    }
    const hint = this.$('.aim-hint');
    if (sel) {
      const name = sel.kind === 'gen' ? `⭐ ${GENERALS[sel.key].name}` : TROOPS[sel.type].name;
      hint.querySelector('.txt').textContent = `${name}: 길 옆을 누르고 있다가 손을 떼면 놓여요`;
      hint.classList.remove('hidden');
    } else if (!this.ui.aim) {
      hint.classList.add('hidden');
    }
    for (const c of this.el.querySelectorAll('.icard')) c.dataset.k = '';
  }

  selInfo() {
    const s = this.sel;
    if (!s) return null;
    if (s.kind === 'gen') {
      const g = this.sim.generals.find(x => x.key === s.key);
      return { type: g.type, range: g.range, gen: true, letter: GENERALS[g.key].letter };
    }
    return { type: s.type, range: this.setup.troops[s.type].range, gen: false };
  }

  overMap(sx, sy) {
    for (const el of [this.inv, this.invGen]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (sx >= r.left - 4 && sx <= r.right + 4 && sy >= r.top - 4 && sy <= r.bottom + 4) return false;
    }
    return true;
  }

  ghostAtScreen(sx, sy) {
    if (!this.overMap(sx, sy)) { this.ui.ghost = null; return; }
    this.ghostAt(this.view.toWorld(sx, sy));
  }

  ghostAt(w) {
    const info = this.selInfo();
    if (!info) { this.ui.ghost = null; return; }
    let ok = this.sim.canPlace(w.x, w.y).ok;
    if (ok && !info.gen && this.sim.food < TROOPS[info.type].cost) ok = false;
    this.ui.ghost = { x: w.x, y: w.y, r: info.range, type: info.type, gen: info.gen, letter: info.letter, melee: TROOPS[info.type].melee, ok };
  }

  tryPlace(w) {
    const s = this.sel;
    this.ui.ghost = null;
    if (!s) return false;
    const r = s.kind === 'gen' ? this.sim.deployGeneral(s.key, w.x, w.y) : this.sim.deploy(s.type, w.x, w.y);
    if (!r.ok) {
      sfx.denied();
      const g = s.kind === 'gen' ? this.sim.generals.find(x => x.key === s.key) : null;
      this.toast(r.reason === 'wait' ? `${Math.ceil(g.waitT)}초 뒤에 놓을 수 있어요` : PLACE_ERR[r.reason] || '여기에는 놓을 수 없어요');
      return false;
    }
    if (s.kind === 'gen') sfx.horn(); else sfx.deploy();
    this.select(null);
    if (this.tutorial === 1) this.advanceTutorial(1);
    else if (this.tutorial === 2 && this.sim.squads.length >= 2) this.refreshTutorial();
    return true;
  }

  // ---- input on the battlefield ------------------------------------------------------------

  bindInput() {
    const cv = this.game.canvas;
    this.ptr = null;
    this.cursor = '';
    this.onDown = e => {
      if (this.game.paused || this.ended) return;
      if (e.pointerType === 'mouse') {
        // right click backs out of placing, aiming or a menu; only the left button plays
        if (e.button === 2) { e.preventDefault(); this.cancelAction(); return; }
        if (e.button !== 0) return;
        this.ptr = null; // a mouse has one pointer: drop a press whose release was missed
      }
      if (this.ptr) return;
      e.preventDefault();
      const w = this.view.toWorld(e.clientX, e.clientY);
      this.ptr = { id: e.pointerId, sx: e.clientX, sy: e.clientY, w, moved: false, mode: null };
      try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      if (this.sel) {
        this.ptr.mode = 'place';
        this.ghostAt(w);
        return;
      }
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
      if (p.mode === 'place') this.ghostAt(w);
      if (p.mode === 'aim' && this.ui.aim) { this.ui.aim.x = w.x; this.ui.aim.y = w.y; }
      if (p.mode === 'lord') this.ui.lordDrag = { x: w.x, y: w.y };
    };
    this.onUp = e => {
      const p = this.ptr;
      if (!p || p.id !== e.pointerId) return;
      this.ptr = null;
      if (e.type === 'pointercancel') { this.ui.lordDrag = null; this.ui.ghost = null; return; }
      const w = this.view.toWorld(e.clientX, e.clientY);
      if (p.mode === 'place') { this.tryPlace(w); return; }
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
      if (!this.ptr) {
        this.ui.hover = null;
        if (this.ui.ghost && this.sel) this.ui.ghost = null;
        if (this.ui.aim) { this.ui.aim.x = undefined; this.ui.aim.y = undefined; }
      }
    };
    // Esc on a PC keyboard: back out of placing, aiming or a menu, otherwise pause
    this.onKey = e => {
      if (e.key !== 'Escape' || this.ended) return;
      if (this.sel || this.ui.aim || this.popupKind || this.genInfoKey) this.cancelAction();
      else if (!this.game.paused) this.game.pause();
    };
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointercancel', this.onUp);
    cv.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('keydown', this.onKey);
  }

  // Mouse only: the placing preview and aiming circle follow the pointer; clickable things
  // get a hand cursor.
  hover(e) {
    if (this.game.paused || this.ended) return;
    const w = this.view.toWorld(e.clientX, e.clientY);
    let cursor = 'default';
    if (this.sel) {
      this.ghostAt(w);
      cursor = 'crosshair';
    } else if (this.ui.aim) {
      this.ui.aim.x = w.x;
      this.ui.aim.y = w.y;
      cursor = 'crosshair';
    } else {
      const L = this.sim.lord;
      if (!L.dead && Math.hypot(w.x - L.x, w.y - (L.y - 20)) < LORD_TAP) cursor = 'grab';
      else if (this.squadAt(w)) cursor = 'pointer';
    }
    this.setCursor(cursor);
  }

  setCursor(c) {
    if (this.cursor === c) return;
    this.cursor = c;
    this.game.canvas.style.cursor = c;
  }

  cancelAction() {
    if (this.sel) { this.select(null); sfx.select(); }
    else if (this.genInfoKey) { this.closeGenInfo(); sfx.select(); }
    else if (this.ui.aim) { this.setAim(null); sfx.select(); }
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
    window.removeEventListener('resize', this.measureInset);
    cv.style.cursor = '';
    clearTimeout(this.bannerT);
    clearTimeout(this.toastT);
    this.root.innerHTML = '';
  }

  squadAt(w) {
    let best = null, bd = SQUAD_TAP;
    for (const q of this.sim.squads) {
      const d = Math.min(Math.hypot(q.x - w.x, q.y - 12 - w.y), Math.hypot(q.hx - w.x, q.hy - 10 - w.y));
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  tap(w) {
    if (this.genInfoKey) this.closeGenInfo();
    const squad = this.squadAt(w);
    if (squad) { this.openSquad(squad); return; }
    if (this.popupKind) { this.closePopup(); return; }
    // tapping open ground sends the lord there
    if (this.sim.moveLord(w.x, w.y)) {
      sfx.select();
      this.advanceTutorial(3);
    }
  }

  // ---- unit menu ---------------------------------------------------------------------------

  placePopup(x, y) {
    const p = this.popup;
    this.view.fit(this.game.view);
    const s = this.view.toScreen(x, y);
    p.classList.remove('hidden');
    const r = p.getBoundingClientRect();
    const W = window.innerWidth - (this.view.insetR || 0), H = window.innerHeight;
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
    this.ui.squad = null;
    this.ui.preview = null;
  }

  relHtml(type) {
    const name = t => TROOPS[t].short;
    const R = relations(type);
    return `<div class="pop-rel"><span class="good">${R.good.map(([t, lv]) => `${COUNTER_MARK[lv]} ${name(t)}`).join(' · ')}</span><span class="bad">${R.bad.map(([t, lv]) => `${COUNTER_MARK[lv]} ${name(t)}`).join(' · ')}</span></div>`;
  }

  openSquad(q) {
    sfx.select();
    this.closePopup();
    this.closeGenInfo();
    this.popupKind = 'squad';
    this.ui.squad = q;
    const T = TROOPS[q.type];
    const area = T.melee ? '<div class="pop-note">점선 원 = 이 부대가 움직이며 막는 구역</div>' : '';
    if (q.gen) {
      const G = GENERALS[q.general];
      this.popup.innerHTML = `
        <div class="pop-title"><img src="${generalIcon(q.type, G.letter, this.us, 48)}" alt=""> ${G.name} <small>${T.name} 장수</small></div>
        <div class="pop-hp"><div class="bar"><i style="width:${(q.hp / q.maxHp) * 100}%"></i></div></div>
        <div class="pop-skill">✨ <b>${G.skill}</b>: ${GEN_SPECIALS[G.kind].text}</div>
        ${this.relHtml(q.type)}${area}
        <div class="pop-btns"><button class="pbtn retreat" type="button">↩ 다른 자리로 옮기기</button></div>`;
    } else {
      const lv = this.setup.troops[q.type].lv;
      this.popup.innerHTML = `
        <div class="pop-title"><img src="${troopIcon(q.type, this.us, 48)}" alt=""> ${T.name} <span class="stars">${'★'.repeat(q.star)}</span> <small>Lv${lv}</small></div>
        <div class="pop-hp"><div class="bar"><i style="width:${(q.hp / q.maxHp) * 100}%"></i></div></div>
        ${this.relHtml(q.type)}${area}
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
          this.toast(r.reason === 'food' ? PLACE_ERR.food : '이미 최고 등급이에요');
        }
      });
    }
    this.popup.querySelector('.retreat').addEventListener('click', e => {
      e.stopPropagation();
      this.sim.retreat(q.id);
      sfx.select();
      this.closePopup();
      if (q.gen) {
        this.select({ kind: 'gen', key: q.general });
        this.toast(`${GENERALS[q.general].name}: 새 자리를 고르세요`);
      }
    });
    this.placePopup(q.x, q.y);
    this.refreshPopup();
  }

  refreshPopup() {
    const sim = this.sim;
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

  // ---- a general's info box (the i on its card) ------------------------------------------

  toggleGenInfo(key) {
    sfx.select();
    if (this.genInfoKey === key) { this.closeGenInfo(); return; }
    this.closePopup();
    this.genInfoKey = key;
    this.paintGenInfo(true);
  }

  closeGenInfo() {
    this.genInfoKey = null;
    const box = this.$('.gen-info');
    box.classList.add('hidden');
    box.innerHTML = '';
  }

  paintGenInfo(full) {
    const box = this.$('.gen-info');
    const g = this.sim.generals.find(x => x.key === this.genInfoKey);
    if (!g) { this.closeGenInfo(); return; }
    const G = GENERALS[g.key];
    const st = this.genStatus(g);
    if (full) {
      box.innerHTML = `
        <div class="pop-title"><img src="${generalIcon(g.type, G.letter, this.us, 48)}" alt=""> ${G.name} <small>${TROOPS[g.type].name} 장수</small></div>
        <div class="pop-skill">✨ <b>${G.skill}</b>: ${GEN_SPECIALS[g.kind].text}</div>
        ${this.relHtml(g.type)}
        <div class="gi-state"></div>
        <div class="pop-hp gi-hp"><div class="bar"><i></i></div></div>
        <div class="pop-btns"><button class="pbtn gi-act" type="button"></button></div>`;
      const edge = (this.invGen || this.inv).getBoundingClientRect().left;
      box.style.right = `${window.innerWidth - edge + 6}px`;
      box.classList.remove('hidden');
      box.querySelector('.gi-act').addEventListener('click', e => {
        e.stopPropagation();
        const cur = this.sim.generals.find(x => x.key === this.genInfoKey);
        if (!cur) return;
        if (cur.state === 'field') this.sim.retreat(cur.squad.id);
        else if (cur.waitT > 0) { sfx.denied(); return; }
        sfx.select();
        this.closeGenInfo();
        this.select({ kind: 'gen', key: cur.key });
      });
    }
    const stateEl = box.querySelector('.gi-state');
    const sp = GEN_SPECIALS[g.kind];
    let extra = '';
    if (g.state === 'field' && sp.cd) extra = g.squad.specT > 0 ? ` · ${G.skill} ${Math.ceil(g.squad.specT)}초 뒤` : ` · ${G.skill} 준비 완료!`;
    const txt = `${st.text}${extra}`;
    if (stateEl.textContent !== txt) stateEl.textContent = txt;
    const hp = box.querySelector('.gi-hp');
    hp.classList.toggle('hidden', g.state !== 'field');
    if (g.state === 'field') hp.querySelector('i').style.width = `${(g.squad.hp / g.squad.maxHp) * 100}%`;
    const act = box.querySelector('.gi-act');
    const label = g.state === 'field' ? '↩ 다른 자리로 옮기기' : g.waitT > 0 ? `⏱ ${Math.ceil(g.waitT)}초 기다려요` : '📍 놓을 곳 고르기';
    if (act.textContent !== label) act.textContent = label;
    act.disabled = g.state !== 'field' && g.waitT > 0;
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
    if (aim && this.sel) { this.sel = null; this.ui.ghost = null; }
    this.ui.aim = aim;
    const hint = this.$('.aim-hint');
    hint.classList.toggle('hidden', !aim && !this.sel);
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
    const r = this.sim.callWave();
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
      this.closeGenInfo();
      this.select(null);
      this.setAim(null);
      if (sim.state === 'won') { sfx.clear(); this.banner('승리!', 'win', 3000); }
      else { sfx.death(); this.banner(sim.lostReason === 'boss' ? `적장 ${this.stage.boss.name}이(가) 성문을 넘었다...` : '성문이 뚫렸다...', 'lose', 3000); }
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
      reason: sim.lostReason || null,
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
          this.banner(e.boss ? `마지막 웨이브! 적장 ${this.stage.boss.name}을(를) 놓치면 패배!` : `웨이브 ${e.i + 1}`, e.boss ? 'boss' : '', 2400);
          if (this.tutorial === 2) this.advanceTutorial(2);
          break;
        case 'boss': sfx.boss(); break;
        case 'leak': sfx.gateHit(); break;
        case 'bossLeak': sfx.gateHit(); break;
        case 'die': if (e.boss) sfx.crit(); else sfx.hit(); break;
        case 'squadDown': sfx.squadDown(); break;
        case 'generalDown': sfx.hurt(); break;
        case 'lordDown': sfx.hurt(); break;
        case 'bow': sfx.bow(); break;
        case 'launch': sfx.stone(); break;
        case 'boom': if (!e.big) sfx.smash(); break;
        case 'cast': sfx.magic(); break;
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
    if (!this.view.insetR && this.inv.offsetWidth) this.measureInset();
    this.view.render(ctx, view, this.ui, dt);
    this.updateHud();
  }
}

export { counterMult };
