/**
 * Eras the player travels through. Each one changes the sky, the scenery, the
 * escort craft and the flagship that has to be shot down to jump forward.
 *
 * The whole difficulty curve lives in this table. Two rules keep it honest:
 *
 * The year on a stage is a property of its theme; every other number is a
 * property of its position in the run. Stages can therefore be reordered by
 * moving the themed fields between blocks and leaving the curve where it is,
 * which is how the helicopters and the jets came to swap places.
 *
 *  - 1910 is a tutorial. Four slow escorts at a time, they rarely shoot, and
 *    the Zeppelin is a soft target that brings no friends. A first-time player
 *    should reach it and beat it. Escorts are deliberately far slower than any
 *    craft: on a touch screen you need time to read where they are going, and
 *    the sky stays busy by holding more of them rather than faster ones.
 *  - Every number below only ever grows across the eras, and a full lap of
 *    history multiplies them again by CYCLE_DIFFICULTY_STEP, so the pressure
 *    comes from progressing rather than from the opening minute.
 *
 * For reference, the player flies at 178 px/s and turns at 3.6 rad/s: no escort
 * should out-run or out-turn them on the first lap.
 */

/** Each completed lap of the five eras scales speed, turn rate and aggression. */
export const CYCLE_DIFFICULTY_STEP = 0.28;

export const ERAS = [
  {
    label: '1910',
    subtitle: 'THE GREAT WAR SKIES',
    enemy: 'biplane',
    boss: 'zeppelin',
    bossName: 'ZEPPELIN',
    scenery: 'clouds',
    sky: ['#1d4f88', '#5ea3d8'],
    colors: { body: '#e0cba0', wing: '#c0873f', wingAlt: '#8d5f2c', glass: '#2b2013', rotor: '#dce7f2' },
    bossColors: { body: '#d9cdb4', wing: '#9c8a6a', wingAlt: '#6f6047', glass: '#f4d35e', rotor: '#dce7f2' },
    enemySpeed: 46,
    enemyTurn: 0.62,
    bulletSpeed: 150,
    bulletRange: 55,
    bossRange: 380,
    fireInterval: [3.8, 6.0],
    spawnInterval: [1.8, 2.9],
    maxEnemies: 4,
    squadronChance: 0,
    quota: 10,
    bossHp: 12,
    bossSpeed: 56,
    bossTurn: 0.40,
    bossFire: [2.6, 4.0],
    bossShots: 1,
    bossEscorts: null,
  },
  {
    label: '1940',
    subtitle: 'FIGHTER SQUADRONS',
    enemy: 'fighter',
    boss: 'bomber',
    bossName: 'HEAVY BOMBER',
    scenery: 'stormclouds',
    sky: ['#22384f', '#6b7f92'],
    colors: { body: '#a7b6a0', wing: '#7e8f78', wingAlt: '#5d6b58', glass: '#2b3a2a', rotor: '#c9d3c4' },
    bossColors: { body: '#8d9a86', wing: '#6f7d68', wingAlt: '#4f5c4a', glass: '#ffd166', rotor: '#c9d3c4' },
    enemySpeed: 60,
    enemyTurn: 0.82,
    bulletSpeed: 175,
    bulletRange: 65,
    bossRange: 400,
    fireInterval: [3.2, 5.2],
    spawnInterval: [1.5, 2.5],
    maxEnemies: 5,
    squadronChance: 0,
    quota: 13,
    bossHp: 18,
    bossSpeed: 64,
    bossTurn: 0.48,
    bossFire: [2.2, 3.4],
    bossShots: 1,
    bossEscorts: [8, 11],
  },
  {
    label: '1980',
    subtitle: 'GUNSHIP CITY',
    enemy: 'helicopter',
    boss: 'gunship',
    bossName: 'ASSAULT GUNSHIP',
    scenery: 'city',
    sky: ['#1a2136', '#4a5a74'],
    colors: { body: '#7a8b6f', wing: '#5c6a54', wingAlt: '#414d3c', glass: '#20301f', rotor: '#dfe7ee' },
    bossColors: { body: '#5d6b54', wing: '#46523f', wingAlt: '#8fa07f', glass: '#ff8f5e', rotor: '#eef3f8' },
    enemySpeed: 88,
    enemyTurn: 1.23,
    bulletSpeed: 200,
    bulletRange: 400,
    bossRange: 420,
    fireInterval: [2.6, 4.4],
    spawnInterval: [1.3, 2.1],
    maxEnemies: 6,
    squadronChance: 0.25,
    quota: 16,
    bossHp: 26,
    bossSpeed: 70,
    bossTurn: 0.54,
    bossFire: [1.8, 2.9],
    bossShots: 3,
    bossEscorts: [7, 10],
  },
  {
    label: '2000',
    subtitle: 'FORWARD-SWEPT INTERCEPT',
    enemy: 'fsw',
    boss: 'stealth',
    bossName: 'STEALTH WING',
    scenery: 'highclouds',
    sky: ['#123049', '#3f7d9c'],
    colors: { body: '#d3dde8', wing: '#5d7a97', wingAlt: '#3c536b', glass: '#12202e', rotor: '#d4e0ec' },
    bossColors: { body: '#3d4a5c', wing: '#2a3543', wingAlt: '#8fa5bd', glass: '#7cf5ff', rotor: '#d4e0ec' },
    enemySpeed: 98,
    enemyTurn: 1.49,
    bulletSpeed: 220,
    bulletRange: 440,
    bossRange: 450,
    fireInterval: [2.2, 3.8],
    spawnInterval: [1.1, 1.8],
    maxEnemies: 7,
    squadronChance: 0.30,
    quota: 19,
    bossHp: 34,
    bossSpeed: 76,
    bossTurn: 0.60,
    bossFire: [1.5, 2.5],
    bossShots: 3,
    bossEscorts: [6, 9],
  },
  {
    label: '2084',
    subtitle: 'OUTER ORBIT',
    enemy: 'ufo',
    boss: 'mothership',
    bossName: 'MOTHERSHIP',
    scenery: 'stars',
    sky: ['#080615', '#241a4d'],
    colors: { body: '#8f7bd8', wing: '#c58bf0', wingAlt: '#7cf5ff', glass: '#f2e9ff', rotor: '#c58bf0' },
    bossColors: { body: '#4b3c86', wing: '#c58bf0', wingAlt: '#7cf5ff', glass: '#1a1330', rotor: '#c58bf0' },
    enemySpeed: 111,
    enemyTurn: 1.74,
    bulletSpeed: 245,
    bulletRange: 480,
    bossRange: 540,
    fireInterval: [1.8, 3.2],
    spawnInterval: [0.9, 1.6],
    maxEnemies: 8,
    squadronChance: 0.35,
    quota: 22,
    bossHp: 44,
    bossSpeed: 82,
    bossTurn: 0.68,
    bossFire: [1.3, 2.2],
    bossShots: 3,
    bossEscorts: [5, 8],
  },
];

export function eraAt(index) {
  return ERAS[index % ERAS.length];
}

/** How many full trips through history the player has completed. */
export function cycleAt(index) {
  return Math.floor(index / ERAS.length);
}

/** Speed and aggression multiplier for the era at `index`. */
export function difficultyAt(index) {
  return 1 + cycleAt(index) * CYCLE_DIFFICULTY_STEP;
}

/**
 * How many hits everything takes on this lap: one on the first, two on the
 * second, three on the third. Kept separate from `difficultyAt`, which is a
 * gentle 28%-a-lap nudge to speed and reach — armour is the loud lever and it
 * deserves its own, obvious number.
 */
export function toughnessAt(index) {
  return cycleAt(index) + 1;
}
