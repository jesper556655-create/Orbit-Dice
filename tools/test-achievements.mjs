import assert from 'node:assert/strict';
import {
  ACHIEVEMENTS, createAchievementState, restoreAchievementState,
  recordAchievementRoll, recordMenuOpen, getAchievementProgress
} from '../dist/achievements-state.mjs';

let passed = 0;
function test(name, run) {
  run();
  passed += 1;
}
function rolls(state, values) {
  return values.flatMap(value => recordAchievementRoll(state, value));
}
const earned = (state, id) => Boolean(state.unlocked[id]);
const progress = (state, id) => getAchievementProgress(state, id).current;
const roundTrip = state => restoreAchievementState(JSON.stringify(state));

test('fresh state has exactly ten distinct locked achievements', () => {
  const state = createAchievementState();
  assert.equal(ACHIEVEMENTS.length, 10);
  assert.equal(new Set(ACHIEVEMENTS.map(item => item.id)).size, 10);
  for (const item of ACHIEVEMENTS) {
    assert.equal(progress(state, item.id), 0);
    assert.ok(item.title && item.description && item.icon && item.target);
  }
});

test('total milestones unlock exactly on their thresholds and only once', () => {
  const state = createAchievementState();
  rolls(state, Array.from({ length: 9 }, (_, index) => index % 6 + 1));
  assert.equal(earned(state, 'space-cadet'), false);
  assert.equal(progress(state, 'space-cadet'), 9);
  assert.ok(recordAchievementRoll(state, 4).includes('space-cadet'));
  assert.equal(recordAchievementRoll(state, 5).includes('space-cadet'), false);
  rolls(state, Array.from({ length: 88 }, (_, index) => index % 6 + 1));
  assert.equal(state.totalRolls, 99);
  assert.equal(earned(state, 'galactic-gambler'), false);
  assert.ok(recordAchievementRoll(state, 2).includes('galactic-gambler'));
  assert.equal(progress(state, 'galactic-gambler'), 100);
  assert.equal(recordAchievementRoll(state, 3).includes('galactic-gambler'), false);
});

test('Lucky Streak requires adjacent sixes and survives a refresh between them', () => {
  let state = createAchievementState();
  rolls(state, [6, 2, 6]);
  assert.equal(earned(state, 'lucky-streak'), false);
  state = roundTrip(state);
  assert.ok(recordAchievementRoll(state, 6).includes('lucky-streak'));
  const timestamp = state.unlocked['lucky-streak'];
  recordAchievementRoll(state, 1);
  state = roundTrip(state);
  assert.equal(state.unlocked['lucky-streak'], timestamp);
  assert.equal(progress(state, 'lucky-streak'), 2);
});

test('Low Life requires adjacent ones', () => {
  const state = createAchievementState();
  rolls(state, [1, 2, 1]);
  assert.equal(earned(state, 'low-life'), false);
  assert.ok(recordAchievementRoll(state, 1).includes('low-life'));
});

test('lifetime balance does not falsely unlock House Rules', () => {
  const state = createAchievementState();
  rolls(state, [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  assert.ok(earned(state, 'perfect-balance'));
  assert.equal(earned(state, 'house-rules'), false);
  assert.equal(progress(state, 'perfect-balance'), 6);
  assert.equal(progress(state, 'house-rules'), 2);
});

test('Chaos Theory allows nonadjacent repeats but resets on an adjacent repeat', () => {
  const state = createAchievementState();
  rolls(state, [1, 2, 1, 2, 1, 2, 1, 2, 1]);
  assert.equal(earned(state, 'chaos-theory'), false);
  recordAchievementRoll(state, 1);
  assert.equal(state.nonRepeatStreak, 1);
  assert.equal(progress(state, 'chaos-theory'), 9);
  rolls(state, [2, 1, 2, 1, 2, 1, 2, 1]);
  assert.equal(earned(state, 'chaos-theory'), false);
  assert.ok(recordAchievementRoll(state, 2).includes('chaos-theory'));
  assert.equal(state.nonRepeatStreak, 10);
  recordAchievementRoll(state, 2);
  assert.equal(progress(state, 'chaos-theory'), 10);
});

test('odd streak breaks on even results and unlocks only at six', () => {
  const state = createAchievementState();
  rolls(state, [1, 3, 2, 5, 1, 3, 5, 1]);
  assert.equal(state.oddStreak, 5);
  assert.equal(earned(state, 'odd-job'), false);
  assert.ok(recordAchievementRoll(state, 3).includes('odd-job'));
  recordAchievementRoll(state, 4);
  assert.equal(state.oddStreak, 0);
  assert.equal(progress(state, 'odd-job'), 6);
});

test('Triple Threat tracks any face, not only ones and sixes', () => {
  const state = createAchievementState();
  rolls(state, [4, 4, 5, 4, 4]);
  assert.equal(earned(state, 'triple-threat'), false);
  assert.ok(recordAchievementRoll(state, 4).includes('triple-threat'));
  assert.equal(state.sameStreak, 3);
});

test('House Rules accepts the requested example', () => {
  const state = createAchievementState();
  const unlocked = rolls(state, [4, 1, 6, 2, 3, 5]);
  assert.ok(unlocked.includes('house-rules'));
  assert.deepEqual(state.uniqueSuffix, [4, 1, 6, 2, 3, 5]);
});

test('House Rules keeps the valid suffix after an overlapping repeat', () => {
  let state = createAchievementState();
  rolls(state, [1, 2, 3, 2, 4, 5]);
  assert.deepEqual(state.uniqueSuffix, [3, 2, 4, 5]);
  state = roundTrip(state);
  recordAchievementRoll(state, 6);
  assert.equal(earned(state, 'house-rules'), false);
  assert.ok(recordAchievementRoll(state, 1).includes('house-rules'));
});

test('menu open unlocks Rocket Scientist immediately and never repeats it', () => {
  let state = createAchievementState();
  assert.deepEqual(recordMenuOpen(state), ['rocket-scientist']);
  const timestamp = state.unlocked['rocket-scientist'];
  assert.ok(Number.isSafeInteger(timestamp) && timestamp > 0);
  assert.deepEqual(recordMenuOpen(state), []);
  state = roundTrip(state);
  assert.deepEqual(recordMenuOpen(state), []);
  assert.equal(state.unlocked['rocket-scientist'], timestamp);
});

test('all current streaks resume correctly after serialization', () => {
  let state = createAchievementState();
  rolls(state, [1, 3, 5, 1, 3]);
  state = roundTrip(state);
  assert.equal(state.oddStreak, 5);
  assert.equal(state.nonRepeatStreak, 5);
  assert.ok(recordAchievementRoll(state, 5).includes('odd-job'));
  recordAchievementRoll(state, 5);
  state = roundTrip(state);
  assert.equal(state.sameStreak, 2);
  assert.ok(recordAchievementRoll(state, 5).includes('triple-threat'));
});

test('seeded counts credit aggregates without inventing streaks', () => {
  const state = createAchievementState([2, 2, 2, 2, 1, 1]);
  assert.equal(state.totalRolls, 10);
  assert.equal(state.seenMask, 63);
  assert.equal(state.last, null);
  assert.equal(state.sameStreak, 0);
  assert.equal(state.bestUniqueStreak, 0);
  assert.equal(Object.keys(state.unlocked).length, 0);
  const restored = roundTrip(state);
  assert.equal(restored.last, null);
  assert.deepEqual(recordMenuOpen(restored), ['space-cadet', 'perfect-balance', 'rocket-scientist']);
  for (const id of ['chaos-theory', 'lucky-streak', 'low-life', 'odd-job', 'triple-threat', 'house-rules']) {
    assert.equal(earned(restored, id), false);
  }
  recordAchievementRoll(restored, 1);
  assert.equal(restored.totalRolls, 11);
  assert.equal(restored.sameStreak, 1);
});

test('restore derives aggregates from counts and clones saved references', () => {
  const raw = createAchievementState([1, 2, 3, 4, 5, 6]);
  raw.totalRolls = 10000;
  raw.seenMask = 0;
  const state = restoreAchievementState(raw);
  assert.equal(state.totalRolls, 21);
  assert.equal(state.seenMask, 63);
  state.counts[0] += 1;
  assert.equal(raw.counts[0], 1);
});

test('corrupted storage is safe and cannot manufacture streaks', () => {
  for (const raw of [null, false, [], 'not json', '{}', { counts: [1] }, { counts: [-1, 0, 0, 0, 0, 0] }]) {
    const state = restoreAchievementState(raw);
    assert.equal(state.totalRolls, 0);
    assert.doesNotThrow(() => recordAchievementRoll(state, 3));
  }
  const raw = { counts: [1, 1, 1, 1, 1, 1], last: 3, sameStreak: 999999, bestSameStreak: 999999,
    oddStreak: -3, bestOddStreak: Infinity, nonRepeatStreak: NaN, bestNonRepeatStreak: 999999,
    uniqueSuffix: [1, 2, 1, 8], bestUniqueStreak: 99, unlocked: { unknown: 123, 'odd-job': 'yesterday' } };
  const state = restoreAchievementState(raw);
  assert.deepEqual(state.uniqueSuffix, [3]);
  assert.equal(state.sameStreak, 1);
  assert.equal(progress(state, 'triple-threat'), 1);
  assert.equal(progress(state, 'chaos-theory'), 1);
  assert.deepEqual(state.unlocked, {});
});

test('valid earned badges survive damaged counters and show complete progress', () => {
  const timestamp = 1700000000000;
  const state = restoreAchievementState({ counts: ['bad'], unlocked: { 'space-cadet': timestamp } });
  assert.equal(state.totalRolls, 0);
  assert.equal(state.unlocked['space-cadet'], timestamp);
  assert.deepEqual(getAchievementProgress(state, 'space-cadet'), { current: 10, target: 10 });
  assert.equal(recordAchievementRoll(state, 1).includes('space-cadet'), false);
});

test('invalid die values never change state', () => {
  const state = createAchievementState();
  for (const value of [0, 7, 1.5, '6', NaN, null]) assert.throws(() => recordAchievementRoll(state, value), RangeError);
  assert.equal(state.totalRolls, 0);
  assert.throws(() => getAchievementProgress(state, 'unknown'), RangeError);
});

test('all ten achievements can be earned and remain earned after refresh', () => {
  let state = createAchievementState();
  recordMenuOpen(state);
  rolls(state, [6, 6, 1, 1, 1, 3, 5, 1, 3, 5, 4, 1, 6, 2, 3, 5]);
  rolls(state, Array.from({ length: 100 - state.totalRolls }, (_, index) => index % 6 + 1));
  assert.equal(Object.keys(state.unlocked).length, 10);
  state = roundTrip(state);
  assert.equal(Object.keys(state.unlocked).length, 10);
  assert.equal(state.totalRolls, 100);
  assert.deepEqual(recordMenuOpen(state), []);
  assert.deepEqual(recordAchievementRoll(state, 2), []);
});

export const testResults = { passed, summary: `${passed} achievement state tests passed.` };
console.log(testResults.summary);
