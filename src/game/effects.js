import { randRange, TAU } from '../core/math.js';

/** Particles, shockwave rings and floating score popups. */
export class Effects {
  constructor() {
    this.particles = [];
    this.rings = [];
    this.popups = [];
  }

  clear() {
    this.particles.length = 0;
    this.rings.length = 0;
    this.popups.length = 0;
  }

  burst(x, y, { count = 18, speed = 190, life = 0.6, colors = ['#ffd166', '#ff7b3c', '#fff3c4'], size = 3 } = {}) {
    for (let i = 0; i < count; i += 1) {
      const angle = randRange(0, TAU);
      const velocity = randRange(speed * 0.25, speed);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: randRange(life * 0.5, life),
        maxLife: life,
        size: randRange(size * 0.6, size * 1.6),
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  ring(x, y, { radius = 70, life = 0.45, color = '#ffe9b0', width = 3 } = {}) {
    this.rings.push({ x, y, radius, life, maxLife: life, color, width });
  }

  popup(x, y, text, color = '#ffe9b0') {
    this.popups.push({ x, y, text, color, life: 1.0, maxLife: 1.0 });
  }

  update(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);

    for (const t of this.popups) {
      t.y -= 26 * dt;
      t.life -= dt;
    }
    this.popups = this.popups.filter((t) => t.life > 0);
  }

  draw(ctx, cam) {
    const ox = cam.width / 2 - cam.x;
    const oy = cam.height / 2 - cam.y;

    for (const r of this.rings) {
      const t = 1 - r.life / r.maxLife;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x + ox, r.y + oy, r.radius * t, 0, TAU);
      ctx.stroke();
    }

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x + ox, p.y + oy, p.size, 0, TAU);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'center';
    for (const t of this.popups) {
      ctx.globalAlpha = Math.min(1, t.life / t.maxLife * 1.6);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x + ox, t.y + oy);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}
