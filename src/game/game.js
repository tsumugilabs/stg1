import { circlesOverlap, distance, randRange, TAU } from '../core/math.js';
import { Background } from './background.js';
import { Boss } from './boss.js';
import { Bullet } from './bullet.js';
import { Effects } from './effects.js';
import { Enemy } from './enemy.js';
import { Parachutist } from './parachutist.js';
import { Player } from './player.js';
import { drawHud } from './hud.js';
import { cardAt, inStart, selectLayout } from './selectscreen.js';
import { CRAFT, craftIndexById, DEFAULT_CRAFT } from './craft.js';
import { cycleAt, difficultyAt, eraAt, ERAS } from './levels.js';

const HIGH_SCORE_KEY = 'chronopilot.highscore';
const CRAFT_KEY = 'chronopilot.craft';
const UNLOCK_KEY = 'chronopilot.unlocked';
// Up, up, down, down, left, right, left, right, B, A.
const CHEAT = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA',
];
const CHEAT_HOLD_SECONDS = 3;
const EXTRA_LIFE_EVERY = 30000;
const RESCUE_BONUS = [500, 1000, 2000, 4000, 8000];

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
    this.player = new Player();

    this.enemies = [];
    this.bullets = [];
    this.parachutists = [];
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

  get craft() {
    return CRAFT[this.craftIndex];
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
    this.player.setCraft(this.craft.id);
    this.score = 0;
    this.lives = this.craft.lives;
    this.eraIndex = 0;
    this.nextExtraLife = EXTRA_LIFE_EVERY;
    this.rescueChain = 0;
    this.startEra();
  }

  startEra() {
    const era = this.era;
    this.kills = 0;
    this.quota = era.quota;
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.parachutists.length = 0;
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
    return {
      x: this.player.x + Math.cos(angle) * this.spawnRadius,
      y: this.player.y + Math.sin(angle) * this.spawnRadius,
      angle,
    };
  }

  spawnSquadron(count) {
    const spot = this.spawnPoint();
    const heading = Math.atan2(this.player.y - spot.y, this.player.x - spot.x);
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
        angle: Math.atan2(this.player.y - spot.y, this.player.x - spot.x),
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
      angle: Math.atan2(this.player.y - spot.y, this.player.x - spot.x),
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

  fireEnemyBullet(x, y, angle, speed) {
    this.bullets.push(new Bullet({
      x, y, angle, speed, life: 2.4, team: 'enemy', color: '#ff8c5a', radius: 3.2,
    }));
    this.sfx.enemyShot();
  }

  // --- scoring -------------------------------------------------------------

  addScore(points) {
    this.score += points;
    if (this.score >= this.nextExtraLife) {
      this.nextExtraLife += EXTRA_LIFE_EVERY;
      this.lives += 1;
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
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.6);
    this.background.update(dt);

    if (this.input.touch) this.input.touch.mode = this.state;
    if (this.input.wasPressed('mute')) this.muted = this.sfx.toggleMute();

    switch (this.state) {
      case 'title': this.updateTitle(dt); break;
      case 'select': this.updateSelect(dt); break;
      case 'playing': this.updatePlaying(dt); break;
      case 'paused': this.updatePaused(); break;
      case 'respawn': this.updateRespawn(dt); break;
      case 'eraclear': this.updateEraClear(dt); break;
      case 'gameover': this.updateGameOver(dt); break;
      default: break;
    }

    this.updateCamera();
  }

  updateTitle(dt) {
    // The attract screen keeps the plane cruising so the sky keeps scrolling.
    this.player.angle += 0.16 * dt;
    this.player.x += Math.cos(this.player.angle) * 90 * dt;
    this.player.y += Math.sin(this.player.angle) * 90 * dt;
    this.updateCheat(dt);
    if (this.input.wantsStart()) {
      this.state = 'select';
      this.stateTimer = 0;
    }
  }

  /**
   * Craft select. The hidden slot can be highlighted before it is earned —
   * seeing that it exists is the point — but it cannot be launched, and
   * holding it down is the touch equivalent of the keyboard cheat.
   */
  updateSelect(dt) {
    this.player.angle += 0.16 * dt;
    this.player.x += Math.cos(this.player.angle) * 90 * dt;
    this.player.y += Math.sin(this.player.angle) * 90 * dt;
    this.updateCheat(dt);

    const step = (this.input.wasPressed('right') ? 1 : 0) - (this.input.wasPressed('left') ? 1 : 0);
    if (step !== 0) {
      this.craftIndex = (this.craftIndex + step + CRAFT.length) % CRAFT.length;
      this.player.setCraft(this.craft.id);
      this.sfx.hit();
    }

    const touch = this.input.touch;
    // Computed once here and reused by the renderer, so the screen and the
    // hit testing are literally the same boxes.
    const layout = selectLayout(this.cam.width, this.cam.height);
    this.selectBoxes = layout;
    let tappedStart = false;
    if (touch && touch.tapPoint) {
      const card = cardAt(touch.tapPoint, layout);
      if (card !== -1 && card !== this.craftIndex) {
        this.craftIndex = card;
        this.player.setCraft(this.craft.id);
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
      writeStored(CRAFT_KEY, this.craft.id);
      this.startNewGame();
    }
    if (this.input.wasPressed('pause')) this.state = 'title';
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

  updateRespawn(dt) {
    this.effects.update(dt);
    this.updateWorld(dt);
    this.stateTimer -= dt;
    if (this.stateTimer > 0) return;

    this.lives -= 1;
    if (this.lives <= 0) {
      this.state = 'gameover';
      this.stateTimer = 1.0;
      this.sfx.gameOver();
      return;
    }
    this.rescueChain = 0;
    // Clear the immediate area, and hold off the next wave, so the player is
    // not straight back into the fight the instant the shield drops.
    this.bullets = this.bullets.filter((b) => b.team !== 'enemy');
    this.enemies = this.enemies.filter((e) => distance(e.x, e.y, this.player.x, this.player.y) > 300);
    this.spawnTimer = Math.max(this.spawnTimer, 2.2);
    this.player.reset(this.player.x, this.player.y);
    this.state = 'playing';
  }

  updatePlaying(dt) {
    if (this.input.wasPressed('pause')) {
      this.state = 'paused';
      return;
    }

    this.player.update(dt, this.input, this);
    this.updateWorld(dt);
    this.updateSpawning(dt);
    this.resolveCollisions();
    this.effects.update(dt);
  }

  updateWorld(dt) {
    for (const enemy of this.enemies) enemy.update(dt, this);
    this.enemies = this.enemies.filter((e) => !e.dead);

    if (this.boss) {
      this.boss.update(dt, this);
      if (this.boss.dead) this.boss = null;
    }

    for (const bullet of this.bullets) bullet.update(dt);
    this.bullets = this.bullets.filter(
      (b) => !b.dead && distance(b.x, b.y, this.player.x, this.player.y) < 1200,
    );

    for (const chute of this.parachutists) chute.update(dt);
    this.parachutists = this.parachutists.filter((p) => !p.dead);
  }

  updateSpawning(dt) {
    if (this.boss) return;

    this.spawnTimer -= dt;
    const era = this.era;
    const cap = Math.min(era.maxEnemies + cycleAt(this.eraIndex), 12);
    if (this.spawnTimer <= 0 && this.enemies.length < cap) {
      this.spawnTimer = randRange(...era.spawnInterval) / this.difficulty;
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

  killBoss(boss) {
    this.addScore(boss.score);
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
  hitPlayer() {
    const outcome = this.player.takeHit();
    if (outcome === 'ignored') return;
    if (outcome === 'damaged') {
      this.effects.burst(this.player.x, this.player.y, {
        count: 10, speed: 150, life: 0.4, size: 2.6, colors: ['#ff8f8f', '#ffd166', '#ffffff'],
      });
      this.effects.ring(this.player.x, this.player.y, { radius: 62, life: 0.35, color: '#ff8f8f' });
      this.sfx.hit();
      this.shake = Math.max(this.shake, 0.45);
      return;
    }
    this.destroyPlayer();
  }

  destroyPlayer() {
    this.effects.burst(this.player.x, this.player.y, {
      count: 30, speed: 240, life: 0.9, size: 4, colors: ['#7cf5ff', '#ffffff', '#ffd166'],
    });
    this.effects.ring(this.player.x, this.player.y, { radius: 150, life: 0.7, color: '#7cf5ff', width: 5 });
    this.sfx.bigExplosion();
    this.shake = 0.9;
    this.state = 'respawn';
    this.stateTimer = 1.9;
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
      } else if (this.player.alive && this.player.invulnerable <= 0 && circlesOverlap(bullet, this.player)) {
        bullet.dead = true;
        this.hitPlayer();
        if (!this.player.alive) return;
      }
    }

    if (!this.player.alive) return;

    for (const enemy of this.enemies) {
      if (!enemy.dead && circlesOverlap(enemy, this.player)) {
        this.killEnemy(enemy);
        this.hitPlayer();
        if (!this.player.alive) return;
      }
    }

    if (this.boss && circlesOverlap(this.boss, this.player)) {
      this.hitPlayer();
      if (!this.player.alive) return;
    }

    for (const chute of this.parachutists) {
      if (chute.dead || !circlesOverlap(chute, this.player)) continue;
      chute.dead = true;
      const bonus = RESCUE_BONUS[Math.min(this.rescueChain, RESCUE_BONUS.length - 1)];
      this.rescueChain += 1;
      this.addScore(bonus);
      this.effects.popup(chute.x, chute.y - 20, `+${bonus}`, '#ffd166');
      this.effects.ring(chute.x, chute.y, { radius: 60, color: '#ffd166' });
      this.sfx.rescue();
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
    for (const bullet of this.bullets) {
      if (bullet.team === 'enemy') bullet.draw(ctx, this.cam);
    }
    for (const enemy of this.enemies) enemy.draw(ctx, this.cam, this.time);
    if (this.boss) this.boss.draw(ctx, this.cam, this.time);
    this.player.drawLock(ctx, this.cam, this, this.time);
    this.player.draw(ctx, this.cam, this.time);
    for (const bullet of this.bullets) {
      if (bullet.team === 'player') bullet.draw(ctx, this.cam);
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
