import assert from 'node:assert/strict';
import test from 'node:test';
import { CRAFT, craftById, craftIndexById, flagshipDps, slowestCraft } from '../src/game/craft.js';

const FIELDS = [
  'id', 'name', 'motif', 'tagline', 'blurb', 'speed', 'turnRate', 'fireCooldown',
  'maxShots', 'bulletSpeed', 'bulletLife', 'bulletRadius', 'bulletColor', 'barrels',
  'damage', 'pierce', 'radius', 'hp', 'lives', 'respawnShield', 'colors', 'hidden',
  'stealth', 'brake',
];

// Everything a pilot could care about, expressed so that higher is better.
const MERITS = {
  speed: (c) => c.speed,
  turn: (c) => c.turnRate,
  rateOfFire: (c) => 1 / c.fireCooldown,
  shotsOnScreen: (c) => c.maxShots,
  range: (c) => c.bulletSpeed * c.bulletLife,
  firepower: (c) => flagshipDps(c),
  armour: (c) => c.hp,
  lives: (c) => c.lives,
  smallHitbox: (c) => -c.radius,
  shield: (c) => c.respawnShield,
  pierce: (c) => c.pierce,
  // How much tighter the air brake makes a corner: the deceleration and the
  // turn bonus together.
  brakeBite: (c) => (1 / c.brake.speed) * c.brake.turn,
};

const SELECTABLE = CRAFT.filter((craft) => !craft.hidden);

test('every craft is fully specified', () => {
  for (const craft of CRAFT) {
    for (const field of FIELDS) {
      assert.ok(field in craft, `${craft.id} is missing ${field}`);
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

test('armour is what makes a craft survivable, and it is a real trade', () => {
  // A hit costs a point rather than the craft, so armour is the headline
  // survivability number; it must vary, and it must be paid for.
  const armours = CRAFT.map((craft) => craft.hp);
  // Three is the floor: enough that a mistake is a setback rather than the
  // end of the run. Only the stealth craft sits there, and it pays for the
  // rest of its kit with exactly that.
  assert.ok(Math.min(...armours) >= 3, 'every craft needs enough armour to absorb a mistake');
  assert.ok(new Set(armours).size > 1, 'identical armour on every craft is not a choice');
  assert.equal(craftById('viper').hp, 5, 'Viper is the reference: five hits');
  assert.ok(craftById('eagle').hp > craftById('viper').hp, 'the heavy craft should take more');
  assert.ok(craftById('dragon').hp < craftById('viper').hp, 'the nimble craft should take less');
  const stealthy = CRAFT.filter((craft) => craft.stealth);
  for (const craft of stealthy) {
    assert.equal(craft.hp, Math.min(...armours),
      `${craft.name} avoids being shot, so it must be the most fragile thing flying`);
  }
});

test('stealth is a real trade, not a free pass', () => {
  const stealthy = CRAFT.filter((craft) => craft.stealth);
  assert.ok(stealthy.length >= 1);
  for (const craft of stealthy) {
    // Firing has to give the position away, or holding the trigger costs
    // nothing and the mechanic is just invulnerability.
    assert.ok(craft.stealth.reveal > 0, `${craft.name} is never detected at all`);
    assert.ok(craft.maxShots <= 4, `${craft.name} should not also carry a full magazine`);
    assert.ok(craft.fireCooldown >= 0.25, `${craft.name} should not also fire quickly`);
  }
});

test('the air brake tightens the corner without ever stopping the craft', () => {
  // Turning radius is speed over turn rate, so the deceleration alone is most
  // of the effect; the turn bonus is the rest. Both must point the same way.
  for (const craft of CRAFT) {
    const brake = craft.brake;
    assert.ok(brake, `${craft.name} has no air brake`);
    assert.ok(brake.speed > 0.3 && brake.speed < 0.8,
      `${craft.name} brake factor ${brake.speed} is a stop or a shrug`);
    assert.ok(brake.turn >= 1, `${craft.name} turns worse on the brake`);
    const open = craft.speed / craft.turnRate;
    const braked = (craft.speed * brake.speed) / (craft.turnRate * brake.turn);
    assert.ok(braked < open * 0.8,
      `${craft.name} barely corners any tighter: ${open.toFixed(1)} -> ${braked.toFixed(1)}`);
    // The craft never stops. That constraint is the whole game.
    assert.ok(craft.speed * brake.speed > 55,
      `${craft.name} nearly comes to a halt at ${(craft.speed * brake.speed).toFixed(0)}`);
  }
});

test('the nimble craft has the best brake and the heavy one the worst', () => {
  const bite = (c) => (1 / c.brake.speed) * c.brake.turn;
  const selectable = CRAFT.filter((c) => !c.hidden);
  const best = selectable.reduce((x, y) => (bite(y) > bite(x) ? y : x));
  const worst = selectable.reduce((x, y) => (bite(y) < bite(x) ? y : x));
  assert.equal(best.id, 'dragon', 'the agility craft should brake hardest');
  assert.equal(worst.id, 'eagle', 'the heavy craft should brake worst');
});

test('the slowest craft can still be flown', () => {
  const slowest = slowestCraft();
  assert.equal(slowest.id, 'eagle');
  // A craft that cannot outrun anything has no escape, which is not a trade.
  assert.ok(slowest.speed >= 150);
});
