import { angleDiff, distance, randRange, turnToward } from '../core/math.js';
import { drawEnemy } from '../render/sprites.js';

/**
 * Escort craft. They home in on the player but their turn rate is limited, so
 * they overshoot, sweep past and come back around — the dogfight loop that the
 * whole game is built on.
 */
export class Enemy {
  constructor({ x, y, angle, era, difficulty = 1, toughness = 1 }) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.era = era;
    this.kind = era.enemy;
    this.radius = 15;
    this.speed = era.enemySpeed * difficulty;
    this.turnRate = era.enemyTurn * difficulty;
    this.fireTimer = randRange(...era.fireInterval);
    this.rangeScale = difficulty;
    this.wobblePhase = randRange(0, Math.PI * 2);
    this.wobbleRate = randRange(1.2, 2.4);
    this.score = 300;
    // On the first lap an escort dies to one round, which is the arcade feel
    // the whole game was tuned around. Later laps add armour rather than
    // numbers: the sky stays readable and the fights get longer.
    this.maxHp = toughness;
    this.hp = toughness;
    this.hitFlash = 0;
    this.dead = false;
    this.isEscort = false;
  }

  /** Takes damage from gunfire. Returns true if that finished it. */
  hit(damage = 1) {
    this.hp -= damage;
    this.hitFlash = 0.09;
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }

  update(dt, game) {
    if (this.hitFlash > 0) this.hitFlash -= dt;
    const player = game.nearestPlayer(this.x, this.y);
    const toPlayer = Math.atan2(player.y - this.y, player.x - this.x);
    this.wobblePhase += this.wobbleRate * dt;
    // A stealth craft that is holding its fire cannot be found: escorts keep
    // whatever heading they were on and drift, rather than converging.
    const lost = player.hidden;
    const target = lost
      ? this.angle + Math.sin(this.wobblePhase) * 0.5
      : toPlayer + Math.sin(this.wobblePhase) * 0.28;
    this.angle = turnToward(this.angle, target, this.turnRate * dt);

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    this.fireTimer -= dt;
    const range = distance(this.x, this.y, player.x, player.y);
    const aimed = Math.abs(angleDiff(this.angle, toPlayer)) < 0.4;
    // Escorts only fire inside the reach of their own guns, which in the
    // opening eras is barely longer than the aircraft itself.
    const reach = this.era.bulletRange * this.rangeScale;
    if (this.fireTimer <= 0 && aimed && player.alive && !lost
        && range < reach * 1.05 && range > reach * 0.15) {
      this.fireTimer = randRange(...this.era.fireInterval);
      game.fireEnemyBullet(this.x, this.y, this.angle, this.era.bulletSpeed, reach);
    }

    // Anything that wanders far outside the play area is recycled.
    if (range > 1400) this.dead = true;
  }

  draw(ctx, cam, time) {
    const sx = this.x - cam.x + cam.width / 2;
    const sy = this.y - cam.y + cam.height / 2;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    ctx.scale(1.25, 1.25);
    drawEnemy(ctx, this.kind, this.era.colors, time + this.wobblePhase);
    if (this.hitFlash > 0) {
      // Same trick the player craft uses: the airframe painted over itself in
      // one flat colour, additively, so a hit that did not kill still reads.
      ctx.globalAlpha = Math.min(0.8, this.hitFlash * 8);
      ctx.globalCompositeOperation = 'lighter';
      drawEnemy(ctx, this.kind, {
        body: '#ff6b6b', wing: '#ff6b6b', wingAlt: '#ff6b6b',
        glass: '#ff6b6b', accent: '#ff6b6b',
      }, time + this.wobblePhase);
    }
    ctx.restore();
  }
}
