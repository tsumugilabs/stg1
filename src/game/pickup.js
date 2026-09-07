import { MODULES } from './gear.js';

/** A module canister shaken loose by a kill. Fly into it to fit it. */
export class ModulePickup {
  constructor(x, y, moduleId) {
    this.x = x;
    this.y = y;
    this.moduleId = moduleId;
    this.radius = 17;
    this.drift = (Math.random() - 0.5) * 26;
    this.fall = 16 + Math.random() * 10;
    this.life = 16;
    this.phase = Math.random() * Math.PI * 2;
    this.dead = false;
  }

  update(dt) {
    this.phase += dt;
    this.x += (this.drift + Math.sin(this.phase * 1.7) * 14) * dt;
    this.y += this.fall * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  /** Blinks out its last three seconds so a miss is never a surprise. */
  get visible() {
    return this.life > 3 || Math.floor(this.life * 8) % 2 === 0;
  }

  draw(ctx, cam) {
    if (!this.visible) return;
    const module = MODULES[this.moduleId];
    const sx = this.x - cam.x + cam.width / 2;
    const sy = this.y - cam.y + cam.height / 2;
    const bob = Math.sin(this.phase * 3) * 2;

    ctx.save();
    ctx.translate(sx, sy + bob);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = module.color;
    ctx.beginPath();
    ctx.arc(0, 0, 15 + Math.sin(this.phase * 4) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.rotate(Math.sin(this.phase * 1.4) * 0.25);
    ctx.fillStyle = '#0b1622';
    ctx.strokeStyle = module.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(9, -5);
    ctx.lineTo(9, 5);
    ctx.lineTo(0, 10);
    ctx.lineTo(-9, 5);
    ctx.lineTo(-9, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = module.color;
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(module.name.slice(0, 2), 0, 0);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}
