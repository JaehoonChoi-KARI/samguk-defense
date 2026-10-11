// Boot, the main loop, and switching between menu screens and battles.

import { unlockAudio, setSoundEnabled, sfx } from './audio.js';
import { playMusic, stopMusic, playJingle, setMusicEnabled, resumeMusic } from './music.js';
import { defaultSave, loadSlot, writeSlot, loadPrefs, writePrefs, defaultPrefs, useTestStorage } from './save.js';
import { STORIES } from './stories.js';
import { LORDS } from './data.js';
import { BattleController } from './battle-ui.js';
import { applyResult, consumeItems } from './progression.js';
import { SCREENS } from './screens.js';
import { fitUi } from './device.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const uiRoot = document.getElementById('ui');
const hudRoot = document.getElementById('hud');

const params = new URLSearchParams(location.search);
const testMode = params.has('autotest') || params.has('shot');
if (testMode) useTestStorage();

const view = { w: 0, h: 0, dpr: 1 };
function resize() {
  fitUi();
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  clearCanvas();
}
function clearCanvas() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1d140c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

const game = {
  canvas,
  hudRoot,
  view,
  prefs: testMode ? defaultPrefs() : loadPrefs(),
  slot: null,
  save: defaultSave(),
  battle: null,
  paused: false,
  screen: null,
  screenName: '',
  updateReady: false,

  get story() { return STORIES[this.save.lord]; },

  persist() {
    if (!testMode && this.slot && this.save.lord) writeSlot(this.slot, this.save);
  },
  savePrefs() {
    if (!testMode) writePrefs(this.prefs);
  },

  applyUpdateIfIdle() {
    if (this.updateReady && !this.battle && (this.screenName === 'title' || this.screenName === 'slots')) location.reload();
  },
  async checkForUpdate() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch { /* offline: just reload from cache */ }
    location.reload();
  },

  // Continue the slot's save, or start a new game (pick a lord) if it is empty.
  openSlot(n) {
    const existing = loadSlot(n);
    this.prefs.lastSlot = n;
    this.savePrefs();
    if (!existing) { this.show('lordSelect', { slot: n }); return; }
    this.slot = n;
    this.save = existing;
    this.show('base');
  },

  newGame(slot, lord, diff = 1) {
    this.slot = slot;
    this.save = defaultSave(lord);
    this.save.diff = diff;
    this.persist();
    const L = LORDS[lord];
    this.show('story', {
      title: `${L.name}의 이야기`,
      sub: L.title,
      lord,
      lines: STORIES[lord].prologue,
      music: 'title',
      btn: '본영으로 ▶',
      next: () => {
        this.save.seen.prologue = true;
        this.persist();
        this.show('base');
      },
    });
  },

  showEnding() {
    const s = this.save;
    s.seen.ending = true;
    this.prefs.endingSeen = true;
    this.savePrefs();
    this.persist();
    this.show('story', {
      title: '🎉 천하통일!',
      sub: `${LORDS[s.lord].name}이(가) 삼국을 하나로 만들었다`,
      lord: s.lord,
      lines: [...this.story.ending, `<b>함께 해 줘서 고마워요!</b> 별 3개를 모으러 다시 도전해 보세요.${this.prefs.endingSeen ? ' 이제 새 게임에서 <b>💀 지옥</b> 난이도를 고를 수 있어요.' : ''}`],
      music: 'title',
      btn: '본영으로 ▶',
      next: () => this.show('base'),
    });
  },

  exitToTitle() {
    this.persist();
    this.slot = null;
    this.save = defaultSave();
    this.show('title');
  },

  show(name, arg) {
    this.hideScreen();
    const scr = SCREENS[name](this, arg);
    this.screen = scr;
    this.screenName = name;
    uiRoot.appendChild(scr.el);
    scr.mount?.();
    if (typeof scr.music === 'string') playMusic(scr.music);
    else if (scr.music === null) stopMusic();
    this.applyUpdateIfIdle();
  },

  hideScreen() {
    if (this.screen) {
      this.screen.unmount?.();
      this.screen.el.remove();
    }
    this.screen = null;
    this.screenName = '';
  },

  startBattle(stageIdx, opts = {}) {
    this.hideScreen();
    if (this.battle) this.battle.destroy();
    const stage = this.story.stages[stageIdx];
    this.battle = new BattleController(this, stageIdx, stage, opts);
    this.paused = false;
    hudRoot.classList.remove('hidden');
    playMusic('battle');
  },

  endBattle() {
    if (this.battle) this.battle.destroy();
    this.battle = null;
    this.paused = false;
    hudRoot.classList.add('hidden');
    clearCanvas();
  },

  pause() {
    if (!this.battle || this.battle.ended || this.paused) return;
    this.paused = true;
    this.persist();
    this.show('pause');
  },

  resume() {
    this.hideScreen();
    this.paused = false;
  },

  restartBattle() {
    const b = this.battle;
    if (!b) return;
    consumeItems(this.save, b.sim.itemsUsed);
    this.persist();
    this.startBattle(b.stageIdx, b.tut && !b.tut.finished ? { tutorial: true } : {});
  },

  quitBattle() {
    const b = this.battle;
    if (!b) return;
    consumeItems(this.save, b.sim.itemsUsed);
    const idx = b.stageIdx;
    this.endBattle();
    this.persist();
    this.show('map', { sel: idx });
  },

  onBattleEnd(r) {
    const out = applyResult(this.save, this.story, r);
    this.endBattle();
    this.persist();
    this.lastResult = { r, out };
    this.show('result', { r, out });
    playJingle(r.won ? 'victory' : 'defeat');
  },

  setSound(on) {
    this.prefs.sound = on;
    setSoundEnabled(on);
    this.savePrefs();
  },

  setMusic(on) {
    this.prefs.music = on;
    setMusicEnabled(on);
    this.savePrefs();
  },
};

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const b = game.battle;
  if (b) {
    if (!game.paused) b.update(dt);
    if (game.battle === b) b.render(ctx, view, game.paused ? 0 : dt);
  }
  requestAnimationFrame(frame);
}

function setupServiceWorker() {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    // iPad keeps home-screen apps suspended instead of relaunching them, so also look for
    // a new version whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  }).catch(() => {});
  // A newer version took over: reload, but only on the title or slot screen.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    game.updateReady = true;
    game.applyUpdateIfIdle();
  });
}

function boot() {
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('contextmenu', e => e.preventDefault());
  // iOS: double-tap zoom and long-press menus get in the way of fast tapping
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  const unlock = () => { unlockAudio(); setTimeout(resumeMusic, 50); };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('touchend', unlock, { passive: true });
  window.addEventListener('click', unlock, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.pause();
      game.persist();
    }
  });
  if (game.prefs.music === undefined) game.prefs.music = true;
  setSoundEnabled(game.prefs.sound);
  setMusicEnabled(game.prefs.music);

  if (testMode) {
    import('./autotest.js').then(m => m.run({ game, view, params }));
  } else {
    game.show('title');
    try { navigator.storage?.persist?.(); } catch { /* best effort */ }
    const secure = location.protocol === 'https:' || location.hostname === 'localhost';
    if ('serviceWorker' in navigator && secure) setupServiceWorker();
  }
  requestAnimationFrame(frame);
}

window.__game = game;
void sfx;
boot();
