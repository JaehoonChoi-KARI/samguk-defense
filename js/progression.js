// After a battle: gold, experience, level-ups, new skills, first-clear equipment,
// stars and newly unlocked troop types are written into the save.

import {
  stageGold, stageExp, starGold, expNeed, recLevel, REPLAY_RATE, NO_REWARD_GAP, LOW_REWARD, MAX_LORD_LEVEL,
  SKILL_UNLOCK, EQUIPS, sellPrice, TROOP_KEYS, TROOP_UNLOCK, ITEM_KEYS, STAGE_COUNT, diffOf,
  GENERALS, GENERAL_PICKS, LORDS, generalsOf, challengeGold,
} from './data.js';

// Replays pay REPLAY_RATE of a first clear; a lord NO_REWARD_GAP or more levels above the stage
// gets LOW_REWARD of that (old stages are no gold mine, but they always give something).
export const lowReward = (save, idx) => save.stages[idx].clears > 0 && save.level >= recLevel(idx + 1) + NO_REWARD_GAP;
export const rewardRate = (save, idx) => (save.stages[idx].clears > 0 ? REPLAY_RATE * (lowReward(save, idx) ? LOW_REWARD : 1) : 1);
// Gold for winning the stage now, before stars and the challenge.
export const clearGold = (save, idx) => Math.round(stageGold(idx + 1) * rewardRate(save, idx) * diffOf(save).gold);

export function addExp(save, exp) {
  const out = { levels: 0, newSkills: [] };
  save.exp += exp;
  while (save.level < MAX_LORD_LEVEL && save.exp >= expNeed(save.level)) {
    save.exp -= expNeed(save.level);
    save.level++; // one more talent point comes with every level
    out.levels++;
    SKILL_UNLOCK.forEach((lv, i) => { if (save.level === lv) out.newSkills.push(i); });
  }
  if (save.level >= MAX_LORD_LEVEL) save.exp = 0;
  return out;
}

export function giveEquip(save, key) {
  if (!key || !EQUIPS[key]) return { item: null, gold: 0 };
  if (save.equips.some(e => e.key === key)) {
    const gold = sellPrice(key); // already owned: the caller pays this out instead
    return { item: key, dup: true, gold };
  }
  save.equips.push({ key, up: 0 });
  save.newEquips.push(key);
  return { item: key, dup: false, gold: 0 };
}

// Items thrown in a battle are used up, whatever happens afterwards.
export function consumeItems(save, used = {}) {
  for (const k of ITEM_KEYS) {
    save.items[k] = Math.max(0, (save.items[k] || 0) - (used[k] || 0));
    save.carry[k] = Math.min(save.carry[k] || 0, save.items[k]);
  }
}

export function applyResult(save, story, r) {
  const idx = r.stageIdx;
  const n = idx + 1;
  const st = save.stages[idx];
  const stage = story.stages[idx];
  const out = { won: r.won, stars: r.stars, first: false, gold: 0, exp: 0, sleep: false, newStars: 0, item: null, levels: 0, newSkills: [], unlocked: [], newGenerals: [], ending: false };

  consumeItems(save, r.itemsUsed);
  save.kills += r.kills || 0;

  if (!r.won) {
    // a little experience for trying
    out.exp = Math.round(stageExp(n) * 0.2 * Math.min(1, (r.wavesReached || 1) / (r.totalWaves || 1)) * (lowReward(save, idx) ? LOW_REWARD : 1));
    Object.assign(out, addExp(save, out.exp));
    return out;
  }

  const first = st.clears === 0;
  out.first = first;
  if (first) {
    out.gold = Math.round(stageGold(n) * diffOf(save).gold);
    out.exp = stageExp(n);
    const g = giveEquip(save, stage.reward);
    out.item = g.item;
    out.itemDup = g.dup;
    out.gold += g.gold;
  } else {
    out.sleep = lowReward(save, idx);
    out.gold = clearGold(save, idx);
    out.exp = Math.round(stageExp(n) * rewardRate(save, idx));
  }
  if (r.challenge?.done && !st.ch) {
    st.ch = 1;
    out.challenge = Math.round(challengeGold(n) * diffOf(save).gold);
    out.gold += out.challenge;
  }
  if (r.stars > st.stars) {
    out.newStars = r.stars - st.stars;
    out.starGold = Math.round(starGold(n) * out.newStars * diffOf(save).gold);
    out.gold += out.starGold;
    st.stars = r.stars;
  }
  st.clears++;
  save.gold += out.gold;
  const lv = addExp(save, out.exp);
  out.levels = lv.levels;
  out.newSkills = lv.newSkills;

  if (first && idx === save.progress) {
    const before = save.progress;
    save.progress = Math.min(STAGE_COUNT, save.progress + 1);
    out.unlocked = TROOP_KEYS.filter(t => TROOP_UNLOCK[t] > before && TROOP_UNLOCK[t] <= save.progress);
    out.newGenerals = generalsOf(LORDS[save.lord].faction).filter(k => GENERALS[k].unlock > before && GENERALS[k].unlock <= save.progress);
    for (const k of out.newGenerals) if (save.picks.length < GENERAL_PICKS && !save.picks.includes(k)) save.picks.push(k);
    if (save.progress >= STAGE_COUNT && !save.seen.ending) out.ending = true;
  }
  return out;
}
