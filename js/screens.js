// Menu screens (DOM): title, save slots, lord choice, story pages, the base, the China map,
// battle preparation, barracks, lord skills, equipment, counter chart, results, pause, ending.

import {
  VERSION, TROOPS, TROOP_KEYS, STRONG, STRONG_WHY, LORDS, LORD_KEYS, SKILLS, SKILL_UNLOCK, EQUIPS, GRADES, SLOTS,
  ITEMS, ITEM_KEYS, ITEM_CARRY_MAX, FACTIONS, TROOP_UNLOCK, BOSS_SKILLS, MAX_TROOP_LEVEL, MAX_ENHANCE,
  STAGE_COUNT, troopUpCost, enhanceCost, equipFx, fxText, expNeed, recLevel, stageGold, fmt, weakTo, pct,
  DIFFS, diffOf, GENERALS, GEN_SPECIALS, GENERAL_PICKS, COUNTER_MARK, COUNTER_NAME, COUNTER_MULT, relations, bestLevel, RING,
  generalsOf,
} from './data.js';
import { PLACES } from './maps.js';
import { STORIES } from './stories.js';
import { listSlots, deleteSlot } from './save.js';
import {
  TALENT_TREES, TALENT_ROWS, TALENTS, talentLabel, talentText, talentPoints, freePoints, treeSpent, addBlock, canRemove,
  addTalent, removeTalent, resetTalents, autoTalents, skillLevel,
} from './talents.js';
import { lordStats, troopStats, lordLeadership, rosterLead, troopUnlocked, skillList, fitRoster, unlockedGenerals, pickedGenerals, generalStats, generalUnlocked } from './army.js';
import { buildWaves, stageSummary } from './waves.js';
import { stageLayout } from './maps.js';
import { noReward } from './progression.js';
import { troopIcon, lordIcon, generalIcon } from './sprites.js';
import { drawChinaMap, mapFit } from './chinamap.js';
import { recommendRoster, recommendGenerals } from './bot.js';
import { sfx } from './audio.js';
import { hasMouse } from './device.js';

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
const backBtn = (label = '← 뒤로') => `<button class="back-btn" type="button">${label}</button>`;
const us = save => FACTIONS[LORDS[save.lord].faction];
const gradeName = key => `<b class="grade" style="color:${GRADES[EQUIPS[key].g].color}">${EQUIPS[key].name}</b>`;
const upTag = up => (up ? ` <span class="up">+${up}</span>` : '');
const storyOf = save => STORIES[save.lord];
const troopImg = (save, t, size = 56) => `<img class="ticon" src="${troopIcon(t, us(save), size)}" alt="">`;

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function toast(parent, text, bad = false) {
  let t = parent.querySelector(':scope > .stoast');
  if (!t) {
    t = h('<div class="stoast"></div>');
    parent.appendChild(t);
  }
  t.textContent = text;
  t.classList.toggle('bad', bad);
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
}

function confirmDialog(parent, { title, text, no = '아니요', yes = '네', onYes, danger = true }) {
  const dlg = h(`
    <div class="confirm">
      <div class="panel confirm-panel">
        <h2>${title}</h2>
        <p>${text}</p>
        <div class="row-btns">
          <button class="btn no" type="button">${no}</button>
          <button class="btn yes ${danger ? 'danger' : 'primary'}" type="button">${yes}</button>
        </div>
      </div>
    </div>`);
  parent.appendChild(dlg);
  dlg.querySelector('.no').addEventListener('click', () => { sfx.select(); dlg.remove(); });
  dlg.querySelector('.yes').addEventListener('click', () => { dlg.remove(); onYes(); });
}

function soundToggles(game) {
  const wrap = h(`
    <div class="sound-toggles">
      <button class="tog sfx-tog" type="button"></button>
      <button class="tog mus-tog" type="button"></button>
    </div>`);
  const paint = () => {
    wrap.querySelector('.sfx-tog').textContent = game.prefs.sound ? '🔊 효과음 켜짐' : '🔈 효과음 꺼짐';
    wrap.querySelector('.mus-tog').textContent = game.prefs.music ? '🎵 음악 켜짐' : '🎵 음악 꺼짐';
    wrap.querySelector('.sfx-tog').classList.toggle('off', !game.prefs.sound);
    wrap.querySelector('.mus-tog').classList.toggle('off', !game.prefs.music);
  };
  wrap.querySelector('.sfx-tog').addEventListener('click', e => { e.stopPropagation(); game.setSound(!game.prefs.sound); sfx.select(); paint(); });
  wrap.querySelector('.mus-tog').addEventListener('click', e => { e.stopPropagation(); game.setMusic(!game.prefs.music); sfx.select(); paint(); });
  paint();
  return wrap;
}

// ---------------------------------------------------------------------------------

function titleScreen(game) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  const el = h(`
    <div class="screen title-screen">
      <div class="title-hills"></div>
      <div class="title-box">
        <div class="logo-sub">삼국지</div>
        <h1 class="logo">천하통일 디펜스</h1>
        <p class="sub">군주가 되어 진지를 지키고, 천하를 통일하자!</p>
        <div class="title-lords">${LORD_KEYS.map(k => `<img src="${lordIcon(k, 120)}" alt="">`).join('')}</div>
        <div class="press">${hasMouse() ? '🖱️ 클릭해서 시작' : '👆 화면을 터치해서 시작'}</div>
        ${ios && !installed ? '<p class="install">📲 Safari 공유 버튼 → <b>홈 화면에 추가</b> 하면 앱처럼 쓸 수 있어요</p>' : ''}
      </div>
      <div class="credits">기획: J.W. Choi · 개발: Claude</div>
      <button class="version" type="button">v${VERSION} · ↻ 업데이트 확인</button>
    </div>`);
  el.appendChild(soundToggles(game));
  el.addEventListener('click', () => { sfx.confirm(); game.show('slots'); });
  const ver = el.querySelector('.version');
  ver.addEventListener('click', e => {
    e.stopPropagation();
    ver.textContent = '확인 중...';
    game.checkForUpdate();
  });
  return { el, music: 'title' };
}

// ---------------------------------------------------------------------------------

function slotsScreen(game, { deleted = 0 } = {}) {
  const slots = listSlots();
  const when = t => (t ? new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const card = (s, i) => {
    if (!s) {
      return `
        <div class="slot empty" data-i="${i}">
          <div class="slot-no">슬롯 ${i + 1}</div>
          <div class="slot-new">✨</div>
          <div class="slot-title">비어 있어요</div>
          <div class="slot-sub">눌러서 새로 시작</div>
        </div>`;
    }
    const L = LORDS[s.lord];
    return `
      <div class="slot" data-i="${i}">
        <div class="slot-no">슬롯 ${i + 1}</div>
        <img class="slot-face" src="${lordIcon(s.lord, 120)}" alt="">
        <div class="slot-title">${L.name} <small>Lv ${s.level}</small></div>
        <div class="slot-diff ${diffOf(s).key}">${diffOf(s).icon} ${diffOf(s).name}</div>
        <div class="slot-sub">🗺 ${s.progress}/${STAGE_COUNT} 지역</div>
        <div class="slot-sub">💰 ${fmt(s.gold)}</div>
        <div class="slot-time">${when(s.updatedAt)}</div>
        <button class="slot-del" type="button">🗑 지우기</button>
      </div>`;
  };
  const el = h(`
    <div class="screen slots">
      ${backBtn('← 처음으로')}
      <div class="panel slots-panel">
        <h2>💾 어느 슬롯으로 할까요?</h2>
        <div class="slot-row">${slots.map(card).join('')}</div>
      </div>
    </div>`);
  el.querySelector('.back-btn').addEventListener('click', () => { sfx.select(); game.show('title'); });
  el.querySelectorAll('.slot').forEach(c => {
    const i = +c.dataset.i;
    c.addEventListener('click', () => { sfx.confirm(); game.openSlot(i + 1); });
    c.querySelector('.slot-del')?.addEventListener('click', e => {
      e.stopPropagation();
      sfx.select();
      confirmDialog(el, {
        title: `🗑 슬롯 ${i + 1}을 지울까요?`,
        text: `${LORDS[slots[i].lord].name} Lv ${slots[i].level}의 진행이 사라지고, 되돌릴 수 없어요.`,
        no: '아니요, 그냥 둘래요',
        yes: '🗑 네, 지울래요',
        onYes: () => { deleteSlot(i + 1); sfx.error(); game.show('slots', { deleted: i + 1 }); },
      });
    });
  });
  if (deleted) toast(el, `슬롯 ${deleted}을 지웠어요`);
  return { el, music: 'title' };
}

// ---------------------------------------------------------------------------------

function lordSelectScreen(game, { slot }) {
  let pick = null;
  let diff = 1;
  const diffs = DIFFS.filter((d, i) => i < 3 || game.prefs.endingSeen);
  const card = k => {
    const L = LORDS[k];
    const F = FACTIONS[L.faction];
    return `
      <div class="lord-card" data-k="${k}" style="--fc:${F.color}">
        <img class="lord-face" src="${lordIcon(k, 160)}" alt="">
        <div class="lord-name">${L.name} <small>${F.name}</small></div>
        <div class="lord-title">${L.title}</div>
        <div class="lord-trait">⭐ ${L.trait}</div>
        <div class="lord-style">${L.style}</div>
        <div class="lord-skills">${L.skills.map((s, i) => `<span>${SKILLS[s].icon} ${SKILLS[s].name}${i ? ` <small>Lv${SKILL_UNLOCK[i]}</small>` : ''}</span>`).join('')}</div>
      </div>`;
  };
  const el = h(`
    <div class="screen lord-select">
      ${backBtn('← 슬롯으로')}
      <h2 class="center-title">👑 어느 군주가 되어 천하를 통일할까요?</h2>
      <div class="lord-row">${LORD_KEYS.map(card).join('')}</div>
      <div class="diff-row">
        <span class="diff-label">난이도</span>
        ${diffs.map((d, i) => `<button class="diff-btn ${i === diff ? 'on' : ''} ${d.key}" data-i="${i}" type="button"><b>${d.icon} ${d.name}</b><small>${d.desc}</small></button>`).join('')}
      </div>
      <button class="btn primary big start-lord" type="button" disabled>군주를 골라 주세요</button>
    </div>`);
  const btn = el.querySelector('.start-lord');
  el.querySelector('.back-btn').addEventListener('click', () => { sfx.select(); game.show('slots'); });
  el.querySelectorAll('.lord-card').forEach(c => c.addEventListener('click', () => {
    pick = c.dataset.k;
    sfx.select();
    el.querySelectorAll('.lord-card').forEach(x => x.classList.toggle('sel', x === c));
    btn.disabled = false;
    btn.textContent = `${LORDS[pick].name}(으)로 시작! · ${DIFFS[diff].name}`;
  }));
  el.querySelectorAll('.diff-btn').forEach(b => b.addEventListener('click', () => {
    diff = +b.dataset.i;
    sfx.select();
    el.querySelectorAll('.diff-btn').forEach(x => x.classList.toggle('on', x === b));
    if (pick) btn.textContent = `${LORDS[pick].name}(으)로 시작! · ${DIFFS[diff].name}`;
  }));
  btn.addEventListener('click', () => {
    if (!pick) return;
    sfx.confirm();
    game.newGame(slot, pick, diff);
  });
  return { el, music: 'title' };
}

// ---------------------------------------------------------------------------------

// A page of story lines that appear one by one; tap to continue.
function storyScreen(game, { title, sub = '', lines, lord = null, next, music = 'base', btn = '계속 ▶' }) {
  const el = h(`
    <div class="screen story">
      <div class="scroll">
        ${lord ? `<img class="story-face" src="${lordIcon(lord, 140)}" alt="">` : ''}
        <h2>${title}</h2>
        ${sub ? `<div class="story-sub">${sub}</div>` : ''}
        <div class="story-lines">${lines.map(l => `<p>${l}</p>`).join('')}</div>
        <button class="btn primary story-next" type="button">${btn}</button>
      </div>
    </div>`);
  const ps = [...el.querySelectorAll('.story-lines p')];
  let shown = 0;
  const showNext = () => {
    if (shown < ps.length) { ps[shown].classList.add('on'); shown++; }
  };
  const timer = setInterval(() => { showNext(); if (shown >= ps.length) clearInterval(timer); }, 700);
  showNext();
  const go = () => {
    if (shown < ps.length) { ps.forEach(p => p.classList.add('on')); shown = ps.length; return; }
    clearInterval(timer);
    sfx.confirm();
    next();
  };
  el.addEventListener('click', go);
  return { el, music, unmount: () => clearInterval(timer) };
}

// ---------------------------------------------------------------------------------

function header(game) {
  const s = game.save;
  const L = LORDS[s.lord];
  const need = expNeed(s.level);
  return `
    <div class="hdr">
      <img class="hdr-face" src="${lordIcon(s.lord, 96)}" alt="">
      <div class="hdr-name">${L.name} <small>${L.title}</small></div>
      <div class="hdr-pill diff ${diffOf(s).key}">${diffOf(s).icon} ${diffOf(s).name}</div>
      <div class="hdr-lv">Lv ${s.level}<div class="xp"><i style="width:${Math.min(100, (s.exp / need) * 100)}%"></i></div></div>
      <div class="hdr-pill">💰 <b class="hdr-gold">${fmt(s.gold)}</b></div>
      <div class="hdr-pill">🚩 통솔 ${lordLeadership(s)}</div>
    </div>`;
}

function nextStageIdx(save) { return Math.min(STAGE_COUNT - 1, save.progress); }

function baseScreen(game) {
  const s = game.save;
  const story = storyOf(s);
  const ni = nextStageIdx(s);
  const st = story.stages[ni];
  const newEq = s.newEquips.length;
  const done = s.progress >= STAGE_COUNT;
  const el = h(`
    <div class="screen base">
      ${header(game)}
      <div class="base-main">
        <button class="go-card" type="button">
          <div class="go-left">
            <div class="go-kicker">${done ? '🎉 천하통일 달성!' : `⚔ 다음 출진 · ${ni + 1}번째 지역`}</div>
            <div class="go-title">${done ? '천하 지도' : `${st.title}`}</div>
            <div class="go-sub">${done ? '다시 도전해서 별을 모아요' : `📍 ${PLACES[st.loc]?.name || ''} · ${st.year}년<br>권장 Lv ${recLevel(ni + 1)}`}</div>
            <div class="go-btn">🗺 천하 지도 열기 ▶</div>
          </div>
          <div class="go-story">${done
            ? `<div class="gs-h">🎉 천하통일 이야기</div>${story.ending.map(l => `<p>${l}</p>`).join('')}`
            : `${ni > 0 ? `<div class="gs-h">📖 지난 이야기</div><div class="gs-prev">${story.stages[ni - 1].outro.map(l => `<p>${l}</p>`).join('')}</div>` : ''}
               <div class="gs-h">📜 이번 이야기</div>${st.intro.map(l => `<p>${l}</p>`).join('')}`}
          </div>
        </button>
        <div class="tiles">
          <button class="tile" data-go="barracks" type="button"><span class="ti">🏯</span><b>병영</b><small>병종 강화</small></button>
          <button class="tile" data-go="lord" type="button"><span class="ti">👑</span><b>군주</b><small>특성 ${freePoints(s) ? `<em class="badge">${freePoints(s)}</em>` : s.talentNew ? '<em class="badge">NEW</em>' : ''}</small></button>
          <button class="tile" data-go="equip" type="button"><span class="ti">🛡️</span><b>장비</b><small>장착·강화·구매 ${newEq ? `<em class="badge">새 ${newEq}</em>` : ''}</small></button>
          <button class="tile" data-go="counters" type="button"><span class="ti">📖</span><b>상성표</b><small>누가 누구에게 강할까?</small></button>
          <button class="tile" data-go="generals" type="button"><span class="ti">🎖️</span><b>장수</b><small>${unlockedGenerals(s).length}명 합류</small></button>
          <button class="tile" data-go="storybook" type="button"><span class="ti">📜</span><b>이야기</b><small>${unreadChapters(s) ? `<em class="badge">새 이야기 ${unreadChapters(s)}</em>` : `${storyChapters(s).filter(c => c.open).length}장까지 읽을 수 있어요`}</small></button>
          <button class="tile exit" data-go="exit" type="button"><span class="ti">🚪</span><b>저장하고 나가기</b><small>처음 화면으로</small></button>
        </div>
      </div>
    </div>`);
  el.appendChild(soundToggles(game));
  el.querySelector('.go-card').addEventListener('click', () => { sfx.confirm(); game.show('map', { sel: ni }); });
  el.querySelectorAll('.tile').forEach(b => b.addEventListener('click', () => {
    const go = b.dataset.go;
    sfx.select();
    if (go === 'exit') game.exitToTitle();
    else if (go === 'story') {
      game.show('story', { title: `${LORDS[s.lord].name}의 이야기`, lines: story.prologue, lord: s.lord, next: () => game.show('base') });
    } else game.show(go, { back: 'base' });
  }));
  return { el, music: 'base' };
}

// ---------------------------------------------------------------------------------

function mapScreen(game, { sel = null } = {}) {
  const s = game.save;
  const story = storyOf(s);
  const F = us(s);
  const open = i => i <= s.progress && i < STAGE_COUNT;
  let selected = sel !== null && open(sel) ? sel : nextStageIdx(s);
  const el = h(`
    <div class="screen map-screen">
      <canvas class="map-canvas"></canvas>
      <div class="map-top">
        ${backBtn('← 본영')}
        <div class="map-title">🗺 천하 지도 <small>${LORDS[s.lord].name}의 이야기 · ${s.progress}/${STAGE_COUNT}</small></div>
      </div>
      <div class="markers"></div>
      <aside class="map-story"></aside>
    </div>`);
  el.querySelector('.back-btn').addEventListener('click', () => { sfx.select(); game.show('base'); });
  const markers = el.querySelector('.markers');
  const panel = el.querySelector('.map-story');

  // The story of the chosen place, for the child (and parent) to read before going.
  const paintStory = () => {
    const i = selected;
    const st = story.stages[i];
    const rec = recLevel(i + 1);
    const stars = s.stages[i].stars;
    const cleared = s.stages[i].clears > 0;
    const sleep = noReward(s, i);
    const prev = i > 0 ? story.stages[i - 1] : null;
    const reward = !cleared && st.reward ? `<div class="mc-reward">🎁 첫 클리어 보상: ${EQUIPS[st.reward].icon} ${gradeName(st.reward)}</div>` : '';
    panel.innerHTML = `
      <div class="mc-head">
        <span class="mc-no">${i + 1}</span>
        <div><div class="mc-title">${st.title}</div>
        <div class="mc-sub">📍 ${PLACES[st.loc]?.name || ''} · ${st.year}년 · 적: ${FACTIONS[st.enemy]?.army || ''}</div></div>
        <div class="mc-stars">${[1, 2, 3].map(k => `<span class="${k <= stars ? 'on' : ''}">★</span>`).join('')}</div>
      </div>
      <div class="ms-body">
        ${i === 0 ? `<div class="ms-h">📖 지난 이야기</div><div class="ms-text prev">${story.prologue.map(l => `<p>${l}</p>`).join('')}</div>`
          : prev ? `<div class="ms-h">📖 지난 이야기 · ${prev.title}</div><div class="ms-text prev">${prev.outro.map(l => `<p>${l}</p>`).join('')}</div>` : ''}
        <div class="ms-h">📜 이번 이야기</div>
        <div class="ms-text">${st.intro.map(l => `<p>${l}</p>`).join('')}</div>
        ${cleared ? `<div class="ms-h">🏁 그 뒤</div><div class="ms-text outro">${st.outro.map(l => `<p>${l}</p>`).join('')}</div>` : ''}
      </div>
      <div class="ms-foot">
        <div class="mc-info">
          <span class="${s.level < rec ? 'warn' : ''}">권장 Lv ${rec} (지금 Lv ${s.level})</span>
          ${sleep ? '<span class="sleep">💤 레벨이 높아서 보상이 없어요</span>' : `<span>💰 ${fmt(s.stages[i].clears ? Math.round(stageGold(i + 1) * 0.5) : stageGold(i + 1))}</span>`}
        </div>
        ${reward}
        <button class="btn primary mc-go" type="button">🏕 정비하러 가기 ▶</button>
      </div>`;
    panel.querySelector('.ms-body').scrollTop = 0;
    panel.querySelector('.mc-go').addEventListener('click', e => {
      e.stopPropagation();
      sfx.confirm();
      game.show('prep', { stageIdx: selected });
    });
  };

  const layout = () => {
    const w = el.clientWidth || window.innerWidth, hh = el.clientHeight || window.innerHeight;
    const pr = panel.getBoundingClientRect();
    const left = pr.right + 8;
    const fit = mapFit(left, 58, Math.max(200, w - left - 12), hh - 58 - 12);
    const route = story.stages.map((st, i) => ({ loc: st.loc, state: i < s.progress ? 'done' : i === s.progress ? 'next' : 'locked' }));
    drawChinaMap(el.querySelector('.map-canvas'), w, hh, Math.min(2, window.devicePixelRatio || 1), fit, route, F.color);
    markers.innerHTML = '';
    // stages that share a place get nudged apart
    const used = {};
    story.stages.forEach((st, i) => {
      const P = PLACES[st.loc];
      if (!P) return;
      const k = st.loc;
      const dup = used[k] = (used[k] || 0) + 1;
      const x = fit.ox + (P.x + (dup - 1) * 22) * fit.s, y = fit.oy + (P.y - (dup - 1) * 10) * fit.s;
      const state = i < s.progress ? 'done' : i === s.progress ? 'next' : 'locked';
      const m = h(`
        <button class="mk ${state} ${i === selected ? 'sel' : ''}" type="button" style="left:${x}px;top:${y}px;--fc:${F.color}">
          <span class="mk-dot">${state === 'locked' ? '' : i + 1}</span>
          ${state !== 'locked' ? `<span class="mk-name">${P.name}${s.stages[i].stars ? ` <i>${'★'.repeat(s.stages[i].stars)}</i>` : ''}</span>` : ''}
        </button>`);
      if (state !== 'locked') {
        m.addEventListener('click', e => {
          e.stopPropagation();
          selected = i;
          sfx.select();
          markers.querySelectorAll('.mk').forEach(x => x.classList.remove('sel'));
          m.classList.add('sel');
          paintStory();
        });
      }
      markers.appendChild(m);
    });
  };
  paintStory();
  const onResize = () => layout();
  return {
    el,
    music: 'map',
    mount() { layout(); window.addEventListener('resize', onResize); },
    unmount() { window.removeEventListener('resize', onResize); },
  };
}

// ---------------------------------------------------------------------------------

function prepScreen(game, { stageIdx }) {
  const s = game.save;
  const story = storyOf(s);
  const st = story.stages[stageIdx];
  const n = stageIdx + 1;
  const layoutN = stageLayout(n);
  const waves = buildWaves(st, n, layoutN.paths.length);
  const sum = stageSummary(waves);
  const them = FACTIONS[st.enemy] || FACTIONS.yellow;
  const foeTypes = TROOP_KEYS.filter(t => sum[t]).sort((a, b) => sum[b] - sum[a]);
  const top = foeTypes.slice(0, 2);
  s.roster = fitRoster(s, s.roster);
  const rec = recLevel(n);

  const el = h(`
    <div class="screen prep">
      <div class="prep-top">
        ${backBtn('← 지도')}
        <div class="prep-title">🏕 정비 · <b>${n}. ${st.title}</b></div>
        <div class="hdr-pill">💰 <b class="p-gold">${fmt(s.gold)}</b></div>
      </div>
      <div class="prep-cols">
        <section class="pc story-col">
          <div class="pc-h">📜 상황</div>
          <div class="intro">${st.intro.map(l => `<p>${l}</p>`).join('')}</div>
          <div class="pc-h">🔍 정찰 보고 <small>${them.army} · 웨이브 ${waves.length} · 길 ${layoutN.paths.length}</small></div>
          <div class="scout">
            ${foeTypes.map(t => `
              <div class="sc-row">
                <img class="ticon" src="${troopIcon(t, them, 48)}" alt="">
                <b>${TROOPS[t].name}</b><span class="cnt">×${sum[t]}</span>
                <span class="weak">약점: ${weakTo(t).map((w, i) => `${TROOPS[w].short}${i ? '▲' : '▲▲'}`).join(' · ')}</span>
              </div>`).join('')}
            <div class="sc-row boss">
              <img class="ticon" src="${troopIcon(st.boss.type, them, 48)}" alt="">
              <b>적장 ${st.boss.name}</b><span class="cnt">${TROOPS[st.boss.type].name}</span><span class="boss-warn">놓치면 패배!</span>
              <span class="weak">${BOSS_SKILLS[st.boss.skill]}</span>
            </div>
          </div>
          <div class="lvl-note ${s.level < rec ? 'warn' : ''}">권장 군주 레벨 ${rec} · 지금 Lv ${s.level}${noReward(s, stageIdx) ? ' · 💤 보상 없음' : ''}</div>
        </section>
        <section class="pc army-col">
          <div class="pc-h">⚔ 병력 편성 <button class="mini auto" type="button">✨ 추천 편성</button></div>
          <div class="lead"><span class="lead-txt"></span><div class="bar"><i></i></div></div>
          <div class="roster"></div>
          <div class="hint-line">▲▲ 아주 강함 · ▲ 강함 (이번 적에게)</div>
        </section>
        <section class="pc gear-col">
          <div class="pc-h">⭐ 장수 <small>${GENERAL_PICKS}명 · 배치 무료</small></div>
          <div class="gen-picks"></div>
          <div class="pc-h">🎒 아이템 <small>종류별 ${ITEM_CARRY_MAX}개까지</small></div>
          <div class="prep-items"></div>
          <div class="pc-h">🛡 장비 <button class="mini to-equip" type="button">바꾸기 ▶</button></div>
          <div class="gear"></div>
          <button class="btn primary big go" type="button">⚔ 출진!</button>
        </section>
      </div>
    </div>`);

  const $ = q => el.querySelector(q);
  $('.back-btn').addEventListener('click', () => { sfx.select(); game.persist(); game.show('map', { sel: stageIdx }); });

  const paintRoster = () => {
    const max = lordLeadership(s);
    const used = rosterLead(s.roster);
    $('.lead-txt').innerHTML = `🚩 통솔력 <b>${used}</b> / ${max}`;
    $('.lead .bar i').style.width = `${Math.min(100, (used / max) * 100)}%`;
    $('.roster').innerHTML = TROOP_KEYS.map(t => {
      const T = TROOPS[t];
      if (!troopUnlocked(s, t)) {
        return `<div class="ro locked">${troopImg(s, t, 48)}<div class="ro-mid"><b>${T.name}</b><small>🔒 ${TROOP_UNLOCK[t]}번째 지역을 깨면 열려요</small></div></div>`;
      }
      const c = s.roster[t] || 0;
      const good = bestLevel(t, top);
      const lv = s.troops[t];
      return `
        <div class="ro ${c ? 'has' : ''}" data-t="${t}">
          ${troopImg(s, t, 48)}
          <div class="ro-mid"><b>${T.name}${good > 0 ? ` <em class="up${good > 1 ? ' very' : ''}">${COUNTER_MARK[good]}</em>` : ''}</b><small>Lv ${lv} · 통솔 ${T.lead} · 🌾${T.cost}</small></div>
          <div class="stepper"><button class="minus" type="button">−</button><span class="num">${c}</span><button class="plus" type="button">＋</button></div>
        </div>`;
    }).join('');
    el.querySelectorAll('.ro[data-t]').forEach(r => {
      const t = r.dataset.t;
      r.querySelector('.minus').addEventListener('click', () => {
        if (!(s.roster[t] > 0)) { sfx.denied(); return; }
        s.roster[t]--;
        if (!s.roster[t]) delete s.roster[t];
        sfx.select();
        paintRoster();
      });
      r.querySelector('.plus').addEventListener('click', () => {
        if (rosterLead(s.roster) + TROOPS[t].lead > lordLeadership(s)) { sfx.denied(); shake($('.lead')); toast(el, '통솔력이 모자라요. 군주 레벨을 올리면 늘어나요', true); return; }
        s.roster[t] = (s.roster[t] || 0) + 1;
        sfx.select();
        paintRoster();
      });
    });
  };

  const paintItems = () => {
    $('.p-gold').textContent = fmt(s.gold);
    $('.prep-items').innerHTML = ITEM_KEYS.map(k => {
      const I = ITEMS[k];
      const own = s.items[k] || 0;
      const carry = Math.min(own, s.carry[k] || 0);
      return `
        <div class="it" data-k="${k}">
          <span class="it-ico">${I.icon}</span>
          <div class="it-mid"><b>${I.name}</b><small>가진 것 ${own}개</small></div>
          <div class="stepper"><button class="minus" type="button">−</button><span class="num">${carry}</span><button class="plus" type="button">＋</button></div>
          <button class="buy" type="button">사기<br><small>💰${I.price}</small></button>
        </div>`;
    }).join('');
    el.querySelectorAll('.it').forEach(r => {
      const k = r.dataset.k;
      r.querySelector('.minus').addEventListener('click', () => {
        if (!(s.carry[k] > 0)) { sfx.denied(); return; }
        s.carry[k] = Math.min(s.items[k], s.carry[k]) - 1;
        sfx.select();
        paintItems();
      });
      r.querySelector('.plus').addEventListener('click', () => {
        const c = Math.min(s.items[k], s.carry[k] || 0);
        if (c >= ITEM_CARRY_MAX) { sfx.denied(); toast(el, `${ITEM_CARRY_MAX}개까지 챙길 수 있어요`, true); return; }
        if (c >= s.items[k]) { sfx.denied(); toast(el, '가진 게 없어요. 사기를 눌러 사세요', true); return; }
        s.carry[k] = c + 1;
        sfx.select();
        paintItems();
      });
      r.querySelector('.buy').addEventListener('click', () => {
        const price = ITEMS[k].price;
        if (s.gold < price) { sfx.denied(); toast(el, '골드가 모자라요', true); return; }
        s.gold -= price;
        s.items[k] = (s.items[k] || 0) + 1;
        if ((s.carry[k] || 0) < ITEM_CARRY_MAX) s.carry[k] = Math.min(s.items[k], (s.carry[k] || 0) + 1);
        sfx.coin();
        game.persist();
        paintItems();
      });
    });
  };

  const paintGear = () => {
    $('.gear').innerHTML = Object.entries(SLOTS).map(([slot, label]) => {
      const key = s.equipped[slot];
      const it = key && s.equips.find(e => e.key === key);
      return `<div class="gr"><span class="gr-l">${label}</span>${it ? `${EQUIPS[key].icon} ${gradeName(key)}${upTag(it.up)}` : '<span class="muted">없음</span>'}</div>`;
    }).join('');
  };

  const paintGenerals = () => {
    const picks = pickedGenerals(s);
    const box = $('.gen-picks');
    const avail = unlockedGenerals(s);
    box.innerHTML = Array.from({ length: GENERAL_PICKS }, (_, i) => {
      const k = picks[i];
      if (!k) return `<button class="gp empty" type="button">＋ 장수 고르기<small>${avail.length} 명 중</small></button>`;
      const G = GENERALS[k];
      const lv = bestLevel(G.type, top);
      return `<button class="gp" type="button"><img src="${generalIcon(G.type, G.letter, us(s), 56)}" alt=""><span class="gp-mid"><b>${G.name}${lv > 0 ? ` <em class="up${lv > 1 ? ' very' : ''}">${COUNTER_MARK[lv]}</em>` : ''}</b><small>${TROOPS[G.type].short} · ${G.skill}</small></span></button>`;
    }).join('');
    box.querySelectorAll('.gp').forEach(b => b.addEventListener('click', () => { sfx.select(); openGeneralPicker(game, el, top, () => { game.persist(); paintGenerals(); }); }));
  };

  $('.auto').addEventListener('click', () => {
    s.roster = recommendRoster(s, waves);
    s.picks = recommendGenerals(s, waves);
    paintGenerals();
    sfx.confirm();
    paintRoster();
    toast(el, '적의 약점에 맞춰 골랐어요');
  });
  $('.to-equip').addEventListener('click', () => { sfx.select(); game.persist(); game.show('equip', { back: 'prep', stageIdx }); });
  $('.go').addEventListener('click', () => {
    if (rosterLead(s.roster) <= 0) { sfx.denied(); shake($('.roster')); toast(el, '부대를 하나 이상 데려가세요', true); return; }
    sfx.confirm();
    game.persist();
    game.startBattle(stageIdx);
  });
  paintRoster();
  paintGenerals();
  paintItems();
  paintGear();
  return { el, music: 'base' };
}

// ---------------------------------------------------------------------------------

function goBack(game, arg) {
  if (arg?.back === 'prep') game.show('prep', { stageIdx: arg.stageIdx });
  else game.show('base');
}

function barracksScreen(game, arg = {}) {
  const s = game.save;
  const el = h(`
    <div class="screen barracks">
      ${header(game)}
      ${backBtn()}
      <h2 class="center-title">🏯 병영 · 병종 강화</h2>
      <div class="troop-cards"></div>
    </div>`);
  el.querySelector('.back-btn').addEventListener('click', () => { sfx.select(); goBack(game, arg); });
  const paint = () => {
    el.querySelector('.hdr-gold').textContent = fmt(s.gold);
    el.querySelector('.troop-cards').innerHTML = TROOP_KEYS.map(t => {
      const T = TROOPS[t];
      const name = x => TROOPS[x].short;
      if (!troopUnlocked(s, t)) {
        return `<div class="tc locked">${troopImg(s, t, 64)}<b>${T.name}</b><small>🔒 ${TROOP_UNLOCK[t]}번째 지역을 깨면 열려요</small><p>${T.desc}</p></div>`;
      }
      const st = troopStats(s, t);
      const lv = s.troops[t];
      const max = lv >= MAX_TROOP_LEVEL;
      const nx = max ? null : troopStats({ ...s, troops: { ...s.troops, [t]: lv + 1 } }, t);
      return `
        <div class="tc" data-t="${t}">
          <div class="tc-head">${troopImg(s, t, 64)}<div><b>${T.name}</b> <span class="lv">Lv ${lv}</span><br><small>${T.melee ? '근접 · 길을 막아요' : '원거리'}</small></div></div>
          <div class="tc-stats">
            <span>❤ ${fmt(st.hp)}${nx ? ` <i>→ ${fmt(nx.hp)}</i>` : ''}</span>
            <span>⚔ ${fmt(st.atk)}${nx ? ` <i>→ ${fmt(nx.atk)}</i>` : ''}</span>
            <span>🎯 ${st.range}</span>
            <span>🌾 ${T.cost} · 🚩 ${T.lead}</span>
          </div>
          <div class="tc-rel"><span class="good">${relations(t).good.map(([x, lv]) => `${COUNTER_MARK[lv]} ${name(x)}`).join(' · ')}</span><span class="bad">${relations(t).bad.map(([x, lv]) => `${COUNTER_MARK[lv]} ${name(x)}`).join(' · ')}</span></div>
          <p>${T.desc}</p>
          <button class="btn up-btn ${max ? '' : 'primary'}" type="button" ${max ? 'disabled' : ''}>${max ? '최고 레벨' : `⬆ 강화 💰${fmt(troopUpCost(lv))}`}</button>
        </div>`;
    }).join('');
    el.querySelectorAll('.tc[data-t] .up-btn').forEach(b => b.addEventListener('click', () => {
      const t = b.closest('.tc').dataset.t;
      const lv = s.troops[t];
      if (lv >= MAX_TROOP_LEVEL) return;
      const cost = troopUpCost(lv);
      if (s.gold < cost) { sfx.denied(); shake(b); toast(el, '골드가 모자라요', true); return; }
      s.gold -= cost;
      s.troops[t] = lv + 1;
      sfx.upgrade();
      game.persist();
      paint();
    }));
  };
  paint();
  return { el, music: 'base' };
}

// ---------------------------------------------------------------------------------

function lordScreen(game, arg = {}) {
  const s = game.save;
  const L = LORDS[s.lord];
  const el = h(`
    <div class="screen lord-screen">
      ${header(game)}
      ${backBtn()}
      <div class="lord-cols">
        <div class="panel lord-info"></div>
        <div class="panel lord-talents"></div>
      </div>
    </div>`);
  el.querySelector('.back-btn').addEventListener('click', () => { sfx.select(); goBack(game, arg); });
  let sel = arg.talent || TALENT_TREES[0].nodes[0].key;
  let resetArmed = 0;
  const news = s.talentNew;
  if (news) { s.talentNew = false; game.persist(); }
  const BLOCK = {
    max: '이미 최고예요',
    points: '특성 포인트가 없어요. 레벨을 올리거나 다른 특성에서 빼 오세요',
  };
  const blockText = (k, why) => {
    const n = TALENTS[k];
    if (why === 'skill') return `군주 Lv ${SKILL_UNLOCK[n.skill]}에 스킬을 배우면 찍을 수 있어요`;
    if (why === 'row') {
      const t = TALENT_TREES.find(x => x.key === n.tree);
      return `${t.name} 특성에 ${TALENT_ROWS[n.row] - treeSpent(s, n.tree, n.row)}포인트를 더 찍으면 열려요`;
    }
    return BLOCK[why] || '';
  };
  const paint = () => {
    const st = lordStats(s);
    const list = skillList(s);
    el.querySelector('.lord-info').innerHTML = `
      <img class="big-face" src="${lordIcon(s.lord, 180)}" alt="">
      <h2>${L.name} <small>${L.title}</small></h2>
      <div class="stat-list">
        <div>레벨 <b>${s.level}</b> <small>(경험치 ${fmt(s.exp)} / ${fmt(expNeed(s.level))})</small></div>
        <div>❤ 체력 <b>${fmt(st.hp)}</b> · ⚔ 공격 <b>${fmt(st.atk)}</b> <small>${L.ranged ? '활' : '칼'}</small></div>
        <div>🛡 받는 피해 <b>-${pct(st.def)}</b> · 🚩 통솔력 <b>${lordLeadership(s)}</b></div>
      </div>
      <div class="trait">⭐ ${L.trait}</div>
      <div class="lord-sk-list">
        ${L.skills.map((key, i) => {
          const def = SKILLS[key];
          const sk = list[i];
          return `<div class="lsk ${sk ? '' : 'locked'}"><span class="sk-ico">${def.icon}</span><div><b>${def.name}</b> ${sk ? `<span class="lv">Lv ${sk.lv}</span> <small>대기 ${Math.round(sk.cd)}초</small>` : `<small>🔒 군주 Lv ${SKILL_UNLOCK[i]}에 배워요</small>`}</div></div>`;
        }).join('')}
      </div>`;
    const free = freePoints(s);
    const n = TALENTS[sel];
    const r = s.talents[sel] || 0;
    const lab = talentLabel(s.lord, sel);
    const why = addBlock(s, sel);
    el.querySelector('.lord-talents').innerHTML = `
      <div class="tl-head">
        <h2>✨ 군주 특성</h2>
        <span class="sp">남은 포인트 <b>${free}</b> / ${talentPoints(s)}</span>
        <span class="grow"></span>
        <button class="btn tl-auto" type="button" ${free ? '' : 'disabled'}>🧭 추천대로 찍기</button>
        <button class="btn tl-reset ${resetArmed ? 'danger' : ''}" type="button">${resetArmed ? '정말 되돌릴까요?' : '↩ 모두 되돌리기'}</button>
      </div>
      ${news ? '<p class="tl-news">🆕 군주 특성이 생겼어요! 예전 스킬 포인트를 추천대로 찍어 두었어요. 마음대로 바꿔 보세요.</p>' : '<p class="muted">레벨이 오를 때마다 특성 포인트 1개. 어디에 쓸지 골라요. 언제든 공짜로 되돌려 다시 찍을 수 있어요.</p>'}
      <div class="tl-trees">
        ${TALENT_TREES.map(t => `
          <div class="tl-tree">
            <div class="tl-tree-h">${t.icon} ${t.name} <small>${treeSpent(s, t.key)}포인트</small></div>
            ${TALENT_ROWS.map((need, row) => `
              <div class="tl-row ${treeSpent(s, t.key, row) < need ? 'shut' : ''}">
                ${t.nodes.filter(m => m.row === row).map(m => {
                  const mr = s.talents[m.key] || 0;
                  const ml = talentLabel(s.lord, m.key);
                  const b = addBlock(s, m.key);
                  const cls = [m.key === sel ? 'sel' : '', mr ? 'some' : '', mr >= m.max ? 'full' : '', b === 'row' || b === 'skill' ? 'off' : '', m.row === 3 ? 'cap' : ''].join(' ');
                  return `<button class="tl-node ${cls}" data-k="${m.key}" type="button"><span class="tl-ico">${ml.icon}</span><span class="tl-name">${ml.name}</span><span class="tl-r">${mr}/${m.max}</span></button>`;
                }).join('')}
              </div>`).join('')}
          </div>`).join('')}
      </div>
      <div class="tl-detail">
        <div class="tl-d-head"><span class="tl-ico">${lab.icon}</span><b>${lab.name}</b><span class="tl-r">${r}/${n.max}</span></div>
        <div class="tl-d-now">${r ? `지금: ${talentText(s.lord, sel, r)}` : `아직 안 찍었어요${n.skill !== undefined && skillLevel(s, n.skill) ? ` (스킬 Lv 1)` : ''}`}</div>
        ${r < n.max ? `<div class="tl-d-next">${r ? '다음' : '1포인트'}: ${talentText(s.lord, sel, r + 1)}</div>` : ''}
        ${why && why !== 'max' ? `<div class="tl-d-why">🔒 ${blockText(sel, why)}</div>` : ''}
        <div class="tl-d-btns">
          <button class="btn tl-minus" type="button" ${canRemove(s, sel) ? '' : 'disabled'}>➖ 빼기</button>
          <button class="btn primary tl-plus" type="button" ${why ? 'disabled' : ''}>${r >= n.max ? '최고' : '➕ 1포인트'}</button>
        </div>
      </div>`;
    el.querySelectorAll('.tl-node').forEach(b => b.addEventListener('click', () => { sfx.select(); sel = b.dataset.k; resetArmed = 0; paint(); }));
    el.querySelector('.tl-plus').addEventListener('click', e => {
      const w = addBlock(s, sel);
      if (w) { sfx.denied(); shake(e.currentTarget); toast(el, blockText(sel, w), true); return; }
      addTalent(s, sel);
      sfx.upgrade();
      game.persist();
      paint();
    });
    el.querySelector('.tl-minus').addEventListener('click', e => {
      if (!removeTalent(s, sel)) { sfx.denied(); shake(e.currentTarget); toast(el, '아래 줄에 찍은 포인트가 있어서 뺄 수 없어요', true); return; }
      sfx.select();
      game.persist();
      paint();
    });
    el.querySelector('.tl-auto').addEventListener('click', () => {
      autoTalents(s);
      sfx.upgrade();
      game.persist();
      paint();
    });
    el.querySelector('.tl-reset').addEventListener('click', () => {
      if (!resetArmed) {
        sfx.select();
        resetArmed = setTimeout(() => { resetArmed = 0; if (el.isConnected) paint(); }, 3000);
        paint();
        return;
      }
      clearTimeout(resetArmed);
      resetArmed = 0;
      resetTalents(s);
      sfx.select();
      toast(el, `특성 포인트 ${talentPoints(s)}개를 모두 돌려받았어요`);
      game.persist();
      paint();
    });
  };
  paint();
  return { el, music: 'base' };
}

// ---------------------------------------------------------------------------------

function equipScreen(game, arg = {}) {
  const s = game.save;
  let tab = arg.tab || 'weapon';
  let pick = s.equipped[tab] || null;
  const el = h(`
    <div class="screen equip">
      ${header(game)}
      ${backBtn()}
      <div class="eq-tabs">${Object.entries(SLOTS).map(([k, v]) => `<button class="eq-tab" data-k="${k}" type="button">${v}</button>`).join('')}</div>
      <div class="eq-cols">
        <div class="panel eq-list"></div>
        <div class="panel eq-detail"></div>
      </div>
    </div>`);
  el.querySelector('.back-btn').addEventListener('click', () => { sfx.select(); game.persist(); goBack(game, arg); });
  const shopFor = slot => Object.entries(EQUIPS).filter(([k, e]) => e.slot === slot && e.price && s.progress >= (e.shopAfter || 0) && !s.equips.some(x => x.key === k)).map(([k]) => k);

  const paint = () => {
    el.querySelector('.hdr-gold').textContent = fmt(s.gold);
    el.querySelectorAll('.eq-tab').forEach(b => {
      b.classList.toggle('on', b.dataset.k === tab);
      const nNew = s.newEquips.filter(k => EQUIPS[k].slot === b.dataset.k).length;
      b.innerHTML = `${SLOTS[b.dataset.k]}${nNew ? ' <em class="badge">새</em>' : ''}`;
    });
    const owned = s.equips.filter(e => EQUIPS[e.key].slot === tab).sort((a, b) => EQUIPS[b.key].g - EQUIPS[a.key].g);
    const shop = shopFor(tab);
    el.querySelector('.eq-list').innerHTML = `
      <div class="pc-h">가진 ${SLOTS[tab]}</div>
      ${owned.length ? owned.map(e => `
        <button class="eq-item ${s.equipped[tab] === e.key ? 'worn' : ''} ${pick === e.key ? 'sel' : ''}" data-k="${e.key}" type="button">
          <span class="eq-ico">${EQUIPS[e.key].icon}</span>${gradeName(e.key)}${upTag(e.up)}
          ${s.equipped[tab] === e.key ? '<span class="worn-tag">장착 중</span>' : ''}
          ${s.newEquips.includes(e.key) ? '<em class="badge">새</em>' : ''}
        </button>`).join('') : '<p class="muted">아직 없어요</p>'}
      ${shop.length ? `<div class="pc-h">🏪 상점</div>${shop.map(k => `
        <button class="eq-item shop ${pick === k ? 'sel' : ''}" data-k="${k}" type="button">
          <span class="eq-ico">${EQUIPS[k].icon}</span>${gradeName(k)} <span class="price">💰${fmt(EQUIPS[k].price)}</span>
        </button>`).join('')}` : ''}`;
    el.querySelectorAll('.eq-item').forEach(b => b.addEventListener('click', () => {
      pick = b.dataset.k;
      s.newEquips = s.newEquips.filter(k => k !== pick);
      sfx.select();
      paint();
    }));
    const d = el.querySelector('.eq-detail');
    if (!pick || EQUIPS[pick].slot !== tab) {
      d.innerHTML = '<p class="muted">왼쪽에서 장비를 골라 주세요</p>';
      return;
    }
    const E = EQUIPS[pick];
    const it = s.equips.find(e => e.key === pick);
    if (!it) {
      d.innerHTML = `
        <div class="eq-big">${E.icon}</div>
        <h2>${gradeName(pick)} <small>${GRADES[E.g].name}</small></h2>
        <div class="fx">${fxText(equipFx(pick, 0))}</div>
        <button class="btn primary big buy" type="button">💰${fmt(E.price)} 에 사기</button>`;
      d.querySelector('.buy').addEventListener('click', () => {
        if (s.gold < E.price) { sfx.denied(); toast(el, '골드가 모자라요', true); return; }
        s.gold -= E.price;
        s.equips.push({ key: pick, up: 0 });
        sfx.coin();
        game.persist();
        paint();
      });
      return;
    }
    const worn = s.equipped[tab] === pick;
    const max = it.up >= MAX_ENHANCE;
    const cost = max ? 0 : enhanceCost(pick, it.up);
    d.innerHTML = `
      <div class="eq-big">${E.icon}</div>
      <h2>${gradeName(pick)}${upTag(it.up)} <small>${GRADES[E.g].name}</small></h2>
      <div class="fx">${fxText(equipFx(pick, it.up))}</div>
      ${max ? '' : `<div class="fx next">+${it.up + 1}: ${fxText(equipFx(pick, it.up + 1))}</div>`}
      <div class="row-btns">
        <button class="btn ${worn ? '' : 'primary'} wear" type="button">${worn ? '벗기' : '장착하기'}</button>
        <button class="btn enh" type="button" ${max ? 'disabled' : ''}>${max ? '최고 강화' : `⬆ 강화 💰${fmt(cost)}`}</button>
      </div>`;
    d.querySelector('.wear').addEventListener('click', () => {
      s.equipped[tab] = worn ? null : pick;
      sfx.confirm();
      game.persist();
      paint();
    });
    d.querySelector('.enh').addEventListener('click', () => {
      if (max) return;
      if (s.gold < cost) { sfx.denied(); toast(el, '골드가 모자라요', true); return; }
      s.gold -= cost;
      it.up++;
      sfx.upgrade();
      game.persist();
      paint();
    });
  };
  el.querySelectorAll('.eq-tab').forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.k;
    pick = s.equipped[tab] || null;
    sfx.select();
    paint();
  }));
  paint();
  return { el, music: 'base' };
}

// ---------------------------------------------------------------------------------

function countersScreen(game, arg = {}) {
  const s = game.save;
  const col = s?.lord ? us(s) : FACTIONS.shu;
  const img = t => `<img class="ticon" src="${troopIcon(t, col, 48)}" alt="">`;
  const el = h(`
    <div class="screen counters">
      ${backBtn()}
      <h2 class="center-title">📖 상성표 <small>▲▲ 아주 강함 피해 ${COUNTER_MULT[2]}배 · ▲ 강함 ${COUNTER_MULT[1]}배 · ▼ 약함 ${COUNTER_MULT[-1]}배 · ▼▼ 아주 약함 ${COUNTER_MULT[-2]}배</small></h2>
      <div class="ring">${[...RING, RING[0]].map(t => `<span class="ring-i">${img(t)}<b>${TROOPS[t].short}</b></span>`).join('<span class="ring-a">⇒</span>')}<div class="ring-cap">⇒ 다음 병종에게 <b>아주 강함</b> ▲▲</div></div>
      <div class="ct-grid">
        ${TROOP_KEYS.map(t => `
          <div class="ct">
            <div class="ct-head">${img(t)}<b>${TROOPS[t].name}</b></div>
            ${relations(t).good.map(([x, lv]) => `<div class="ct-line good ${lv > 1 ? 'very' : ''}"><i class="mk">${COUNTER_MARK[lv]}</i> ${img(x)} <b>${TROOPS[x].short}</b> <small>${STRONG_WHY[`${t}>${x}`]}</small></div>`).join('')}
            ${relations(t).bad.map(([x, lv]) => `<div class="ct-line bad ${lv < -1 ? 'very' : ''}"><i class="mk">${COUNTER_MARK[lv]}</i> ${img(x)} <b>${TROOPS[x].short}</b> <small>${STRONG_WHY[`${x}>${t}`]}</small></div>`).join('')}
          </div>`).join('')}
      </div>
      <p class="ct-tip">💡 정찰 보고에서 적 병종을 보고, 그 적에게 ▲인 부대를 데려가세요!</p>
    </div>`);
  el.querySelector('.back-btn').addEventListener('click', () => { sfx.select(); goBack(game, arg); });
  if (s) { s.seen.counters = true; }
  return { el, music: 'base' };
}

// ---------------------------------------------------------------------------------

function resultScreen(game, { r, out }) {
  const s = game.save;
  const story = storyOf(s);
  const st = story.stages[r.stageIdx];
  const lines = [];
  if (out.sleep) lines.push('<div class="rw sleep">💤 레벨이 높아서 이번에는 보상이 없어요</div>');
  if (out.gold) lines.push(`<div class="rw">💰 골드 +${fmt(out.gold)}${out.starGold ? ` <small>(별 보너스 ${fmt(out.starGold)} 포함)</small>` : ''}</div>`);
  if (out.exp) lines.push(`<div class="rw">✨ 경험치 +${fmt(out.exp)}</div>`);
  if (out.levels) lines.push(`<div class="rw big">🎉 레벨 업! Lv ${s.level} <small>통솔력 ${lordLeadership(s)} · 특성 포인트 +${out.levels}</small></div>`);
  for (const i of out.newSkills) {
    const key = LORDS[s.lord].skills[i];
    lines.push(`<div class="rw big">✨ 새 스킬: ${SKILLS[key].icon} ${SKILLS[key].name}</div>`);
  }
  if (out.first) lines.push(`<div class="rw big">📜 새 이야기가 열렸어요: <b>제${r.stageIdx + 1}장 · ${st.title}</b> <small>이야기책에서 자세히 읽을 수 있어요</small></div>`);
  if (out.item) lines.push(`<div class="rw big">🎁 ${EQUIPS[out.item].icon} ${gradeName(out.item)} ${out.itemDup ? '<small>(이미 있어서 골드로 받았어요)</small>' : '획득! <small>장비에서 장착하세요</small>'}</div>`);
  for (const k of out.newGenerals || []) lines.push(`<div class="rw big"><img class="ticon" src="${generalIcon(GENERALS[k].type, GENERALS[k].letter, us(s), 48)}" alt=""> 새 장수 합류: <b>${GENERALS[k].name}</b>! <small>${GENERALS[k].skill} · 정비에서 데려갈 수 있어요</small></div>`);
  for (const t of out.unlocked) lines.push(`<div class="rw big">${troopImg(s, t, 40)} 새 병종: <b>${TROOPS[t].name}</b>! <small>병영과 정비에서 쓸 수 있어요</small></div>`);
  let tip = '';
  if (!r.won) {
    const sum = stageSummary(buildWaves(st, r.stageIdx + 1, stageLayout(r.stageIdx + 1).paths.length));
    const topT = TROOP_KEYS.filter(t => sum[t]).sort((a, b) => sum[b] - sum[a])[0];
    tip = r.reason === 'boss' ? `💡 적장 <b>${st.boss.name}</b>이(가) 성문을 넘으면 바로 져요. 적장은 가까이 있는 우리 부대와 먼저 싸우니, 적장이 지나가는 길목에 강한 부대와 장수를 모으고, 군주 스킬과 벽력탄·목책을 아껴 두었다가 적장에게 쓰세요. 적장은 <b>${TROOPS[st.boss.type].name}</b>이라 ${weakTo(st.boss.type).map(t => TROOPS[t].name).join(', ')}이(가) 강해요.` : `💡 이번 적은 <b>${TROOPS[topT].name}</b>이 많았어요. ${weakTo(topT).map(t => TROOPS[t].name).join(', ')}이(가) 강해요. 병영에서 병종을 강화하거나, 아이템을 챙겨 보세요.`;
  }
  const hasNext = r.won && r.stageIdx + 1 < STAGE_COUNT && r.stageIdx + 1 <= s.progress;
  const el = h(`
    <div class="screen result ${r.won ? 'win' : 'lose'}">
      <div class="panel result-panel">
        <h1>${r.won ? '🏆 승리!' : '💥 패배...'}</h1>
        ${r.won ? `<div class="big-stars">${[1, 2, 3].map(k => `<span class="${k <= r.stars ? 'on' : ''}" style="animation-delay:${k * 0.25}s">★</span>`).join('')}</div>
        <div class="gate-left">성문 내구도 ${r.gate}/20 남음</div>` : `<div class="gate-left">${r.reason === 'boss' ? `적장 ${st.boss.name}이(가) 성문을 넘었어요` : `${r.wavesReached}/${r.totalWaves} 웨이브까지 버텼어요`}</div>`}
        ${r.won ? `<div class="outro">${st.outro.map(l => `<p>${l}</p>`).join('')}</div>` : ''}
        <div class="rewards">${lines.join('') || '<div class="rw muted">보상 없음</div>'}</div>
        ${tip ? `<div class="tip">${tip}</div>` : ''}
        <div class="row-btns">
          ${out.ending ? '<button class="btn primary big ending" type="button">🎉 천하통일!</button>' : ''}
          ${!out.ending && hasNext ? '<button class="btn primary next" type="button">▶ 다음 지역 정비</button>' : ''}
          ${!r.won ? '<button class="btn primary retry" type="button">↻ 다시 정비하기</button>' : ''}
          ${r.won ? '<button class="btn read-lore" type="button">📜 이야기 읽기</button>' : ''}
          <button class="btn map" type="button">🗺 지도</button>
          <button class="btn base" type="button">🏯 본영</button>
        </div>
      </div>
    </div>`);
  const on = (sel, fn) => el.querySelector(sel)?.addEventListener('click', () => { sfx.confirm(); fn(); });
  on('.next', () => game.show('prep', { stageIdx: r.stageIdx + 1 }));
  on('.retry', () => game.show('prep', { stageIdx: r.stageIdx }));
  on('.map', () => game.show('map', { sel: hasNext ? r.stageIdx + 1 : r.stageIdx }));
  on('.base', () => game.show('base'));
  on('.ending', () => game.showEnding());
  on('.read-lore', () => game.show('storybook', { chapter: st.id }));
  return { el, music: null };
}

function pauseScreen(game) {
  const el = h(`
    <div class="screen pause">
      <div class="panel pause-panel">
        <h2>⏸ 잠깐 멈춤</h2>
        <button class="btn primary big resume" type="button">▶ 계속하기</button>
        <button class="btn restart" type="button">↻ 처음부터 다시</button>
        <button class="btn quit" type="button">🗺 그만두고 지도로</button>
        <button class="btn counters" type="button">📖 상성표 보기</button>
      </div>
    </div>`);
  el.querySelector('.pause-panel').appendChild(soundToggles(game));
  el.querySelector('.resume').addEventListener('click', () => { sfx.confirm(); game.resume(); });
  el.querySelector('.restart').addEventListener('click', () => {
    sfx.select();
    confirmDialog(el, { title: '처음부터 다시 할까요?', text: '이번 전투에서 쓴 아이템은 돌아오지 않아요.', yes: '↻ 다시 하기', onYes: () => game.restartBattle() });
  });
  el.querySelector('.quit').addEventListener('click', () => {
    sfx.select();
    confirmDialog(el, { title: '전투를 그만둘까요?', text: '보상은 없고, 쓴 아이템은 돌아오지 않아요.', yes: '그만두기', onYes: () => game.quitBattle() });
  });
  el.querySelector('.counters').addEventListener('click', () => {
    sfx.select();
    const c = countersScreen(game, {});
    c.el.classList.add('over');
    c.el.querySelector('.back-btn').addEventListener('click', e => { e.stopPropagation(); c.el.remove(); }, { capture: true });
    el.appendChild(c.el);
  });
  return { el, music: undefined };
}

// ---------------------------------------------------------------------------------

// One general's card: picture, name, troop type, special and current strength.
function generalCard(s, k, { foes = [], picked = false, locked = false } = {}) {
  const G = GENERALS[k];
  const story = storyOf(s);
  if (locked) {
    const st = story.stages[G.unlock - 1];
    return `
      <div class="gcard locked" data-k="${k}">
        <img src="${generalIcon(G.type, G.letter, { color: '#777' }, 72)}" alt="">
        <div class="gc-mid"><b>${G.name}</b> <small>${TROOPS[G.type].short}</small>
        <div class="gc-lock">🔒 ${G.unlock}번째 지역${st ? ` '${st.title}'` : ''}을(를) 깨면 합류</div></div>
      </div>`;
  }
  const st = generalStats(s, k);
  const lv = bestLevel(G.type, foes);
  return `
    <button class="gcard ${picked ? 'picked' : ''}" data-k="${k}" type="button">
      <img src="${generalIcon(G.type, G.letter, us(s), 72)}" alt="">
      <div class="gc-mid">
        <b>${G.name}</b> <small>${TROOPS[G.type].name}${lv > 0 ? ` <em class="up${lv > 1 ? ' very' : ''}">${COUNTER_MARK[lv]}</em>` : ''}</small>
        <div class="gc-desc">${G.desc}</div>
        <div class="gc-skill">✨ <b>${G.skill}</b> ${GEN_SPECIALS[G.kind].text}</div>
        <div class="gc-stat">❤ ${fmt(st.hp)} · ⚔ ${fmt(st.atk)} · 🎯 ${st.range}</div>
      </div>
      ${picked ? '<span class="gc-tag">데려감</span>' : ''}
    </button>`;
}

// Overlay for choosing which generals come along (toggle, up to GENERAL_PICKS).
function openGeneralPicker(game, parent, foes, onDone) {
  const s = game.save;
  const dlg = h(`
    <div class="confirm gpick">
      <div class="panel gpick-panel">
        <h2>⭐ 데려갈 장수 <small>${GENERAL_PICKS}명까지 · ▲ = 이번 적에게 강함</small></h2>
        <div class="gcards"></div>
        <div class="row-btns"><button class="btn primary done" type="button">확인</button></div>
      </div>
    </div>`);
  const paint = () => {
    const avail = unlockedGenerals(s);
    const locked = generalsOf(LORDS[s.lord].faction).filter(k => !generalUnlocked(s, k));
    dlg.querySelector('.gcards').innerHTML =
      avail.map(k => generalCard(s, k, { foes, picked: s.picks.includes(k) })).join('') +
      locked.map(k => generalCard(s, k, { locked: true })).join('');
    dlg.querySelectorAll('button.gcard').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (s.picks.includes(k)) s.picks = s.picks.filter(x => x !== k);
      else if (s.picks.length < GENERAL_PICKS) s.picks = [...s.picks, k];
      else s.picks = [...s.picks.slice(1), k]; // full: replace the oldest pick
      sfx.select();
      paint();
    }));
  };
  paint();
  dlg.querySelector('.done').addEventListener('click', () => { sfx.confirm(); dlg.remove(); onDone(); });
  parent.appendChild(dlg);
}

function generalsScreen(game, arg = {}) {
  const s = game.save;
  const el = h(`
    <div class="screen generals">
      ${header(game)}
      ${backBtn()}
      <h2 class="center-title">🎖️ 장수 <small>정비에서 ${GENERAL_PICKS}명을 골라 데려가요. 전장에서는 무료로 세우는 강한 타워가 돼요. 힘은 군주 레벨을 따라 올라요.</small></h2>
      <div class="gcards wide"></div>
    </div>`);
  el.querySelector('.back-btn').addEventListener('click', () => { sfx.select(); goBack(game, arg); });
  const paint = () => {
    const avail = unlockedGenerals(s);
    const locked = generalsOf(LORDS[s.lord].faction).filter(k => !generalUnlocked(s, k));
    el.querySelector('.gcards').innerHTML =
      avail.map(k => generalCard(s, k, { picked: pickedGenerals(s).includes(k) })).join('') +
      locked.map(k => generalCard(s, k, { locked: true })).join('');
    el.querySelectorAll('button.gcard').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (s.picks.includes(k)) s.picks = s.picks.filter(x => x !== k);
      else if (s.picks.length < GENERAL_PICKS) s.picks = [...s.picks, k];
      else s.picks = [...s.picks.slice(1), k];
      sfx.select();
      game.persist();
      paint();
    }));
  };
  paint();
  return { el, music: 'base' };
}

// ---------------------------------------------------------------------------------

// Story book chapters: the prologue, one per stage (opens when that stage is cleared), the ending.
export function storyChapters(s) {
  const story = storyOf(s);
  const list = [{ key: 'prologue', kind: 'prologue', open: true }];
  story.stages.forEach((st, i) => list.push({ key: st.id, kind: 'stage', idx: i, open: s.stages[i].clears > 0 }));
  list.push({ key: 'ending', kind: 'ending', open: !!s.seen.ending });
  return list;
}
export const unreadChapters = s => storyChapters(s).filter(c => c.open && !s.read.includes(c.key)).length;

const loreCache = {};
async function loadLore(lord) {
  if (!loreCache[lord]) {
    loreCache[lord] = import(`./lore/${lord}.js`).then(m => m.default).catch(() => null);
  }
  return loreCache[lord];
}

function storybookScreen(game, { chapter = null } = {}) {
  const s = game.save;
  const story = storyOf(s);
  const L = LORDS[s.lord];
  const list = storyChapters(s);
  const lastOpen = [...list].reverse().find(c => c.open && c.kind === 'stage') || list[0];
  let cur = list.find(c => c.key === chapter && c.open) || list.find(c => c.open && !s.read.includes(c.key)) || lastOpen;
  let lore = null;
  const el = h(`
    <div class="screen storybook">
      ${backBtn('← 본영')}
      <h2 class="center-title">📜 ${L.name}의 이야기책 <small>지역을 깨면 새 장이 열려요</small></h2>
      <div class="sb-cols">
        <nav class="sb-toc"></nav>
        <article class="sb-page"></article>
      </div>
    </div>`);
  el.querySelector('.back-btn').addEventListener('click', () => { sfx.select(); game.persist(); game.show('base'); });
  const toc = el.querySelector('.sb-toc');
  const page = el.querySelector('.sb-page');

  const label = c => (c.kind === 'prologue' ? '프롤로그' : c.kind === 'ending' ? '마지막 장 · 천하통일' : `제${c.idx + 1}장 · ${story.stages[c.idx].title}`);

  const paintToc = () => {
    toc.innerHTML = list.map(c => {
      const next = c.kind === 'stage' && !c.open && c.idx === s.progress;
      const text = c.open ? label(c) : next ? `🔒 제${c.idx + 1}장 · ${story.stages[c.idx].title}` : c.kind === 'ending' ? '🔒 마지막 장' : `🔒 제${c.idx + 1}장`;
      const isNew = c.open && !s.read.includes(c.key);
      return `<button class="sb-ch ${c.open ? '' : 'locked'} ${c === cur ? 'on' : ''}" data-k="${c.key}" type="button" ${c.open ? '' : 'disabled'}>${text}${isNew ? ' <em class="badge">새</em>' : ''}</button>`;
    }).join('');
    toc.querySelectorAll('.sb-ch:not(.locked)').forEach(b => b.addEventListener('click', () => {
      cur = list.find(c => c.key === b.dataset.k);
      sfx.select();
      paintPage();
    }));
    toc.querySelector('.sb-ch.on')?.scrollIntoView({ block: 'nearest' });
  };

  const paintPage = () => {
    const c = cur;
    let title, meta = '', paras, fact = '';
    if (c.kind === 'prologue') {
      title = lore?.prologue?.title ? `프롤로그 · ${lore.prologue.title}` : '프롤로그';
      paras = lore?.prologue?.paras || story.prologue;
    } else if (c.kind === 'ending') {
      title = lore?.ending?.title ? `마지막 장 · ${lore.ending.title}` : '마지막 장 · 천하통일';
      paras = lore?.ending?.paras || story.ending;
    } else {
      const st = story.stages[c.idx];
      const ch = lore?.stages?.[st.id];
      title = `제${c.idx + 1}장 · ${st.title}`;
      meta = `📍 ${PLACES[st.loc]?.name || ''} · ${st.year}년 · 상대: ${FACTIONS[st.enemy]?.army || ''}, ${st.boss.name}`;
      paras = ch?.paras || [...st.intro, ...st.outro];
      fact = ch?.fact || '';
    }
    const open = list.filter(x => x.open);
    const i = open.indexOf(c);
    const prev = open[i - 1], next = open[i + 1];
    page.innerHTML = `
      <h3 class="sb-title">${title}</h3>
      ${meta ? `<div class="sb-meta">${meta}</div>` : ''}
      <div class="sb-text">${paras.map(p => `<p>${p}</p>`).join('')}</div>
      ${fact ? `<div class="sb-fact">💡 <b>알고 있나요?</b> ${fact}</div>` : ''}
      <div class="sb-nav">
        <button class="btn sb-prev" type="button" ${prev ? '' : 'disabled'}>◀ ${prev ? label(prev) : '처음'}</button>
        <button class="btn primary sb-next" type="button" ${next ? '' : 'disabled'}>${next ? label(next) : '다음 장은 다음 지역을 깨면 열려요'} ▶</button>
      </div>`;
    page.scrollTop = 0;
    page.querySelector('.sb-prev').addEventListener('click', () => { if (prev) { cur = prev; sfx.select(); paintPage(); } });
    page.querySelector('.sb-next').addEventListener('click', () => { if (next) { cur = next; sfx.select(); paintPage(); } });
    if (!s.read.includes(c.key)) { s.read = [...s.read, c.key]; game.persist(); }
    paintToc();
  };

  page.innerHTML = '<p class="muted">이야기를 펼치는 중...</p>';
  paintToc();
  loadLore(s.lord).then(m => { lore = m; if (el.isConnected || true) paintPage(); });
  return { el, music: 'base' };
}

export const SCREENS = {
  storybook: storybookScreen,
  generals: generalsScreen,
  title: titleScreen,
  slots: slotsScreen,
  lordSelect: lordSelectScreen,
  story: storyScreen,
  base: baseScreen,
  map: mapScreen,
  prep: prepScreen,
  barracks: barracksScreen,
  lord: lordScreen,
  equip: equipScreen,
  counters: countersScreen,
  result: resultScreen,
  pause: pauseScreen,
};
