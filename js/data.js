// Game rules and numbers: troop types and counters, lords and their orders, equipment,
// consumable items and growth formulas. Balance knobs live here.

export const VERSION = '1.0.13'; // keep in sync with CACHE in sw.js
export const STAGE_COUNT = 20;
export const GATE_HP = 60;
export const MAX_LORD_LEVEL = 30;
export const MAX_TROOP_LEVEL = 20;
export const MAX_SKILL_LEVEL = 5;
export const MAX_ENHANCE = 10;
export const ITEM_CARRY_MAX = 3;

// ---- Troops (both armies use the same six types) ------------------------------

export const TROOP_KEYS = ['infantry', 'spear', 'cavalry', 'archer', 'strategist', 'catapult'];

// Player squads. cost = 군량 to deploy, lead = 통솔력 it takes in the roster.
// Every type has a named trait shown on its card (the ranged ones just name what they already
// do). The three melee types each have a trait that makes them fight differently:
// 보병 is the wall (holds the most enemies, takes less damage, arrows least of all),
// 창병 is the attacker (strikes first and runs several enemies through), and 기마병 never
// stands to hold the road: it rides through the enemy, wheels round and rides through again.
export const TROOPS = {
  infantry: {
    name: '보병', short: '보병', melee: true, cost: 60, lead: 2,
    hp: 430, atk: 12, cd: 1.0, range: 85, block: 4, speed: 75, reach: 34,
    trait: { icon: '🛡️', name: '방패벽', dr: 0.12, arrowDr: 0.5, text: '적을 가장 많이 막고, 방패로 받는 피해를 줄여요 (화살은 절반)' },
    desc: '칼과 방패. 길을 막고 오래 버텨요.',
  },
  spear: {
    name: '창병', short: '창병', melee: true, cost: 60, lead: 2,
    hp: 290, atk: 12, cd: 1.4, range: 90, block: 2, speed: 75, reach: 62,
    trait: { icon: '🔱', name: '긴 창', pierce: 3, text: '창이 길어 공격은 느리지만, 적이 닿기 전에 먼저 찌르고 한 번에 3명까지 꿰뚫어요' },
    desc: '긴 창으로 길을 막아요. 기마병을 잘 막아요.',
  },
  cavalry: {
    name: '기마병', short: '기마', melee: true, cost: 90, lead: 3,
    hp: 330, atk: 28, cd: 1.1, range: 230, block: 0, speed: 190, reach: 38,
    trait: {
      icon: '🐎', name: '돌격', pass: true, power: 1.6, rest: 0.3, hits: 4, width: 34, over: 90, turn: 0.35,
      text: '길을 막지 않고, 넓은 구역을 달리며 적진을 뚫고 지나가요 (처음 부딪힌 적은 1.6배, 스친 적은 한 번 반격해요)',
    },
    desc: '멀리까지 달려 나가 강하게 들이받아요.',
  },
  archer: {
    name: '궁수', short: '궁수', melee: false, cost: 70, lead: 2,
    hp: 160, atk: 19, cd: 0.8, range: 200,
    role: '한 명씩 빠르게',
    trait: { icon: '🏹', name: '속사', text: '0.8초마다 빠르게 쏘고, 노린 적이 먼저 쓰러지면 화살이 옆의 적에게 날아가요' },
    desc: '멀리 있는 적을 빠르게 쏴요.',
  },
  strategist: {
    name: '책사', short: '책사', melee: false, cost: 100, lead: 3,
    hp: 150, atk: 23, cd: 2.2, range: 180, splash: 52, burn: 0.5, slow: 0.3,
    role: '불로 둘레 여럿을',
    trait: { icon: '🔥', name: '화계', text: '불을 던져 둘레의 적까지 태우고(2.5초 더 타요), 맞은 적은 잠깐 느려져요' },
    desc: '책략으로 불을 질러요. 맞은 적은 불타고 느려져요.',
  },
  catapult: {
    name: '투석기', short: '투석', melee: false, cost: 120, lead: 4,
    hp: 210, atk: 27, cd: 3.2, range: 290, splash: 66,
    role: '가장 멀리, 여럿을',
    trait: { icon: '🪨', name: '바위 세례', text: '가장 멀리 던져 떨어진 곳의 적을 한꺼번에 때려요. 움직이는 적은 앞을 보고 던져요' },
    desc: '아주 멀리 큰 돌을 던져 여럿을 한꺼번에 때려요.',
  },
};

// Waves bring HORDE times as many soldiers as the numbers below were made for, each one weaker
// and worth a third of the 군량. A melee squad holds HORDE times as many of them, and the gate is
// HORDE times as big. The enemy general is not affected. Soldiers are weakest in the first
// stages, where we have no catapults or strategists to hit a crowd yet.
export const HORDE = 3;
export const HORDE_STATS = { hp: 0.36, hpUp: 0.013, hpMax: 0.56, atk: 0.3, atkUp: 0.006, atkMax: 0.42 };
export const hordeHp = n => Math.min(HORDE_STATS.hpMax, HORDE_STATS.hp + HORDE_STATS.hpUp * (n - 1));
export const hordeAtk = n => Math.min(HORDE_STATS.atkMax, HORDE_STATS.atk + HORDE_STATS.atkUp * (n - 1));

// Enemy soldiers at stage 1 (stage scaling multiplies hp/atk).
export const FOES = {
  infantry: { hp: 110, atk: 9, cd: 1.0, speed: 36, reward: 7, gate: 1 },
  spear: { hp: 95, atk: 11, cd: 1.0, speed: 38, reward: 7, gate: 1 },
  cavalry: { hp: 130, atk: 14, cd: 1.0, speed: 68, reward: 10, gate: 2, raid: 110 },
  archer: { hp: 70, atk: 7, cd: 1.3, speed: 38, range: 170, reward: 8, gate: 1 },
  strategist: { hp: 85, atk: 7, cd: 1.6, speed: 36, range: 150, heal: 0.14, healCd: 3, reward: 10, gate: 1 },
  catapult: { hp: 230, atk: 19, cd: 4.5, speed: 24, range: 240, splash: 40, reward: 16, gate: 2 },
};

// Counters: each type is very strong against one type and strong against another, and the
// mirror for weak. The very-strong links form one ring a kid can remember:
// 창병 ⇒ 기마병 ⇒ 궁수 ⇒ 책사 ⇒ 투석기 ⇒ 보병 ⇒ 창병.
export const STRONG = { // [very strong, strong]
  spear: ['cavalry', 'catapult'],
  cavalry: ['archer', 'infantry'],
  archer: ['strategist', 'spear'],
  strategist: ['catapult', 'cavalry'],
  catapult: ['infantry', 'archer'],
  infantry: ['spear', 'strategist'],
};
export const RING = ['spear', 'cavalry', 'archer', 'strategist', 'catapult', 'infantry'];
// Why, in words a kid remembers (shown in the counter chart).
export const STRONG_WHY = {
  'spear>cavalry': '긴 창으로 말을 막아요',
  'spear>catapult': '투석기에 달려들어 부숴요',
  'cavalry>infantry': '말을 타고 짓밟아요',
  'cavalry>archer': '빠르게 궁수를 덮쳐요',
  'infantry>spear': '방패로 막고 창 안쪽으로 파고들어요',
  'infantry>strategist': '책사를 붙잡아요',
  'archer>strategist': '약한 책사를 노려 쏴요',
  'archer>spear': '방패 없는 창병에게 화살 비',
  'strategist>catapult': '화계로 나무 투석기를 태워요',
  'strategist>cavalry': '함정과 매복으로 말을 묶어요',
  'catapult>archer': '모여 있는 궁수에게 바위',
  'catapult>infantry': '무거운 보병 대열에 바위',
};
// level: 2 아주 강함, 1 강함, 0 보통, -1 약함, -2 아주 약함
export const COUNTER_MULT = { 2: 2.0, 1: 1.4, 0: 1, '-1': 0.7, '-2': 0.5 };
export const COUNTER_MARK = { 2: '▲▲', 1: '▲', 0: '', '-1': '▼', '-2': '▼▼' };
export const COUNTER_NAME = { 2: '아주 강함', 1: '강함', 0: '보통', '-1': '약함', '-2': '아주 약함' };

export function counterLevel(att, def) {
  if (!att || !def || !STRONG[att] || !STRONG[def]) return 0;
  const a = STRONG[att].indexOf(def);
  if (a >= 0) return a === 0 ? 2 : 1;
  const d = STRONG[def].indexOf(att);
  if (d >= 0) return d === 0 ? -2 : -1;
  return 0;
}
export const counterMult = (att, def) => COUNTER_MULT[counterLevel(att, def)];
// Melee types that stand and stop enemies (기마병 ride through instead).
export const holdsRoad = t => !!TROOPS[t]?.melee && !TROOPS[t].trait?.pass;
// Who beats t, the very strong one first.
export const weakTo = t => [...TROOP_KEYS.filter(k => STRONG[k][0] === t), ...TROOP_KEYS.filter(k => STRONG[k][1] === t)];

// Number of first-time stage clears needed before a troop type can be brought.
export const TROOP_UNLOCK = { infantry: 0, archer: 0, spear: 2, cavalry: 3, strategist: 5, catapult: 7 };

// For the ▲ marks: how well type t does against the strongest-countered of `foes`.
export const bestLevel = (t, foes) => foes.reduce((m, f) => Math.max(m, counterLevel(t, f)), 0);
// Counter lines for one type: [[other, level], ...], very strong / very weak first.
export const relations = t => ({
  good: STRONG[t].map((x, i) => [x, i === 0 ? 2 : 1]),
  bad: weakTo(t).map(x => [x, counterLevel(t, x)]),
});

// ---- Generals (hero towers) ---------------------------------------------------------
// Two are picked before a battle and stand on a flag spot like a squad: free to place,
// much stronger, with one special. They join as the lord's story goes on (unlock =
// first-time clears needed) and grow with the lord's level.

export const GENERAL_PICKS = 2;
export const GENERAL_RECOVER = 25; // seconds before a fallen general can be placed again
export const GENERAL_MOVE_WAIT = 3; // seconds after picking a general up to move it
export const GENERAL_HP = 2.0; // × the troop type's squad stats
export const GENERAL_ATK = 1.8;

export const GEN_SPECIALS = {
  cleave: { cd: 8, radius: 100, power: 3, text: '8초마다 주변 적을 한꺼번에 베어요 (공격력 3배)' },
  stun: { cd: 12, radius: 140, stun: 2, power: 1, text: '12초마다 주변 적을 2초 동안 얼어붙게 해요' },
  snipe: { cd: 7, rangeMult: 1.6, power: 5, text: '7초마다 아주 멀리 있는 가장 강한 적을 저격해요 (공격력 5배)' },
  fire: { cd: 12, radius: 95, dur: 5, power: 0.45, slow: 0.3, text: '12초마다 적이 몰린 곳에 불을 질러요 (5초 동안 불바다)' },
  slow: { cd: 10, slow: 0.45, dur: 4, power: 0.8, text: '10초마다 사거리 안 모든 적을 4초 동안 느리게 해요' },
  multishot: { targets: 3, text: '한 번에 적 3명까지 공격해요' },
  guard: { block: 5, dr: 0.35, text: '적을 5명까지 막고, 받는 피해가 35% 줄어요' },
  charge: { cd: 10, length: 240, width: 55, power: 3, text: '10초마다 길을 따라 돌격해 지나가는 적을 쳐요 (공격력 3배)' },
  rally: { radius: 190, atk: 0.25, text: '주변 부대의 공격력이 25% 올라요' },
  food: { cd: 6, amount: 10, text: '6초마다 군량을 10 보내 줘요' },
  barrage: { cd: 10, shots: 5, power: 1, text: '10초마다 돌 5개를 한꺼번에 날려요' },
};

export const GENERALS = {
  // 촉 (유비)
  guanyu: { name: '관우', faction: 'shu', type: 'infantry', unlock: 0, kind: 'cleave', skill: '청룡참', letter: '관', desc: '청룡언월도를 든 의리의 장수' },
  zhangfei: { name: '장비', faction: 'shu', type: 'spear', unlock: 0, kind: 'stun', skill: '장판교 호통', letter: '장', desc: '고함 한 번에 적이 얼어붙는 맹장' },
  zhaoyun: { name: '조운', faction: 'shu', type: 'cavalry', unlock: 8, kind: 'multishot', skill: '칠진칠출', letter: '조', desc: '적진을 일곱 번 드나든 상산의 조자룡' },
  zhugeliang: { name: '제갈량', faction: 'shu', type: 'strategist', unlock: 9, kind: 'slow', skill: '팔진도', letter: '제', desc: '와룡 선생, 촉의 군사' },
  pangtong: { name: '방통', faction: 'shu', type: 'strategist', unlock: 13, kind: 'fire', skill: '연환계', letter: '방', desc: '봉추 선생, 적벽에서 연환계를 낸 책사' },
  huangzhong: { name: '황충', faction: 'shu', type: 'archer', unlock: 14, kind: 'snipe', skill: '백보천양', letter: '황', desc: '백 걸음 밖 버들잎도 맞히는 노장' },
  weiyan: { name: '위연', faction: 'shu', type: 'spear', unlock: 14, kind: 'rally', skill: '선봉장의 기세', letter: '위', desc: '언제나 앞장서는 용맹한 선봉장' },
  machao: { name: '마초', faction: 'shu', type: 'cavalry', unlock: 16, kind: 'charge', skill: '서량 철기', letter: '마', desc: '서량의 비단 마초, 금마초' },
  // 위 (조조)
  xiahoudun: { name: '하후돈', faction: 'wei', type: 'infantry', unlock: 0, kind: 'cleave', skill: '외눈의 맹장', letter: '돈', desc: '조조의 가장 믿음직한 장수' },
  xiahouyuan: { name: '하후연', faction: 'wei', type: 'archer', unlock: 0, kind: 'multishot', skill: '질풍 속사', letter: '연', desc: '바람처럼 빠른 활솜씨의 장수' },
  xunyu: { name: '순욱', faction: 'wei', type: 'strategist', unlock: 3, kind: 'food', skill: '왕좌지재', letter: '순', desc: '나라 살림을 맡은 조조의 참모' },
  dianwei: { name: '전위', faction: 'wei', type: 'spear', unlock: 4, kind: 'guard', skill: '쌍철극 철벽', letter: '전', desc: '조조를 지키는 쌍철극의 호위 무사' },
  xuchu: { name: '허저', faction: 'wei', type: 'infantry', unlock: 5, kind: 'stun', skill: '호치의 괴력', letter: '허', desc: '호랑이처럼 힘센 호위 장수' },
  guojia: { name: '곽가', faction: 'wei', type: 'strategist', unlock: 6, kind: 'slow', skill: '귀재의 계책', letter: '곽', desc: '앞날을 내다보는 천재 책사' },
  zhangliao: { name: '장료', faction: 'wei', type: 'cavalry', unlock: 7, kind: 'charge', skill: '위진소요진', letter: '료', desc: '이름만 들어도 적이 떠는 명장' },
  liuye: { name: '유엽', faction: 'wei', type: 'catapult', unlock: 9, kind: 'barrage', skill: '벽력거', letter: '엽', desc: '관도에서 벽력거를 만든 발명가' },
  simayi: { name: '사마의', faction: 'wei', type: 'strategist', unlock: 14, kind: 'rally', skill: '천하의 지략', letter: '사', desc: '참을성 많은 위의 대도독' },
  // 오 (손권)
  sunce: { name: '손책', faction: 'wu', type: 'cavalry', unlock: 0, kind: 'cleave', skill: '소패왕', letter: '책', desc: '강동을 휩쓴 손권의 형' },
  huanggai: { name: '황개', faction: 'wu', type: 'infantry', unlock: 0, kind: 'guard', skill: '노장의 투지', letter: '개', desc: '손씨 집안을 3대째 지킨 노장' },
  zhouyu: { name: '주유', faction: 'wu', type: 'strategist', unlock: 4, kind: 'fire', skill: '적벽 화공', letter: '주', desc: '적벽을 불태운 오의 대도독' },
  taishici: { name: '태사자', faction: 'wu', type: 'archer', unlock: 5, kind: 'multishot', skill: '신궁', letter: '태', desc: '손책과 겨룬 뒤 친구가 된 명궁' },
  lusu: { name: '노숙', faction: 'wu', type: 'strategist', unlock: 7, kind: 'food', skill: '군량 지원', letter: '노', desc: '창고를 열어 군량을 보태는 마음 넓은 책사' },
  ganning: { name: '감녕', faction: 'wu', type: 'infantry', unlock: 8, kind: 'charge', skill: '백기겁영', letter: '감', desc: '방울 소리와 함께 나타나는 용장' },
  lumeng: { name: '여몽', faction: 'wu', type: 'spear', unlock: 10, kind: 'rally', skill: '괄목상대', letter: '몽', desc: '공부해서 몰라보게 달라진 장수' },
  luxun: { name: '육손', faction: 'wu', type: 'strategist', unlock: 13, kind: 'stun', skill: '화소연영', letter: '육', desc: '젊은 나이에 대도독이 된 지략가' },
};
export const generalsOf = faction => Object.keys(GENERALS).filter(k => GENERALS[k].faction === faction);

// In-battle promotion (★1 → ★3)
export const STAR_MULT = [1, 1.45, 2.0];
export const STAR_RANGE = [1, 1.07, 1.14];
export const STAR_COST = [0.7, 1.0]; // × deploy cost, for ★2 and ★3
export const RETREAT_REFUND = 0.5;

// Ground under a unit's build cells (js/field.js lays them out).
export const GROUND = {
  plain: { name: '평지', icon: '', text: '' },
  hill: { name: '언덕', icon: '⛰️', text: '원거리 부대 사거리 +20%, 공격 +10%', range: 0.2, atk: 0.1 },
  forest: { name: '숲', icon: '🌲', text: '매복: 적의 화살·돌·기습을 받지 않고, 첫 공격은 2배', ambush: 2 },
  choke: { name: '길목', icon: '🚧', text: '보병·창병이 적을 더 많이 막아요', block: 1 },
};

// Formations: squads in cells side by side (up, down, left, right) help each other.
export const FORMATIONS = {
  spearbow: { name: '창궁진', icon: '🛡️', text: '창병 옆 원거리 부대는 적 기마병 기습을 받지 않아요' },
  shield: { name: '방패진', icon: '🪵', text: '보병 옆 부대는 받는 피해 -10%', dr: 0.1 },
  command: { name: '지휘', icon: '📜', text: '책사 옆 부대는 공격 +10%', atk: 0.1 },
  line: { name: '일자진', icon: '➖', text: '같은 병종 3부대를 한 줄로 놓으면 체력 +15%', hp: 0.15 },
};

export const troopLevelMult = lv => 1 + 0.12 * (lv - 1);
export const troopUpCost = lv => Math.round(80 * 1.18 ** (lv - 1)); // gold for lv → lv+1

// ---- Factions -----------------------------------------------------------------

export const FACTIONS = {
  shu: { name: '촉', army: '유비군', color: '#2f9e44', dark: '#1d6b2c' },
  wei: { name: '위', army: '조조군', color: '#2f6fd6', dark: '#1d4793' },
  wu: { name: '오', army: '손권군', color: '#d6402f', dark: '#922a1f' },
  yellow: { name: '황건', army: '황건적', color: '#e2bd1c', dark: '#9b8010' },
  dong: { name: '동탁', army: '동탁군', color: '#7040a8', dark: '#4a2a70' },
  lubu: { name: '여포', army: '여포군', color: '#b02f6a', dark: '#701c43' },
  yuanshao: { name: '원소', army: '원소군', color: '#b8862b', dark: '#7a5818' },
  yuanshu: { name: '원술', army: '원술군', color: '#a0522d', dark: '#6b371e' },
  zhangxiu: { name: '장수', army: '장수군', color: '#62803a', dark: '#405526' },
  jing: { name: '형주', army: '형주군', color: '#23918e', dark: '#17605e' },
  yi: { name: '익주', army: '익주군', color: '#8a8f2a', dark: '#5c5f1b' },
  liang: { name: '서량', army: '서량군', color: '#d0782a', dark: '#8c4f1a' },
  wuhuan: { name: '오환', army: '오환족', color: '#80705e', dark: '#544a3e' },
  jiangdong: { name: '강동', army: '강동 호족', color: '#4f7090', dark: '#344a60' },
  zhanglu: { name: '장로', army: '장로군', color: '#8f5fb0', dark: '#5f3f75' },
  nanman: { name: '남만', army: '남만군', color: '#5f8f2a', dark: '#3f5f1b' },
};

// ---- Lords ------------------------------------------------------------------

export const LORDS = {
  liubei: {
    name: '유비', title: '인덕의 군주', faction: 'shu',
    trait: '인덕: 모든 부대 체력 +15%, 쉬는 동안 회복 2배',
    traitFx: { troopHp: 0.15, regen: 2 },
    style: '부대가 튼튼해서 버티기 좋아요',
    skills: ['lb_heal', 'lb_oath', 'lb_militia'],
  },
  caocao: {
    name: '조조', title: '난세의 간웅', faction: 'wei',
    trait: '간웅: 군량 +20%, 승급 비용 -20%',
    traitFx: { food: 0.2, starCost: 0.2 },
    style: '군량이 많아 부대를 빨리 늘리고 승급해요',
    skills: ['cc_roar', 'cc_supply', 'cc_tiger'],
  },
  sunquan: {
    name: '손권', title: '강동의 호랑이', faction: 'wu',
    trait: '강동: 원거리 부대 사거리 +12%, 공격 +10%',
    traitFx: { rangedRange: 0.12, rangedAtk: 0.1 },
    style: '궁수·책사·투석기가 강해요',
    skills: ['sq_volley', 'sq_fire', 'sq_guard'],
  },
};
export const LORD_KEYS = ['liubei', 'caocao', 'sunquan'];

export const expNeed = lv => Math.round(60 * 1.18 ** (lv - 1));
export const leadership = lv => 8 + 2 * lv;

// The lord stays inside the castle, so its skills are orders and rallying calls, not blows.
// They are big and slow: most last 30 seconds and come back after 3 minutes, about once or
// twice a battle. Skills unlock at lord levels 1, 3, 6; target 'self' acts at once, 'point'
// and 'path' ask for a spot. Damage from orders (cavalry, fire) grows with the lord's level.
export const SKILL_UNLOCK = [1, 3, 6];
export const SKILL_CD = 180;
export const cmdPower = lv => 30 * 1.08 ** (lv - 1);
const grow = (base, step) => lv => base + step * (lv - 1);
const lvPct = lv => pct(1 + 0.2 * (lv - 1)); // strength of damage orders against level 1
export const SKILLS = {
  lb_heal: {
    name: '인덕의 손길', icon: '💚', target: 'self', cd: SKILL_CD, dur: 30,
    power: grow(0.3, 0.06),
    desc: lv => `모든 부대와 장수의 체력을 ${pct(grow(0.3, 0.06)(lv))} 바로 회복하고, 30초 동안 계속 조금씩 회복해요`,
  },
  lb_oath: {
    name: '도원결의', icon: '🍑', target: 'self', cd: SKILL_CD, dur: 30, dr: 0.3,
    power: grow(0.5, 0.1),
    desc: lv => `쓰러진 장수를 바로 다시 놓을 수 있고, 30초 동안 장수 공격 +${pct(grow(0.5, 0.1)(lv))}, 받는 피해 -30%`,
  },
  lb_militia: {
    name: '의병 봉기', icon: '🙋', target: 'path', cd: SKILL_CD, dur: 30, count: 4,
    power: grow(1, 0.2),
    desc: lv => `고른 길에 의병 4명을 보내 30초 동안 적을 막아요 (보병의 ${pct(grow(1, 0.2)(lv))} 힘)`,
  },
  cc_roar: {
    name: '패왕의 호령', icon: '📯', target: 'self', cd: SKILL_CD, dur: 30,
    power: grow(0.3, 0.06),
    desc: lv => `사기를 북돋아 30초 동안 모든 부대와 장수 공격 +${pct(grow(0.3, 0.06)(lv))}`,
  },
  cc_supply: {
    name: '둔전 징발', icon: '🌾', target: 'self', cd: SKILL_CD,
    power: grow(0.6, 0.12),
    desc: lv => `창고를 열어 군량을 바로 받아요 (시작 군량의 ${pct(grow(0.6, 0.12)(lv))})`,
  },
  cc_tiger: {
    name: '호표기 출격', icon: '🐎', target: 'point', cd: SKILL_CD, radius: 150, stun: 3,
    power: lv => 10 * (1 + 0.2 * (lv - 1)),
    desc: lv => `성에서 정예 기병이 달려 나가 고른 곳의 적을 짓밟고 3초 동안 기절시켜요 (위력 ${lvPct(lv)})`,
  },
  sq_volley: {
    name: '궁노 일제 사격', icon: '🏹', target: 'self', cd: SKILL_CD, dur: 30,
    power: grow(0.4, 0.08),
    desc: lv => `30초 동안 궁수·책사·투석기와 원거리 장수가 ${pct(grow(0.4, 0.08)(lv))} 더 빨리 쏴요`,
  },
  sq_fire: {
    name: '화공', icon: '🔥', target: 'point', cd: SKILL_CD, radius: 140, dur: 10, slow: 0.35,
    power: lv => 0.8 * (1 + 0.2 * (lv - 1)),
    desc: lv => `병사들이 고른 곳에 불을 질러 10초 동안 불바다, 적이 느려져요 (위력 ${lvPct(lv)}, 동남풍이면 2배)`,
  },
  sq_guard: {
    name: '강동의 철벽', icon: '🛡️', target: 'self', cd: SKILL_CD, dur: 30, gate: 6,
    power: grow(0.3, 0.05),
    desc: lv => `30초 동안 모든 부대와 장수가 받는 피해 -${pct(grow(0.3, 0.05)(lv))}, 성문 +6`,
  },
};
// Talents and treasure can stretch how long a skill lasts.
export const skillDur = (def, mods) => (def.dur || 0) * (1 + (mods?.skillDur || 0));
export const AURA_R = 380; // 군주의 위엄 reaches squads placed this close to the gate

// ---- Equipment -------------------------------------------------------------------

export const GRADES = [
  { name: '일반', color: '#6f6a60', enh: 70 },
  { name: '희귀', color: '#1f7fd0', enh: 140 },
  { name: '영웅', color: '#9b3fd6', enh: 280 },
  { name: '전설', color: '#d88400', enh: 520 },
  { name: '신화', color: '#e0294a', enh: 900 },
];
export const SLOTS = { weapon: '무기', armor: '갑옷', treasure: '보물' };

// The lord no longer fights, so it hands its gear to the army: weapons sharpen every squad,
// armour toughens them, treasure helps orders, supplies and generals.
// fx keys: troopAtk%, troopHp%, troopDef% (damage taken), genPower%, atk_/hp_<type>%,
// skillDmg% (skill effect), skillCd%, skillDur%, food% (군량 income), startFood, starCost%, stratAtk%
export const EQUIPS = {
  w_iron: { slot: 'weapon', name: '철검', g: 0, icon: '🗡️', fx: { troopAtk: 0.03 }, price: 120 },
  w_saber: { slot: 'weapon', name: '환수도', g: 0, icon: '🔪', fx: { troopAtk: 0.045 }, price: 240 },
  w_twin: { slot: 'weapon', name: '쌍고검', g: 1, icon: '⚔️', fx: { troopAtk: 0.06, genPower: 0.05 } },
  w_guding: { slot: 'weapon', name: '고정도', g: 1, icon: '🗡️', fx: { troopAtk: 0.065, skillDmg: 0.08 } },
  w_yitian: { slot: 'weapon', name: '의천검', g: 2, icon: '⚔️', fx: { troopAtk: 0.09, skillDmg: 0.12 } },
  w_qinggang: { slot: 'weapon', name: '청강검', g: 2, icon: '🗡️', fx: { troopAtk: 0.1, genPower: 0.06 } },
  w_qinglong: { slot: 'weapon', name: '청룡언월도', g: 3, icon: '🐉', fx: { troopAtk: 0.12, genPower: 0.1 } },
  w_zhangba: { slot: 'weapon', name: '장팔사모', g: 3, icon: '🔱', fx: { troopAtk: 0.12, skillDmg: 0.12 } },
  w_fangtian: { slot: 'weapon', name: '방천화극', g: 3, icon: '🔱', fx: { troopAtk: 0.15 } },
  w_heaven: { slot: 'weapon', name: '천하무쌍검', g: 4, icon: '✨', fx: { troopAtk: 0.19, skillDmg: 0.15 } },

  a_leather: { slot: 'armor', name: '가죽 갑옷', g: 0, icon: '🦺', fx: { troopHp: 0.04 }, price: 100 },
  a_iron: { slot: 'armor', name: '철갑', g: 0, icon: '🛡️', fx: { troopHp: 0.05, troopDef: 0.02 }, price: 260 },
  a_scale: { slot: 'armor', name: '어린갑', g: 1, icon: '🛡️', fx: { troopHp: 0.08, troopDef: 0.03 }, price: 900, shopAfter: 6 },
  a_bright: { slot: 'armor', name: '명광개', g: 2, icon: '🛡️', fx: { troopHp: 0.11, troopDef: 0.04 } },
  a_silver: { slot: 'armor', name: '백은 갑옷', g: 3, icon: '🛡️', fx: { troopHp: 0.14, troopDef: 0.05 } },
  a_dragon: { slot: 'armor', name: '황금 용린갑', g: 4, icon: '🐲', fx: { troopHp: 0.18, troopDef: 0.07 } },

  t_bingfa: { slot: 'treasure', name: '병법서', g: 0, icon: '📘', fx: { skillCd: 0.08 }, price: 220 },
  t_hufu: { slot: 'treasure', name: '호부', g: 1, icon: '🐯', fx: { troopHp: 0.08 }, price: 900, shopAfter: 4 },
  t_seven: { slot: 'treasure', name: '칠성보도', g: 1, icon: '🌟', fx: { genPower: 0.12 } },
  t_taiping: { slot: 'treasure', name: '태평요술서', g: 1, icon: '📗', fx: { skillDmg: 0.2 } },
  t_dilu: { slot: 'treasure', name: '적로마', g: 2, icon: '🐴', fx: { atk_cavalry: 0.15, hp_cavalry: 0.15 } },
  t_sunzi: { slot: 'treasure', name: '손자병법', g: 2, icon: '📜', fx: { troopAtk: 0.1 } },
  t_mengde: { slot: 'treasure', name: '맹덕신서', g: 2, icon: '📕', fx: { starCost: 0.15, food: 0.05 } },
  t_seal: { slot: 'treasure', name: '전국옥새', g: 3, icon: '🀄', fx: { startFood: 80, food: 0.12 } },
  t_redhare: { slot: 'treasure', name: '적토마', g: 3, icon: '🐎', fx: { atk_cavalry: 0.2, hp_cavalry: 0.2, skillDur: 0.15 } },
  t_feather: { slot: 'treasure', name: '백우선', g: 4, icon: '🪶', fx: { skillCd: 0.2, stratAtk: 0.25 } },
};

const FX_TEXT = {
  troopAtk: v => `모든 부대 공격 +${pct(v)}`,
  troopHp: v => `모든 부대 체력 +${pct(v)}`,
  troopDef: v => `모든 부대 받는 피해 -${pct(v)}`,
  genPower: v => `장수 체력·공격 +${pct(v)}`,
  atk_cavalry: v => `기마병 공격 +${pct(v)}`,
  hp_cavalry: v => `기마병 체력 +${pct(v)}`,
  skillDmg: v => `스킬 효과 +${pct(v)}`,
  skillCd: v => `스킬 대기 -${pct(v)}`,
  skillDur: v => `스킬 지속 +${pct(v)}`,
  food: v => `군량 +${pct(v)}`,
  startFood: v => `시작 군량 +${Math.round(v)}`,
  starCost: v => `승급 비용 -${pct(v)}`,
  stratAtk: v => `책사 부대 공격 +${pct(v)}`,
};

// Enhancement: every + adds 10% of the item's numbers.
export const enhMult = up => 1 + 0.1 * up;
export function equipFx(key, up = 0) {
  const e = EQUIPS[key];
  const out = {};
  for (const [k, v] of Object.entries(e.fx)) out[k] = v * enhMult(up);
  return out;
}
export const fxText = fx => Object.entries(fx).map(([k, v]) => FX_TEXT[k](v)).join(', ');
export const enhanceCost = (key, up) => Math.round(GRADES[EQUIPS[key].g].enh * (1 + 0.35 * up)); // up → up+1
export const sellPrice = key => Math.round((EQUIPS[key].price || GRADES[EQUIPS[key].g].enh * 2) * 0.3);

// ---- Consumable items ----------------------------------------------------------------

export const ITEM_KEYS = ['potion', 'bomb', 'wall'];
export const ITEMS = {
  potion: {
    name: '회복 약초', icon: '🌿', price: 50, radius: 150, heal: 0.45,
    desc: '고른 곳 근처의 부대와 장수 체력을 45% 회복해요',
  },
  bomb: {
    name: '벽력탄', icon: '💣', price: 70, radius: 105, dmg: 190,
    desc: '고른 곳에서 크게 터져 적에게 큰 피해를 줘요',
  },
  wall: {
    name: '목책', icon: '🪵', price: 60, hp: 420, dur: 20,
    desc: '길 위에 나무 울타리를 세워 적을 막아요. 부서지거나 20초가 지나면 사라져요',
  },
};

// ---- Stage scaling & rewards ------------------------------------------------------

export const stageHpMult = n => 1.088 ** (n - 1); // n = 1..20
export const stageAtkMult = n => 1.07 ** (n - 1);
export const stageGold = n => Math.round(110 * 1.16 ** (n - 1));
export const stageExp = n => Math.round(60 * 1.18 ** (n - 1));
export const starGold = n => Math.round(stageGold(n) * 0.25);
export const startFood = n => 150 + 20 * (n - 1);
export const killFood = (type, n) => Math.round(FOES[type].reward * (1 + 0.04 * (n - 1)));
export const PASSIVE_FOOD = 1; // per second while a wave is running
export const recLevel = n => n;
export const REPLAY_RATE = 0.5;
export const NO_REWARD_GAP = 2; // lord level ≥ recommended + this → replays give nothing

// Difficulty is chosen with the lord for a new game. 지옥 appears once an ending has been seen on this device.
// shp / satk toughen the soldiers alone (not the enemy general): 쉬움 stays easy with a plan but
// is lost now and then by a player who puts units anywhere. crowd* bring more soldiers per wave
// (a defence game gets harder with numbers): crowdBase before stage crowdFrom, then rising to
// crowd at stage 20; or crowdBands, one multiplier for each five stages; or crowdPts,
// [[stage, multiplier], ...] joined by straight lines.
export const DIFFS = [
  { key: 'easy', name: '쉬움', icon: '🌱', hp: 1.33, atk: 1.2, shp: 1.85, satk: 1.55, gold: 0.85, desc: '적이 약해요. 처음 하는 사람에게 추천' },
  { key: 'normal', name: '보통', icon: '⚔️', hp: 2.63, atk: 1.79, gold: 1, desc: '상성을 생각하며 싸우면 이길 수 있어요' },
  { key: 'hard', name: '어려움', icon: '🔥', hp: 3.4, atk: 2.21, crowdPts: [[1, 1], [5, 1.2], [15, 1.2], [20, 1.42]], gold: 1.25, desc: '승급과 스킬, 아이템을 잘 써야 해요' },
  { key: 'hell', name: '지옥', icon: '💀', hp: 4.11, atk: 2.58, crowdBands: [2.8, 1.7, 1.6, 1.13], gold: 1.6, desc: '엔딩을 본 군주만 도전할 수 있는 진짜 시험' },
];
export const diffOf = save => DIFFS[save?.diff ?? 1] || DIFFS[1];
export function crowdMult(D, n) {
  if (D?.crowdPts) {
    const p = D.crowdPts;
    if (n <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) {
      if (n <= p[i][0]) return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (n - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
    }
    return p[p.length - 1][1];
  }
  if (D?.crowdBands) return D.crowdBands[Math.min(3, Math.floor((n - 1) / 5))];
  const base = D?.crowdBase || 1, top = D?.crowd || base, from = D?.crowdFrom || 1;
  return n < from ? base : base + (top - base) * (n - from + 1) / (21 - from);
}
// Harder difficulties bite less in the first stages (a new 지옥 game still starts at Lv 1).
export const diffScale = (m, n) => 1 + (m - 1) * (n === 1 ? 0.5 : n === 2 ? 0.65 : 0.8 + 0.2 * (n - 1) / 19);

export const BOSS = { hp: 14, atk: 2.4, speed: 0.85, gate: 5, skillCd: 8 };
export const BOSS_SKILLS = {
  charge: '돌격: 빠르게 달려와 길을 막은 부대를 들이받아요',
  summon: '지원군: 병사들을 더 불러요',
  heal: '요술: 주변 병사를 치료해요',
  rally: '호령: 주변 병사가 빠르고 강해져요',
  volley: '일제 사격: 우리 부대에 화살비를 내려요',
};

// 일기토: one of our generals that meets the enemy general fights it one on one, once per
// general and battle. A win wounds and stuns the enemy general and makes enemies near it run.
export const DUEL = { reach: 60, time: 2.4, bossDmg: 0.25, bossStun: 3, genDmg: 0.4, rout: 0.4, routR: 220 };
export const DUEL_KINDS = { cleave: 0.12, charge: 0.12, stun: 0.1, guard: 0.08, snipe: 0.02, multishot: 0, barrage: -0.05, fire: -0.1, slow: -0.1, rally: -0.05, food: -0.12 };
export const DUEL_DIFF = { easy: 0.1, normal: 0, hard: -0.05, hell: -0.1 };
export function duelChance(G, level, n, diffKey) {
  return Math.max(0.2, Math.min(0.85, 0.5 + 0.03 * (level - n) + (DUEL_KINDS[G.kind] || 0) + (DUEL_DIFF[diffKey] || 0)));
}

// Morale: when the enemy general is badly hurt some enemies near it run; when it falls, half
// of the enemies left run away.
export const ROUT = { waver: 0.3, waverR: 250, fall: 0.5 };

// Weather of a stage, from the story where it fits.
export const WEATHER = {
  clear: { name: '맑음', icon: '☀️', text: '특별한 효과가 없어요' },
  wind: { name: '동남풍', icon: '🌬️', text: '바람이 불길을 키워요: 불 공격 피해 2배 (책사·화공·불 특수 능력)', fire: 2 },
  rain: { name: '비', icon: '🌧️', text: '비가 불을 꺼요: 불 공격 피해 절반, 모두 10% 느려져요', fire: 0.5, speed: 0.9 },
  fog: { name: '안개', icon: '🌫️', text: '앞이 잘 안 보여요: 모든 원거리 사거리 -20%', range: 0.8 },
  night: { name: '밤', icon: '🌙', text: '어두워요: 모든 원거리 사거리 -20%', range: 0.8 },
  snow: { name: '눈보라', icon: '❄️', text: '눈 때문에 모두 15% 느려져요', speed: 0.85 },
};
const STAGE_WEATHER = {
  lb10: 'wind', lb11: 'wind', lb13: 'wind', lb19: 'wind', cc05: 'wind', cc13: 'wind', sq03: 'wind', sq09: 'wind', sq14: 'wind',
  lb08: 'rain', cc07: 'rain', cc18: 'rain', sq17: 'rain',
  cc04: 'fog', sq16: 'fog', cc06: 'night', sq02: 'night',
  cc11: 'snow', sq13: 'snow',
};
export const weatherKey = stage => STAGE_WEATHER[stage.id] || 'clear';

// A challenge for every stage; the first time it is met it pays extra gold.
export const CHALLENGES = {
  gate20: { icon: '🏯', text: () => '성문을 하나도 잃지 않고 이기기' },
  noItems: { icon: '🎒', text: () => '아이템을 쓰지 않고 이기기' },
  noType: { icon: '🚫', text: t => `${TROOPS[t].name} 없이 이기기` },
  duelWin: { icon: '⚔️', text: () => '일기토에서 이기기' },
  forms3: { icon: '🧩', text: () => '진형을 3가지 이상 만들고 이기기' },
  bossHalf: { icon: '🎯', text: () => '적장을 길 절반을 넘기 전에 쓰러뜨리기' },
  lostMax: { icon: '🛡️', text: () => '부대를 2개 이하로 잃고 이기기' },
  hillForest: { icon: '⛰️', text: () => '언덕과 숲에 모두 부대를 놓고 이기기' },
  early: { icon: '⏩', text: () => '"바로 출격"을 3번 이상 쓰고 이기기' },
};
const CHALLENGE_ORDER = [
  'lostMax', 'hillForest', 'forms3', 'duelWin', 'noItems', 'bossHalf', 'noType', 'gate20', 'early', 'forms3',
  'noItems', 'duelWin', 'hillForest', 'noType', 'bossHalf', 'duelWin', 'lostMax', 'gate20', 'noType', 'forms3',
];
export const challengeGold = n => Math.round(stageGold(n) * 0.5);

// The stage's challenge: { key, type?, text, icon }. "Without X" names the troop type that
// beats the stage's most common enemy best; maps without woods get the gate challenge instead.
export function stageChallenge(stage, n) {
  let key = CHALLENGE_ORDER[(n - 1) % CHALLENGE_ORDER.length];
  if (key === 'hillForest' && ['castle', 'desert'].includes(stage.terrain)) key = 'gate20';
  let type;
  if (key === 'noType') {
    const main = Object.entries(stage.mix || { infantry: 1 }).sort((a, b) => b[1] - a[1])[0][0];
    type = TROOP_KEYS.filter(t => TROOP_UNLOCK[t] <= n - 1).sort((a, b) => counterMult(b, main) - counterMult(a, main))[0];
  }
  return { key, type, icon: CHALLENGES[key].icon, text: CHALLENGES[key].text(type) };
}

// ---- small helpers ---------------------------------------------------------------

export function pct(v) { return `${Math.round(v * 100)}%`; }
export const fmt = n => Math.round(n).toLocaleString('ko-KR');
