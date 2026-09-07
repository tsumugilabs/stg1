import assert from 'node:assert/strict';
import test from 'node:test';
import { CRAFT, craftById } from '../src/game/craft.js';
import {
  AFFIXES, fanBarrels, makePart, MODULES, MODULE_IDS, partScore,
  RARITIES, rarityIndex, resolveCraft, rollModule, SLOTS, WEAPONS,
} from '../src/game/gear.js';

const NUMERIC = [
  'speed', 'turnRate', 'fireCooldown', 'maxShots', 'bulletSpeed', 'bulletLife',
  'damage', 'pierce', 'radius', 'hp', 'lives', 'respawnShield', 'killBlast',
  'podCount', 'missile', 'flare', 'laser', 'swarm',
];

test('an unequipped craft is exactly the airframe, so ARCADE cannot drift', () => {
  // This is the guarantee that the tuned mode is untouched by any of this.
  for (const base of CRAFT) {
    const resolved = resolveCraft(base, [], []);
    for (const key of NUMERIC) {
      assert.equal(resolved[key], base[key], `${base.id}.${key} changed with nothing fitted`);
    }
    assert.equal(resolved.barrels.length, base.barrels.length);
  }
});

test('resolving never mutates the craft table', () => {
  const base = craftById('viper');
  const before = JSON.stringify(base);
  const part = makePart({ slot: 'gun', rarity: RARITIES[3] });
  resolveCraft(base, [part], ['rapid', 'spread', 'plate']);
  assert.equal(JSON.stringify(base), before, 'the airframe was written through');
});

test('generated parts stay inside their declared ranges', () => {
  for (let i = 0; i < 600; i += 1) {
    const part = makePart({ depth: i % 15 });
    const rarity = RARITIES[rarityIndex(part.rarity)];
    const slot = SLOTS.find((s) => s.id === part.slot);
    assert.ok(part.affixes.length >= 1);
    assert.ok(part.affixes.length <= rarity.affixes, `${part.rarity} rolled too many affixes`);
    const seen = new Set();
    for (const { key, value } of part.affixes) {
      const affix = AFFIXES[key];
      assert.ok(affix, `unknown affix ${key}`);
      assert.ok(slot.pool.includes(key), `${key} does not belong on a ${part.slot}`);
      assert.ok(affix.minRarity <= rarityIndex(part.rarity),
        `${key} appeared on a ${part.rarity} part`);
      assert.ok(value >= affix.range[0] - 1e-9 && value <= affix.range[1] + 1e-9,
        `${key}=${value} is outside ${affix.range}`);
      assert.ok(!seen.has(key), `${key} rolled twice on one part`);
      seen.add(key);
    }
  }
});

test('no pile of equipment can push a craft past its caps', () => {
  // Every slot filled with the best possible part, and every module maxed.
  const modules = [];
  for (const id of MODULE_IDS) {
    for (let i = 0; i < MODULES[id].max; i += 1) modules.push(id);
  }
  // Everything at once, including the exclusives: caps must hold regardless
  // of how the pile was assembled.
  for (const base of CRAFT) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const parts = SLOTS.map((slot) => makePart({ slot: slot.id, rarity: RARITIES[3] }));
      const c = resolveCraft(base, parts, modules);
      assert.ok(c.speed <= 260 && c.speed >= 110, `speed ${c.speed}`);
      assert.ok(c.turnRate <= 7, `turn ${c.turnRate}`);
      assert.ok(c.fireCooldown >= 0.07, `cooldown ${c.fireCooldown}`);
      assert.ok(c.radius >= 4, `radius ${c.radius}`);
      assert.ok(c.hp <= 14, `hp ${c.hp}`);
      assert.ok(c.barrels.length <= 5, `barrels ${c.barrels.length}`);
      assert.ok(c.damage <= 5 && c.pierce <= 4, 'damage or pierce ran away');
      assert.ok(c.podCount <= 6, `bits ran away: ${c.podCount}`);
      assert.ok(c.missile <= 3 && c.flare <= 3 && c.laser <= 3 && c.swarm <= 2,
        'a weapon level ran past its cap');
      assert.ok(c.bulletLife <= 2.2 && c.bulletLife >= 0.3, `life ${c.bulletLife}`);
    }
  }
});

test('equipment only ever helps, never hinders', () => {
  // A part the player has to think twice about is a different design; as it
  // stands, fitting something should never be a downgrade.
  const base = craftById('viper');
  const bare = resolveCraft(base, [], []);
  for (let i = 0; i < 200; i += 1) {
    const part = makePart({ depth: 10 });
    const fitted = resolveCraft(base, [part], []);
    assert.ok(fitted.speed >= bare.speed);
    assert.ok(fitted.turnRate >= bare.turnRate);
    assert.ok(fitted.fireCooldown <= bare.fireCooldown);
    assert.ok(fitted.radius <= bare.radius);
    assert.ok(fitted.hp >= bare.hp);
  }
});

test('barrels fan symmetrically and stay bounded', () => {
  assert.equal(fanBarrels(1).length, 1);
  assert.equal(fanBarrels(1)[0].offset, 0);
  assert.equal(fanBarrels(9).length, 5, 'the fan is capped');
  for (const count of [2, 3, 4, 5]) {
    const barrels = fanBarrels(count);
    assert.equal(barrels.length, count);
    const sum = barrels.reduce((total, b) => total + b.offset, 0);
    assert.ok(Math.abs(sum) < 1e-9, `a ${count}-barrel fan is lopsided`);
  }
});

test('modules stop dropping once they are all maxed out', () => {
  const held = [];
  for (const id of MODULE_IDS) {
    for (let i = 0; i < MODULES[id].max; i += 1) held.push(id);
  }
  assert.equal(rollModule(held, 'swind'), null);
  // With one slot free, that is the only thing that can come up.
  const nearly = held.filter((id, i) => !(id === 'pod' && held.indexOf('pod') === i));
  assert.equal(rollModule(nearly, 'swind'), 'pod');
});

test('craft-locked modules only drop for the craft they belong to', () => {
  const locked = MODULE_IDS.filter((id) => MODULES[id].only);
  assert.ok(locked.length >= 1, 'nothing is exclusive any more');
  for (const id of locked) {
    assert.equal(MODULES[id].only, 'swind', `${id} is locked to an unexpected craft`);
  }
  // A thousand rolls on an ordinary craft must never turn one up.
  for (let i = 0; i < 1000; i += 1) {
    const rolled = rollModule([], 'viper');
    assert.ok(!locked.includes(rolled), `${rolled} dropped for a Viper`);
  }
  // And they must be reachable for the craft that owns them.
  const seen = new Set();
  for (let i = 0; i < 4000; i += 1) seen.add(rollModule([], 'swind'));
  for (const id of locked) assert.ok(seen.has(id), `${id} never drops even for S.Wind`);
});

test('every weapon level is a sane, monotonic step up', () => {
  for (const [name, spec] of Object.entries(WEAPONS)) {
    let previous = null;
    for (let level = 1; level <= 3; level += 1) {
      const now = spec(level);
      assert.ok(now.interval > 0.15, `${name} Lv${level} fires absurdly fast`);
      if (previous) {
        assert.ok(now.interval < previous.interval,
          `${name} Lv${level} is no faster than Lv${level - 1}`);
      }
      previous = now;
    }
  }
});

test('the range ladder is a ladder, not a nudge', () => {
  const base = CRAFT[0];
  const one = resolveCraft(base, [], ['reach']);
  const three = resolveCraft(base, [], ['reach', 'reach', 'reach']);
  const rangeOf = (c) => c.bulletSpeed * c.bulletLife;
  assert.ok(MODULES.reach.max >= 5, 'the ladder needs rungs to climb');
  assert.ok(rangeOf(one) > rangeOf(base) * 1.2, 'one rung should be felt');
  assert.ok(rangeOf(three) > rangeOf(one) * 1.4, 'stacking should keep paying');
});

test('every module declares a limit and a description', () => {
  for (const id of MODULE_IDS) {
    const module = MODULES[id];
    assert.ok(module.max >= 1, `${id} has no limit`);
    assert.ok(module.name && module.blurb && module.color, `${id} is not presentable`);
  }
});

test('part score ranks rarity above rolls', () => {
  const common = makePart({ slot: 'engine', rarity: RARITIES[0] });
  const legendary = makePart({ slot: 'engine', rarity: RARITIES[3] });
  assert.ok(partScore(legendary) > partScore(common));
});
