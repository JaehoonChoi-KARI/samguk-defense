// Game rules and numbers: troop types and counters, lords and skills, equipment,
// consumable items and growth formulas. Balance knobs live here.

export const VERSION = '1.0.5'; // keep in sync with CACHE in sw.js
export const STAGE_COUNT = 20;
export const GATE_HP = 20;
export const MAX_LORD_LEVEL = 30;
export const MAX_TROOP_LEVEL = 20;
export const MAX_SKILL_LEVEL = 5;
export const MAX_ENHANCE = 10;
export const ITEM_CARRY_MAX = 3;

// ---- Troops (both armies use the same six types) ------------------------------

export const TROOP_KEYS = ['infantry', 'spear', 'cavalry', 'archer', 'strategist', 'catapult'];

// Player squads. cost = 군량 to deploy, lead = 통솔력 it takes in the roster.
export const TROOPS = {
  infantry: {
    name: '보병', short: '보병', melee: true, cost: 60, lead: 2,
    hp: 400, atk: 15, cd: 1.0, range: 85, block: 3, speed: 75, reach: 34,
    desc: '칼과 방패. 길을 막고 오래 버텨요.',
  },
  spear: {
    name: '창병', short: '창병', melee: true, cost: 60, lead: 2,
    hp: 320, atk: 19, cd: 1.0, range: 90, block: 2, speed: 75, reach: 40,
    desc: '긴 창으로 길을 막아요. 기마병을 잘 막아요.',
  },
  cavalry: {
    name: '기마병', short: '기마', melee: true, cost: 90, lead: 3,
    hp: 360, atk: 28, cd: 1.1, range: 140, block: 2, speed: 130, reach: 38,
    desc: '멀리까지 달려 나가 강하게 들이받아요.',
  },
  archer: {
    name: '궁수', short: '궁수', melee: false, cost: 70, lead: 2,
    hp: 160, atk: 13, cd: 0.8, range: 200,
    desc: '멀리 있는 적을 빠르게 쏴요.',
  },
  strategist: {
    name: '책사', short: '책사', melee: false, cost: 100, lead: 3,
    hp: 150, atk: 21, cd: 2.2, range: 180, splash: 52, burn: 0.5, slow: 0.3,
    desc: '책략으로 불을 질러요. 맞은 적은 불타고 느려져요.',
  },
  catapult: {
    name: '투석기', short: '투석', melee: false, cost: 120, lead: 4,
    hp: 210, atk: 42, cd: 3.2, range: 290, splash: 66,
    desc: '아주 멀리 큰 돌을 던져 여럿을 한꺼번에 때려요.',
  },
};

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

// Free placement: how far apart units must stand, how far ranged units keep off the road.
export const PLACE_GAP = 40;
export const ROAD_CLEAR = 34;

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
    name: '유비', title: '인덕의 군주', faction: 'shu', ranged: false,
    trait: '인덕: 모든 부대 체력 +15%, 쉬는 동안 회복 2배',
    traitFx: { troopHp: 0.15, regen: 2 },
    style: '부대가 튼튼해서 버티기 좋아요',
    skills: ['lb_whirl', 'lb_heal', 'lb_militia'],
  },
  caocao: {
    name: '조조', title: '난세의 간웅', faction: 'wei', ranged: false,
    trait: '간웅: 군량 +20%, 승급 비용 -20%',
    traitFx: { food: 0.2, starCost: 0.2 },
    style: '군량이 많아 부대를 빨리 늘리고 승급해요',
    skills: ['cc_dash', 'cc_roar', 'cc_cavalry'],
  },
  sunquan: {
    name: '손권', title: '강동의 호랑이', faction: 'wu', ranged: true,
    trait: '강동: 원거리 부대 사거리 +12%, 공격 +10%. 손권도 활을 쏴요',
    traitFx: { rangedRange: 0.12, rangedAtk: 0.1 },
    style: '궁수·책사·투석기가 강해요',
    skills: ['sq_rain', 'sq_fire', 'sq_guard'],
  },
};
export const LORD_KEYS = ['liubei', 'caocao', 'sunquan'];

export const lordBase = (lv, ranged) => ({
  hp: Math.round(520 + 58 * (lv - 1)),
  atk: Math.round((26 + 3.4 * (lv - 1)) * (ranged ? 0.72 : 1)),
  cd: ranged ? 1.0 : 0.9,
  range: ranged ? 190 : 56,
  speed: 125,
  block: 2,
});
export const expNeed = lv => Math.round(60 * 1.18 ** (lv - 1));
export const leadership = lv => 8 + 2 * lv;

// Skills unlock at lord levels 1, 3, 6. target: 'self' casts at once, 'point' asks for a spot.
export const SKILL_UNLOCK = [1, 3, 6];
export const SKILLS = {
  lb_whirl: {
    name: '쌍고검 난무', icon: '⚔️', target: 'self', cd: 18, radius: 120,
    power: lv => 3 + 0.6 * (lv - 1),
    desc: lv => `유비 주변의 적을 베어요 (공격력의 ${pct(3 + 0.6 * (lv - 1))})`,
  },
  lb_heal: {
    name: '인덕의 손길', icon: '💚', target: 'self', cd: 36, radius: 320,
    power: lv => 0.3 + 0.06 * (lv - 1),
    desc: lv => `가까운 부대와 유비의 체력을 ${pct(0.3 + 0.06 * (lv - 1))} 회복해요`,
  },
  lb_militia: {
    name: '의병 봉기', icon: '🙋', target: 'path', cd: 52, count: 3, dur: 15,
    power: lv => 0.7 + 0.15 * (lv - 1),
    desc: lv => `길 위에 의병 3명을 불러 ${15}초 동안 적을 막아요 (힘 ${pct(0.7 + 0.15 * (lv - 1))})`,
  },
  cc_dash: {
    name: '의천검 일섬', icon: '🗡️', target: 'point', cd: 18, width: 55, maxDist: 360,
    power: lv => 3 + 0.6 * (lv - 1),
    desc: lv => `고른 곳까지 돌진하며 지나가는 적을 베어요 (공격력의 ${pct(3 + 0.6 * (lv - 1))})`,
  },
  cc_roar: {
    name: '패왕의 호령', icon: '📯', target: 'self', cd: 39, dur: 10,
    power: lv => 0.3 + 0.06 * (lv - 1),
    desc: lv => `10초 동안 모든 부대 공격력 +${pct(0.3 + 0.06 * (lv - 1))}`,
  },
  cc_cavalry: {
    name: '호표기 돌격', icon: '🐎', target: 'point', cd: 52, radius: 130, stun: 1.5,
    power: lv => 5 + 1 * (lv - 1),
    desc: lv => `고른 곳에 정예 기병이 돌격해요 (공격력의 ${pct(5 + (lv - 1))}, 잠깐 기절)`,
  },
  sq_rain: {
    name: '연환궁', icon: '🏹', target: 'point', cd: 18, radius: 110, hits: 6, dur: 2.4,
    power: lv => 0.7 + 0.14 * (lv - 1),
    desc: lv => `고른 곳에 화살비 6번 (한 번에 공격력의 ${pct(0.7 + 0.14 * (lv - 1))})`,
  },
  sq_fire: {
    name: '화공', icon: '🔥', target: 'point', cd: 39, radius: 110, dur: 6, slow: 0.35,
    power: lv => 0.45 + 0.09 * (lv - 1),
    desc: lv => `6초 동안 불바다 (0.5초마다 공격력의 ${pct(0.45 + 0.09 * (lv - 1))}), 적이 느려져요`,
  },
  sq_guard: {
    name: '강동의 철벽', icon: '🛡️', target: 'self', cd: 52, dur: 10,
    power: lv => 0.35 + 0.05 * (lv - 1),
    desc: lv => `10초 동안 모든 부대와 손권이 받는 피해 -${pct(0.35 + 0.05 * (lv - 1))}, 성문 +1`,
  },
};

// ---- Equipment -------------------------------------------------------------------

export const GRADES = [
  { name: '일반', color: '#6f6a60', enh: 70 },
  { name: '희귀', color: '#1f7fd0', enh: 140 },
  { name: '영웅', color: '#9b3fd6', enh: 280 },
  { name: '전설', color: '#d88400', enh: 520 },
  { name: '신화', color: '#e0294a', enh: 900 },
];
export const SLOTS = { weapon: '무기', armor: '갑옷', treasure: '보물' };

// fx keys: atk, hp, def (damage reduction), lordAtk%, lordSpeed%, lordHp%, skillDmg%, skillCd%,
// troopAtk%, troopHp%, food% (군량 income), startFood, starCost%, attackSpeed%, stratAtk%
export const EQUIPS = {
  w_iron: { slot: 'weapon', name: '철검', g: 0, icon: '🗡️', fx: { atk: 5 }, price: 120 },
  w_saber: { slot: 'weapon', name: '환수도', g: 0, icon: '🔪', fx: { atk: 7 }, price: 240 },
  w_twin: { slot: 'weapon', name: '쌍고검', g: 1, icon: '⚔️', fx: { atk: 11, attackSpeed: 0.1 } },
  w_guding: { slot: 'weapon', name: '고정도', g: 1, icon: '🗡️', fx: { atk: 12, skillDmg: 0.1 } },
  w_yitian: { slot: 'weapon', name: '의천검', g: 2, icon: '⚔️', fx: { atk: 17, skillDmg: 0.15 } },
  w_qinggang: { slot: 'weapon', name: '청강검', g: 2, icon: '🗡️', fx: { atk: 19, attackSpeed: 0.08 } },
  w_qinglong: { slot: 'weapon', name: '청룡언월도', g: 3, icon: '🐉', fx: { atk: 26, skillDmg: 0.1 } },
  w_zhangba: { slot: 'weapon', name: '장팔사모', g: 3, icon: '🔱', fx: { atk: 25, attackSpeed: 0.15 } },
  w_fangtian: { slot: 'weapon', name: '방천화극', g: 3, icon: '🔱', fx: { atk: 30 } },
  w_heaven: { slot: 'weapon', name: '천하무쌍검', g: 4, icon: '✨', fx: { atk: 38, skillDmg: 0.2 } },

  a_leather: { slot: 'armor', name: '가죽 갑옷', g: 0, icon: '🦺', fx: { hp: 60 }, price: 100 },
  a_iron: { slot: 'armor', name: '철갑', g: 0, icon: '🛡️', fx: { hp: 100, def: 0.03 }, price: 260 },
  a_scale: { slot: 'armor', name: '어린갑', g: 1, icon: '🛡️', fx: { hp: 160, def: 0.05 }, price: 900, shopAfter: 6 },
  a_bright: { slot: 'armor', name: '명광개', g: 2, icon: '🛡️', fx: { hp: 240, def: 0.08 } },
  a_silver: { slot: 'armor', name: '백은 갑옷', g: 3, icon: '🛡️', fx: { hp: 340, def: 0.11 } },
  a_dragon: { slot: 'armor', name: '황금 용린갑', g: 4, icon: '🐲', fx: { hp: 460, def: 0.15 } },

  t_bingfa: { slot: 'treasure', name: '병법서', g: 0, icon: '📘', fx: { skillCd: 0.08 }, price: 220 },
  t_hufu: { slot: 'treasure', name: '호부', g: 1, icon: '🐯', fx: { troopHp: 0.08 }, price: 900, shopAfter: 4 },
  t_seven: { slot: 'treasure', name: '칠성보도', g: 1, icon: '🌟', fx: { lordAtk: 0.15 } },
  t_taiping: { slot: 'treasure', name: '태평요술서', g: 1, icon: '📗', fx: { skillDmg: 0.2 } },
  t_dilu: { slot: 'treasure', name: '적로마', g: 2, icon: '🐴', fx: { lordSpeed: 0.35, lordHp: 0.1 } },
  t_sunzi: { slot: 'treasure', name: '손자병법', g: 2, icon: '📜', fx: { troopAtk: 0.1 } },
  t_mengde: { slot: 'treasure', name: '맹덕신서', g: 2, icon: '📕', fx: { starCost: 0.15, food: 0.05 } },
  t_seal: { slot: 'treasure', name: '전국옥새', g: 3, icon: '🀄', fx: { startFood: 80, food: 0.12 } },
  t_redhare: { slot: 'treasure', name: '적토마', g: 3, icon: '🐎', fx: { lordSpeed: 0.5, lordAtk: 0.15 } },
  t_feather: { slot: 'treasure', name: '백우선', g: 4, icon: '🪶', fx: { skillCd: 0.2, stratAtk: 0.25 } },
};

const FX_TEXT = {
  atk: v => `군주 공격 +${Math.round(v)}`,
  hp: v => `군주 체력 +${Math.round(v)}`,
  def: v => `받는 피해 -${pct(v)}`,
  lordAtk: v => `군주 공격 +${pct(v)}`,
  lordSpeed: v => `군주 이동 +${pct(v)}`,
  lordHp: v => `군주 체력 +${pct(v)}`,
  skillDmg: v => `스킬 피해 +${pct(v)}`,
  skillCd: v => `스킬 대기 -${pct(v)}`,
  troopAtk: v => `모든 부대 공격 +${pct(v)}`,
  troopHp: v => `모든 부대 체력 +${pct(v)}`,
  food: v => `군량 +${pct(v)}`,
  startFood: v => `시작 군량 +${Math.round(v)}`,
  starCost: v => `승급 비용 -${pct(v)}`,
  attackSpeed: v => `군주 공격 속도 +${pct(v)}`,
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
    desc: '고른 곳 근처의 부대와 군주 체력을 45% 회복해요',
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
export const DIFFS = [
  { key: 'easy', name: '쉬움', icon: '🌱', hp: 1.45, atk: 1.3, gold: 0.85, desc: '적이 약해요. 처음 하는 사람에게 추천' },
  { key: 'normal', name: '보통', icon: '⚔️', hp: 2.94, atk: 2.13, gold: 1, desc: '상성을 생각하며 싸우면 이길 수 있어요' },
  { key: 'hard', name: '어려움', icon: '🔥', hp: 3.75, atk: 2.6, late: 0.85, gold: 1.25, desc: '승급과 스킬, 아이템을 잘 써야 해요' },
  { key: 'hell', name: '지옥', icon: '💀', hp: 4.56, atk: 3.07, gold: 1.6, desc: '엔딩을 본 군주만 도전할 수 있는 진짜 시험' },
];
export const diffOf = save => DIFFS[save?.diff ?? 1] || DIFFS[1];
// Harder difficulties bite less in the first stages (a new 지옥 game still starts at Lv 1).
export const diffScale = (m, n) => 1 + (m - 1) * (n === 1 ? 0.5 : n === 2 ? 0.65 : 0.8 + 0.2 * (n - 1) / 19);
// Some difficulties ease off in the last stages: enemy hp and attack × late from stage 16 (half at 15).
export const lateEase = (D, n) => D.late ? 1 - (1 - D.late) * Math.min(1, Math.max(0, (n - 14) / 2)) : 1;

export const BOSS = { hp: 14, atk: 2.4, speed: 0.85, gate: 5, skillCd: 8 };
export const BOSS_SKILLS = {
  charge: '돌격: 빠르게 달려와 길을 막은 부대를 들이받아요',
  summon: '지원군: 병사들을 더 불러요',
  heal: '요술: 주변 병사를 치료해요',
  rally: '호령: 주변 병사가 빠르고 강해져요',
  volley: '일제 사격: 우리 부대에 화살비를 내려요',
};

// ---- small helpers ---------------------------------------------------------------

export function pct(v) { return `${Math.round(v * 100)}%`; }
export const fmt = n => Math.round(n).toLocaleString('ko-KR');
