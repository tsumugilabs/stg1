import { angleDiff, distance, randRange, turnToward } from '../core/math.js';
import { drawEnemy } from '../render/sprites.js';

/**
 * Escort craft. They home in on the player but their turn rate is limited, so
 * they overshoot, sweep past and come back around — the dogfight loop that the
 * whole game is built on.
 */
export class Enemy {
  constructor({ x, y, angle, era, difficulty = 1 }) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.era = era;
    this.kind = era.enemy;
    this.radius = 15;
    this.speed = era.enemySpeed * difficulty;
    this.turnRate = era.enemyTurn * difficulty;
    this.fireTimer = randRange(...era.fireInterval);
    this.wobblePhase = randRange(0, Math.PI * 2);
    this.wobbleRate = randRange(1.2, 2.4);
    this.score = 300;
    this.dead = false;
    this.isEscort = false;
  }

  update(dt, game) {
    const player = game.player;
    const toPlayer = Math.atan2(player.y - this.y, player.x - this.x);
    this.wobblePhase += this.wobbleRate * dt;
    const target = toPlayer + Math.sin(this.wobblePhase) * 0.28;
    this.angle = turnToward(this.angle, target, this.turnRate * dt);

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    this.fireTimer -= dt;
    const range = distance(this.x, this.y, player.x, player.y);
    const aimed = Math.abs(angleDiff(this.angle, toPlayer)) < 0.4;
    if (this.fireTimer <= 0 && aimed && range < 520 && player.alive) {
      this.fireTimer = randRange(...this.era.fireInterval);
      game.fireEnemyBullet(this.x, this.y, this.angle, this.era.bulletSpeed);
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
    ctx.restore();
  }
}
