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

/**
 * Whether one window of one building is lit. Depends only on the building's
 * grid cell and the window's position within it, so a tower looks the same
 * every frame however the camera moves past it.
 */
export function litWindow(ix, iy, column, row) {
  return hash2(ix * 73856093 + column, iy * 19349663 + row, 91) > 0.62;
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
  city(ctx, x, y, size, alpha, rand, ix, iy) {
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
        // Which windows are lit must come from the building's own cell, never
        // from where it happens to sit on screen: screen coordinates change
        // every frame as the camera moves, and the lights flicker.
        if (litWindow(ix, iy, cx, cy)) {
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

/** A coherent top-down city, all on one ground plane below the aircraft. */
function drawNightDistrict(ctx, ix, iy, x, y, cell) {
  const district = hash2(ix, iy, 101);
  // Continuous streets across cell boundaries. Lights are quiet, thin dashes,
  // distinct from the bright, round projectiles above them.
  ctx.fillStyle = '#111e30';
  ctx.fillRect(x, y, cell, 15);
  ctx.fillRect(x, y, 15, cell);
  ctx.fillStyle = '#1a2a3d';
  ctx.fillRect(x + 19, y + 19, cell - 23, 1);
  ctx.fillRect(x + 19, y + 19, 1, cell - 23);
  ctx.fillStyle = '#48504b';
  for (let i = 28; i < cell; i += 46) {
    ctx.fillRect(x + i, y + 6, 8, 0.8);
    ctx.fillRect(x + 6, y + i, 0.8, 8);
  }
  if (district > 0.87) {
    // Dark park blocks give the city breathing room.
    ctx.fillStyle = '#0d222b';
    ctx.fillRect(x + 30, y + 30, cell - 49, cell - 49);
    ctx.strokeStyle = '#21313a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 40, y + 40, cell - 69, cell - 69);
    return;
  }
  for (let bx = 0; bx < 2; bx += 1) {
    for (let by = 0; by < 2; by += 1) {
      const keyX = ix * 2 + bx, keyY = iy * 2 + by;
      const roll = hash2(keyX, keyY, 109);
      const left = x + 29 + bx * 96, top = y + 29 + by * 96;
      const bw = 46 + roll * 32;
      const bh = 42 + hash2(keyX, keyY, 113) * 35;
      const depth = 4 + roll * 7;
      ctx.fillStyle = '#08121f';
      ctx.fillRect(left + depth, top + depth, bw, bh);
      ctx.fillStyle = roll > 0.6 ? '#1e3041' : '#192b3b';
      ctx.fillRect(left, top, bw, bh);
      ctx.strokeStyle = '#304354';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(left + 1.5, top + 1.5, bw - 3, bh - 3);
      ctx.fillStyle = '#142332';
      ctx.fillRect(left + 8, top + 8, bw - 16, bh - 16);
      // Recessed plant rooms and lift cores read as rooftops, not upright
      // facades floating in the sky. Window occupancy is world-anchored.
      ctx.fillStyle = '#243747';
      ctx.fillRect(left + 12, top + 13, bw * 0.26, bh * 0.3);
      ctx.fillStyle = '#344553';
      ctx.fillRect(left + 12, top + 13, bw * 0.26, 1);
      if (roll > 0.55) {
        ctx.strokeStyle = '#293e4c';
        ctx.strokeRect(left + bw * 0.51, top + 12, bw * 0.27, bh * 0.58);
        ctx.fillStyle = '#304755';
        for (let vent = 0; vent < 3; vent += 1) ctx.fillRect(left + bw * 0.55, top + 17 + vent * 7, bw * 0.18, 1);
      }
      for (let col = 0; col < 6; col += 1) {
        ctx.fillStyle = col % 3 === 0 ? '#99845b' : '#576f7a';
        if (litWindow(keyX, keyY, col, 0)) ctx.fillRect(left + 6 + col * (bw - 12) / 6, top + bh - 2, 3, 1.1);
        if (litWindow(keyX, keyY, col, 1)) ctx.fillRect(left + bw - 2, top + 6 + col * (bh - 12) / 6, 1.1, 3);
      }
    }
  }
}

function drawNightCity(ctx, cam, w, h) {
  const wash = ctx.createLinearGradient(0, 0, w, h);
  wash.addColorStop(0, '#071321');
  wash.addColorStop(1, '#162b3c');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  const cell = 228;
  const ox = cam.x * 0.32 - w / 2, oy = cam.y * 0.32 - h / 2;
  for (let ix = Math.floor(ox / cell); ix <= Math.ceil((ox + w) / cell); ix += 1) {
    for (let iy = Math.floor(oy / cell); iy <= Math.ceil((oy + h) / cell); iy += 1) {
      drawNightDistrict(ctx, ix, iy, ix * cell - ox, iy * cell - oy, cell);
    }
  }
  const haze = ctx.createLinearGradient(0, 0, 0, h);
  haze.addColorStop(0, 'rgba(6,17,32,0.55)');
  haze.addColorStop(0.55, 'rgba(17,35,52,0.08)');
  haze.addColorStop(1, 'rgba(31,51,69,0.3)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);
}

const ORBIT_STAR_LAYERS = [
  { factor: 0.08, cell: 86, seed: 151, alpha: 0.28 },
  { factor: 0.18, cell: 145, seed: 163, alpha: 0.48 },
  { factor: 0.32, cell: 230, seed: 179, alpha: 0.68 },
];

function drawDeepOrbit(ctx, cam, w, h) {
  ctx.fillStyle = '#060d1b';
  ctx.fillRect(0, 0, w, h);
  // Large, feathered gas clouds instead of opaque circles. Each nebula is
  // world-anchored; the padded grid includes its full footprint at any size.
  const cell = 1100;
  const ox = cam.x * 0.045 - w / 2, oy = cam.y * 0.045 - h / 2;
  for (let ix = Math.floor(ox / cell) - 1; ix <= Math.ceil((ox + w) / cell) + 1; ix += 1) {
    for (let iy = Math.floor(oy / cell) - 1; iy <= Math.ceil((oy + h) / cell) + 1; iy += 1) {
      const roll = hash2(ix, iy, 191);
      const x = (ix + 0.2 + hash2(ix, iy, 193) * 0.6) * cell - ox;
      const y = (iy + 0.2 + hash2(ix, iy, 197) * 0.6) * cell - oy;
      const radius = 700 + roll * 240;
      if (x + radius < 0 || x - radius > w || y + radius < 0 || y - radius > h) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.35 + roll * 0.6);
      ctx.scale(1, 0.62);
      const mist = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      const tint = roll > 0.5 ? '63,63,116' : '31,87,115';
      mist.addColorStop(0, `rgba(${tint},0.38)`);
      mist.addColorStop(0.4, `rgba(${tint},0.2)`);
      mist.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = mist;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    }
  }
  for (const layer of ORBIT_STAR_LAYERS) {
    const sx = cam.x * layer.factor - w / 2, sy = cam.y * layer.factor - h / 2;
    for (let ix = Math.floor(sx / layer.cell) - 1; ix <= Math.ceil((sx + w) / layer.cell); ix += 1) {
      for (let iy = Math.floor(sy / layer.cell) - 1; iy <= Math.ceil((sy + h) / layer.cell); iy += 1) {
        const roll = hash2(ix, iy, layer.seed);
        const x = ix * layer.cell + hash2(ix, iy, layer.seed + 1) * layer.cell - sx;
        const y = iy * layer.cell + hash2(ix, iy, layer.seed + 2) * layer.cell - sy;
        const size = roll > 0.96 ? 1.25 : 0.45 + roll * 0.45;
        ctx.globalAlpha = layer.alpha * (0.5 + roll * 0.5);
        ctx.fillStyle = roll > 0.86 ? '#e1d6b9' : '#b5cddd';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        if (roll > 0.985) {
          ctx.globalAlpha = layer.alpha * 0.2;
          ctx.fillRect(x - 3.5, y - 0.4, 7, 0.8);
          ctx.fillRect(x - 0.4, y - 3.5, 0.8, 7);
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}

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

    // Keep the other three era paths byte-for-byte unchanged below.
    if (era.scenery === 'city' || era.scenery === 'stars') {
      ctx.save();
      if (era.scenery === 'city') drawNightCity(ctx, cam, w, h);
      else drawDeepOrbit(ctx, cam, w, h);
      ctx.restore();
      return;
    }

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
          draw(ctx, px - ox, py - oy, size, layer.alpha, hash2(ix, iy, layer.seed + 4), ix, iy);
        }
      }
    }
  }
}
