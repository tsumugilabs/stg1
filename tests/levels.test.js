import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CYCLE_DIFFICULTY_STEP, cycleAt, difficultyAt, eraAt, ERAS,
} from '../src/game/levels.js';
import { slowestCraft, widestTurningCraft } from '../src/game/craft.js';

const RISING = [
  'enemySpeed', 'enemyTurn', 'bulletSpeed', 'quota', 'bossHp',
  'maxEnemies', 'bossSpeed', 'bossTurn', 'squadronChance', 'bossShots',
];
const EASING = ['fireInterval', 'spawnInterval', 'bossFire'];

test('every era defines the whole difficulty vector', () => {
  for (const era of ERAS) {
    for (const key of RISING) {
      assert.equal(typeof era[key], 'number', `${era.label} is missing ${key}`);
    }
    for (const key of EASING) {
      assert.ok(Array.isArray(era[key]) && era[key].length === 2, `${era.label}.${key} must be a range`);
      assert.ok(era[key][0] <= era[key][1], `${era.label}.${key} is inverted`);
    }
  }
});

test('the curve only ever gets harder across the eras', () => {
  for (let i = 1; i < ERAS.length; i += 1) {
    const previous = ERAS[i - 1];
    const era = ERAS[i];
    for (const key of RISING) {
      assert.ok(era[key] >= previous[key],
        `${era.label}.${key} (${era[key]}) is below ${previous.label} (${previous[key]})`);
    }
    // Shorter waits between shots and spawns means more pressure, not less.
    for (const key of EASING) {
      assert.ok(era[key][0] <= previous[key][0] && era[key][1] <= previous[key][1],
        `${era.label}.${key} is slower than ${previous.label}`);
    }
  }
});

test('flagship escorts start absent and then arrive faster', () => {
  assert.equal(ERAS[0].bossEscorts, null, 'the first flagship must fight alone');
  const withEscorts = ERAS.slice(1);
  for (const era of withEscorts) {
    assert.ok(Array.isArray(era.bossEscorts), `${era.label} should call escorts`);
  }
  for (let i = 1; i < withEscorts.length; i += 1) {
    assert.ok(withEscorts[i].bossEscorts[0] <= withEscorts[i - 1].bossEscorts[0],
      `${withEscorts[i].label} escorts should not arrive slower`);
  }
});

test('no escort out-runs or out-turns any craft on the first lap', () => {
  // The bar is the worst craft on each axis: every airframe must stay flyable.
  const slowest = slowestCraft();
  const widest = widestTurningCraft();
  for (const era of ERAS) {
    assert.ok(era.enemySpeed < slowest.speed,
      `${era.label} escorts (${era.enemySpeed}) out-run the ${slowest.name} (${slowest.speed})`);
    assert.ok(era.enemyTurn < widest.turnRate,
      `${era.label} escorts out-turn the ${widest.name}`);
  }
});

test('the opening era is an introduction, not a fight', () => {
  const first = ERAS[0];
  const slowest = slowestCraft();
  const widest = widestTurningCraft();
  assert.ok(first.maxEnemies <= 2, 'more than two escorts at once is not an introduction');
  assert.ok(first.enemySpeed < slowest.speed * 0.5, 'every craft must comfortably outrun the first escorts');
  assert.ok(first.enemyTurn < widest.turnRate * 0.4, 'every craft must comfortably out-turn them');
  assert.ok(first.fireInterval[0] >= 3, 'the first escorts should rarely shoot');
  assert.equal(first.squadronChance, 0, 'the first era should never spawn a pair at once');
  assert.equal(first.bossShots, 1, 'the first flagship should not fire a spread');
});

test('eraAt wraps and cycleAt counts completed laps', () => {
  assert.equal(eraAt(0), ERAS[0]);
  assert.equal(eraAt(ERAS.length), ERAS[0]);
  assert.equal(eraAt(ERAS.length + 2), ERAS[2]);
  assert.equal(cycleAt(0), 0);
  assert.equal(cycleAt(ERAS.length - 1), 0);
  assert.equal(cycleAt(ERAS.length), 1);
});

test('each lap raises the multiplier', () => {
  assert.equal(difficultyAt(0), 1);
  assert.equal(difficultyAt(ERAS.length - 1), 1);
  assert.ok(Math.abs(difficultyAt(ERAS.length) - (1 + CYCLE_DIFFICULTY_STEP)) < 1e-9);
  assert.ok(difficultyAt(ERAS.length * 2) > difficultyAt(ERAS.length));
});

test('a second lap of 1910 is harder than the first lap of 1940', () => {
  // Coming back round should not feel like a step backwards.
  const lapTwoOpening = ERAS[0].enemySpeed * difficultyAt(ERAS.length);
  assert.ok(lapTwoOpening >= ERAS[1].enemySpeed * 0.95,
    `lap-2 1910 (${lapTwoOpening.toFixed(0)}) should be near or above 1940 (${ERAS[1].enemySpeed})`);
});
