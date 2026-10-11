// The first battle doubles as a tutorial. One step at a time: while a step explains something
// the battle waits, a glowing ring points at the button or the spot it talks about, and a step
// that asks for an action only moves on once the player has done it.

import { TROOPS, SKILLS, GENERALS, LORDS, GEN_SPECIALS, holdsRoad } from './data.js';
import { Bot } from './bot.js';
import { tapWord } from './device.js';

// Korean particles after a name: josa('보병', '을', '를') → '보병을'
const josa = (w, withFinal, without) => {
  const k = w.charCodeAt(w.length - 1) - 0xac00;
  return w + (k >= 0 && k < 11172 && k % 28 ? withFinal : without);
};
// melee = a type that stands and stops enemies (not 기마병, who ride through)
const firstOf = (c, melee) => Object.keys(c.setup.roster).find(t => c.setup.roster[t] > 0 && (melee ? holdsRoad(t) : !TROOPS[t].melee));
const cardOf = t => `.icard[data-t="${t}"]`;
const plainSquads = c => c.sim.squads.filter(q => !q.gen);
const spot = (c, type, range) => {
  c.tutBot = c.tutBot || new Bot(c.sim, {});
  return type ? c.tutBot.pickPos(type, range) : null;
};

// Each step: title, text(c), focus (DOM selector, or c => selector), mark (c => world point for
// a ring on the battlefield; follow: re-aim it every frame), start(c) (wait until true, battle
// running), skip(c) (not needed now), done(c) (the action it asks for; steps without it have a
// 다음 button), enter(c).
export const TUT_STEPS = [
  {
    key: 'welcome', title: '🏯 성을 지켜라!',
    text: c => `적은 길을 따라 <b>성문</b>으로 몰려와요. 적이 성문에 닿으면 왼쪽 위 <b>🏯 성문</b> 숫자가 줄고, 0이 되면 져요.<br>마지막 웨이브에 나오는 <b>적장 ${josa(c.stage.boss.name, '</b>이', '</b>가')} 성문을 넘어도 바로 져요.`,
    focus: '.pill.gate',
    mark: c => ({ x: c.sim.layout.gate.x, y: c.sim.layout.gate.y }),
  },
  {
    key: 'food', title: '🌾 군량과 웨이브',
    text: () => '<b>🌾 군량</b>으로 부대를 놓고 강하게 만들어요. 적을 쓰러뜨리면 군량이 생기고, 싸우는 동안 조금씩 저절로 늘어요.<br><b>⚑</b>는 적이 몇 번(웨이브)에 나눠 오는지 보여 줘요.',
    focus: '.pill.food, .pill.wave',
  },
  {
    key: 'melee', title: '🛡 부대 놓기: 길을 막는 부대',
    text: c => { const t = firstOf(c, true); return `오른쪽 목록에서 <b>${josa(TROOPS[t].name, '</b>을', '</b>를')} 누르고, 반짝이는 칸을 ${tapWord()}하세요.<br>누른 채로 움직이면 칸을 바꿀 수 있어요. ${josa(TROOPS[t].name, '은', '는')} 길로 달려 나가 <b>적을 막아요</b>.`; },
    focus: c => cardOf(firstOf(c, true)),
    mark: c => { const t = firstOf(c, true); return spot(c, t, c.setup.troops[t].range); },
    skip: c => !firstOf(c, true),
    done: c => plainSquads(c).some(q => holdsRoad(q.type)),
  },
  {
    key: 'ranged', title: '🏹 부대 놓기: 멀리 쏘는 부대',
    text: c => { const t = firstOf(c, false); return `이번엔 <b>${TROOPS[t].name}</b>! 멀리서 공격하지만 몸이 약해요.<br>막는 부대 <b>뒤쪽</b>, 길이 잘 보이는 칸에 놓아 보세요.`; },
    focus: c => cardOf(firstOf(c, false)),
    mark: c => { const t = firstOf(c, false); return spot(c, t, c.setup.troops[t].range); },
    skip: c => !firstOf(c, false),
    done: c => plainSquads(c).some(q => !TROOPS[q.type].melee),
  },
  {
    key: 'general', title: '⭐ 장수 출진!',
    text: c => { const g = c.sim.generals[0]; const G = GENERALS[g.key]; return `위쪽 장수 카드를 눌러 놓아 보세요. 장수는 <b>군량 없이</b> 놓고 아주 강해요.<br><b>${G.name}</b>의 특별한 기술: ✨ ${G.skill} (${GEN_SPECIALS[g.kind].text}).<br>쓰러져도 잠시 뒤 다시 놓을 수 있어요.`; },
    focus: '.inv-gen .icard',
    mark: c => { const g = c.sim.generals[0]; return spot(c, g.type, g.range); },
    skip: c => !c.sim.generals.length,
    done: c => c.sim.generals.some(g => g.state === 'field'),
  },
  {
    key: 'ground', title: '🧱 진지 칸과 지형',
    text: () => '부대는 길 옆 <b>진지 칸</b>에만 놓아요. ⛰️언덕(원거리 사거리↑) · 🌲숲(매복) · 🚧길목(더 많이 막기) 칸은 특별해요.<br>같은 병종 셋을 한 줄로 놓거나 창병 옆에 궁수를 놓으면 <b>진형</b>이 생겨요. 놓을 때 이름이 떠요!',
  },
  {
    key: 'start', title: '⚔ 전투 시작!',
    text: () => '가운데 위 <b>안내판</b>에 다음 웨이브에 올 적이 보여요. ▲ 표시는 "내 부대가 이 적에게 강해요"라는 뜻이에요.<br>준비가 됐으면 <b>⚔ 전투 시작!</b>을 누르세요.',
    focus: '.wave-panel',
    done: c => c.sim.state !== 'ready',
  },
  {
    key: 'kill', title: '👍 잘했어요!',
    text: () => '적을 쓰러뜨리면 <b>🌾 군량</b>이 생겨요.<br>병종마다 강한 상대가 있어요(<b>상성</b>). 화면에 ▲가 뜨면 강하게 때린 거예요. 일시정지(⏸)나 본영에서 상성표를 볼 수 있어요.',
    focus: '.pill.food',
    start: c => c.sim.stats.kills > 0,
  },
  {
    key: 'break', title: '⏳ 쉬는 시간',
    text: () => '이번 웨이브의 적이 모두 나왔어요. 다음 웨이브까지 <b>25초</b> 쉬어요.<br>이때 부대를 더 놓거나 강하게 만들어요. 준비가 끝나면 <b>⚔ 바로 출격</b>으로 일찍 불러도 돼요(군량 보너스!).',
    focus: '.wave-panel',
    start: c => c.sim.nextT !== null || c.sim.waveIdx >= 1,
  },
  {
    key: 'tapSquad', title: '⬆ 승급: 부대를 강하게',
    text: () => '놓은 부대는 <b>승급</b>할 수 있어요! 반짝이는 부대를 눌러 보세요.',
    mark: c => { const q = plainSquads(c)[0]; return q && { x: q.x, y: q.y }; }, follow: true,
    skip: c => !plainSquads(c).some(q => q.star < 3),
    enter: c => {
      const costs = plainSquads(c).map(q => c.sim.starCost(q)).filter(v => v !== null);
      const need = costs.length ? Math.min(...costs) : 0;
      if (c.sim.food < need) {
        const gift = Math.ceil(need - c.sim.food);
        c.sim.food += gift;
        c.toast(`🎁 튜토리얼 선물: 군량 +${gift}`);
      }
    },
    done: c => c.popupKind === 'squad' && c.ui.squad && !c.ui.squad.gen,
  },
  {
    key: 'promote', title: '⬆ 승급 버튼',
    text: () => '<b>⬆ 승급</b>을 누르면 별(★)이 늘고 체력·공격이 크게 올라요. ★3까지!<br><b>↩ 철수</b>는 부대를 거두고 군량 절반을 돌려받아요. (메뉴를 닫았다면 부대를 다시 누르세요)',
    focus: '.popup .promote',
    done: c => c.sim.stats.promoted > 0,
  },
  {
    key: 'skill', title: '👑 군주의 명령',
    text: c => { const s = SKILLS[c.sim.skills[0].key]; return `${josa(LORDS[c.sim.setup.lordKey].name, '은', '는')} 성 안에서 지휘해요. 오른쪽 아래 <b>${s.icon} ${s.name}</b>을 눌러 보세요!<br>${s.desc(1)}.<br>한 번 쓰면 <b>3분</b>을 기다려야 하니, 적이 많을 때 쓰는 게 좋아요.`; },
    focus: '.sbtn[data-i="0"]',
    start: c => (c.sim.waveIdx >= 1 && c.sim.foes.length >= 3) || c.sim.waveIdx >= 2,
    skip: c => !c.sim.skills[0] || c.sim.stats.skills > 0,
    done: c => c.sim.stats.skills > 0,
  },
  {
    key: 'item', title: '🎒 아이템',
    text: () => `왼쪽 아래는 아이템이에요. 🌿 회복 약초(부대 회복) · 💣 벽력탄(쾅!) · 🪵 목책(길 막기).<br><b>💣 벽력탄</b>을 누르고, 적이 모인 곳을 ${tapWord()}해 보세요. 아이템은 정비 화면에서 사서 챙겨요.`,
    focus: '.ibtn[data-k="bomb"]',
    mark: c => { const f = c.sim.foes[0]; return f && { x: f.x, y: f.y }; }, follow: true,
    start: c => c.sim.foes.length >= 2,
    enter: c => {
      if (!(c.sim.items.bomb > 0)) {
        c.sim.items.bomb = 1;
        c.toast('🎁 튜토리얼 선물: 벽력탄 1개');
      }
    },
    done: c => c.sim.stats.items > 0,
  },
  {
    key: 'speed', title: '⏩ 이제 혼자서!',
    text: () => '오른쪽 위 <b>▶ 1배</b>를 누르면 2배로 빨라지고, <b>⏸</b>는 잠깐 멈춰요.<br>남은 웨이브는 혼자 막아 보세요. 부대를 더 놓고, 승급하고, 명령을 쓰는 거예요!',
    focus: '.tb-right',
  },
  {
    key: 'boss', title: '👹 적장 등장!',
    text: c => `<b>${josa(c.stage.boss.name, '</b>이', '</b>가')} 나타났어요! 적장이 성문을 넘으면 바로 져요.<br>장수와 부대로 막으세요. 우리 장수가 적장 옆에 가면 <b>⚔ 일기토</b>! 이기면 적장이 크게 다치고 적병이 달아나요.`,
    focus: '.boss-bar',
    mark: c => { const b = c.sim.boss(); return b && { x: b.x, y: b.y }; }, follow: true,
    start: c => { const b = c.sim.boss(); return !!b && b.d > 60; },
  },
];

export class Tutorial {
  constructor(ctl) {
    this.ctl = ctl;
    this.i = 0;
    this.active = null;
    this.finished = false;
    this.el = ctl.$('.tut');
    this.focused = [];
    this.tick = 0;
    this.el.addEventListener('click', e => {
      if (e.target.closest('.tut-next')) this.next();
      else if (e.target.closest('.tut-skip')) this.stop(true);
    });
    this.el.addEventListener('pointerdown', e => e.stopPropagation());
  }

  // The battle waits while a step is on screen.
  get holding() { return !!this.active; }

  // Called every frame, whether the battle is waiting or not.
  update() {
    if (this.finished) return;
    const c = this.ctl;
    if (!this.active) {
      const s = TUT_STEPS[this.i];
      if (!s) { this.stop(false); return; }
      if (s.start && !s.start(c)) return;
      if (s.skip?.(c) || (s.done && s.done(c))) { this.i++; return; }
      this.enter(s);
      return;
    }
    const s = this.active;
    // moving targets are followed every frame, cells now and then (one may have been taken)
    if (s.mark && (s.follow || ++this.tick % 20 === 0)) { c.tutBot = null; c.ui.tutMark = s.mark(c) || null; }
    // menus get rebuilt (the squad menu after a promotion): keep the glow on the new button
    if (s.focus && (!this.focused.length || this.focused.some(e => !e.isConnected))) this.setFocus(typeof s.focus === 'function' ? s.focus(c) : s.focus);
    if (s.done && s.done(c)) this.next();
  }

  enter(s) {
    const c = this.ctl;
    this.active = s;
    s.enter?.(c);
    c.tutBot = null;
    c.ui.tutMark = s.mark ? s.mark(c) || null : null;
    const n = TUT_STEPS.indexOf(s) + 1;
    this.el.innerHTML = `
      <div class="tut-head"><span class="tut-n">🎓 튜토리얼 ${n}/${TUT_STEPS.length}</span><button class="tut-skip" type="button">건너뛰기</button></div>
      <div class="tut-title">${s.title}</div>
      <div class="tut-text">${s.text(c)}</div>
      <div class="tut-foot">${s.done ? '<span class="tut-do">👉 직접 해 보세요!</span>' : '<button class="tut-next" type="button">다음 ▶</button>'}</div>`;
    this.el.classList.remove('hidden');
    this.el.classList.toggle('low', s.key === 'start' || s.key === 'break');
    this.setFocus(typeof s.focus === 'function' ? s.focus(c) : s.focus);
  }

  setFocus(sel) {
    for (const e of this.focused) e.classList.remove('tut-focus');
    this.focused = sel ? [...this.ctl.el.querySelectorAll(sel)] : [];
    for (const e of this.focused) e.classList.add('tut-focus');
  }

  next() {
    if (!this.active) return;
    this.active = null;
    this.i++;
    this.ctl.ui.tutMark = null;
    this.setFocus(null);
    this.el.classList.add('hidden');
    this.ctl.sfxStep?.();
    this.update(); // a following step that is ready opens at once
  }

  // skipped: the player chose to leave it; otherwise every step was seen
  stop(skipped) {
    this.active = null;
    this.finished = true;
    this.skipped = skipped;
    this.ctl.ui.tutMark = null;
    this.setFocus(null);
    this.el.classList.add('hidden');
    this.ctl.game.save.seen.tutorial = true;
    this.ctl.game.persist();
  }
}
