import { drawParachutist } from '../render/sprites.js';

/** Bail-out pilots. Fly into one to rescue it for an escalating bonus. */
export class Parachutist {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 16;
    this.drift = (Math.random() - 0.5) * 22;
    this.fall = 26 + Math.random() * 12;
    this.life = 14;
    this.phase = Math.random() * Math.PI * 2;
    this.dead = false;
  }

  update(dt) {
    this.phase += dt;
    this.x += (this.drift + Math.sin(this.phase * 1.5) * 12) * dt;
    this.y += this.fall * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  get visible() {
    return this.life > 3 || Math.floor(this.life * 8) % 2 === 0;
  }

  draw(ctx, cam) {
    if (!this.visible) return;
    const sx = this.x - cam.x + cam.width / 2;
    const sy = this.y - cam.y + cam.height / 2;
    ctx.save();
    ctx.translate(sx, sy);
    drawParachutist(ctx, this.phase);
    ctx.restore();
  }
}
