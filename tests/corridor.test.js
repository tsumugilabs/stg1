import test from 'node:test';
import assert from 'node:assert/strict';
import { Corridor, CORRIDOR_NODES } from '../src/game/corridor.js';

const canyon = new Corridor({ seed: 4242, heading: -Math.PI / 2 });

test('the same seed builds the same canyon, so guests need none of it on the wire', () => {
  const twin = new Corridor({ seed: 4242, heading: -Math.PI / 2 });
  assert.deepEqual(twin.nodes, canyon.nodes);
  const other = new Corridor({ seed: 4243, heading: -Math.PI / 2 });
  assert.notDeepEqual(other.nodes, canyon.nodes);
});

test('the run is one continuous slot from the mouth to the chamber', () => {
  assert.equal(canyon.nodes.length, CORRIDOR_NODES);
  assert.ok(canyon.length > 6000, `run is only ${Math.round(canyon.length)}px`);
  for (let s = 0; s <= canyon.length; s += 40) {
    const spot = canyon.pointAt(s);
    assert.ok(canyon.clearance(spot.x, spot.y) > 0, `centreline is inside rock at ${s}`);
  }
});

test('arc length runs forwards and never doubles back', () => {
  let last = -1;
  for (const node of canyon.nodes) {
    assert.ok(node.s > last, 'node arc lengths must increase');
    last = node.s;
  }
});

test('the mouth is wide and the walls close in behind it', () => {
  const middle = canyon.nodes.slice(2, -2).map((n) => n.half * 2);
  assert.ok(Math.max(...middle) < canyon.nodes[0].half * 2);
  // Two hundred pixels is the tuned floor: a craft turns inside fifty at
  // cruise, so the slot is never the turning circle — it is the margin.
  assert.ok(Math.min(...middle) >= 200, 'the slot must stay flyable');
});

test('a craft driven into rock is put back inside by the shortest way', () => {
  const spot = canyon.pointAt(canyon.length * 0.4);
  const craft = { x: spot.x + spot.half + 200, y: spot.y, radius: 14 };
  const depth = canyon.confine(craft);
  assert.ok(depth > 0, 'the craft started inside the rock');
  assert.ok(canyon.clearance(craft.x, craft.y, craft.radius) >= -1e-6, 'it must end up clear');
});

test('a craft already clear of the walls is left exactly where it was', () => {
  const spot = canyon.pointAt(canyon.length * 0.6);
  const craft = { x: spot.x, y: spot.y, radius: 14 };
  assert.equal(canyon.confine(craft), 0);
  assert.equal(craft.x, spot.x);
  assert.equal(craft.y, spot.y);
});

test('progress reads 0 at the mouth and 1 in the chamber', () => {
  const mouth = canyon.entry;
  assert.ok(canyon.progress(mouth.x, mouth.y) < 0.01);
  const end = canyon.nodes[canyon.nodes.length - 1];
  assert.ok(canyon.progress(end.x, end.y) > 0.99);
});
