import { clamp, pick, randInt, randRange } from '../core/math.js';

/**
 * Equipment.
 *
 * A craft's effective statistics are the base airframe from craft.js, plus the
 * affixes on whatever parts are fitted, plus any modules picked up during the
 * current run. `resolveCraft` is the only place those three are combined, and
 * every consumer keeps reading the same shape it always did.
 *
 * Everything here applies to the SORTIE mode only. ARCADE flies the bare
 * airframe, so the balance tuned for it cannot drift.
 */

export const RARITIES = [
  { id: 'common', name: 'COMMON', color: '#9fb6d1', affixes: 1, quality: [0.00, 0.45] },
  { id: 'rare', name: 'RARE', color: '#7cf5ff', affixes: 2, quality: [0.30, 0.70] },
  { id: 'epic', name: 'EPIC', color: '#c58bf0', affixes: 3, quality: [0.55, 0.90] },
  { id: 'legendary', name: 'LEGENDARY', color: '#ffb347', affixes: 4, quality: [0.80, 1.00] },
];

export function rarityIndex(id) {
  return RARITIES.findIndex((r) => r.id === id);
}

/** Spreads `count` barrels evenly around the nose. */
export function fanBarrels(count) {
  const total = clamp(count, 1, 5);
  if (total === 1) return [{ offset: 0, lateral: 0 }];
  const spread = 0.12;
  const barrels = [];
  for (let i = 0; i < total; i += 1) {
    barrels.push({ offset: (i - (total - 1) / 2) * spread, lateral: 0 });
  }
  return barrels;
}

/**
 * Affixes. `range` is the value at quality 0 and quality 1; `integer` rounds.
 * `minRarity` keeps the swingy ones off common parts.
 */
export const AFFIXES = {
  speed: { label: 'SPEED', range: [4, 18], integer: true, minRarity: 0, format: (v) => `+${v}`,
    apply: (s, v) => { s.speed += v; } },
  turn: { label: 'TURN', range: [0.10, 0.45], minRarity: 0, format: (v) => `+${v.toFixed(2)}`,
    apply: (s, v) => { s.turnRate += v; } },
  rate: { label: 'FIRE RATE', range: [0.04, 0.18], minRarity: 0, format: (v) => `+${Math.round(v * 100)}%`,
    apply: (s, v) => { s.fireCooldown *= 1 - v; } },
  reach: { label: 'RANGE', range: [0.08, 0.30], minRarity: 0, format: (v) => `+${Math.round(v * 100)}%`,
    apply: (s, v) => { s.bulletLife *= 1 + v; } },
  hp: { label: 'ARMOR', range: [1, 3], integer: true, minRarity: 0, format: (v) => `+${v}`,
    apply: (s, v) => { s.hp += v; } },
  shield: { label: 'SHIELD', range: [0.3, 1.2], minRarity: 0, format: (v) => `+${v.toFixed(1)}s`,
    apply: (s, v) => { s.respawnShield += v; } },
  shots: { label: 'SHOTS', range: [1, 5], integer: true, minRarity: 0, format: (v) => `+${v}`,
    apply: (s, v) => { s.maxShots += v; } },
  hitbox: { label: 'HITBOX', range: [1, 3], integer: true, minRarity: 1, format: (v) => `-${v}`,
    apply: (s, v) => { s.radius -= v; } },
  blast: { label: 'BLAST', range: [10, 34], integer: true, minRarity: 1, format: (v) => `+${v}`,
    apply: (s, v) => { s.killBlast += v; } },
  pierce: { label: 'PIERCE', range: [1, 2], integer: true, minRarity: 2, format: (v) => `+${v}`,
    apply: (s, v) => { s.pierce += v; } },
  damage: { label: 'DAMAGE', range: [1, 2], integer: true, minRarity: 2, format: (v) => `+${v}`,
    apply: (s, v) => { s.damage += v; } },
  barrel: { label: 'BARREL', range: [1, 1], integer: true, minRarity: 3, format: (v) => `+${v}`,
    apply: (s, v) => { s.barrels = fanBarrels(s.barrels.length + v); } },
};

export const SLOTS = [
  { id: 'engine', name: 'ENGINE', pool: ['speed', 'turn', 'shield'] },
  { id: 'wing', name: 'WING', pool: ['turn', 'hitbox', 'speed'] },
  { id: 'gun', name: 'GUN', pool: ['rate', 'damage', 'barrel', 'shots'] },
  { id: 'armor', name: 'ARMOR', pool: ['hp', 'shield', 'hitbox'] },
  { id: 'avionics', name: 'AVIONICS', pool: ['reach', 'pierce', 'blast', 'shots'] },
];

export function slotById(id) {
  return SLOTS.find((slot) => slot.id === id);
}

const PREFIXES = {
  common: ['FIELD', 'STOCK', 'SPARE', 'PLAIN'],
  rare: ['TUNED', 'HONED', 'KEEN', 'SWIFT'],
  epic: ['STORM', 'RAVEN', 'TEMPEST', 'VANGUARD'],
  legendary: ['TITAN', 'PHOENIX', 'ZENITH', 'MERIDIAN'],
};

/** Odds improve the deeper into the run the part is earned. */
export function rollRarity(depth = 0) {
  const luck = Math.min(depth, 14) / 14;
  const weights = [
    Math.max(6, 62 - luck * 46),
    28 + luck * 6,
    8 + luck * 22,
    2 + luck * 18,
  ];
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return RARITIES[i];
  }
  return RARITIES[0];
}

let nextId = 1;

export function makePart({ slot, rarity, depth = 0 } = {}) {
  const chosenSlot = slot ? slotById(slot) : pick(SLOTS);
  const chosenRarity = rarity ?? rollRarity(depth);
  const tier = rarityIndex(chosenRarity.id);
  const eligible = chosenSlot.pool.filter((key) => AFFIXES[key].minRarity <= tier);
  const wanted = Math.min(chosenRarity.affixes, eligible.length);

  const keys = [];
  const bag = [...eligible];
  for (let i = 0; i < wanted; i += 1) {
    keys.push(...bag.splice(randInt(0, bag.length - 1), 1));
  }

  const affixes = keys.map((key) => {
    const affix = AFFIXES[key];
    const quality = randRange(...chosenRarity.quality);
    const raw = affix.range[0] + (affix.range[1] - affix.range[0]) * quality;
    return { key, value: affix.integer ? Math.max(1, Math.round(raw)) : Number(raw.toFixed(3)) };
  });

  return {
    id: `p${Date.now().toString(36)}${(nextId += 1).toString(36)}`,
    slot: chosenSlot.id,
    rarity: chosenRarity.id,
    name: `${pick(PREFIXES[chosenRarity.id])} ${chosenSlot.name}`,
    affixes,
  };
}

/** A rough single number for sorting a locker, and for deciding what to scrap. */
export function partScore(part) {
  const tier = rarityIndex(part.rarity);
  const rolls = part.affixes.reduce((sum, { key, value }) => {
    const affix = AFFIXES[key];
    const span = affix.range[1] - affix.range[0] || 1;
    return sum + (value - affix.range[0]) / span;
  }, 0);
  return tier * 10 + rolls;
}

/** Limits that keep any combination of parts and modules inside sane bounds. */
const CAPS = {
  speed: [110, 260],
  turnRate: [1.8, 7.0],
  fireCooldown: [0.07, 0.4],
  maxShots: [3, 26],
  radius: [4, 14],
  hp: [3, 14],
  damage: [1, 5],
  pierce: [0, 4],
  killBlast: [0, 90],
  respawnShield: [1.5, 6],
  bulletLife: [0.3, 2.2],
};

function clampStats(stats) {
  for (const [key, [lo, hi]] of Object.entries(CAPS)) {
    stats[key] = clamp(stats[key], lo, hi);
  }
  if (stats.barrels.length > 5) stats.barrels = fanBarrels(5);
  return stats;
}

/**
 * Base airframe + fitted parts + modules picked up this run. Returns a fresh
 * object shaped exactly like a craft table entry, so nothing downstream has to
 * know equipment exists.
 */
export function resolveCraft(base, parts = [], modules = []) {
  const stats = {
    ...base,
    barrels: base.barrels.map((barrel) => ({ ...barrel })),
    colors: { ...base.colors },
  };
  for (const part of parts) {
    if (!part) continue;
    for (const { key, value } of part.affixes) AFFIXES[key]?.apply(stats, value);
  }
  for (const id of modules) MODULES[id]?.apply(stats);
  return clampStats(stats);
}

/**
 * Modules are the run-local half of the loot: picked up in the air, active
 * until the run ends, and stackable up to their own limit.
 */
export const MODULES = {
  rapid: { name: 'RAPID', blurb: '連射 +12%', max: 4, color: '#ffd166', apply: (s) => { s.fireCooldown *= 0.88; } },
  spread: { name: 'SPREAD', blurb: '砲門 +1', max: 3, color: '#ff8f5e', apply: (s) => { s.barrels = fanBarrels(s.barrels.length + 1); } },
  pierce: { name: 'PIERCE', blurb: '貫通 +1', max: 3, color: '#7cf5ff', apply: (s) => { s.pierce += 1; } },
  heavy: { name: 'HEAVY', blurb: '威力 +1', max: 3, color: '#ff6b6b', apply: (s) => { s.damage += 1; } },
  plate: { name: 'PLATE', blurb: '装甲 +1', max: 4, color: '#9fe8a0', apply: (s) => { s.hp += 1; } },
  agile: { name: 'AGILE', blurb: '旋回 +0.4', max: 4, color: '#c58bf0', apply: (s) => { s.turnRate += 0.4; } },
  thrust: { name: 'THRUST', blurb: '速度 +10', max: 4, color: '#f2f6ff', apply: (s) => { s.speed += 10; } },
  reach: { name: 'REACH', blurb: '射程 +18%', max: 3, color: '#a0c8ff', apply: (s) => { s.bulletLife *= 1.18; } },
  blast: { name: 'BLAST', blurb: '撃墜時に爆風', max: 3, color: '#ffb066', apply: (s) => { s.killBlast += 22; } },
  pod: { name: 'POD', blurb: '随伴ポッド', max: 1, color: '#b9f2ff', apply: (s) => { s.pod = true; } },
};

export const MODULE_IDS = Object.keys(MODULES);

/** A module the player can still stack, or null when everything is maxed. */
export function rollModule(held) {
  const room = MODULE_IDS.filter(
    (id) => held.filter((h) => h === id).length < MODULES[id].max,
  );
  return room.length ? pick(room) : null;
}
