/**
 * Selectable craft.
 *
 * VIPER is the reference: its numbers are exactly what the era table in
 * levels.js was balanced against, so the tuned first-era feel is preserved
 * whatever else changes here. The other two are defined as trades away from
 * it — every advantage is paid for somewhere else, which `tests/craft.test.js`
 * checks mechanically so no craft can quietly become the only sane pick.
 *
 * S.WIND is the exception, and is hidden until it is earned.
 *
 * `barrels` describes a volley: `offset` fans the shot in radians, `lateral`
 * moves the muzzle sideways, so twin cannons and a spread come from one field.
 */

export const CRAFT = [
  {
    id: 'viper',
    name: 'VIPER',
    motif: 'F-2',
    tagline: 'BALANCED',
    blurb: 'クセのない万能機。迷ったらこれ。装甲も標準の5。',
    speed: 178,
    turnRate: 3.6,
    fireCooldown: 0.18,
    maxShots: 8,
    bulletSpeed: 520,
    bulletLife: 0.82,
    bulletRadius: 3,
    bulletColor: '#fff3c4',
    barrels: [{ offset: 0, lateral: 0 }],
    damage: 1,
    pierce: 0,
    radius: 8,
    hp: 5,
    lives: 2,
    // Its edge is recovery: a longer shield after a hit than anyone else gets.
    respawnShield: 3.4,
    glideTurn: null,
    killBlast: 0,
    // Air brake: how far the throttle comes back, and how much tighter it
    // turns while it is out. Turning radius is speed over turn rate, so the
    // deceleration alone is most of the effect.
    brake: { speed: 0.45, turn: 1.20 },
    podCount: 0,
    missile: 0,
    flare: 0,
    laser: 0,
    swarm: 0,
    lockOn: false,
    trail: null,
    stealth: null,
    colors: { body: '#e9f2ff', wing: '#8fb6e0', wingAlt: '#7aa3d0', glass: '#1c3a5c', accent: '#ffb347' },
    hidden: false,
  },
  {
    id: 'dragon',
    name: 'DRAGON',
    motif: 'DRAKEN',
    tagline: 'AGILITY',
    blurb: '常に背後を取れる。装甲は最も薄いが、当たり判定も最小。',
    speed: 190,
    turnRate: 4.6,
    fireCooldown: 0.19,
    maxShots: 7,
    bulletSpeed: 500,
    bulletLife: 0.76,
    bulletRadius: 3,
    bulletColor: '#cfe9ff',
    barrels: [{ offset: 0, lateral: 0 }],
    damage: 1,
    pierce: 0,
    radius: 6,
    hp: 4,
    lives: 2,
    respawnShield: 2.8,
    // The cobra: hold fire and it turns tighter still, so shooting and
    // turning become a choice rather than something you do at once.
    glideTurn: { after: 0.4, turnRate: 5.4 },
    killBlast: 0,
    // Air brake: how far the throttle comes back, and how much tighter it
    // turns while it is out. Turning radius is speed over turn rate, so the
    // deceleration alone is most of the effect.
    brake: { speed: 0.36, turn: 1.35 },
    podCount: 0,
    missile: 0,
    flare: 0,
    laser: 0,
    swarm: 0,
    lockOn: false,
    trail: null,
    stealth: null,
    colors: { body: '#dfe7ef', wing: '#4f7fbf', wingAlt: '#2f5a94', glass: '#101f33', accent: '#7cf5ff' },
    hidden: false,
  },
  {
    id: 'eagle',
    name: 'EAGLE',
    motif: 'F-15',
    tagline: 'FIREPOWER',
    blurb: '一発が重く装甲も厚い。連射は利かず鈍重。撃墜すると爆風が出る。',
    speed: 162,
    turnRate: 2.8,
    // Slow, heavy shells. Play testing showed that a second barrel is worth
    // more than every drawback in the table put together — it doubles the
    // width of the hit envelope, and firepower is survival here. So the
    // firepower craft carries one big shell rather than two ordinary ones:
    // twice the damage to a flagship, but it has to be aimed.
    fireCooldown: 0.28,
    maxShots: 4,
    bulletSpeed: 560,
    bulletLife: 0.86,
    bulletRadius: 4.6,
    bulletColor: '#ffe08a',
    barrels: [{ offset: 0, lateral: 0 }],
    damage: 2,
    pierce: 0,
    radius: 11,
    hp: 7,
    lives: 2,
    respawnShield: 2.4,
    glideTurn: null,
    killBlast: 36,
    // Air brake: how far the throttle comes back, and how much tighter it
    // turns while it is out. Turning radius is speed over turn rate, so the
    // deceleration alone is most of the effect.
    brake: { speed: 0.62, turn: 1.08 },
    podCount: 0,
    missile: 0,
    flare: 0,
    laser: 0,
    swarm: 0,
    lockOn: false,
    trail: null,
    stealth: null,
    colors: { body: '#d8dee6', wing: '#7f8a99', wingAlt: '#5b6673', glass: '#16202b', accent: '#ff8f5e' },
    hidden: false,
  },
  {
    id: 'raptor',
    name: 'RAPTOR',
    motif: 'F-22',
    tagline: 'STEALTH',
    blurb: '撃たなければ護衛機に捕捉されない。装甲は最薄で、弾も3発しか持てない。',
    speed: 196,
    turnRate: 4.4,
    // Slow, heavy shells and almost nothing in the bays: this one picks its
    // moment rather than holding the trigger.
    fireCooldown: 0.30,
    maxShots: 3,
    bulletSpeed: 540,
    bulletLife: 0.78,
    bulletRadius: 4.2,
    bulletColor: '#cfe4ff',
    barrels: [{ offset: 0, lateral: 0 }],
    damage: 2,
    pierce: 0,
    radius: 6,
    hp: 3,
    lives: 2,
    respawnShield: 2.4,
    glideTurn: null,
    killBlast: 0,
    // Air brake: how far the throttle comes back, and how much tighter it
    // turns while it is out. Turning radius is speed over turn rate, so the
    // deceleration alone is most of the effect.
    brake: { speed: 0.42, turn: 1.28 },
    podCount: 0,
    missile: 0,
    flare: 0,
    laser: 0,
    swarm: 0,
    lockOn: false,
    trail: null,
    // Escorts cannot find it while it holds its fire; shooting gives the
    // position away for `reveal` seconds. Flagships track it regardless.
    stealth: { reveal: 1.7 },
    colors: { body: '#b9c2cc', wing: '#8b96a3', wingAlt: '#69747f', glass: '#141d27', accent: '#7cf5ff' },
    hidden: false,
  },
  {
    id: 'swind',
    name: 'S.WIND',
    motif: 'SUPER SYLPH',
    tagline: 'ALL SYSTEMS',
    blurb: '全部乗せ。マニューバ・ポッドが随伴し、AIが最寄りの敵を自動照準する。',
    speed: 205,
    turnRate: 4.4,
    fireCooldown: 0.18,
    // High enough that the on-screen cap never throttles the spread: this one
    // is meant to feel unrestrained.
    maxShots: 15,
    bulletSpeed: 540,
    bulletLife: 0.88,
    bulletRadius: 3,
    bulletColor: '#b9f2ff',
    barrels: [{ offset: -0.13, lateral: 0 }, { offset: 0, lateral: 0 }, { offset: 0.13, lateral: 0 }],
    damage: 1,
    pierce: 1,
    radius: 6,
    hp: 6,
    lives: 2,
    respawnShield: 3.0,
    glideTurn: null,
    killBlast: 0,
    // Air brake: how far the throttle comes back, and how much tighter it
    // turns while it is out. Turning radius is speed over turn rate, so the
    // deceleration alone is most of the effect.
    brake: { speed: 0.40, turn: 1.30 },
    podCount: 1,
    missile: 0,
    flare: 0,
    laser: 0,
    swarm: 0,
    lockOn: true,
    trail: { colors: ['#7cf5ff', '#c58bf0', '#ffd166', '#ff6bd6'], every: 0.02 },
    stealth: null,
    colors: { body: '#e8ecff', wing: '#6f7bd8', wingAlt: '#c58bf0', glass: '#101430', accent: '#7cf5ff' },
    hidden: true,
  },
];

export const DEFAULT_CRAFT = 'viper';

export function craftById(id) {
  return CRAFT.find((craft) => craft.id === id) ?? CRAFT[0];
}

export function craftIndexById(id) {
  const index = CRAFT.findIndex((craft) => craft.id === id);
  return index === -1 ? 0 : index;
}

/** Slowest and widest-turning craft, which the era table has to stay under. */
export function slowestCraft() {
  return CRAFT.reduce((slowest, craft) => (craft.speed < slowest.speed ? craft : slowest));
}

export function widestTurningCraft() {
  return CRAFT.reduce((widest, craft) => (craft.turnRate < widest.turnRate ? craft : widest));
}

/** Shots per second landed on a flagship, assuming every barrel connects. */
export function flagshipDps(craft) {
  return (craft.barrels.length * craft.damage) / craft.fireCooldown;
}
