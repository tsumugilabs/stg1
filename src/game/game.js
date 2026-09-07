import { circlesOverlap, clamp, distance, randInt, randRange, TAU } from '../core/math.js';
import { Background } from './background.js';
import { Boss } from './boss.js';
import { Bullet } from './bullet.js';
import { Effects } from './effects.js';
import { Enemy } from './enemy.js';
import { Parachutist } from './parachutist.js';
import { Player } from './player.js';
import { drawHud } from './hud.js';
import { cardAt, inStart, MODES, modeLayout, selectLayout } from './selectscreen.js';
import { loadoutLayout, ROWS_VISIBLE, rowAt } from './loadout.js';
import {
  DEBUG_ACTIONS, DEBUG_TAP_GAP, DEBUG_TAPS, debugButtonAt, debugLayout,
} from './debug.js';
import { CRAFT, craftIndexById, DEFAULT_CRAFT } from './craft.js';
import {
  MODULES, makePart, partScore, resolveCraft, rollModule, SLOTS, WEAPONS,
} from './gear.js';
import { drawDownedPilot } from '../render/sprites.js';
import { ModulePickup } from './pickup.js';
import { Wingman } from './wingman.js';
import { beamEnd, distanceToSegment, drawBeam, Flare } from './weapons.js';
import { cycleAt, difficultyAt, eraAt, ERAS } from './levels.js';

const HIGH_SCORE_KEY = 'chronopilot.highscore';
const CRAFT_KEY = 'chronopilot.craft';
const MODE_KEY = 'chronopilot.mode';
const LOCKER_KEY = 'chronopilot.locker';
const LOADOUT_KEY = 'chronopilot.loadout';
const LOCKER_LIMIT = 60;
const DEBUG_KEY = 'chronopilot.debug';
/** Craft in a squadron, counting the one the player is flying. */
export const SQUAD_SIZE = 4;
/** Chance an escort coughs up a module when it goes down, in SORTIE. */
const MODULE_DROP_CHANCE = 0.07;
const UNLOCK_KEY = 'chronopilot.unlocked';
// Up, up, down, down, left, right, left, right, B, A.
const CHEAT = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA',
];
const CHEAT_HOLD_SECONDS = 3;
const EXTRA_LIFE_EVERY = 30000;
const RESCUE_BONUS = [500, 1000, 2000, 4000, 8000];
/** Pulling a squadron mate out of the sky. Flat: the craft back is the prize. */
const PILOT_RESCUE = 1000;
/** How close a mate has to fly to catch a parachute. */
const CHUTE_REACH = 34;

function readHighScore() {
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeHighScore(value) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  } catch {
    /* storage can be unavailable in private mode; the score just is not kept */
  }
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a full or disabled store just means the locker is not kept */
  }
}

function readStored(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* nothing to do: the choice simply is not remembered next time */
  }
}

export class Game {
  constructor(canvas, input, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.sfx = sfx;

    this.background = new Background();
    this.effects = new Effects();
    this.players = [new Player()];
    this.localIndex = 0;

    this.enemies = [];
    this.bullets = [];
    this.parachutists = [];
    this.pickups = [];
    this.flares = [];
    this.boss = null;

    this.cam = { x: 0, y: 0, width: canvas.width, height: canvas.height, era: eraAt(0) };
    this.resize();

    this.highScore = readHighScore();
    this.unlocked = readStored(UNLOCK_KEY, '') === '1';
    this.craftIndex = craftIndexById(readStored(CRAFT_KEY, DEFAULT_CRAFT));
    if (!this.unlocked && CRAFT[this.craftIndex].hidden) this.craftIndex = 0;
    this.cheatProgress = 0;
    this.holdTimer = 0;
    this.selectBoxes = null;
    const storedMode = readStored(MODE_KEY, 'arcade');
    this.mode = ['arcade', 'squadron', 'sortie'].includes(storedMode) ? storedMode : 'arcade';
    this.locker = readJson(LOCKER_KEY, []);
    this.loadout = readJson(LOADOUT_KEY, {});
    this.modules = [];
    this.resolvedCraft = null;
    this.lootBanner = '';
    this.lootTimer = 0;
    this.modeIndex = Math.max(0, MODES.findIndex((m) => m.id === this.mode));
    this.modeBoxes = null;
    this.loadoutBoxes = null;
    this.loadoutPane = 'slots';
    this.slotIndex = 0;
    this.partIndex = 0;
    this.listOffset = 0;
    this.holdPart = 0;
    this.debug = readStored(DEBUG_KEY, '') === '1';
    this.debugFlags = { invincible: false, hitboxes: false };
    this.debugTaps = 0;
    this.debugTapAt = -99;
    this.debugBoxes = null;
    this.fps = 60;
    this.unlockFlash = 0;
    this.state = 'title';
    this.time = 0;
    this.banner = '';
    this.bannerTimer = 0;
    this.shake = 0;
    this.muted = false;

    this.resetRun();
    this.state = 'title';
  }

  /** Picks up a new canvas size; the view can change shape on rotation. */
  resize() {
    this.cam.width = this.canvas.width;
    this.cam.height = this.canvas.height;
    // Enemies must arrive from just beyond whatever the player can actually see.
    this.spawnRadius = Math.hypot(this.canvas.width, this.canvas.height) / 2 + 70;
  }

  /** Statistics actually flown: airframe, plus equipment, plus modules. */
  get squadron() {
    return this.mode === 'squadron';
  }

  /**
   * How much to multiply a per-run quantity by for the size of the flight.
   * `per` is the share each extra craft adds: 0.5 means four craft face two
   * and a half times as much as one, not four times.
   */
  squadScale(per) {
    return 1 + per * (this.players.length - 1);
  }

  /**
   * Rebuilds the flight. Seat zero is always the local craft; the rest are
   * wingmen for now, and are exactly the seats a peer will take later.
   */
  buildRoster() {
    const wanted = this.squadron ? SQUAD_SIZE : 1;
    const selectable = CRAFT.filter((craft) => !craft.hidden || this.unlocked);
    this.players = [];
    this.wingmen = [];
    for (let i = 0; i < wanted; i += 1) {
      const local = i === 0;
      const craftId = local
        ? this.baseCraft.id
        : selectable[(this.craftIndex + i) % selectable.length].id;
      const player = new Player(craftId, { local, index: i, name: `P${i + 1}` });
      player.lives = player.craft.lives;
      player.out = false;
      this.players.push(player);
      if (!local) this.wingmen.push(new Wingman(player));
    }
    this.localIndex = 0;
    this.placeFormation();
  }

  /** Line the flight up abreast so nobody starts inside anybody else. */
  placeFormation() {
    this.players.forEach((player, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const rank = Math.ceil(i / 2);
      player.reset(0, side * rank * 90);
    });
  }

  /** Stock left on the craft the player is flying, for the HUD. */
  get lives() {
    return this.player.lives;
  }

  /** True once nobody in the squadron has anything left to fly. */
  get squadOut() {
    return this.players.every((p) => p.out);
  }

  /** The craft the camera follows and the controls drive. */
  get player() {
    return this.players[this.localIndex];
  }

  /** Everyone still able to fly, in seat order. */
  livingPlayers() {
    return this.players.filter((p) => p.flying);
  }

  /** Whoever is closest to a point, for enemies choosing a mark. */
  nearestPlayer(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (const player of this.players) {
      if (!player.flying) continue;
      const d = distance(x, y, player.x, player.y);
      if (d < bestDistance) { bestDistance = d; best = player; }
    }
    return best ?? this.player;
  }

  /** Craft the roster spawns around: pressure spreads across the squadron. */
  spawnAnchor() {
    const living = this.livingPlayers();
    return living.length ? living[randInt(0, living.length - 1)] : this.player;
  }

  get craft() {
    return this.resolvedCraft ?? CRAFT[this.craftIndex];
  }

  /** The airframe itself, before anything is bolted to it. */
  get baseCraft() {
    return CRAFT[this.craftIndex];
  }

  get sortie() {
    return this.mode === 'sortie';
  }

  /** Parts fitted right now, in slot order. ARCADE flies bare. */
  equippedParts() {
    if (!this.sortie) return [];
    return SLOTS.map((slot) => this.locker.find((part) => part.id === this.loadout[slot.id]) ?? null);
  }

  /** Recomputes effective statistics and hands them to the craft in flight. */
  rebuildCraft({ inFlight = false } = {}) {
    this.resolvedCraft = resolveCraft(this.baseCraft, this.equippedParts(), this.modules);
    if (inFlight) this.player.applyCraft(this.resolvedCraft);
    else this.player.setCraft(this.resolvedCraft);
    return this.resolvedCraft;
  }

  /** Craft the select screen may actually start with. */
  isSelectable(craft) {
    return !craft.hidden || this.unlocked;
  }

  get era() {
    return eraAt(this.eraIndex);
  }

  get nextEraLabel() {
    return eraAt(this.eraIndex + 1).label;
  }

  /** True once the player has touched the screen (or is on a touch device). */
  get touchMode() {
    return Boolean(this.input.touch && this.input.touch.enabled);
  }

  get difficulty() {
    return difficultyAt(this.eraIndex);
  }

  // --- run / era lifecycle -------------------------------------------------

  resetRun() {
    this.modules = [];
    this.buildRoster();
    this.rebuildCraft();
    this.score = 0;
    this.lootBanner = '';
    this.lootTimer = 0;
    this.eraIndex = 0;
    this.nextExtraLife = EXTRA_LIFE_EVERY;
    this.rescueChain = 0;
    this.startEra();
  }

  startEra() {
    const era = this.era;
    this.kills = 0;
    // A flight clears escorts several times faster than one craft, so the
    // flagship has to be earned rather than arriving in half a minute.
    this.quota = Math.round(era.quota * this.squadScale(0.5));
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.parachutists.length = 0;
    this.pickups.length = 0;
    this.flares.length = 0;
    this.boss = null;
    this.effects.clear();
    this.spawnTimer = randRange(...era.spawnInterval);
    this.parachuteTimer = randRange(6, 12);
    this.rescueChain = 0;
    this.player.reset(0, 0);
    this.cam.x = 0;
    this.cam.y = 0;
    this.state = 'playing';
    this.showBanner(`${era.label}  ${era.subtitle}`, 2.6);
  }

  startNewGame() {
    this.resetRun();
    this.sfx.eraJump();
  }

  showBanner(text, seconds) {
    this.banner = text;
    this.bannerTimer = seconds;
  }

  // --- spawning ------------------------------------------------------------

  spawnPoint() {
    const angle = randRange(0, TAU);
    const anchor = this.spawnAnchor();
    return {
      x: anchor.x + Math.cos(angle) * this.spawnRadius,
      y: anchor.y + Math.sin(angle) * this.spawnRadius,
      angle,
    };
  }

  spawnSquadron(count) {
    const spot = this.spawnPoint();
    const anchor = this.nearestPlayer(spot.x, spot.y);
    const heading = Math.atan2(anchor.y - spot.y, anchor.x - spot.x);
    for (let i = 0; i < count; i += 1) {
      const offset = (i - (count - 1) / 2) * 46;
      this.enemies.push(new Enemy({
        x: spot.x + Math.cos(heading + Math.PI / 2) * offset,
        y: spot.y + Math.sin(heading + Math.PI / 2) * offset,
        angle: heading,
        era: this.era,
        difficulty: this.difficulty,
      }));
    }
  }

  spawnEscorts(count) {
    for (let i = 0; i < count; i += 1) {
      const spot = this.spawnPoint();
      const enemy = new Enemy({
        x: spot.x,
        y: spot.y,
        angle: Math.atan2(this.nearestPlayer(spot.x, spot.y).y - spot.y,
          this.nearestPlayer(spot.x, spot.y).x - spot.x),
        era: this.era,
        difficulty: this.difficulty,
      });
      enemy.isEscort = true;
      this.enemies.push(enemy);
    }
  }

  spawnBoss() {
    const spot = this.spawnPoint();
    this.boss = new Boss({
      x: spot.x,
      y: spot.y,
      angle: Math.atan2(this.nearestPlayer(spot.x, spot.y).y - spot.y,
        this.nearestPlayer(spot.x, spot.y).x - spot.x),
      era: this.era,
      difficulty: this.difficulty,
    });
    this.showBanner(`${this.era.bossName} INBOUND`, 2.6);
    this.sfx.eraJump();
  }

  /** One trigger pull: every barrel the craft carries fires together. */
  firePlayerVolley(x, y, angle) {
    const craft = this.craft;
    const sideX = Math.cos(angle + Math.PI / 2);
    const sideY = Math.sin(angle + Math.PI / 2);
    for (const barrel of craft.barrels) {
      this.bullets.push(new Bullet({
        x: x + Math.cos(angle) * 18 + sideX * barrel.lateral,
        y: y + Math.sin(angle) * 18 + sideY * barrel.lateral,
        angle: angle + barrel.offset,
        speed: craft.bulletSpeed,
        life: craft.bulletLife,
        team: 'player',
        color: craft.bulletColor,
        radius: craft.bulletRadius,
        damage: craft.damage,
        pierce: craft.pierce,
      }));
    }
    this.sfx.playerShot();
  }

  firePodShot(x, y, angle) {
    const craft = this.craft;
    this.bullets.push(new Bullet({
      x, y, angle,
      speed: craft.bulletSpeed * 0.92,
      life: craft.bulletLife * 0.8,
      team: 'player',
      color: craft.colors.accent,
      radius: 2.4,
      damage: craft.damage,
      pierce: 0,
    }));
  }

  /** Every escort currently inside the view, plus the flagship if it is. */
  onScreenTargets() {
    const margin = 40;
    const visible = (thing) => {
      const sx = thing.x - this.cam.x + this.cam.width / 2;
      const sy = thing.y - this.cam.y + this.cam.height / 2;
      return sx > -margin && sx < this.cam.width + margin
        && sy > -margin && sy < this.cam.height + margin;
    };
    const found = this.enemies.filter((e) => !e.dead && visible(e));
    if (this.boss && visible(this.boss)) found.push(this.boss);
    return found;
  }

  spawnMissile(x, y, angle, target, spec, color) {
    this.bullets.push(new Bullet({
      x, y, angle,
      speed: spec.speed,
      life: spec.life,
      team: 'player',
      color,
      radius: 3.4,
      damage: spec.damage,
      pierce: 0,
      homing: { turnRate: spec.turnRate, target },
    }));
  }

  /** Missiles leave the rails fanned out and then find their own marks. */
  fireMissiles(player, spec) {
    const target = this.nearestTarget(player.x, player.y, 900);
    for (let i = 0; i < spec.salvo; i += 1) {
      const offset = (i - (spec.salvo - 1) / 2) * 0.5;
      this.spawnMissile(
        player.x - Math.sin(player.angle) * (i % 2 ? 10 : -10),
        player.y + Math.cos(player.angle) * (i % 2 ? 10 : -10),
        player.angle + offset, target, spec, '#ff9f43',
      );
    }
    this.sfx.playerShot();
  }

  /** One missile for every target in view, each on its own mark. */
  fireSwarm(player, spec) {
    const targets = this.onScreenTargets().slice(0, spec.maxTargets);
    if (!targets.length) return;
    targets.forEach((target, i) => {
      const offset = (i / targets.length) * Math.PI * 2;
      this.spawnMissile(player.x, player.y, player.angle + Math.sin(offset) * 1.2,
        target, spec, '#c58bf0');
    });
    this.effects.ring(player.x, player.y, { radius: 120, color: '#c58bf0', life: 0.4 });
    this.sfx.playerShot();
  }

  dropFlare(player, spec) {
    this.flares.push(new Flare(
      player.x - Math.cos(player.angle) * 18,
      player.y - Math.sin(player.angle) * 18,
      spec,
    ));
  }

  /** One damage tick of the beam along its whole length. */
  burnWithBeam(player, spec) {
    const end = beamEnd(player, this.cam);
    const hits = (thing) => distanceToSegment(
      thing.x, thing.y, player.x, player.y, end.x, end.y,
    ) < spec.width + thing.radius;

    for (const enemy of this.enemies) {
      if (!enemy.dead && hits(enemy)) this.killEnemy(enemy);
    }
    if (this.boss && hits(this.boss)) {
      this.effects.burst(this.boss.x, this.boss.y, { count: 4, speed: 80, life: 0.25, size: 2 });
      if (this.boss.hit(spec.damage)) this.killBoss(this.boss);
    }
  }

  /** Closest escort, or the flagship, within `range` of a point. */
  nearestTarget(x, y, range) {
    let best = null;
    let bestDistance = range;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const d = distance(x, y, enemy.x, enemy.y);
      if (d < bestDistance) { bestDistance = d; best = enemy; }
    }
    if (this.boss) {
      const d = distance(x, y, this.boss.x, this.boss.y);
      if (d < bestDistance) best = this.boss;
    }
    return best;
  }

  /** `reach` is how far the shot travels before it burns out, in pixels. */
  fireEnemyBullet(x, y, angle, speed, reach) {
    this.bullets.push(new Bullet({
      x, y, angle, speed, life: reach / speed, team: 'enemy', color: '#ff8c5a', radius: 3.2,
    }));
    this.sfx.enemyShot();
  }

  // --- scoring -------------------------------------------------------------

  addScore(points) {
    this.score += points;
    if (this.score >= this.nextExtraLife) {
      this.nextExtraLife += EXTRA_LIFE_EVERY;
      // In a squadron the whole flight gets the spare, not just whoever
      // happened to score the points.
      for (const player of this.players) if (!player.out) player.lives += 1;
      this.showBanner('EXTRA PILOT', 2.0);
      this.sfx.extraLife();
    }
    if (this.score > this.highScore) {
      this.highScore = this.score;
      writeHighScore(this.highScore);
    }
  }

  // --- update --------------------------------------------------------------

  update(dt) {
    this.time += dt;
    this.fps = this.fps * 0.9 + (1 / Math.max(dt, 1e-6)) * 0.1;
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    if (this.lootTimer > 0) this.lootTimer -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.6);
    this.background.update(dt);

    if (this.input.touch) this.input.touch.mode = this.state;
    if (this.input.wasPressed('mute')) this.muted = this.sfx.toggleMute();

    switch (this.state) {
      case 'title': this.updateTitle(dt); break;
      case 'mode': this.updateMode(dt); break;
      case 'select': this.updateSelect(dt); break;
      case 'loadout': this.updateLoadout(dt); break;
      case 'playing': this.updatePlaying(dt); break;
      case 'paused': this.updatePaused(); break;
      case 'eraclear': this.updateEraClear(dt); break;
      case 'gameover': this.updateGameOver(dt); break;
      default: break;
    }

    this.updateCamera();
  }

  updateTitle(dt) {
    // The attract screen keeps the plane cruising so the sky keeps scrolling.
    this.driftAttract(dt);
    this.updateCheat(dt);
    if (this.input.wantsStart()) {
      this.state = 'mode';
      this.stateTimer = 0;
    }
  }

  /** ARCADE or SORTIE. The choice is remembered between sessions. */
  updateMode(dt) {
    this.driftAttract(dt);
    this.updateCheat();
    const step = (this.input.wasPressed('right') ? 1 : 0) - (this.input.wasPressed('left') ? 1 : 0);
    if (step !== 0) {
      this.modeIndex = (this.modeIndex + step + MODES.length) % MODES.length;
      this.sfx.hit();
    }

    const layout = modeLayout(this.cam.width, this.cam.height, MODES.length);
    this.modeBoxes = layout;
    const touch = this.input.touch;
    let confirmed = false;
    if (touch && touch.tapPoint) {
      const card = rowAt(touch.tapPoint, layout.cards);
      if (card !== -1) {
        if (card === this.modeIndex) confirmed = true;
        else { this.modeIndex = card; this.sfx.hit(); }
      }
    }

    if (this.input.wasPressed('start') || this.input.wasPressed('fire') || confirmed) {
      this.mode = MODES[this.modeIndex].id;
      writeStored(MODE_KEY, this.mode);
      this.rebuildCraft();
      this.state = 'select';
    }
    if (this.input.wasPressed('pause')) this.state = 'title';
  }

  /** Shared by every attract-style screen: keep the sky moving underneath. */
  driftAttract(dt) {
    this.player.angle += 0.16 * dt;
    this.player.x += Math.cos(this.player.angle) * 90 * dt;
    this.player.y += Math.sin(this.player.angle) * 90 * dt;
  }

  /** Parts in the locker that fit the highlighted slot, best first. */
  slotCandidates() {
    const slot = SLOTS[this.slotIndex].id;
    return this.locker
      .filter((part) => part.slot === slot)
      .sort((a, b) => partScore(b) - partScore(a));
  }

  updateLoadout(dt) {
    this.driftAttract(dt);
    const layout = loadoutLayout(this.cam.width, this.cam.height);
    this.loadoutBoxes = layout;
    const candidates = this.slotCandidates();
    const touch = this.input.touch;

    if (this.input.wasPressed('left')) this.loadoutPane = 'slots';
    if (this.input.wasPressed('right') && candidates.length) this.loadoutPane = 'parts';

    const step = (this.input.wasPressed('down') ? 1 : 0) - (this.input.wasPressed('up') ? 1 : 0);
    if (step !== 0) {
      if (this.loadoutPane === 'slots') {
        this.slotIndex = (this.slotIndex + step + SLOTS.length) % SLOTS.length;
        this.partIndex = 0;
        this.listOffset = 0;
      } else if (candidates.length) {
        this.partIndex = clamp(this.partIndex + step, 0, candidates.length - 1);
      }
      this.sfx.hit();
    }

    if (touch && touch.tapPoint) {
      const slot = rowAt(touch.tapPoint, layout.slots);
      const row = rowAt(touch.tapPoint, layout.rows);
      if (slot !== -1) {
        this.slotIndex = slot;
        this.partIndex = 0;
        this.listOffset = 0;
        this.loadoutPane = 'slots';
        this.sfx.hit();
      } else if (row !== -1 && candidates[this.listOffset + row]) {
        this.partIndex = this.listOffset + row;
        this.loadoutPane = 'parts';
        this.equipHighlighted();
      } else if (rowAt(touch.tapPoint, [layout.back]) === 0) {
        this.state = 'select';
      }
    }

    // Long press on a part scraps it, for players with no keyboard.
    const holdingPart = touch && touch.holdPoint
      && rowAt(touch.holdPoint, layout.rows) !== -1
      && this.loadoutPane === 'parts';
    this.holdPart = holdingPart ? this.holdPart + dt : 0;
    if (this.holdPart >= 1.2) {
      this.holdPart = 0;
      this.discardHighlighted();
    }

    if (this.input.wasPressed('start') || this.input.wasPressed('fire')) {
      if (this.loadoutPane === 'slots' && candidates.length) this.loadoutPane = 'parts';
      else this.equipHighlighted();
    }
    if (this.input.wasPressed('discard')) this.discardHighlighted();
    if (this.input.wasPressed('pause')) this.state = 'select';

    // Keep the highlighted row on screen.
    this.partIndex = clamp(this.partIndex, 0, Math.max(0, candidates.length - 1));
    this.listOffset = clamp(this.listOffset, this.partIndex - ROWS_VISIBLE + 1, this.partIndex);
    this.listOffset = Math.max(0, this.listOffset);
  }

  toggleDebug() {
    this.debug = !this.debug;
    if (!this.debug) this.debugFlags = { invincible: false, hitboxes: false };
    writeStored(DEBUG_KEY, this.debug ? '1' : '');
    this.showLoot(this.debug ? 'DEBUG MODE ON' : 'DEBUG MODE OFF');
    this.sfx.extraLife();
  }

  /** Runs one debug action. Shared by the on-screen buttons and the number keys. */
  runDebugAction(key) {
    switch (key) {
      case 'invincible':
      case 'hitboxes':
        this.debugFlags[key] = !this.debugFlags[key];
        break;
      case 'nextEra':
        this.eraIndex += 1;
        this.startEra();
        break;
      case 'flagship':
        if (!this.boss) { this.kills = this.quota; this.spawnBoss(); }
        break;
      case 'part': {
        const part = makePart({ depth: this.eraIndex });
        this.locker.push(part);
        writeJson(LOCKER_KEY, this.locker);
        this.showLoot(`${part.name} を入手`);
        break;
      }
      case 'module': {
        const id = rollModule(this.modules, this.baseCraft.id);
        if (id) {
          this.modules.push(id);
          this.rebuildCraft({ inFlight: true });
          this.showLoot(`${MODULES[id].name} — ${MODULES[id].blurb}`);
        }
        break;
      }
      case 'unlock':
        this.unlockHidden('DEBUG');
        this.unlocked = true;
        writeStored(UNLOCK_KEY, '1');
        break;
      case 'off':
        this.toggleDebug();
        break;
      default:
        break;
    }
  }

  /** Debug buttons and the number keys that mirror them. */
  updateDebugControls() {
    if (!this.debug) return;
    const layout = debugLayout(this.cam.width);
    this.debugBoxes = layout;
    const touch = this.input.touch;
    if (touch && touch.tapPoint) {
      const index = debugButtonAt(touch.tapPoint, layout);
      if (index !== -1) {
        this.runDebugAction(layout.buttons[index].action.key);
        touch.tapPoint = null;
      }
    }
    for (const code of this.input.recentCodes) {
      const slot = Number(code.replace('Digit', ''));
      if (code.startsWith('Digit') && slot >= 1 && slot <= DEBUG_ACTIONS.length) {
        this.runDebugAction(DEBUG_ACTIONS[slot - 1].key);
      }
    }
  }

  equipHighlighted() {
    const slot = SLOTS[this.slotIndex].id;
    const part = this.slotCandidates()[this.partIndex];
    if (!part) return;
    this.loadout[slot] = this.loadout[slot] === part.id ? undefined : part.id;
    if (!this.loadout[slot]) delete this.loadout[slot];
    writeJson(LOADOUT_KEY, this.loadout);
    this.rebuildCraft();
    this.sfx.rescue();
  }

  discardHighlighted() {
    const part = this.slotCandidates()[this.partIndex];
    if (!part) return;
    if (this.loadout[SLOTS[this.slotIndex].id] === part.id) {
      delete this.loadout[SLOTS[this.slotIndex].id];
      writeJson(LOADOUT_KEY, this.loadout);
    }
    this.locker = this.locker.filter((item) => item.id !== part.id);
    writeJson(LOCKER_KEY, this.locker);
    this.rebuildCraft();
    this.showLoot(`${part.name} を破棄`);
    this.sfx.hit();
  }

  /**
   * Craft select. The hidden slot can be highlighted before it is earned —
   * seeing that it exists is the point — but it cannot be launched, and
   * holding it down is the touch equivalent of the keyboard cheat.
   */
  updateSelect(dt) {
    this.driftAttract(dt);
    this.updateCheat(dt);
    if (this.sortie && this.input.wasPressed('down')) {
      this.state = 'loadout';
      return;
    }

    const step = (this.input.wasPressed('right') ? 1 : 0) - (this.input.wasPressed('left') ? 1 : 0);
    if (step !== 0) {
      this.craftIndex = (this.craftIndex + step + CRAFT.length) % CRAFT.length;
      this.rebuildCraft();
      this.sfx.hit();
    }

    const touch = this.input.touch;
    // Computed once here and reused by the renderer, so the screen and the
    // hit testing are literally the same boxes.
    const layout = selectLayout(this.cam.width, this.cam.height);
    this.selectBoxes = layout;
    let tappedStart = false;
    if (touch && touch.tapPoint) {
      const onCard = cardAt(touch.tapPoint, layout) !== -1;
      if (!onCard && !inStart(touch.tapPoint, layout)) {
        this.debugTaps = this.time - this.debugTapAt > DEBUG_TAP_GAP ? 1 : this.debugTaps + 1;
        this.debugTapAt = this.time;
        if (this.debugTaps >= DEBUG_TAPS) {
          this.debugTaps = 0;
          this.toggleDebug();
        }
      }
    }

    if (touch && touch.tapPoint) {
      const card = cardAt(touch.tapPoint, layout);
      if (card !== -1 && card !== this.craftIndex) {
        this.craftIndex = card;
        this.rebuildCraft();
        this.sfx.hit();
      } else if (card === this.craftIndex || inStart(touch.tapPoint, layout)) {
        tappedStart = true;
      }
    }

    // Press and hold the locked slot to open it, for players with no keyboard.
    const holdingCard = touch && touch.holdPoint
      ? cardAt(touch.holdPoint, layout) === this.craftIndex
      : this.input.isHeld('fire');
    this.holdTimer = !this.isSelectable(this.craft) && holdingCard ? this.holdTimer + dt : 0;
    if (this.holdTimer >= CHEAT_HOLD_SECONDS) {
      this.holdTimer = 0;
      this.unlockHidden('THE LONG PRESS');
    }

    if (this.unlockFlash > 0) this.unlockFlash -= dt;

    const launch = this.input.wasPressed('start')
      || tappedStart
      || (this.input.wasPressed('fire') && this.isSelectable(this.craft));
    if (launch && this.isSelectable(this.craft)) {
      writeStored(CRAFT_KEY, this.baseCraft.id);
      this.startNewGame();
    }
    if (this.input.wasPressed('pause')) this.state = 'mode';
  }

  /** The old arcade sequence, still good for opening the locked slot. */
  updateCheat() {
    const codes = this.input.recentCodes;
    if (!codes.length) return;
    for (const code of codes) {
      this.cheatProgress = code === CHEAT[this.cheatProgress]
        ? this.cheatProgress + 1
        : (code === CHEAT[0] ? 1 : 0);
      if (this.cheatProgress === CHEAT.length) {
        this.cheatProgress = 0;
        this.unlockHidden('THE OLD CODE');
      }
    }
  }

  updatePaused() {
    if (this.input.wasPressed('pause')) this.state = 'playing';
  }

  updateGameOver(dt) {
    this.effects.update(dt);
    this.stateTimer -= dt;
    if (this.stateTimer <= 0 && this.input.wantsStart()) {
      this.state = 'select';
    }
  }

  updateEraClear(dt) {
    this.effects.update(dt);
    for (const bullet of this.bullets) bullet.update(dt);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.eraIndex += 1;
      this.startEra();
    }
  }

  updatePlaying(dt) {
    if (this.input.wasPressed('pause')) {
      this.state = 'paused';
      return;
    }
    this.updateDebugControls();

    this.updatePlayers(dt);
    this.updateWorld(dt);
    this.updateSpawning(dt);
    this.resolveCollisions();
    this.effects.update(dt);
  }

  /**
   * Flies everyone, and brings back whoever is down. A craft going down no
   * longer stops the world: the rest of the flight keeps fighting, which is
   * the whole point of having a flight.
   */
  updatePlayers(dt) {
    for (const player of this.players) {
      if (player.out) continue;
      if (player.alive) {
        const wingman = player.local ? null : this.wingmen.find((w) => w.player === player);
        player.update(dt, wingman ? wingman.control(dt, this) : this.input, this);
        continue;
      }
      if (player.chute) {
        // Wingmen just drift; only a person flies their own parachute.
        player.updateChute(dt, player.local ? this.input : null);
        if (player.chute.timer > 0) continue;
        this.losePilot(player);
        continue;
      }
      player.downTimer -= dt;
      if (player.downTimer > 0) continue;
      player.lives -= 1;
      if (player.lives <= 0) {
        player.out = true;
        continue;
      }
      this.returnToTheAir(player);
    }

    if (this.squadOut && this.state === 'playing') {
      this.state = 'gameover';
      this.stateTimer = 1.0;
      this.sfx.gameOver();
    }
  }

  /** Puts a craft back in, alongside the flight if there is any of it left. */
  returnToTheAir(player) {
    const mate = this.players.find((p) => p !== player && p.flying);
    const x = mate ? mate.x - Math.cos(mate.angle) * 90 : player.x;
    const y = mate ? mate.y - Math.sin(mate.angle) * 90 : player.y;
    player.reset(x, y);
    if (player.local) this.rescueChain = 0;
    this.clearAround(x, y);
  }

  /**
   * Clear the ground around one returning craft only, so a player coming back
   * does not wipe the sky for everybody else in the flight.
   */
  clearAround(x, y) {
    this.bullets = this.bullets.filter(
      (b) => b.team !== 'enemy' || distance(b.x, b.y, x, y) > 220,
    );
    this.enemies = this.enemies.filter((e) => distance(e.x, e.y, x, y) > 260);
    this.spawnTimer = Math.max(this.spawnTimer, 1.4);
  }

  /**
   * A mate flew into the parachute. The pilot goes straight back up in a fresh
   * craft and it costs nothing — the only way in the game to lose a craft and
   * not lose a craft. That asymmetry is the whole point of flying together.
   */
  rescuePilot(pilot, rescuer) {
    pilot.chute = null;
    const x = rescuer.x - Math.cos(rescuer.angle) * 70;
    const y = rescuer.y - Math.sin(rescuer.angle) * 70;
    pilot.reset(x, y);
    this.clearAround(x, y);
    this.addScore(PILOT_RESCUE);
    this.effects.popup(x, y - 26, `${pilot.name} RESCUED`, '#7cf5ff');
    this.effects.ring(x, y, { radius: 96, life: 0.6, color: '#7cf5ff', width: 4 });
    this.sfx.rescue();
  }

  /** Nobody reached them. Now it costs a craft, the way it always used to. */
  losePilot(player) {
    player.chute = null;
    this.effects.ring(player.x, player.y, { radius: 74, life: 0.5, color: '#5d7085' });
    if (player.local) this.rescueChain = 0;
    player.lives -= 1;
    if (player.lives <= 0) {
      player.out = true;
      return;
    }
    this.returnToTheAir(player);
  }

  updateWorld(dt) {
    for (const enemy of this.enemies) enemy.update(dt, this);
    this.enemies = this.enemies.filter((e) => !e.dead);

    if (this.boss) {
      this.boss.update(dt, this);
      if (this.boss.dead) this.boss = null;
    }

    for (const bullet of this.bullets) bullet.update(dt, this);
    this.bullets = this.bullets.filter(
      (b) => !b.dead && distance(b.x, b.y, this.cam.x, this.cam.y) < 1600,
    );

    for (const flare of this.flares) flare.update(dt);
    this.flares = this.flares.filter((f) => !f.dead);
    if (this.flares.length) this.burnIncoming();

    for (const chute of this.parachutists) chute.update(dt);
    this.parachutists = this.parachutists.filter((p) => !p.dead);

    for (const pickup of this.pickups) pickup.update(dt);
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  /** Enemy rounds that stray into a burning flare do not come out again. */
  burnIncoming() {
    for (const bullet of this.bullets) {
      if (bullet.dead || bullet.team !== 'enemy') continue;
      for (const flare of this.flares) {
        if (distance(bullet.x, bullet.y, flare.x, flare.y) > flare.radius) continue;
        bullet.dead = true;
        this.effects.burst(bullet.x, bullet.y, {
          count: 4, speed: 70, life: 0.25, size: 2, colors: ['#ffe066', '#fff6c9'],
        });
        break;
      }
    }
  }

  updateSpawning(dt) {
    if (this.boss) return;

    this.spawnTimer -= dt;
    const era = this.era;
    // The sky has to be busy enough for four craft to have something to do.
    const scale = this.squadScale(0.5);
    const cap = Math.round(Math.min(era.maxEnemies + cycleAt(this.eraIndex), 12) * scale);
    if (this.spawnTimer <= 0 && this.enemies.length < cap) {
      this.spawnTimer = randRange(...era.spawnInterval) / (this.difficulty * scale);
      this.spawnSquadron(Math.random() < era.squadronChance ? 2 : 1);
    }

    if (this.kills >= this.quota) this.spawnBoss();
  }

  killEnemy(enemy, chained = false) {
    enemy.dead = true;
    this.kills += 1;
    this.addScore(enemy.score);
    this.effects.burst(enemy.x, enemy.y, { count: 16, speed: 190 });
    this.effects.ring(enemy.x, enemy.y, { radius: 56 });
    this.effects.popup(enemy.x, enemy.y - 18, String(enemy.score));
    this.sfx.explosion();
    this.shake = Math.max(this.shake, 0.25);

    if (!enemy.isEscort && Math.random() < 0.22 && this.parachutists.length < 3) {
      this.parachutists.push(new Parachutist(enemy.x, enemy.y));
    }

    if (this.sortie && Math.random() < MODULE_DROP_CHANCE) this.dropModule(enemy.x, enemy.y);

    // A blast from a kill takes anything alongside it, but the chain stops
    // there: secondary kills do not set off blasts of their own.
    const blast = this.craft.killBlast;
    if (blast > 0 && !chained) {
      this.effects.ring(enemy.x, enemy.y, { radius: blast * 2, color: '#ffb066', width: 4 });
      for (const other of this.enemies) {
        if (other.dead || distance(other.x, other.y, enemy.x, enemy.y) > blast) continue;
        this.killEnemy(other, true);
      }
      if (this.boss && distance(this.boss.x, this.boss.y, enemy.x, enemy.y) < blast + this.boss.radius) {
        if (this.boss.hit(1)) this.killBoss(this.boss);
      }
    }
  }

  /** Shakes a module loose, unless every module is already at its limit. */
  dropModule(x, y) {
    if (this.pickups.length >= 4) return;
    const id = rollModule(this.modules, this.baseCraft.id);
    if (!id) return;
    this.pickups.push(new ModulePickup(x, y, id));
  }

  collectModule(pickup) {
    this.modules.push(pickup.moduleId);
    this.rebuildCraft({ inFlight: true });
    const module = MODULES[pickup.moduleId];
    this.effects.popup(pickup.x, pickup.y - 22, module.name, module.color);
    this.effects.ring(pickup.x, pickup.y, { radius: 90, color: module.color, life: 0.5 });
    this.sfx.rescue();
    this.showLoot(`${module.name} — ${module.blurb}`);
  }

  showLoot(text) {
    this.lootBanner = text;
    this.lootTimer = 3.2;
  }

  /**
   * Every flagship yields a part, and the deeper the run the better the odds.
   * When the locker is full the weakest thing not currently fitted is scrapped
   * to make room, so a good drop is never lost to housekeeping.
   */
  awardPart() {
    const part = makePart({ depth: this.eraIndex });
    if (this.locker.length >= LOCKER_LIMIT) {
      const fitted = new Set(Object.values(this.loadout));
      const spare = this.locker
        .filter((item) => !fitted.has(item.id))
        .sort((a, b) => partScore(a) - partScore(b))[0];
      if (spare) this.locker = this.locker.filter((item) => item !== spare);
    }
    if (this.locker.length < LOCKER_LIMIT) {
      this.locker.push(part);
      writeJson(LOCKER_KEY, this.locker);
      this.showLoot(`${part.name} を入手`);
    }
    return part;
  }

  killBoss(boss) {
    this.addScore(boss.score);
    if (this.sortie) this.awardPart();
    for (let i = 0; i < 5; i += 1) {
      this.effects.burst(
        boss.x + randRange(-40, 40),
        boss.y + randRange(-40, 40),
        { count: 22, speed: 260, life: 0.9, size: 4 },
      );
    }
    this.effects.ring(boss.x, boss.y, { radius: 240, life: 0.9, width: 6 });
    this.effects.popup(boss.x, boss.y - 40, String(boss.score), '#ffd166');
    this.sfx.bigExplosion();
    this.shake = 1;
    this.boss = null;
    this.enemies.length = 0;
    this.state = 'eraclear';
    this.stateTimer = 3.2;

    // Completing a full lap of history earns the hidden craft.
    if ((this.eraIndex + 1) % ERAS.length === 0) this.unlockHidden('A LAP OF HISTORY');
  }

  unlockHidden(reason) {
    if (this.unlocked) return;
    this.unlocked = true;
    writeStored(UNLOCK_KEY, '1');
    this.unlockFlash = 4;
    this.showBanner(`S.WIND UNLOCKED — ${reason}`, 4);
    this.sfx.extraLife();
  }

  /**
   * One point of damage. The craft only goes down when its armour runs out,
   * which is what makes the game survivable with a thumb on a touch screen.
   */
  hitPlayer(player = this.player) {
    if (this.debugFlags.invincible && player.local) return;
    const outcome = player.takeHit();
    if (outcome === 'ignored') return;
    if (outcome === 'damaged') {
      this.effects.burst(player.x, player.y, {
        count: 10, speed: 150, life: 0.4, size: 2.6, colors: ['#ff8f8f', '#ffd166', '#ffffff'],
      });
      this.effects.ring(player.x, player.y, { radius: 62, life: 0.35, color: '#ff8f8f' });
      this.sfx.hit();
      if (player.local) this.shake = Math.max(this.shake, 0.45);
      return;
    }
    this.destroyPlayer(player);
  }

  destroyPlayer(player = this.player) {
    this.effects.burst(player.x, player.y, {
      count: 30, speed: 240, life: 0.9, size: 4, colors: ['#7cf5ff', '#ffffff', '#ffd166'],
    });
    this.effects.ring(player.x, player.y, { radius: 150, life: 0.7, color: '#7cf5ff', width: 5 });
    this.sfx.bigExplosion();
    if (player.local) this.shake = 0.9;
    if (player.alive) {
      // Called directly (debug, tests): take the craft down properly.
      player.hp = 0;
      player.alive = false;
      player.downTimer = 1.9;
    }
    // In a flight the pilot outlives the craft. Alone there is nobody to come
    // and get them, so a solo run keeps the plain timer.
    if (this.squadron && !player.out) player.bailOut();
  }

  resolveCollisions() {
    for (const bullet of this.bullets) {
      if (bullet.dead) continue;

      if (bullet.team === 'player') {
        for (const enemy of this.enemies) {
          if (enemy.dead || !circlesOverlap(bullet, enemy)) continue;
          if (bullet.pierce > 0) bullet.pierce -= 1;
          else bullet.dead = true;
          this.killEnemy(enemy);
          break;
        }
        if (!bullet.dead && this.boss && circlesOverlap(bullet, this.boss)) {
          bullet.dead = true;
          this.effects.burst(bullet.x, bullet.y, { count: 5, speed: 90, life: 0.3, size: 2 });
          this.sfx.hit();
          if (this.boss.hit(bullet.damage)) this.killBoss(this.boss);
        }
      } else {
        for (const player of this.players) {
          if (!player.flying || player.invulnerable > 0) continue;
          if (!circlesOverlap(bullet, player)) continue;
          bullet.dead = true;
          this.hitPlayer(player);
          break;
        }
      }
    }

    for (const player of this.players) {
      if (!player.flying) continue;

      for (const enemy of this.enemies) {
        if (enemy.dead || !circlesOverlap(enemy, player)) continue;
        this.killEnemy(enemy);
        this.hitPlayer(player);
        if (!player.flying) break;
      }
      if (!player.flying) continue;

      if (this.boss && circlesOverlap(this.boss, player)) {
        this.hitPlayer(player);
        if (!player.flying) continue;
      }

      for (const mate of this.players) {
        if (mate === player || !mate.downed) continue;
        if (distance(mate.x, mate.y, player.x, player.y) > player.radius + CHUTE_REACH) continue;
        this.rescuePilot(mate, player);
      }

      for (const pickup of this.pickups) {
        if (pickup.dead || !circlesOverlap(pickup, player)) continue;
        pickup.dead = true;
        this.collectModule(pickup);
      }

      for (const chute of this.parachutists) {
        if (chute.dead || !circlesOverlap(chute, player)) continue;
        chute.dead = true;
        const bonus = RESCUE_BONUS[Math.min(this.rescueChain, RESCUE_BONUS.length - 1)];
        this.rescueChain += 1;
        this.addScore(bonus);
        this.effects.popup(chute.x, chute.y - 20, `+${bonus}`, '#ffd166');
        this.effects.ring(chute.x, chute.y, { radius: 60, color: '#ffd166' });
        this.sfx.rescue();
      }
    }
  }

  updateCamera() {
    const amount = this.shake * 8;
    this.cam.x = this.player.x + (Math.random() - 0.5) * amount;
    this.cam.y = this.player.y + (Math.random() - 0.5) * amount;
    this.cam.era = this.era;
  }

  // --- render --------------------------------------------------------------

  render() {
    const ctx = this.ctx;
    this.background.draw(ctx, this.cam);

    for (const chute of this.parachutists) chute.draw(ctx, this.cam);
    for (const pickup of this.pickups) pickup.draw(ctx, this.cam);
    for (const flare of this.flares) flare.draw(ctx, this.cam);
    for (const bullet of this.bullets) {
      if (bullet.team === 'enemy') bullet.draw(ctx, this.cam);
    }
    for (const enemy of this.enemies) enemy.draw(ctx, this.cam, this.time);
    if (this.boss) this.boss.draw(ctx, this.cam, this.time);
    for (const player of this.players) {
      if (player.local || !player.flying) continue;
      player.draw(ctx, this.cam, this.time);
    }
    for (const player of this.players) {
      if (!player.downed) continue;
      const sx = player.x - this.cam.x + this.cam.width / 2;
      const sy = player.y - this.cam.y + this.cam.height / 2;
      ctx.save();
      ctx.translate(sx, sy);
      drawDownedPilot(ctx, this.time, player.craft.colors,
        Math.max(0, player.chute.timer) / player.chute.window);
      ctx.restore();
    }
    this.player.drawLock(ctx, this.cam, this, this.time);
    if (this.player.flying) this.player.draw(ctx, this.cam, this.time);
    for (const bullet of this.bullets) {
      if (bullet.team === 'player') bullet.draw(ctx, this.cam);
    }
    for (const player of this.players) {
      if (!(player.laserActive > 0) || !player.flying) continue;
      const spec = WEAPONS.laser(player.craft.laser);
      drawBeam(ctx, player, this.cam, {
        width: spec.width,
        strength: Math.min(1, player.laserActive / Math.max(spec.duration, 1e-6) + 0.35),
      });
    }
    this.effects.draw(ctx, this.cam);

    drawHud(ctx, this, this.cam);

    if (this.input.touch) {
      const playing = this.state === 'playing' || this.state === 'paused' || this.state === 'respawn';
      this.input.touch.draw(ctx, { showSticks: this.state !== 'paused' && playing });
    }
  }
}

export { ERAS };
