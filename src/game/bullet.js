import { turnToward } from '../core/math.js';

export class Bullet {
  constructor({
    x, y, angle, speed, life, team, color, radius = 3, damage = 1, pierce = 0,
    homing = null,
  }) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.angle = angle;
    this.life = life;
    this.team = team;
    this.color = color;
    this.radius = radius;
    this.damage = damage;
    this.pierce = pierce;
    // { turnRate, target } turns this into a missile: it steers, and it picks
    // a new mark when the one it was chasing goes down.
    this.homing = homing;
    this.speed = speed;
    this.dead = false;
  }

  update(dt, game) {
    if (this.homing && game) this.steer(dt, game);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  steer(dt, game) {
    let target = this.homing.target;
    const stillThere = target && !target.dead
      && (target === game.boss || game.enemies.includes(target));
    if (!stillThere) {
      target = game.nearestTarget(this.x, this.y, 900);
      this.homing.target = target;
    }
    if (!target) return;
    const toTarget = Math.atan2(target.y - this.y, target.x - this.x);
    this.angle = turnToward(this.angle, toTarget, this.homing.turnRate * dt);
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
  }

  draw(ctx, cam) {
    const sx = this.x - cam.x + cam.width / 2;
    const sy = this.y - cam.y + cam.height / 2;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius * (this.homing ? 2.8 : 2.1), this.radius, 0, 0, Math.PI * 2);
    ctx.fill();
    if (this.homing) {
      // A missile shows its fins, so it is not mistaken for a bullet.
      ctx.beginPath();
      ctx.moveTo(-this.radius * 2.4, -this.radius * 1.8);
      ctx.lineTo(-this.radius * 0.6, 0);
      ctx.lineTo(-this.radius * 2.4, this.radius * 1.8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(-this.radius * 2.4, 0, this.radius * 2.2, this.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
