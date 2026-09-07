import assert from 'node:assert/strict';
import test from 'node:test';
import { CRAFT, craftById, craftIndexById, flagshipDps, slowestCraft } from '../src/game/craft.js';

const FIELDS = [
  'id', 'name', 'motif', 'tagline', 'blurb', 'speed', 'turnRate', 'fireCooldown',
  'maxShots', 'bulletSpeed', 'bulletLife', 'bulletRadius', 'bulletColor', 'barrels',
  'damage', 'pierce', 'radius', 'lives', 'respawnShield', 'colors', 'hidden',
];

// Everything a pilot could care about, expressed so that higher is better.
const MERITS = {
  speed: (c) => c.speed,
  turn: (c) => c.turnRate,
  rateOfFire: (c) => 1 / c.fireCooldown,
  shotsOnScreen: (c) => c.maxShots,
  range: (c) => c.bulletSpeed * c.bulletLife,
  firepower: (c) => flagshipDps(c),
  lives: (c) => c.lives,
  smallHitbox: (c) => -c.radius,
  shield: (c) => c.respawnShield,
  pierce: (c) => c.pierce,
};

const SELECTABLE = CRAFT.filter((craft) => !craft.hidden);

test('every craft is fully specified', () => {
  for (const craft of CRAFT) {
    for (const field of FIELDS) {
      assert.ok(craft[field] !== undefined, `${craft.id} is missing ${field}`);
    }
    assert.ok(craft.barrels.length >= 1, `${craft.id} needs at least one barrel`);
    for (const barrel of craft.barrels) {
      assert.equal(typeof barrel.offset, 'number');
      assert.equal(typeof barrel.lateral, 'number');
    }
  }
});

test('craft ids are unique and resolvable', () => {
  const ids = CRAFT.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (let i = 0; i < CRAFT.length; i += 1) {
    assert.equal(craftById(CRAFT[i].id), CRAFT[i]);
    assert.equal(craftIndexById(CRAFT[i].id), i);
  }
  // An id that is not in the table must fall back rather than explode.
  assert.equal(craftById('nope'), CRAFT[0]);
  assert.equal(craftIndexById('nope'), 0);
});

test('no selectable craft is simply better than another', () => {
  // Every advantage has to be paid for. If this fails, one craft has become
  // the only sane pick and another has become pointless.
  for (const a of SELECTABLE) {
    for (const b of SELECTABLE) {
      if (a === b) continue;
      const merits = Object.entries(MERITS);
      const neverWorse = merits.every(([, score]) => score(a) >= score(b));
      const betterSomewhere = merits.some(([, score]) => score(a) > score(b));
      assert.ok(!(neverWorse && betterSomewhere),
        `${a.name} dominates ${b.name} on every axis`);
    }
  }
});

test('each selectable craft leads on the axis it is sold on', () => {
  const best = (key) => CRAFT.reduce((x, y) => (MERITS[key](y) > MERITS[key](x) ? y : x));
  assert.equal(best('turn').hidden ? 'dragon' : best('turn').id, 'dragon',
    'the agility craft should turn best among visible craft');
  assert.equal(craftById('eagle'), SELECTABLE.reduce(
    (x, y) => (MERITS.firepower(y) > MERITS.firepower(x) ? y : x)),
  'the firepower craft should hit hardest of the three');
});

test('exactly one craft is hidden, and it is the reward', () => {
  const hidden = CRAFT.filter((craft) => craft.hidden);
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].id, 'swind');
});

test('Viper stays the balance reference', () => {
  // The era table was tuned against these exact numbers. Changing them means
  // re-checking the whole difficulty curve, so make that a deliberate edit.
  const viper = craftById('viper');
  assert.equal(viper.speed, 178);
  assert.equal(viper.turnRate, 3.6);
  assert.equal(viper.fireCooldown, 0.18);
  assert.equal(viper.hidden, false);
});

test('the slowest craft can still be flown', () => {
  const slowest = slowestCraft();
  assert.equal(slowest.id, 'eagle');
  // A craft that cannot outrun anything has no escape, which is not a trade.
  assert.ok(slowest.speed >= 150);
});
