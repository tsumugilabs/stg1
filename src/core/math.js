/** Small math helpers shared by every system in the game. */

export const TAU = Math.PI * 2;

export function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Normalise an angle into (-PI, PI]. */
export function wrapAngle(angle) {
  let a = (angle + Math.PI) % TAU;
  if (a <= 0) a += TAU;
  return a - Math.PI;
}

/** Shortest signed rotation that takes `from` to `to`. */
export function angleDiff(from, to) {
  return wrapAngle(to - from);
}

/** Rotate `current` towards `target` by at most `maxDelta` radians. */
export function turnToward(current, target, maxDelta) {
  const delta = angleDiff(current, target);
  if (Math.abs(delta) <= maxDelta) return wrapAngle(target);
  return wrapAngle(current + Math.sign(delta) * maxDelta);
}

export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/** Circle-vs-circle test for objects shaped like `{ x, y, radius }`. */
export function circlesOverlap(a, b) {
  const reach = a.radius + b.radius;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy <= reach * reach;
}

/**
 * Deterministic 2D value hash in [0, 1). The endless scenery relies on this:
 * the same cell always produces the same cloud, however often you fly past it.
 */
export function hash2(ix, iy, seed = 0) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
