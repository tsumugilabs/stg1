import { circlesOverlap, clamp, distance, randInt, randRange, TAU } from '../core/math.js';
import { Background } from './background.js';
import { Boss } from './boss.js';
import { Bullet } from './bullet.js';
import { Effects } from './effects.js';
import { Enemy } from './enemy.js';
import { Parachutist } from './parachutist.js';
import { Player, RESCUE_WINDOW } from './player.js';
import { drawHud } from './hud.js';
import {
  cardAt, inStart, MODES, modeLayout, selectLayout, sizeLayout, SQUAD_SIZES,
} from './selectscreen.js';
import { loadoutLayout, ROWS_VISIBLE, rowAt } from './loadout.js';
import {
  DEBUG_ACTIONS, DEBUG_TAP_GAP, DEBUG_TAPS, debugButtonAt, debugLayout,
} from './debug.js';
import { craftById, CRAFT, craftIndexById, DEFAULT_CRAFT } from './craft.js';
import {
  MODULES, makePart, partScore, resolveCraft, rollModule, SLOTS, WEAPONS,
} from './gear.js';
import { drawDownedPilot } from '../render/sprites.js';
import { ModulePickup } from './pickup.js';
import { Wingman } from './wingman.js';
import { beamEnd, distanceToSegment, drawBeam, Flare } from './weapons.js';
import { cycleAt, difficultyAt, eraAt, ERAS, toughnessAt } from './levels.js';
import { codeLayout, drawLobby, hitButton, menuLayout, roomLayout } from './lobby.js';
import { Room } from '../net/room.js';
import { INTERP_DELAY, readPlayer } from '../net/snapshot.js';
import {
  hostOnline, hostOverTabs, joinOnline, joinOverTabs, makeCode, onlineAvailable,
} from '../net/link.js';

const HIGH_SCORE_KEY = 'chronopilot.highscore';
const CRAFT_KEY = 'chronopilot.craft';
const MODE_KEY = 'chronopilot.mode';
const SQUAD_KEY = 'chronopilot.squadsize';
const NETWAY_KEY = 'chronopilot.netway';
const LOCKER_KEY = 'chronopilot.locker';
const LOADOUT_KEY = 'chronopilot.loadout';
const LOCKER_LIMIT = 60;
const DEBUG_KEY = 'chronopilot.debug';
/**
 * Default flight size. The list of sizes lives with the screen that offers
 * them; everything that scales with the flight reads `players.length`, so a
 * two-player game is a real configuration and not four seats with two empty.
 */
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
/**
 * How far out an escort still counts as "on top of" one player. A little
 * wider than a screen, so the crowd measure matches what a person can see
 * coming rather than only what is already in their face.
 */
const CROWD_RADIUS = 620;
/** Slack over the per-craft share, so the sky can breathe without flooding. */
const CROWD_HEADROOM = 2;
/** The characters a room code can contain, for typing one on a keyboard. */
const CODE_KEYS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** How far from the nearest craft a round survives before it is swept up. */
const BULLET_RANGE = 1600;
/**
 * How far a guest's own craft may sit from where the host has it before
 * anything is done about it. Below this the prediction is simply right enough,
 * and correcting inside it is what made the controls feel heavy.
 */
const PREDICTION_SLACK = 26;
/** How long the flight has to decide whether to put another coin in. */
const CONTINUE_SECONDS = 10;

/*
 * Squadron ranks, from the second lap onwards.
 *
 * The lap makes everything take two hits, then three; ranks are what the
 * flight gets back. The level is shared and the rolls are not: everybody
 * levels together off the flight's total kills, and then each craft draws its
 * own module. That means no kill-stealing between four people, no arithmetic
 * about who shot what, and four aircraft that have drifted into different
 * shapes by the end of a long run.
 *
 * It is deliberately run-scoped. SORTIE keeps the locker and the parts that
 * survive a run; SQUADRON's answer to a harder lap is growth inside that run.
 */
const RANK_FIRST = 14;
const RANK_STEP = 7;
/** A flagship is worth a good share of a rank on its own. */
const RANK_BOSS_KILLS = 8;

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
    const storedSize = Number(readStored(SQUAD_KEY, String(SQUAD_SIZE)));
    this.squadSize = SQUAD_SIZES.includes(storedSize) ? storedSize : SQUAD_SIZE;
    this.locker = readJson(LOCKER_KEY, []);
    this.loadout = readJson(LOADOUT_KEY, {});
    this.modules = [];
    this.resolvedCraft = null;
    this.lootBanner = '';
    this.lootTimer = 0;
    this.modeIndex = Math.max(0, MODES.findIndex((m) => m.id === this.mode));
    this.modeBoxes = null;
    this.sizeBoxes = null;
    // Online. `room` is the session; everything else is the screen around it.
    this.room = null;
    this.netHandle = null;
    this.netStage = 'menu';
    // Remembered. Resetting this to the same-device default on every page
    // load is how a host ends up opening a room only their own browser can
    // see, while their friend asks the broker for a code nobody registered.
    this.netWay = readStored(NETWAY_KEY, 'tabs') === 'online' ? 'online' : 'tabs';
    this.netCode = '';
    this.netError = '';
    this.netReady = false;
    this.netClock = 0;
    this.lobbyBoxes = null;
    this.lobbyStage = '';
    // True while the craft cards were opened from a room rather than from the
    // mode screen, so confirming goes back instead of launching.
    this.fromLobby = false;
    this.netStatus = '';
    // A guest draws the host's world instead of simulating its own.
    this.replica = false;
    this.replicaEnemies = new Map();
    this.nextNetId = 1;
    // Things that happened this tick, for the guests. Cleared by each snapshot.
    this.netEvents = [];
    this.netPlayed = -1;
    this.netEye = null;
    this.continueTimer = 0;
    this.continues = 0;
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
    const wanted = this.squadron ? this.squadSize : 1;
    const selectable = CRAFT.filter((craft) => !craft.hidden || this.unlocked);
    this.players = [];
    this.wingmen = [];
    for (let i = 0; i < wanted; i += 1) {
      const local = i === 0;
      const seated = this.hosting ? this.room.slots[i] : null;
      const craftId = local
        ? this.baseCraft.id
        : ((seated && seated.craft)
          || selectable[(this.craftIndex + i) % selectable.length].id);
      const player = new Player(craftId, { local, index: i, name: `P${i + 1}` });
      player.lives = player.craft.lives;
      player.out = false;
      this.players.push(player);
      // A seat with somebody connected to it is flown from there; every other
      // seat is flown by the AI. Game cannot tell the difference and does not
      // get to ask — which is exactly what stage one was building towards.
      const remote = this.hosting ? this.room.controllerFor(i) : null;
      if (remote) {
        player.remote = remote;
        player.name = remote.name;
      } else if (!local) {
        this.wingmen.push(new Wingman(player));
      }
    }
    this.localIndex = 0;
    this.placeFormation();
  }

  /** Line the flight up abreast so nobody starts inside anybody else. */
  placeFormation() {
    this.players.forEach((player, i) => {
      // A craft that is out for good stays out; reset() would fly it again.
      if (player.out) return;
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

  /**
   * Nobody can finish this era: everyone is either out for good or sitting it
   * out, and a stranded pilot cannot shoot the flagship down. Without this the
   * run would hang on an era that can never be cleared.
   */
  get squadStuck() {
    return this.players.every((p) => p.out || p.stranded);
  }

  /**
   * Whether another coin would buy anything: somebody has to still be a pilot.
   *
   * `lives` counts spare craft, not craft — a pilot at zero spares is flying
   * their last one, and only becomes OUT when they next need replacing. So
   * anybody who is merely stranded can pay and fly on, and a flight is past
   * saving exactly when every seat is already OUT.
   */
  get canContinue() {
    return this.squadron && this.players.some((p) => !p.out);
  }

  offerContinue() {
    this.state = 'continue';
    this.continueTimer = CONTINUE_SECONDS;
    if (this.room && this.room.isHost) this.room.clearWantsOn();
    this.sfx.gameOver();
  }

  endRun() {
    this.state = 'gameover';
    this.stateTimer = 1.0;
    this.sfx.gameOver();
  }

  /**
   * The coin goes in. Everybody still holding a craft pays one, whoever that
   * empties is out for good, and the era starts over from the top for whoever
   * is left. Score and rank are kept — the price is craft, not progress.
   */
  acceptContinue() {
    for (const player of this.players) {
      if (player.out) continue;
      player.lives -= 1;
      // Below zero is out of pilots, not out of spares.
      if (player.lives < 0) player.out = true;
      else player.stranded = false;
    }
    this.continues += 1;
    if (this.squadOut) {
      this.endRun();
      return;
    }
    if (this.room && this.room.isHost) this.room.clearWantsOn();
    // startEra announces the era itself; the coin goes on the second line so
    // both are readable rather than one replacing the other.
    this.startEra();
    this.emit('loot', 0, 0, `CONTINUE ${this.continues} ・ 全機が残機を1つ支払いました`);
  }

  updateContinue(dt) {
    this.effects.update(dt);
    this.continueTimer -= dt;
    // A moment to read the screen. Without it, anybody who happened to be
    // firing at the instant the flight went down spends a craft before they
    // have seen what they were asked.
    if (this.continueTimer > CONTINUE_SECONDS - 0.7) return;
    const asked = this.input.wantsStart()
      || (this.room && this.room.isHost && this.room.anyWantsOn);
    if (asked) {
      this.acceptContinue();
      return;
    }
    if (this.input.wasPressed('pause') || this.continueTimer <= 0) this.endRun();
    if (this.room && this.room.isHost) this.room.hostTick(dt, this);
  }

  /** A guest's side of the same screen: ask, and wait to be told. */
  updateGuestContinue(dt) {
    this.updateReplica(dt);
    if (this.continueTimer > 0) this.continueTimer -= dt;
    if (this.continueTimer > CONTINUE_SECONDS - 0.7) return;
    if (this.input.wantsStart() && this.room) this.room.sendWantsOn();
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
  /**
   * Who the next escort comes in on. Not random: the least busy craft in the
   * flight. Measuring showed the old random pick left one player circling an
   * empty sky while another was swamped, and simply raising the cap made that
   * worse — it added escorts nobody could see. Sharing them out is what
   * actually puts more aircraft in front of each person.
   */
  spawnAnchor() {
    const living = this.livingPlayers();
    if (!living.length) return this.player;
    let best = living[0];
    let fewest = Infinity;
    for (const player of living) {
      const near = this.crowdAround(player);
      // Ties go to a random one of the tied craft rather than always seat 0.
      if (near < fewest || (near === fewest && Math.random() < 0.5)) {
        best = player;
        fewest = near;
      }
    }
    return best;
  }

  /** Escorts close enough to one craft to be that player's problem. */
  crowdAround(player) {
    let near = 0;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (distance(enemy.x, enemy.y, player.x, player.y) < CROWD_RADIUS) near += 1;
    }
    return near;
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

  /** Hits everything takes on this lap: 1, then 2, then 3... */
  get toughness() {
    return toughnessAt(this.eraIndex);
  }

  /** Which lap this is, counting from one, for anything shown to a player. */
  get lap() {
    return cycleAt(this.eraIndex) + 1;
  }

  /**
   * Ranks run in SQUADRON from the second lap. The first lap stays exactly as
   * it was tuned — nothing to learn, nothing to manage, just the game.
   */
  get ranked() {
    return this.squadron && this.lap > 1;
  }

  /** Kills still owed before the flight makes the next rank. */
  get rankTarget() {
    return Math.round((RANK_FIRST + (this.squadRank - 1) * RANK_STEP) * this.squadScale(0.5));
  }

  /**
   * Credits the flight for a kill and promotes it if that was enough. Each
   * craft draws its own module, so a flight of four ends a long run as four
   * different aircraft rather than four copies.
   */
  creditRank(kills = 1) {
    if (!this.ranked) return;
    this.rankKills += kills;
    while (this.rankKills >= this.rankTarget) {
      this.rankKills -= this.rankTarget;
      this.squadRank += 1;
      this.promoteFlight();
    }
  }

  promoteFlight() {
    const gained = [];
    for (const player of this.players) {
      if (player.out) continue;
      const id = rollModule(player.modules, player.baseId);
      if (!id) continue;
      player.modules.push(id);
      this.applyModules(player);
      gained.push(`${player.name} ${MODULES[id].name}`);
      this.emit('rank', player.x, player.y, MODULES[id].color);
    }
    this.emit('banner', 0, 0, { t: `RANK ${this.squadRank}`, d: 2.2 });
    if (gained.length) this.emit('loot', 0, 0, gained.join(' ・ '));
  }

  /**
   * Rebuilds one craft from its own modules. The local seat also carries the
   * locker parts, which belong to the person rather than to the run.
   */
  applyModules(player) {
    if (player.local) {
      this.modules = player.modules;
      this.rebuildCraft({ inFlight: true });
      return;
    }
    player.applyCraft(resolveCraft(craftById(player.baseId), [], player.modules));
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
    this.squadRank = 1;
    this.rankKills = 0;
    this.continues = 0;
    this.continueTimer = 0;
    for (const player of this.players) player.modules = [];
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
    // Everybody who still has a craft starts the era in formation, stranded
    // pilots included: sitting out an era is the price, and it is paid in
    // full when the era ends.
    this.placeFormation();
    this.cam.x = 0;
    this.cam.y = 0;
    this.state = 'playing';
    this.emit('banner', 0, 0, { t: `${era.label}  ${era.subtitle}`, d: 2.6 });
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

  spawnPoint(on = null) {
    const angle = randRange(0, TAU);
    const anchor = on ?? this.spawnAnchor();
    return {
      x: anchor.x + Math.cos(angle) * this.spawnRadius,
      y: anchor.y + Math.sin(angle) * this.spawnRadius,
      angle,
    };
  }

  spawnSquadron(count, on = null) {
    const spot = this.spawnPoint(on);
    const anchor = this.nearestPlayer(spot.x, spot.y);
    const heading = Math.atan2(anchor.y - spot.y, anchor.x - spot.x);
    for (let i = 0; i < count; i += 1) {
      const offset = (i - (count - 1) / 2) * 46;
      this.enemies.push(this.tagEnemy(new Enemy({
        x: spot.x + Math.cos(heading + Math.PI / 2) * offset,
        y: spot.y + Math.sin(heading + Math.PI / 2) * offset,
        angle: heading,
        era: this.era,
        difficulty: this.difficulty,
        toughness: this.toughness,
      })));
    }
  }

  /**
   * Gives an escort a number. Interpolation needs to know that the aircraft in
   * this snapshot is the same one as in the last, and position alone cannot
   * say so once two of them cross.
   */
  tagEnemy(enemy) {
    enemy.netId = this.nextNetId;
    this.nextNetId = (this.nextNetId + 1) % 100000;
    return enemy;
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
        toughness: this.toughness,
      });
      enemy.isEscort = true;
      this.enemies.push(this.tagEnemy(enemy));
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
      toughness: this.toughness,
    });
    this.emit('banner', 0, 0, { t: `${this.era.bossName} INBOUND`, d: 2.6 });
    this.sfx.eraJump();
  }

  /**
   * One trigger pull: every barrel the craft carries fires together.
   *
   * Takes the player, not just a position. Reading `this.craft` here meant the
   * host's airframe fired every seat's guns — a guest in an EAGLE got the
   * host's rounds, in the host's colour, doing the host's damage.
   */
  firePlayerVolley(player) {
    const craft = player.craft;
    const { x, y, angle } = player;
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
        owner: player.index,
      }));
    }
    this.sfx.playerShot();
  }

  firePodShot(player, x, y, angle) {
    const craft = player.craft;
    this.bullets.push(new Bullet({
      x, y, angle,
      speed: craft.bulletSpeed * 0.92,
      life: craft.bulletLife * 0.8,
      team: 'player',
      color: craft.colors.accent,
      radius: 2.4,
      damage: craft.damage,
      pierce: 0,
      owner: player.index,
    }));
  }

  /**
   * Every escort inside one player's view, plus the flagship if it is there.
   * Takes the player rather than reading the camera: everyone has their own
   * screen, and a swarm fired from a remote seat must answer to what that
   * pilot can see, not to what the host can.
   */
  onScreenTargets(around = this.player) {
    const margin = 40;
    const halfW = this.cam.width / 2 + margin;
    const halfH = this.cam.height / 2 + margin;
    const visible = (thing) => Math.abs(thing.x - around.x) < halfW
      && Math.abs(thing.y - around.y) < halfH;
    const found = this.enemies.filter((e) => !e.dead && visible(e));
    if (this.boss && visible(this.boss)) found.push(this.boss);
    return found;
  }

  spawnMissile(x, y, angle, target, spec, color, owner = 0) {
    this.bullets.push(new Bullet({
      x, y, angle,
      speed: spec.speed,
      life: spec.life,
      team: 'player',
      owner,
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
        player.angle + offset, target, spec, '#ff9f43', player.index,
      );
    }
    this.sfx.playerShot();
  }

  /** One missile for every target in view, each on its own mark. */
  fireSwarm(player, spec) {
    const targets = this.onScreenTargets(player).slice(0, spec.maxTargets);
    if (!targets.length) return;
    targets.forEach((target, i) => {
      const offset = (i / targets.length) * Math.PI * 2;
      this.spawnMissile(player.x, player.y, player.angle + Math.sin(offset) * 1.2,
        target, spec, '#c58bf0', player.index);
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
      if (!enemy.dead && hits(enemy)) this.damageEnemy(enemy, spec.damage);
    }
    if (this.boss && hits(this.boss)) {
      this.emit('bosshit', this.boss.x, this.boss.y);
      if (this.boss.hit(spec.damage)) this.killBoss(this.boss);
    }
  }

  /**
   * Something happened that a player should see and hear.
   *
   * A guest runs no game logic at all — that is what makes the host
   * authoritative — so nothing on a guest's screen ever exploded and no
   * flagship ever announced itself. The host plays each of these and puts it
   * on the wire; the guest replays it through the same code, so the two
   * screens show the same thing rather than two implementations of it.
   */
  emit(kind, x, y, extra = null) {
    this.playEffect(kind, x, y, extra);
    if (!this.room || !this.room.isHost || !this.room.started) return;
    const event = extra === null
      ? [kind, Math.round(x), Math.round(y)]
      : [kind, Math.round(x), Math.round(y), extra];
    this.netEvents.push(event);
    // A guest that has been away for a moment wants the recent past, not all
    // of it; anything older than a couple of snapshots is not worth showing.
    if (this.netEvents.length > 48) this.netEvents.shift();
  }

  /** Shake, but only for whoever it happened near. */
  jolt(amount, x, y) {
    const me = this.player;
    if (!me) return;
    const near = distance(x, y, me.x, me.y) < 900;
    if (near) this.shake = Math.max(this.shake, amount);
  }

  playEffect(kind, x, y, extra) {
    switch (kind) {
      case 'kill':
        this.effects.burst(x, y, { count: 16, speed: 190 });
        this.effects.ring(x, y, { radius: 56 });
        if (extra) this.effects.popup(x, y - 18, String(extra));
        this.sfx.explosion();
        this.jolt(0.25, x, y);
        break;
      case 'graze':
        this.effects.burst(x, y, {
          count: 5, speed: 110, life: 0.22, size: 2, colors: ['#ffe066', '#ffffff'],
        });
        this.sfx.hit();
        break;
      case 'boss':
        for (let i = 0; i < 5; i += 1) {
          this.effects.burst(x + randRange(-40, 40), y + randRange(-40, 40),
            { count: 22, speed: 260, life: 0.9, size: 4 });
        }
        this.effects.ring(x, y, { radius: 240, life: 0.9, width: 6 });
        if (extra) this.effects.popup(x, y - 40, String(extra), '#ffd166');
        this.sfx.bigExplosion();
        this.jolt(1, x, y);
        break;
      case 'bosshit':
        this.effects.burst(x, y, { count: 5, speed: 90, life: 0.3, size: 2 });
        this.sfx.hit();
        break;
      case 'hurt':
        this.effects.burst(x, y, {
          count: 10, speed: 150, life: 0.4, size: 2.6, colors: ['#ff8f8f', '#ffd166', '#ffffff'],
        });
        this.effects.ring(x, y, { radius: 62, life: 0.35, color: '#ff8f8f' });
        this.sfx.hit();
        this.jolt(0.45, x, y);
        break;
      case 'lost':
        this.effects.burst(x, y, {
          count: 30, speed: 240, life: 0.9, size: 4, colors: ['#7cf5ff', '#ffffff', '#ffd166'],
        });
        this.effects.ring(x, y, { radius: 150, life: 0.7, color: '#7cf5ff', width: 5 });
        this.sfx.bigExplosion();
        this.jolt(0.9, x, y);
        break;
      case 'saved':
        this.effects.popup(x, y - 26, `${extra || 'PILOT'} RESCUED`, '#7cf5ff');
        this.effects.ring(x, y, { radius: 96, life: 0.6, color: '#7cf5ff', width: 4 });
        this.sfx.rescue();
        break;
      case 'gone':
        this.effects.ring(x, y, { radius: 74, life: 0.5, color: '#5d7085' });
        break;
      case 'chute':
        this.effects.popup(x, y - 20, `+${extra}`, '#ffd166');
        this.effects.ring(x, y, { radius: 60, color: '#ffd166' });
        this.sfx.rescue();
        break;
      case 'module': {
        const module = MODULES[extra];
        if (!module) break;
        this.effects.popup(x, y - 22, module.name, module.color);
        this.effects.ring(x, y, { radius: 90, color: module.color, life: 0.5 });
        this.sfx.rescue();
        break;
      }
      case 'rank':
        this.effects.ring(x, y, { radius: 84, color: extra || '#ffd166', life: 0.5 });
        this.sfx.rescue();
        break;
      case 'banner':
        this.showBanner(extra.t, extra.d);
        break;
      case 'loot':
        this.showLoot(extra);
        break;
      default:
        break;
    }
  }

  /**
   * Replays what the host says happened. Keyed on the snapshot's clock, since
   * a guest reads the newest snapshot on every frame and would otherwise
   * explode the same aircraft sixty times.
   */
  playEvents(snap) {
    if (!snap || !snap.ev || !snap.ev.length) return;
    if (snap.c <= this.netPlayed) return;
    this.netPlayed = snap.c;
    for (const [kind, x, y, extra] of snap.ev) {
      this.playEffect(kind, x, y, extra === undefined ? null : extra);
    }
  }

  /** True when any craft in the flight is within `range` of a point. */
  nearAnyPlayer(x, y, range) {
    for (const player of this.players) {
      if (player.out) continue;
      if (distance(x, y, player.x, player.y) < range) return true;
    }
    return false;
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
      case 'lobby': this.updateLobby(dt); break;
      case 'select': this.updateSelect(dt); break;
      case 'loadout': this.updateLoadout(dt); break;
      case 'playing': this.updatePlaying(dt); break;
      case 'paused': this.updatePaused(); break;
      // A guest keeps taking snapshots through these screens; running the
      // host's logic locally would have it jumping to the next era on its own.
      case 'eraclear':
        if (this.replica) this.updateReplica(dt);
        else this.updateEraClear(dt);
        break;
      case 'continue':
        if (this.replica) this.updateGuestContinue(dt);
        else this.updateContinue(dt);
        break;
      case 'gameover':
        if (this.replica) this.updateGuestOver(dt);
        else this.updateGameOver(dt);
        break;
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
    const onSquadron = MODES[this.modeIndex].id === 'squadron';
    // Flight size lives with the mode that uses it, so there is no extra
    // screen between picking SQUADRON and flying.
    const sizes = onSquadron ? sizeLayout(layout, this.cam.width) : null;
    this.sizeBoxes = sizes;
    if (onSquadron) {
      const jump = (this.input.wasPressed('down') ? 1 : 0) - (this.input.wasPressed('up') ? 1 : 0);
      if (jump !== 0) this.setSquadSize(SQUAD_SIZES[
        (SQUAD_SIZES.indexOf(this.squadSize) + jump + SQUAD_SIZES.length) % SQUAD_SIZES.length]);
    }

    const touch = this.input.touch;
    let confirmed = false;
    if (touch && touch.tapPoint && sizes) {
      const picked = rowAt(touch.tapPoint, sizes.boxes);
      if (picked !== -1) {
        this.setSquadSize(SQUAD_SIZES[picked]);
        touch.tapPoint = null;
      } else if (sizes.online && rowAt(touch.tapPoint, [sizes.online]) === 0) {
        touch.tapPoint = null;
        this.openLobby();
        return;
      }
    }
    if (onSquadron && this.input.wasPressed('discard')) {
      this.openLobby();
      return;
    }
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
      writeStored(SQUAD_KEY, String(this.squadSize));
      this.rebuildCraft();
      this.state = 'select';
    }
    if (this.input.wasPressed('pause')) this.state = 'title';
  }

  setSquadSize(size) {
    if (!SQUAD_SIZES.includes(size) || size === this.squadSize) return;
    this.squadSize = size;
    writeStored(SQUAD_KEY, String(size));
    this.sfx.hit();
  }

  // --- online -------------------------------------------------------------

  get onlineReady() {
    return onlineAvailable();
  }

  /** From the room screen to the craft cards and back. */
  openCraftPick() {
    this.fromLobby = true;
    this.state = 'select';
    this.sfx.hit();
  }

  returnToLobby() {
    this.fromLobby = false;
    this.state = 'lobby';
    this.announceCraft();
  }

  /** Tells the room what this seat is flying, whichever side of it we are. */
  announceCraft() {
    const room = this.room;
    if (!room) return;
    if (room.isHost) {
      room.slots[0].craft = this.baseCraft.id;
      room.broadcastLobby();
      return;
    }
    room.sendPick(this.baseCraft.id);
  }

  setNetWay(way) {
    this.netWay = way;
    writeStored(NETWAY_KEY, way);
  }

  openLobby() {
    this.leaveRoom();
    this.netStage = 'menu';
    this.netError = '';
    this.netCode = '';
    this.netReady = false;
    this.fromLobby = false;
    this.netStatus = '';
    this.state = 'lobby';
    this.sfx.hit();
  }

  /** Tears the room down whichever side of it we were on. */
  leaveRoom() {
    if (this.room) this.room.leave();
    if (this.netHandle) this.netHandle.close();
    this.room = null;
    this.netHandle = null;
    this.replica = false;
    this.replicaEnemies.clear();
  }

  async startHosting() {
    const code = makeCode();
    this.netCode = code;
    this.netStage = 'connecting';
    const room = new Room({ host: true, name: 'P1', size: this.squadSize });
    room.on('lobby', () => {});
    try {
      this.netHandle = this.netWay === 'online'
        ? await hostOnline(code, (transport) => room.accept(transport))
        : hostOverTabs(code, (transport) => room.accept(transport));
    } catch (error) {
      this.netError = error.message;
      this.netStage = 'error';
      return;
    }
    this.room = room;
    room.slots[0].craft = this.baseCraft.id;
    this.mode = 'squadron';
    this.modeIndex = Math.max(0, MODES.findIndex((m) => m.id === 'squadron'));
    this.netStage = 'room';
  }

  /**
   * One attempt at joining, over one transport.
   *
   * A room that answers with a seat is a room that works, so that is the test
   * — nothing else about a transport tells you whether the host is on the
   * other end of it. Whatever does not answer in time is closed and forgotten.
   */
  tryJoin(makeTransport, timeout) {
    return new Promise((resolve) => {
      let transport;
      try {
        transport = makeTransport();
      } catch {
        resolve(null);
        return;
      }
      const room = new Room({ host: false, name: `P${Math.ceil(Math.random() * 9)}` });
      // 'pending' -> 'adopted' or 'discarded'. An attempt that lost the race is
      // closed, and closing it fires its own disconnect handler: without
      // knowing it was discarded, that handler would put an error on the
      // screen of the session that actually won.
      let outcome = '';
      const finish = (value) => {
        if (outcome) return;
        outcome = value ? 'adopted' : 'discarded';
        clearTimeout(timer);
        if (!value) transport.close();
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), timeout);
      room.on('seat', () => finish(room));
      room.on('closed', (why) => {
        if (outcome !== 'adopted') {
          finish(null);
          return;
        }
        this.netError = why || '接続が切れました';
        this.netStage = 'error';
        this.replica = false;
        if (this.state === 'playing') this.state = 'lobby';
      });
      // Attached before connecting: the host can send START the moment it sees
      // the seat, and a handler added afterwards would miss it.
      room.on('start', (message) => this.beginAsGuest(message));
      room.connect(transport);
    });
  }

  /**
   * Joins whichever way the host actually opened the room.
   *
   * The person joining is not asked how — they cannot know, and making both
   * sides pick the same thing independently is what broke this: the choice
   * reset to "same device" on every page load, so a host could open a room
   * only their own browser could see while their friend asked the broker for
   * a code nobody had registered. The same-device channel is tried first
   * because it is free and answers instantly when it is the right one.
   */
  async startJoining() {
    this.netStage = 'connecting';
    this.netError = '';

    this.netStatus = '同じ端末をさがしています...';
    let room = await this.tryJoin(() => joinOverTabs(this.netCode), 900);

    if (!room) {
      this.netStatus = 'オンラインでさがしています...';
      try {
        const transport = await joinOnline(this.netCode, (status) => {
          this.netStatus = status.startsWith('retry')
            ? `もう一度試しています (${status.slice(6)}/3)`
            : 'オンラインでさがしています...';
        });
        room = await this.tryJoin(() => transport, 6000);
        if (!room) throw new Error('ルームには届きましたが、返事がありませんでした');
      } catch (error) {
        this.netError = error.message;
        this.netStatus = '';
        this.netStage = 'error';
        return;
      }
    }

    this.netStatus = '';
    this.room = room;
    this.mode = 'squadron';
    this.netStage = 'room';
    // Tell the host what this seat is flying, so the room shows it.
    room.sendPick(this.baseCraft.id);
  }

  /** Host: everybody who is here is here. Fly. */
  launchRoom() {
    const room = this.room;
    if (!room || !room.isHost || room.humans < 2) return;
    this.squadSize = room.size;
    room.beginFlight();
    this.replica = false;
    room.on('leave', (peer) => this.releaseSeat(peer.seat));
    this.startNewGame();
    // Told after the roster exists, so the AI seats' airframes are the real
    // ones rather than whatever a guest would have guessed for them.
    room.announceStart(this.players.map((player) => player.craft.id));
  }

  /** Guest: the host says go. From here this screen only draws. */
  beginAsGuest(message) {
    this.squadSize = message.size || this.squadSize;
    this.mode = 'squadron';
    this.replica = true;
    this.resetRun();
    // A guest owns no seat but its own; the rest are drawn from snapshots.
    this.localIndex = Math.max(0, this.room.seat);
    for (let i = 0; i < this.players.length; i += 1) {
      const id = message.craft && message.craft[i];
      if (id) this.players[i].setCraft(id);
      this.players[i].local = i === this.localIndex;
    }
    this.wingmen = [];
    this.state = 'playing';
  }

  updateLobby(dt) {
    this.driftAttract(dt);
    const { width: w, height: h } = this.cam;
    const stage = this.netStage;
    // Remembered alongside the boxes so the renderer can tell whether they
    // still belong to the face it is about to draw.
    this.lobbyStage = stage;
    this.lobbyBoxes = stage === 'menu' ? menuLayout(w, h)
      : stage === 'code' ? codeLayout(w, h)
        : stage === 'room' ? roomLayout(w, h)
          : { back: { x: w / 2 - 70, y: h * 0.42 + 70, w: 140, h: 40, id: 'back' } };

    const touch = this.input.touch;
    const point = touch && touch.tapPoint ? touch.tapPoint : null;
    const boxes = stage === 'menu'
      ? [...this.lobbyBoxes.buttons, ...this.lobbyBoxes.ways, this.lobbyBoxes.back]
      : stage === 'code'
        ? [...this.lobbyBoxes.keys, this.lobbyBoxes.del, this.lobbyBoxes.go, this.lobbyBoxes.back]
        : stage === 'room'
          ? [...this.lobbyBoxes.rows, ...this.lobbyBoxes.sizes,
            this.lobbyBoxes.action, this.lobbyBoxes.back]
          : [this.lobbyBoxes.back];
    const tapped = point ? hitButton(point, boxes) : null;
    if (tapped) touch.tapPoint = null;

    // Keyboard shortcuts for the same actions, so this screen is not touch-only.
    let pressed = tapped;
    if (!pressed && stage === 'menu') {
      if (this.input.wasPressed('start')) pressed = 'host';
      else if (this.input.wasPressed('fire')) pressed = 'join';
      else if (this.input.wasPressed('left') || this.input.wasPressed('right')) {
        this.setNetWay(this.netWay === 'tabs' ? 'online' : 'tabs');
        this.sfx.hit();
      }
    }
    if (!pressed && stage === 'code') {
      for (const code of this.input.recentCodes) {
        const letter = code.startsWith('Key') ? code.slice(3)
          : (code.startsWith('Digit') ? code.slice(5) : '');
        if (letter && CODE_KEYS.includes(letter) && this.netCode.length < 4) {
          this.netCode += letter;
          this.sfx.hit();
        }
      }
      if (this.input.wasPressed('discard')) pressed = 'del';
      else if (this.input.wasPressed('start') && this.netCode.length === 4) pressed = 'go';
    }
    if (!pressed && stage === 'room') {
      if (this.input.wasPressed('start') || this.input.wasPressed('fire')) pressed = 'action';
      else if (this.input.wasPressed('down') || this.input.wasPressed('up')) pressed = 'mycraft';
    }
    if (!pressed && (stage === 'error' || stage === 'menu') && this.input.wasPressed('pause')) {
      pressed = 'back';
    }

    if (pressed) this.lobbyAction(pressed);
    if (this.room && !this.room.isHost && this.room.started && this.state === 'lobby') {
      // The start message can land while this screen is still up.
      this.state = 'playing';
    }
  }

  lobbyAction(id) {
    this.sfx.hit();
    const stage = this.netStage;
    if (id === 'back') {
      if (stage === 'room' || stage === 'error') {
        this.leaveRoom();
        this.netStage = 'menu';
        this.netError = '';
        return;
      }
      if (stage === 'code') {
        this.netStage = 'menu';
        return;
      }
      this.leaveRoom();
      this.state = 'mode';
      return;
    }
    if (stage === 'menu') {
      if (id === 'way-tabs') { this.setNetWay('tabs'); return; }
      if (id === 'way-online') { this.setNetWay('online'); return; }
      if (id === 'host') { this.startHosting(); return; }
      if (id === 'join') { this.netCode = ''; this.netStage = 'code'; return; }
    }
    if (stage === 'code') {
      if (id === 'del') { this.netCode = this.netCode.slice(0, -1); return; }
      if (id === 'go') { if (this.netCode.length === 4) this.startJoining(); return; }
      if (CODE_KEYS.includes(id) && this.netCode.length < 4) { this.netCode += id; return; }
    }
    if (stage === 'room' && this.room) {
      // Your own row is the way to your own aircraft. Nobody else's is.
      if (id === 'mycraft' || id === `seat${this.room.seat}`) {
        this.openCraftPick();
        return;
      }
      if (id.startsWith('seat')) return;
      if (id === 'action') {
        if (this.room.isHost) this.launchRoom();
        else {
          this.netReady = !this.netReady;
          this.room.sendReady(this.netReady);
        }
        return;
      }
      if (id.startsWith('size') && this.room.isHost) {
        this.squadSize = Number(id.slice(4));
        this.room.setSize(this.squadSize);
      }
    }
  }

  /** A guest's game over: keep drawing the host's world until they leave. */
  updateGuestOver(dt) {
    this.updateReplica(dt);
    if (this.stateTimer > 0) this.stateTimer -= dt;
    if (this.input.wantsStart()) {
      this.leaveRoom();
      this.state = 'title';
    }
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
      // Opened from a room: choosing a craft goes back to the room rather
      // than launching, because it is not this seat's decision when to fly.
      if (this.fromLobby) {
        this.returnToLobby();
        return;
      }
      this.startNewGame();
    }
    if (this.input.wasPressed('pause')) {
      if (this.fromLobby) this.returnToLobby();
      else this.state = 'mode';
    }
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
    // A guest never simulates. It flies its own craft for the feel of it and
    // draws everything else from what the host sends.
    if (this.replica) {
      this.updateReplica(dt);
      return;
    }
    if (this.input.wasPressed('pause')) {
      // Pausing a game other people are in would freeze it for them, so a
      // host pauses only when it is alone.
      if (!this.hosting) {
        this.state = 'paused';
        return;
      }
    }
    this.updateDebugControls();

    this.updatePlayers(dt);
    this.updateWorld(dt);
    this.updateSpawning(dt);
    this.resolveCollisions();
    this.effects.update(dt);
    if (this.room && this.room.isHost) this.room.hostTick(dt, this);
  }

  /**
   * A guest's frame. Send the stick, move the local craft so it answers at
   * once, and pull everything — the local craft included — towards the host's
   * version of events.
   */
  updateReplica(dt) {
    const room = this.room;
    if (!room) {
      this.replica = false;
      return;
    }
    room.sendInput(this.input);
    room.interp.advance(dt);
    this.effects.update(dt);

    const me = this.player;
    if (me && me.alive) me.steer(dt, this.input);
    const wasBoosting = me ? me.boosting : false;
    const wasBraking = me ? me.braking : false;

    const players = room.interp.players();
    players.forEach((state, i) => {
      const player = this.players[i];
      if (!player) return;
      if (state.craftId && player.craft.id !== state.craftId) player.setCraft(state.craftId);
      player.hp = state.hp;
      player.maxHp = player.craft.hp;
      player.lives = state.lives;
      player.alive = state.alive;
      player.out = state.out;
      player.boosting = state.boosting;
      player.braking = state.braking;
      player.invulnerable = state.invulnerable;
      player.chute = state.downed
        ? { timer: state.chuteTimer, window: RESCUE_WINDOW, phase: this.time, drift: 0, fall: 0 }
        : null;
      player.stranded = state.stranded;
      if (i === this.localIndex && player.alive) {
        /*
         * Your own craft is reconciled against the host's newest word, not
         * against the interpolated past that everything else is drawn from.
         *
         * Correcting towards the interpolated position was pulling the craft
         * back onto where it had been a tenth of a second ago, every frame.
         * The prediction runs forward at full speed and the correction hauls
         * it back, which settles at a permanent lag and feels like flying
         * through treacle. Carrying the newest snapshot forward by the time it
         * spent in transit, and leaving small errors alone entirely, gives the
         * stick back its immediacy.
         */
        const latest = room.interp.latest;
        const auth = latest && latest.p[i] ? readPlayer(latest.p[i]) : state;
        const lead = INTERP_DELAY;
        const ax = auth.x + Math.cos(auth.angle) * player.speed * lead;
        const ay = auth.y + Math.sin(auth.angle) * player.speed * lead;
        const gap = distance(player.x, player.y, ax, ay);
        if (gap > 300) {
          player.x = ax;
          player.y = ay;
          player.angle = auth.angle;
        } else if (gap > PREDICTION_SLACK) {
          // Only the part of the error that is past the slack, and gently.
          const pull = Math.min(0.4, dt * 2.5) * ((gap - PREDICTION_SLACK) / gap);
          player.x += (ax - player.x) * pull;
          player.y += (ay - player.y) * pull;
        }
        // Boost and brake are this seat's own business; taking them from a
        // stale snapshot made the throttle flicker.
        player.boosting = wasBoosting;
        player.braking = wasBraking;
        return;
      }
      player.x = state.x;
      player.y = state.y;
      player.angle = state.angle;
    });

    this.applyReplicaWorld(room.interp);
  }

  /** Rebuilds the drawable world from the interpolated snapshot. */
  applyReplicaWorld(interp) {
    const snap = interp.latest;
    if (!snap) return;
    this.eraIndex = snap.e;
    this.kills = snap.k;
    this.quota = snap.q;
    this.score = snap.s;
    this.squadRank = snap.r;
    this.rankKills = snap.rk;
    this.playEvents(snap);
    this.netEye = snap.w ? { x: snap.w[0], y: snap.w[1] } : null;
    // The host's screen state carries the between-era and end-of-run messages.
    if (snap.st !== this.state && ['playing', 'eraclear', 'gameover', 'continue'].includes(snap.st)) {
      this.state = snap.st;
    }
    if (snap.ct !== undefined) this.continueTimer = snap.ct;

    const era = this.era;
    const seen = new Set();
    this.enemies = interp.enemies().map((state) => {
      seen.add(state.id);
      let enemy = this.replicaEnemies.get(state.id);
      if (!enemy) {
        enemy = new Enemy({ x: state.x, y: state.y, angle: state.angle, era });
        enemy.netId = state.id;
        this.replicaEnemies.set(state.id, enemy);
      }
      enemy.era = era;
      enemy.kind = era.enemy;
      enemy.x = state.x;
      enemy.y = state.y;
      enemy.angle = state.angle;
      enemy.hp = state.hp;
      return enemy;
    });
    for (const id of [...this.replicaEnemies.keys()]) {
      if (!seen.has(id)) this.replicaEnemies.delete(id);
    }

    const boss = interp.boss();
    if (!boss) {
      this.boss = null;
    } else {
      if (!this.boss) this.boss = new Boss({ x: boss.x, y: boss.y, angle: boss.angle, era });
      this.boss.era = era;
      this.boss.kind = era.boss;
      this.boss.x = boss.x;
      this.boss.y = boss.y;
      this.boss.angle = boss.angle;
      this.boss.hp = boss.hp;
      this.boss.maxHp = boss.maxHp;
    }

    this.bullets = interp.bullets().map((state) => {
      const bullet = new Bullet({
        x: state.x, y: state.y, angle: state.angle, speed: 0, life: 1,
        team: state.team, color: state.color, radius: state.radius,
      });
      bullet.homing = state.homing;
      return bullet;
    });

    const extras = interp.extras();
    this.flares = extras.flares.map((state) => {
      const flare = new Flare(state.x, state.y, { radius: state.radius, life: 1 });
      flare.maxLife = 1;
      return flare;
    });
    this.parachutists = extras.parachutists.map((state) => {
      const chute = new Parachutist(state.x, state.y);
      chute.phase = state.phase;
      return chute;
    });
    this.pickups = extras.pickups.map((state) => new ModulePickup(state.x, state.y, state.moduleId));
  }

  /**
   * Flies everyone, and brings back whoever is down. A craft going down no
   * longer stops the world: the rest of the flight keeps fighting, which is
   * the whole point of having a flight.
   */
  updatePlayers(dt) {
    for (const player of this.players) {
      if (player.out || player.stranded) continue;
      if (player.alive) {
        player.update(dt, this.controllerFor(player, dt), this);
        continue;
      }
      if (player.chute) {
        // Wingmen just drift; a person — here or on another machine — flies
        // their own parachute.
        player.updateChute(dt, player.local ? this.input : (player.remote || null));
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

    if ((this.squadOut || this.squadStuck) && this.state === 'playing') {
      if (this.canContinue) this.offerContinue();
      else this.endRun();
    }
  }

  /**
   * Somebody's connection went away mid-flight. Their aircraft does not vanish
   * and must not carry on flying the last stick position it was sent for ever;
   * the AI takes the controls, the way it would have if nobody had joined.
   */
  releaseSeat(seat) {
    const player = this.players[seat];
    if (!player || player.local) return;
    player.remote = null;
    player.name = `P${seat + 1}`;
    if (!this.wingmen.some((w) => w.player === player)) this.wingmen.push(new Wingman(player));
  }

  /** Whatever is flying this seat this frame: hands, AI, or a wire. */
  controllerFor(player, dt) {
    if (player.local) return this.input;
    if (player.remote) return player.remote;
    const wingman = this.wingmen.find((w) => w.player === player);
    return wingman ? wingman.control(dt, this) : this.input;
  }

  /**
   * Whether the room is actually open for business. A host whose link to the
   * broker has dropped is no longer discoverable, so its code has quietly
   * stopped working — and without this the screen goes on showing the code as
   * if nothing were wrong, which is how "it worked, then nobody could join"
   * happens.
   */
  get linkState() {
    if (this.netWay !== 'online' || !this.netHandle) return 'open';
    return this.netHandle.status || 'open';
  }

  get linkError() {
    return (this.netHandle && this.netHandle.error) || '';
  }

  /** True while this machine is the one running the simulation for others. */
  get hosting() {
    return Boolean(this.room && this.room.isHost && this.room.started);
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
    this.emit('saved', x, y, pilot.name);
  }

  /** Nobody reached them. Now it costs a craft, the way it always used to. */
  /**
   * Nobody reached them in time.
   *
   * They do not come back this era. It costs a craft and then it costs the
   * rest of the stage, watched from the enemy flagship — which is what makes
   * a parachute worth breaking off a fight for rather than a thing you get
   * round to. The flight can still finish the era without them, and does.
   */
  losePilot(player) {
    player.chute = null;
    this.emit('gone', player.x, player.y);
    if (player.local) this.rescueChain = 0;
    player.lives -= 1;
    if (player.lives <= 0) {
      player.out = true;
      return;
    }
    player.stranded = true;
    this.emit('banner', 0, 0, { t: `${player.name} MISSING`, d: 2.4 });
  }

  /**
   * What a stranded pilot watches. The flagship if it is up; before it
   * arrives, whichever escort is nearest the fight, so the view is always the
   * enemy's rather than a patch of empty sky.
   */
  spectateTarget() {
    if (this.boss) return this.boss;
    // A guest has no escorts of its own to pick from before the flagship
    // arrives, so the host says where to look.
    if (this.replica && this.netEye) return this.netEye;
    const flying = this.players.find((p) => p.flying);
    if (flying) {
      const enemy = this.nearestTarget(flying.x, flying.y, 4000);
      if (enemy) return enemy;
      return flying;
    }
    return this.player;
  }

  updateWorld(dt) {
    for (const enemy of this.enemies) enemy.update(dt, this);
    this.enemies = this.enemies.filter((e) => !e.dead);

    if (this.boss) {
      this.boss.update(dt, this);
      if (this.boss.dead) this.boss = null;
    }

    for (const bullet of this.bullets) bullet.update(dt, this);
    // Rounds are dropped once they are far from everyone, not far from the
    // camera. The camera follows one seat; culling by it deleted a distant
    // player's shots the frame they were fired, so their gun appeared to stop
    // working the moment they flew more than a screen and a half from the
    // host — and started working again the instant they respawned alongside
    // somebody. No amount of AI testing could find it: wingmen are leashed at
    // 330px and never go far enough.
    this.bullets = this.bullets.filter(
      (b) => !b.dead && this.nearAnyPlayer(b.x, b.y, BULLET_RANGE),
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
    /*
     * Two separate rules, and keeping them separate is the whole trick.
     *
     * The total scales with the flight, one full share per craft, so four
     * people meet four times the opposition rather than dividing one era
     * between them. But no single player may have more than a solo player's
     * worth of escorts around them at once, however large the total gets.
     * That per-craft ceiling is the thing that stops a big flight turning the
     * screen into soup: the sky gets busier by being wider, not denser.
     */
    const share = Math.min(era.maxEnemies + cycleAt(this.eraIndex), 12);
    const cap = Math.round(share * this.squadScale(1));
    const anchor = this.spawnAnchor();
    const room = this.crowdAround(anchor) < share + CROWD_HEADROOM;
    if (this.spawnTimer <= 0 && this.enemies.length < cap && room) {
      this.spawnTimer = randRange(...era.spawnInterval)
        / (this.difficulty * this.squadScale(0.75));
      this.spawnSquadron(Math.random() < era.squadronChance ? 2 : 1, anchor);
    }

    if (this.kills >= this.quota) this.spawnBoss();
  }

  /**
   * Gunfire on an escort. On the first lap every escort has one point of
   * armour, so this is the old behaviour exactly; from the second lap on it
   * takes two rounds, then three. Ramming still destroys outright — it costs
   * the player a point of armour, which is price enough.
   */
  damageEnemy(enemy, damage = 1) {
    if (enemy.dead) return false;
    if (!enemy.hit(damage)) {
      // It has to be obvious that the shot landed, or a tougher escort just
      // reads as a shot that missed.
      this.emit('graze', enemy.x, enemy.y);
      return false;
    }
    this.killEnemy(enemy);
    return true;
  }

  killEnemy(enemy, chained = false) {
    enemy.dead = true;
    this.kills += 1;
    this.addScore(enemy.score);
    this.emit('kill', enemy.x, enemy.y, enemy.score);

    if (!enemy.isEscort && Math.random() < 0.22 && this.parachutists.length < 3) {
      this.parachutists.push(new Parachutist(enemy.x, enemy.y));
    }

    if (this.sortie && Math.random() < MODULE_DROP_CHANCE) this.dropModule(enemy.x, enemy.y);
    this.creditRank(1);

    // A blast from a kill takes anything alongside it, but the chain stops
    // there: secondary kills do not set off blasts of their own.
    const blast = this.craft.killBlast;
    if (blast > 0 && !chained) {
      this.effects.ring(enemy.x, enemy.y, { radius: blast * 2, color: '#ffb066', width: 4 });
      for (const other of this.enemies) {
        if (other.dead || distance(other.x, other.y, enemy.x, enemy.y) > blast) continue;
        if (other.hit(1)) this.killEnemy(other, true);
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
    this.emit('module', pickup.x, pickup.y, pickup.moduleId);
    this.emit('loot', 0, 0, `${module.name} — ${module.blurb}`);
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
    this.creditRank(RANK_BOSS_KILLS);
    this.emit('boss', boss.x, boss.y, boss.score);
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
      this.emit('hurt', player.x, player.y);
      return;
    }
    this.destroyPlayer(player);
  }

  destroyPlayer(player = this.player) {
    this.emit('lost', player.x, player.y);
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
          this.damageEnemy(enemy, bullet.damage);
          break;
        }
        if (!bullet.dead && this.boss && circlesOverlap(bullet, this.boss)) {
          bullet.dead = true;
          this.emit('bosshit', bullet.x, bullet.y);
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
        this.emit('chute', chute.x, chute.y, bonus);
      }
    }
  }

  updateCamera() {
    const amount = this.shake * 8;
    // A pilot who did not get picked up watches the rest of the era from the
    // other side, so the camera leaves their wreck and rides the enemy.
    const eye = this.player.stranded && this.state !== 'gameover'
      ? this.spectateTarget()
      : this.player;
    this.cam.x = eye.x + (Math.random() - 0.5) * amount;
    this.cam.y = eye.y + (Math.random() - 0.5) * amount;
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
