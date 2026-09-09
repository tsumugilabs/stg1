import { clamp, distance, hash2, lerp, projectOnSegment, TAU } from '../core/math.js';

/**
 * A canyon: a run of solid ground with a navigable slot cut through it.
 *
 * Everything else in this game is circles in an empty sky, so this is the
 * first piece of terrain the world has ever had, and it is deliberately the
 * cheapest shape that can carry the idea. The canyon is a centreline polyline
 * with a half-width at every node; a point is inside the canyon when its
 * distance to that polyline is less than the half-width interpolated along it.
 * Collision and drawing read the same handful of numbers, so what you can see
 * and what you can hit cannot drift apart.
 *
 * Being generated from a seed rather than authored means it costs nothing on
 * the wire: a guest builds the identical canyon from the same seed and the
 * host never has to send a single wall.
 */

/** Spacing between centreline nodes. */
const NODE_STEP = 330;
/**
 * How far the run may swing between two nodes. Corners tighter than this fold
 * the offset outline over itself — and flying the thing says the bends are not
 * where the difficulty lives anyway. A craft turns inside 50px at cruise, so
 * every slot below is far wider than its turning circle; what a pilot actually
 * fights is the width. Trebling this limit changed nothing a stopwatch could
 * see, while taking 65px off the width took a clean run down to a scrape a
 * second. Width is the dial. This is a guard rail.
 */
const TURN_LIMIT = 0.60;
/** How hard the run is pulled back onto its overall heading. Without this the
 *  canyon coils back on itself instead of going somewhere. */
const HEADING_PULL = 0.22;
/**
 * The default slot, 200 to 280px across. A pilot reacting in 200ms flies it
 * end to end without touching rock and with 8 to 36px to spare, which is the
 * setting worth having: clean while you are only flying, and unforgiving the
 * moment something makes you break line. 265px was a road nothing could touch
 * the walls of; 150px scraped even with nobody shooting.
 */
const HALF_MIN = 100;
const HALF_MAX = 140;
/** The mouth and the chamber at the far end are both wider than the run. */
const MOUTH_HALF = 240;
const CHAMBER_HALF = 340;

/** About seven thousand pixels of canyon, or forty seconds at cruise. */
export const CORRIDOR_NODES = 22;

/*
 * Sunlit plateau above, shaded floor below, and a bright catch along the lip
 * so the edge reads before you are on it. The floor started near black, which
 * looked like a canyon and hid the craft in it completely: a pale airframe on
 * near-black rock is invisible at the size it actually flies. The floor is now
 * light enough to fly against, and the canyon still reads as a canyon because
 * the plateau above it went brighter by more.
 */
const ROCK_BASE = '#8a6f4e';
const ROCK_LIT = '#a2855f';
const ROCK_DARK = '#6d573c';
const RIM = '#e0c496';
const FLOOR = '#4a3a30';
const FLOOR_LIT = '#5b4738';

/** Deterministic 0..1 for node `i` of stream `channel`. */
function wobble(seed, channel, i) {
  return hash2(i, channel, seed);
}

export class Corridor {
  /**
   * `half` and `turnLimit` are the two dials that decide how hard the run is
   * to fly, and they are per-canyon rather than global: a first canyon and a
   * last canyon want the same code and different numbers.
   */
  constructor({
    seed = 1, x = 0, y = 0, heading = 0, nodes = CORRIDOR_NODES,
    half: [halfMin, halfMax] = [HALF_MIN, HALF_MAX], turnLimit = TURN_LIMIT,
  } = {}) {
    this.seed = seed;
    this.heading = heading;
    this.nodes = [];

    let px = x;
    let py = y;
    let dir = heading;
    for (let i = 0; i < nodes; i += 1) {
      const last = i === nodes - 1;
      let half = lerp(halfMin, halfMax, wobble(seed, 3, i));
      if (i === 0) half = MOUTH_HALF;
      if (last) half = CHAMBER_HALF;
      // Ease into the mouth and out into the chamber rather than stepping.
      if (i === 1) half = (half + MOUTH_HALF) / 2;
      if (i === nodes - 2) half = (half + CHAMBER_HALF) / 2;
      this.nodes.push({ x: px, y: py, half, s: 0 });
      const swing = (wobble(seed, 7, i) - 0.5) * 2 * turnLimit;
      dir += swing - (dir - heading) * HEADING_PULL;
      px += Math.cos(dir) * NODE_STEP;
      py += Math.sin(dir) * NODE_STEP;
    }

    this.length = 0;
    for (let i = 1; i < this.nodes.length; i += 1) {
      const a = this.nodes[i - 1];
      const b = this.nodes[i];
      this.length += distance(a.x, a.y, b.x, b.y);
      b.s = this.length;
    }

    this.buildOutline();
    const end = this.nodes[this.nodes.length - 1];
    this.goal = { x: end.x, y: end.y, radius: 40 };
  }

  get entry() {
    const first = this.nodes[0];
    const next = this.nodes[1] ?? first;
    return { x: first.x, y: first.y, angle: Math.atan2(next.y - first.y, next.x - first.x) };
  }

  /**
   * The two rock faces, as point lists. Each node is pushed out along the
   * normal of its averaged direction; corners are gentle enough (TURN_LIMIT)
   * that the mitre correction would be under three percent, so it is left out.
   */
  buildOutline() {
    this.left = [];
    this.right = [];
    for (let i = 0; i < this.nodes.length; i += 1) {
      const node = this.nodes[i];
      const before = this.nodes[Math.max(0, i - 1)];
      const after = this.nodes[Math.min(this.nodes.length - 1, i + 1)];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      this.left.push({ x: node.x + nx * node.half, y: node.y + ny * node.half });
      this.right.push({ x: node.x - nx * node.half, y: node.y - ny * node.half });
    }
  }

  /**
   * Where a point sits relative to the canyon: the nearest point on the
   * centreline, how far away it is, the half-width there, and how far along
   * the run it is. One pass over thirty segments, which at a handful of
   * queries a frame is not worth indexing.
   */
  locate(x, y) {
    let best = null;
    for (let i = 1; i < this.nodes.length; i += 1) {
      const a = this.nodes[i - 1];
      const b = this.nodes[i];
      const t = projectOnSegment(x, y, a.x, a.y, b.x, b.y);
      const cx = a.x + (b.x - a.x) * t;
      const cy = a.y + (b.y - a.y) * t;
      const d = distance(x, y, cx, cy);
      if (best && d >= best.distance) continue;
      best = {
        distance: d,
        x: cx,
        y: cy,
        half: lerp(a.half, b.half, t),
        s: a.s + (b.s - a.s) * t,
      };
    }
    return best;
  }

  /**
   * The point a given distance along the run, with the width and the heading
   * there. Anything that has to be placed relative to the canyon rather than
   * relative to a player — a turret on a face, the chamber at the end, a
   * lead point for a craft following the slot — asks for it this way.
   */
  pointAt(s) {
    const want = clamp(s, 0, this.length);
    let i = 1;
    while (i < this.nodes.length - 1 && this.nodes[i].s < want) i += 1;
    const a = this.nodes[i - 1];
    const b = this.nodes[i];
    const span = b.s - a.s || 1;
    const t = clamp((want - a.s) / span, 0, 1);
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      half: lerp(a.half, b.half, t),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  /** How much room is left before the rock, negative once inside it. */
  clearance(x, y, radius = 0) {
    const spot = this.locate(x, y);
    return spot.half - radius - spot.distance;
  }

  /** Fraction of the run completed, 0 at the mouth and 1 in the chamber. */
  progress(x, y) {
    return clamp(this.locate(x, y).s / this.length, 0, 1);
  }

  /**
   * Put a craft back inside the rock face it has run into, moving it the
   * shortest way out. Only the part of the movement that went into the wall is
   * taken back, so a craft held against the rock slides along it rather than
   * stopping dead. Returns how deep it was, which is zero when it is clear.
   */
  confine(thing, radius = thing.radius ?? 0) {
    const spot = this.locate(thing.x, thing.y);
    const room = spot.half - radius;
    if (spot.distance <= room) return 0;
    const depth = spot.distance - room;
    if (spot.distance < 1e-6) return depth;
    const nx = (thing.x - spot.x) / spot.distance;
    const ny = (thing.y - spot.y) / spot.distance;
    thing.x -= nx * depth;
    thing.y -= ny * depth;
    return depth;
  }

  // --- drawing -------------------------------------------------------------

  /**
   * The canyon as a closed path, in screen coordinates.
   *
   * Both ends are round, because that is what the collision actually is: past
   * the last node every point is measured against that node alone, so the
   * chamber is a disc. Drawn flat it came out as a wedge that the craft could
   * fly straight out of.
   *
   * Along the run the offset outline cuts the corner where the real boundary
   * curves around a node — by at most six pixels in a two-hundred-pixel slot,
   * and always in the direction of drawing rock where there is still room. A
   * wall you can nick without being told off is the forgiving way round; the
   * other way would be a scrape from clear air.
   */
  screenPath(ox, oy) {
    const path = new Path2D();
    const first = this.nodes[0];
    const last = this.nodes[this.nodes.length - 1];
    const inAngle = Math.atan2(this.nodes[1].y - first.y, this.nodes[1].x - first.x);
    const outAngle = Math.atan2(
      last.y - this.nodes[this.nodes.length - 2].y,
      last.x - this.nodes[this.nodes.length - 2].x,
    );

    path.moveTo(this.left[0].x + ox, this.left[0].y + oy);
    for (let i = 1; i < this.left.length; i += 1) {
      path.lineTo(this.left[i].x + ox, this.left[i].y + oy);
    }
    path.arc(last.x + ox, last.y + oy, last.half,
      outAngle + Math.PI / 2, outAngle - Math.PI / 2, true);
    for (let i = this.right.length - 1; i >= 0; i -= 1) {
      path.lineTo(this.right[i].x + ox, this.right[i].y + oy);
    }
    path.arc(first.x + ox, first.y + oy, first.half,
      inAngle - Math.PI / 2, inAngle + Math.PI / 2, true);
    path.closePath();
    return path;
  }

  /**
   * Rock, everywhere, textured from the same stateless hash the sky scenery
   * uses: the plateau covers the whole screen, so without grain there would be
   * no way to tell you were moving over it.
   */
  drawRock(ctx, cam, ox, oy) {
    ctx.fillStyle = ROCK_BASE;
    ctx.fillRect(0, 0, cam.width, cam.height);
    const cell = 108;
    const x0 = Math.floor((cam.x - cam.width / 2) / cell) - 1;
    const x1 = Math.floor((cam.x + cam.width / 2) / cell) + 1;
    const y0 = Math.floor((cam.y - cam.height / 2) / cell) - 1;
    const y1 = Math.floor((cam.y + cam.height / 2) / cell) + 1;
    for (let ix = x0; ix <= x1; ix += 1) {
      for (let iy = y0; iy <= y1; iy += 1) {
        const rx = (ix + hash2(ix, iy, this.seed + 1)) * cell + ox;
        const ry = (iy + hash2(ix, iy, this.seed + 2)) * cell + oy;
        const tone = hash2(ix, iy, this.seed + 4);
        const size = 22 + hash2(ix, iy, this.seed + 3) * 34;
        const spin = hash2(ix, iy, this.seed + 5) * TAU;
        ctx.fillStyle = tone > 0.5 ? ROCK_LIT : ROCK_DARK;
        ctx.globalAlpha = 0.2 + tone * 0.16;
        ctx.beginPath();
        ctx.ellipse(rx, ry, size, size * (0.34 + tone * 0.3), spin, 0, TAU);
        ctx.fill();
        // A strata line across each slab. Broad mottling alone reads as fog
        // when it fills the whole screen; the hard edges are what make the
        // ground look like ground going past.
        if (hash2(ix, iy, this.seed + 6) < 0.4) continue;
        ctx.strokeStyle = ROCK_DARK;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx - Math.cos(spin) * size, ry - Math.sin(spin) * size);
        ctx.lineTo(rx + Math.cos(spin) * size, ry + Math.sin(spin) * size);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFloor(ctx, cam, ox, oy) {
    ctx.fillStyle = FLOOR;
    ctx.fillRect(0, 0, cam.width, cam.height);
    const cell = 190;
    const x0 = Math.floor((cam.x - cam.width / 2) / cell) - 1;
    const x1 = Math.floor((cam.x + cam.width / 2) / cell) + 1;
    const y0 = Math.floor((cam.y - cam.height / 2) / cell) - 1;
    const y1 = Math.floor((cam.y + cam.height / 2) / cell) + 1;
    ctx.fillStyle = FLOOR_LIT;
    for (let ix = x0; ix <= x1; ix += 1) {
      for (let iy = y0; iy <= y1; iy += 1) {
        if (hash2(ix, iy, this.seed + 11) < 0.45) continue;
        const rx = (ix + hash2(ix, iy, this.seed + 12)) * cell + ox;
        const ry = (iy + hash2(ix, iy, this.seed + 13)) * cell + oy;
        const size = 20 + hash2(ix, iy, this.seed + 14) * 40;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.ellipse(rx, ry, size, size * 0.34,
          hash2(ix, iy, this.seed + 15) * TAU, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx, cam) {
    const ox = cam.width / 2 - cam.x;
    const oy = cam.height / 2 - cam.y;
    const path = this.screenPath(ox, oy);

    ctx.save();
    this.drawRock(ctx, cam, ox, oy);

    // The slot, punched out of the rock. Clipping to the outline means the
    // wall shadow below can be a fat stroke of the same path: everything
    // outside the canyon is discarded, so what is left is a band of shade
    // hugging the inside of both faces.
    ctx.save();
    ctx.clip(path);
    this.drawFloor(ctx, cam, ox, oy);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(26, 16, 10, 0.42)';
    ctx.lineWidth = 46;
    ctx.stroke(path);
    ctx.strokeStyle = 'rgba(26, 16, 10, 0.42)';
    ctx.lineWidth = 16;
    ctx.stroke(path);
    ctx.restore();

    ctx.lineJoin = 'round';
    ctx.strokeStyle = RIM;
    ctx.lineWidth = 2.5;
    ctx.stroke(path);
    ctx.restore();

    this.drawGoal(ctx, ox, oy);
  }

  drawGoal(ctx, ox, oy) {
    const x = this.goal.x + ox;
    const y = this.goal.y + oy;
    ctx.save();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x, y, this.goal.radius, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, this.goal.radius * 0.45, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
