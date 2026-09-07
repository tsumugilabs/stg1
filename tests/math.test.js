import assert from 'node:assert/strict';
import test from 'node:test';
import {
  angleDiff, circlesOverlap, clamp, hash2, lerp, turnToward, wrapAngle, TAU,
} from '../src/core/math.js';

test('clamp keeps values inside the range', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(42, 0, 10), 10);
});

test('lerp interpolates between endpoints', () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.25), 2.5);
});

test('wrapAngle normalises into (-PI, PI]', () => {
  assert.ok(Math.abs(wrapAngle(0)) < 1e-9);
  assert.ok(Math.abs(wrapAngle(TAU)) < 1e-9);
  assert.ok(Math.abs(wrapAngle(Math.PI * 3) - Math.PI) < 1e-9);
  const wrapped = wrapAngle(-Math.PI * 1.5);
  assert.ok(wrapped > -Math.PI && wrapped <= Math.PI);
});

test('angleDiff takes the short way round', () => {
  assert.ok(Math.abs(angleDiff(0.1, -0.1) + 0.2) < 1e-9);
  // Crossing the +/-PI seam must not produce a near-full rotation.
  assert.ok(Math.abs(angleDiff(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
});

test('turnToward snaps once it is within one step', () => {
  assert.ok(Math.abs(turnToward(0, 0.05, 0.1) - 0.05) < 1e-9);
  assert.ok(Math.abs(turnToward(0, 1, 0.1) - 0.1) < 1e-9);
  assert.ok(Math.abs(turnToward(0, -1, 0.1) + 0.1) < 1e-9);
});

test('turnToward crosses the seam in the short direction', () => {
  // From just under +PI, the nearest route to just over -PI is forwards.
  const next = turnToward(Math.PI - 0.05, -Math.PI + 0.05, 0.02);
  assert.ok(next > Math.PI - 0.05 || next < -Math.PI + 0.1);
});

test('circlesOverlap uses summed radii', () => {
  const a = { x: 0, y: 0, radius: 5 };
  assert.equal(circlesOverlap(a, { x: 9, y: 0, radius: 5 }), true);
  assert.equal(circlesOverlap(a, { x: 11, y: 0, radius: 5 }), false);
});

test('hash2 is deterministic and stays in [0, 1)', () => {
  assert.equal(hash2(3, -7, 11), hash2(3, -7, 11));
  assert.notEqual(hash2(3, -7, 11), hash2(4, -7, 11));
  for (let x = -20; x < 20; x += 1) {
    for (let y = -20; y < 20; y += 1) {
      const value = hash2(x, y, 5);
      assert.ok(value >= 0 && value < 1, `hash2(${x}, ${y}) out of range: ${value}`);
    }
  }
});
