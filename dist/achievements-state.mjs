/** Pure, JSON-serializable achievement state. Event functions mutate the state. */
export const ACHIEVEMENTS = Object.freeze([
  { id: 'space-cadet', title: 'Space Cadet', description: 'Roll the die 10 times.', target: 10, icon: 'orbit' },
  { id: 'galactic-gambler', title: 'Galactic Gambler', description: 'Roll the die 100 times.', target: 100, icon: 'galaxy' },
  { id: 'lucky-streak', title: 'Lucky Streak', description: 'Roll two 6s in a row.', target: 2, icon: 'spark' },
  { id: 'perfect-balance', title: 'Perfect Balance', description: 'Roll every number from 1 to 6.', target: 6, icon: 'planet' },
  { id: 'chaos-theory', title: 'Chaos Theory', description: 'Roll 10 times without repeating the previous number.', target: 10, icon: 'comet' },
  { id: 'rocket-scientist', title: 'Rocket Scientist', description: 'Open the achievements menu.', target: 1, icon: 'rocket' },
  { id: 'low-life', title: 'Low Life', description: 'Roll two 1s in a row.', target: 2, icon: 'moon' },
  { id: 'odd-job', title: 'Odd Job', description: 'Roll only odd numbers for six consecutive rolls.', target: 6, icon: 'satellite' },
  { id: 'triple-threat', title: 'Triple Threat', description: 'Roll any number three times in a row.', target: 3, icon: 'constellation' },
  { id: 'house-rules', title: 'House Rules', description: 'Roll all six numbers in six consecutive rolls, without repeats.', target: 6, icon: 'station' }
].map(achievement => Object.freeze(achievement)));

const DEFINITIONS = new Map(ACHIEVEMENTS.map(achievement => [achievement.id, achievement]));
const isFace = value => Number.isInteger(value) && value >= 1 && value <= 6;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validCount = value => Number.isSafeInteger(value) && value >= 0;
const boundedCount = (value, maximum, fallback = 0) => validCount(value) && value <= maximum ? value : fallback;
const countBits = mask => mask.toString(2).replaceAll('0', '').length;

function readCounts(value) {
  if (!Array.isArray(value) || value.length !== 6 || !value.every(validCount)) return null;
  if (!Number.isSafeInteger(value.reduce((sum, count) => sum + count, 0))) return null;
  return value.slice();
}

/**
 * Seed only aggregates from older session stats, when no persistent state exists.
 * No last result or streak history is invented. Aggregate achievements are
 * evaluated on the next roll or menu open, just like every other unlock.
 */
export function createAchievementState(priorCounts) {
  const counts = readCounts(priorCounts) ?? [0, 0, 0, 0, 0, 0];
  return {
    version: 1,
    counts,
    totalRolls: counts.reduce((sum, count) => sum + count, 0),
    seenMask: counts.reduce((mask, count, index) => count ? mask | (1 << index) : mask, 0),
    last: null,
    sameStreak: 0,
    bestSameStreak: 0,
    sixStreak: 0,
    bestSixStreak: 0,
    oneStreak: 0,
    bestOneStreak: 0,
    oddStreak: 0,
    bestOddStreak: 0,
    nonRepeatStreak: 0,
    bestNonRepeatStreak: 0,
    uniqueSuffix: [],
    bestUniqueStreak: 0,
    menuOpened: false,
    unlocked: {}
  };
}

/** Restore without mutating the saved object; malformed fields fail conservatively. */
export function restoreAchievementState(raw) {
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (_) { return createAchievementState(); }
  }
  if (!isRecord(raw)) return createAchievementState();
  const state = createAchievementState(raw.counts);
  // Preserve earned badges even if an unrelated counter was damaged.
  if (isRecord(raw.unlocked)) {
    for (const { id } of ACHIEVEMENTS) {
      const timestamp = raw.unlocked[id];
      if (Number.isSafeInteger(timestamp) && timestamp > 0) state.unlocked[id] = timestamp;
    }
  }
  state.menuOpened = raw.menuOpened === true || Boolean(state.unlocked['rocket-scientist']);
  const total = state.totalRolls;
  const last = isFace(raw.last) && state.counts[raw.last - 1] > 0 ? raw.last : null;
  state.last = last;
  if (last !== null) {
    const maximumSame = state.counts[last - 1];
    state.sameStreak = Math.max(1, boundedCount(raw.sameStreak, maximumSame, 1));
    state.sixStreak = last === 6 ? state.sameStreak : 0;
    state.oneStreak = last === 1 ? state.sameStreak : 0;
    const oddCount = state.counts[0] + state.counts[2] + state.counts[4];
    state.oddStreak = last % 2 ? Math.max(state.sameStreak, boundedCount(raw.oddStreak, oddCount, 1)) : 0;
    state.nonRepeatStreak = state.sameStreak > 1 ? 1 : Math.max(1, boundedCount(raw.nonRepeatStreak, total, 1));
    const suffix = raw.uniqueSuffix;
    if (Array.isArray(suffix) && suffix.length >= 1 && suffix.length <= 6 &&
        suffix.every(value => isFace(value) && state.counts[value - 1] > 0) &&
        new Set(suffix).size === suffix.length && suffix.at(-1) === last &&
        suffix.length <= state.nonRepeatStreak) {
      state.uniqueSuffix = suffix.slice();
    } else {
      state.uniqueSuffix = [last];
    }
  }
  state.bestSameStreak = Math.max(state.sameStreak, boundedCount(raw.bestSameStreak, Math.max(...state.counts)));
  state.bestSixStreak = Math.max(state.sixStreak, boundedCount(raw.bestSixStreak, state.counts[5]));
  state.bestOneStreak = Math.max(state.oneStreak, boundedCount(raw.bestOneStreak, state.counts[0]));
  state.bestOddStreak = Math.max(state.oddStreak, boundedCount(raw.bestOddStreak, state.counts[0] + state.counts[2] + state.counts[4]));
  state.bestNonRepeatStreak = Math.max(state.nonRepeatStreak, boundedCount(raw.bestNonRepeatStreak, total));
  state.bestUniqueStreak = Math.max(state.uniqueSuffix.length, boundedCount(raw.bestUniqueStreak, countBits(state.seenMask)));
  return state;
}

/** Best progress is retained after a streak breaks; earned badges always stay complete. */
export function getAchievementProgress(state, id) {
  const definition = DEFINITIONS.get(id);
  if (!definition) throw new RangeError(`Unknown achievement: ${id}`);
  const target = definition.target;
  if (state.unlocked[id]) return { current: target, target };
  let current;
  switch (id) {
    case 'space-cadet':
    case 'galactic-gambler': current = state.totalRolls; break;
    case 'lucky-streak': current = state.bestSixStreak; break;
    case 'perfect-balance': current = countBits(state.seenMask); break;
    case 'chaos-theory': current = state.bestNonRepeatStreak; break;
    case 'rocket-scientist': current = state.menuOpened ? 1 : 0; break;
    case 'low-life': current = state.bestOneStreak; break;
    case 'odd-job': current = state.bestOddStreak; break;
    case 'triple-threat': current = state.bestSameStreak; break;
    case 'house-rules': current = state.bestUniqueStreak; break;
  }
  return { current: Math.min(target, Math.max(0, current)), target };
}

function unlockEligible(state) {
  const unlocked = [];
  const timestamp = Date.now();
  for (const { id, target } of ACHIEVEMENTS) {
    if (!state.unlocked[id] && getAchievementProgress(state, id).current >= target) {
      state.unlocked[id] = timestamp;
      unlocked.push(id);
    }
  }
  return unlocked;
}

/** Record one completed roll, returning only achievements newly earned by this event. */
export function recordAchievementRoll(state, value) {
  if (!isFace(value)) throw new RangeError('A die result must be an integer from 1 to 6.');
  if (!Number.isSafeInteger(state.totalRolls + 1) || !Number.isSafeInteger(state.counts[value - 1] + 1)) {
    throw new RangeError('The saved roll count is too large.');
  }
  const previous = state.last;
  state.totalRolls += 1;
  state.counts[value - 1] += 1;
  state.seenMask |= 1 << (value - 1);
  state.sameStreak = value === previous ? state.sameStreak + 1 : 1;
  state.sixStreak = value === 6 ? state.sixStreak + 1 : 0;
  state.oneStreak = value === 1 ? state.oneStreak + 1 : 0;
  state.oddStreak = value % 2 ? state.oddStreak + 1 : 0;
  state.nonRepeatStreak = value === previous ? 1 : state.nonRepeatStreak + 1;
  const repeatedIndex = state.uniqueSuffix.indexOf(value);
  if (repeatedIndex !== -1) state.uniqueSuffix = state.uniqueSuffix.slice(repeatedIndex + 1);
  state.uniqueSuffix.push(value);
  state.bestSameStreak = Math.max(state.bestSameStreak, state.sameStreak);
  state.bestSixStreak = Math.max(state.bestSixStreak, state.sixStreak);
  state.bestOneStreak = Math.max(state.bestOneStreak, state.oneStreak);
  state.bestOddStreak = Math.max(state.bestOddStreak, state.oddStreak);
  state.bestNonRepeatStreak = Math.max(state.bestNonRepeatStreak, state.nonRepeatStreak);
  state.bestUniqueStreak = Math.max(state.bestUniqueStreak, state.uniqueSuffix.length);
  state.last = value;
  return unlockEligible(state);
}

/** Opening the menu is a real event: Rocket Scientist unlocks immediately. */
export function recordMenuOpen(state) {
  state.menuOpened = true;
  return unlockEligible(state);
}
