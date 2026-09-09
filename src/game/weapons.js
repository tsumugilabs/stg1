import { projectOnSegment, TAU } from '../core/math.js';

/**
 * A flare, ejected on a timer, that burns any enemy round that comes near it.
 * It is a decoy in fiction and an interceptor in practice.
 */
export class Flare {
  constructor(x, y, { radius, life }) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.life = life;
    this.maxLife = life;
    this.drift = (Math.random() - 0.5) * 40;
    this.fall = 18 + Math.random() * 14;
    this.phase = Math.random() * TAU;
    this.dead = false;
  }

  update(dt) {
    this.phase += dt * 9;
    this.x += this.drift * dt;
    this.y += this.fall * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx, cam) {
    const sx = this.x - cam.x + cam.width / 2;
    const sy = this.y - cam.y + cam.height / 2;
    const fade = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.globalAlpha = fade * 0.22;
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = fade;
    const flicker = 3.4 + Math.sin(this.phase) * 1.4;
    ctx.fillStyle = '#fff6c9';
    ctx.beginPath();
    ctx.arc(0, 0, flicker, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i += 1) {
      const a = this.phase * 0.4 + (i / 4) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
      ctx.lineTo(Math.cos(a) * (10 + Math.sin(this.phase + i) * 3), Math.sin(a) * (10 + Math.sin(this.phase + i) * 3));
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/** Shortest distance from a point to the segment a->b. */
export function distanceToSegment(px, py, ax, ay, bx, by) {
  const t = projectOnSegment(px, py, ax, ay, bx, by);
  return Math.hypot(px - (ax + (bx - ax) * t), py - (ay + (by - ay) * t));
}

/** Where the beam ends: always past the edge of the view, whichever way it points. */
export function beamEnd(player, cam) {
  const reach = Math.hypot(cam.width, cam.height) / 2 + 40;
  return {
    x: player.x + Math.cos(player.angle) * reach,
    y: player.y + Math.sin(player.angle) * reach,
  };
}

export function drawBeam(ctx, player, cam, { width, strength }) {
  const end = beamEnd(player, cam);
  const ox = cam.width / 2 - cam.x;
  const oy = cam.height / 2 - cam.y;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  const layers = [
    { w: width * 2.6, color: 'rgba(255,107,214,0.22)' },
    { w: width * 1.3, color: 'rgba(255,150,230,0.55)' },
    { w: width * 0.45, color: 'rgba(255,255,255,0.95)' },
  ];
  for (const layer of layers) {
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = layer.w * strength;
    ctx.beginPath();
    ctx.moveTo(player.x + ox, player.y + oy);
    ctx.lineTo(end.x + ox, end.y + oy);
    ctx.stroke();
  }
  ctx.restore();
}
