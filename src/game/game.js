import { circlesOverlap, distance, randRange, TAU } from '../core/math.js';
import { Background } from './background.js';
import { Boss } from './boss.js';
import { Bullet } from './bullet.js';
import { Effects } from './effects.js';
import { Enemy } from './enemy.js';
import { Parachutist } from './parachutist.js';
import { Player } from './player.js';
import { drawHud } from './hud.js';
import { cycleAt, difficultyAt, eraAt, ERAS } from './levels.js';

const HIGH_SCORE_KEY = 'chronopilot.highscore';
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
    this.score = 0;
    this.lives = 3;
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

  firePlayerBullet(x, y, angle) {
    this.bullets.push(new Bullet({
      x, y, angle, speed: 520, life: 0.82, team: 'player', color: '#fff3c4', radius: 3,
    }));
    this.sfx.playerShot();
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

    if (this.input.wasPressed('mute')) this.muted = this.sfx.toggleMute();

    switch (this.state) {
      case 'title': this.updateTitle(dt); break;
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
    if (this.input.wantsStart()) this.startNewGame();
  }

  updatePaused() {
    if (this.input.wasPressed('pause')) this.state = 'playing';
  }

  updateGameOver(dt) {
    this.effects.update(dt);
    this.stateTimer -= dt;
    if (this.stateTimer <= 0 && this.input.wantsStart()) {
      this.resetRun();
      this.state = 'title';
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
    const cap = Math.min(era.maxEnemies + cycleAt(this.eraIndex), 8);
    if (this.spawnTimer <= 0 && this.enemies.length < cap) {
      this.spawnTimer = randRange(...era.spawnInterval) / this.difficulty;
      this.spawnSquadron(Math.random() < era.squadronChance ? 2 : 1);
    }

    if (this.kills >= this.quota) this.spawnBoss();
  }

  killEnemy(enemy) {
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
  }

  killPlayer() {
    if (!this.player.alive || this.player.invulnerable > 0) return;
    this.player.alive = false;
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
          bullet.dead = true;
          this.killEnemy(enemy);
          break;
        }
        if (!bullet.dead && this.boss && circlesOverlap(bullet, this.boss)) {
          bullet.dead = true;
          this.effects.burst(bullet.x, bullet.y, { count: 5, speed: 90, life: 0.3, size: 2 });
          this.sfx.hit();
          if (this.boss.hit()) this.killBoss(this.boss);
        }
      } else if (this.player.alive && this.player.invulnerable <= 0 && circlesOverlap(bullet, this.player)) {
        bullet.dead = true;
        this.killPlayer();
        return;
      }
    }

    if (!this.player.alive) return;

    for (const enemy of this.enemies) {
      if (!enemy.dead && circlesOverlap(enemy, this.player)) {
        this.killEnemy(enemy);
        this.killPlayer();
        return;
      }
    }

    if (this.boss && circlesOverlap(this.boss, this.player)) {
      this.killPlayer();
      return;
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
