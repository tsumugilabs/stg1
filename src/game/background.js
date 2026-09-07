import { hash2 } from '../core/math.js';

/**
 * Endless parallax scenery. Nothing is stored: each parallax layer is a grid of
 * cells and a deterministic hash decides what sits in every cell, so the world
 * is infinite in all directions and stable when you fly back over it.
 */

const LAYERS = [
  { factor: 0.30, cell: 460, seed: 11, scale: 1.55, alpha: 0.30 },
  { factor: 0.55, cell: 350, seed: 27, scale: 1.10, alpha: 0.55 },
  { factor: 0.82, cell: 260, seed: 43, scale: 0.75, alpha: 0.85 },
];

function puff(ctx, x, y, size, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.arc(x + size * 0.85, y + size * 0.18, size * 0.72, 0, Math.PI * 2);
  ctx.arc(x - size * 0.8, y + size * 0.24, size * 0.62, 0, Math.PI * 2);
  ctx.arc(x + size * 0.1, y - size * 0.55, size * 0.66, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

const SCENERY = {
  clouds(ctx, x, y, size, alpha) {
    puff(ctx, x, y, size, '#ffffff', alpha * 0.9);
  },
  stormclouds(ctx, x, y, size, alpha) {
    puff(ctx, x, y, size * 1.15, '#3a4757', alpha);
    puff(ctx, x - size * 0.2, y - size * 0.35, size * 0.7, '#8b98a8', alpha * 0.7);
  },
  highclouds(ctx, x, y, size, alpha) {
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#eaf4ff';
    ctx.beginPath();
    ctx.ellipse(x, y, size * 2.1, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
  city(ctx, x, y, size, alpha, rand) {
    const w = size * 1.5;
    const h = size * 2.6;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#1b2434';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = '#2b374d';
    ctx.fillRect(x - w / 2, y - h / 2, w, h * 0.12);
    ctx.fillStyle = '#ffd98a';
    const cols = Math.max(2, Math.floor(w / 9));
    const rows = Math.max(3, Math.floor(h / 12));
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        if (hash2(cx + Math.round(x), cy + Math.round(y), rand) > 0.62) {
          ctx.fillRect(x - w / 2 + 3 + cx * 9, y - h / 2 + 6 + cy * 12, 4, 6);
        }
      }
    }
    ctx.globalAlpha = 1;
  },
  stars(ctx, x, y, size, alpha, rand) {
    if (rand > 0.965) {
      ctx.globalAlpha = alpha * 0.22;
      ctx.fillStyle = rand > 0.985 ? '#7a4bb8' : '#2a4d8f';
      ctx.beginPath();
      ctx.arc(x, y, size * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = alpha * (0.5 + rand * 0.5);
    ctx.fillStyle = rand > 0.8 ? '#ffe9b0' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 0.7 + rand * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
};

const DENSITY = {
  clouds: 0.55, stormclouds: 0.6, highclouds: 0.5, city: 0.7, stars: 0.95,
};

export class Background {
  constructor() {
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
  }

  draw(ctx, cam) {
    const { width: w, height: h } = ctx.canvas;
    const era = cam.era;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, era.sky[0]);
    sky.addColorStop(1, era.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const draw = SCENERY[era.scenery] || SCENERY.clouds;
    const density = DENSITY[era.scenery] ?? 0.55;

    for (const layer of LAYERS) {
      const ox = cam.x * layer.factor - w / 2;
      const oy = cam.y * layer.factor - h / 2;
      const first = Math.floor(ox / layer.cell) - 1;
      const last = Math.ceil((ox + w) / layer.cell) + 1;
      const top = Math.floor(oy / layer.cell) - 1;
      const bottom = Math.ceil((oy + h) / layer.cell) + 1;

      for (let ix = first; ix <= last; ix += 1) {
        for (let iy = top; iy <= bottom; iy += 1) {
          const roll = hash2(ix, iy, layer.seed);
          if (roll > density) continue;
          const px = ix * layer.cell + hash2(ix, iy, layer.seed + 1) * layer.cell;
          const py = iy * layer.cell + hash2(ix, iy, layer.seed + 2) * layer.cell;
          const size = (16 + hash2(ix, iy, layer.seed + 3) * 26) * layer.scale;
          draw(ctx, px - ox, py - oy, size, layer.alpha, hash2(ix, iy, layer.seed + 4));
        }
      }
    }
  }
}
