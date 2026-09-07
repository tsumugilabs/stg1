import { angleDiff, distance, randRange, turnToward } from '../core/math.js';
import { drawBossCraft } from '../render/sprites.js';

/**
 * The era flagship. It appears once enough escorts have been shot down and has
 * to be destroyed to jump to the next era.
 */
export class Boss {
  constructor({ x, y, angle, era, difficulty = 1 }) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.era = era;
    this.kind = era.boss;
    this.radius = 48;
    this.speed = era.bossSpeed * Math.min(difficulty, 1.5);
    this.turnRate = era.bossTurn * Math.min(difficulty, 1.6);
    this.maxHp = Math.round(era.bossHp * difficulty);
    this.hp = this.maxHp;
    this.fireTimer = era.bossFire[1];
    // A flagship's guns reach far further than an escort's, so the opening
    // eras still have something that can shoot back.
    this.range = era.bossRange * Math.min(difficulty, 1.5);
    this.escortTimer = era.bossEscorts ? era.bossEscorts[0] : Infinity;
    this.hitFlash = 0;
    this.score = 5000;
    this.dead = false;
  }

  hit(damage = 1) {
    this.hp -= damage;
    this.hitFlash = 0.09;
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }

  update(dt, game) {
    const player = game.player;
    const toPlayer = Math.atan2(player.y - this.y, player.x - this.x);
    this.angle = turnToward(this.angle, toPlayer, this.turnRate * dt);
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    if (this.hitFlash > 0) this.hitFlash -= dt;

    this.fireTimer -= dt;
    const range = distance(this.x, this.y, player.x, player.y);
    if (this.fireTimer <= 0 && player.alive && range < this.range * 1.05) {
      this.fireTimer = randRange(...this.era.bossFire);
      const aim = Math.abs(angleDiff(this.angle, toPlayer)) < 1.0 ? this.angle : toPlayer;
      const offsets = this.era.bossShots > 1 ? [-0.22, 0, 0.22] : [0];
      for (const offset of offsets) {
        game.fireEnemyBullet(this.x, this.y, aim + offset, this.era.bulletSpeed * 0.95, this.range);
      }
    }

    if (this.era.bossEscorts) {
      this.escortTimer -= dt;
      if (this.escortTimer <= 0) {
        this.escortTimer = randRange(...this.era.bossEscorts);
        game.spawnEscorts(2);
      }
    }
  }

  draw(ctx, cam, time) {
    const sx = this.x - cam.x + cam.width / 2;
    const sy = this.y - cam.y + cam.height / 2;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    ctx.scale(1.1, 1.1);
    drawBossCraft(ctx, this.kind, this.era.bossColors, time);
    if (this.hitFlash > 0) {
      ctx.globalAlpha = 0.5;
      ctx.globalCompositeOperation = 'lighter';
      drawBossCraft(ctx, this.kind, {
        body: '#ffffff', wing: '#ffffff', wingAlt: '#ffffff', glass: '#ffffff', rotor: '#ffffff',
      }, time);
    }
    ctx.restore();
  }
}
