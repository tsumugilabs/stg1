import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encode, Interpolator, INTERP_DELAY, MAX_INTERP_DELAY, readPlayer,
} from '../src/net/snapshot.js';

function snapAt(c) {
  return {
    c, p: [[0, 0, 0, 3, 2, 1, 0, 0, 'viper', 0, 0]],
    n: [], b: [], f: [], u: [], m: [], ev: [], o: null, ak: [-1],
  };
}

/** Feeds `count` snapshots at 30Hz, each arriving `late(i)` seconds behind. */
function feed(interp, clock, count, late) {
  for (let i = 0; i < count; i += 1) {
    const sent = i / 30;
    clock.t = sent + late(i);
    interp.push(snapAt(sent));
  }
}

test('a clean line is drawn at the shortest delay there is', () => {
  const clock = { t: 0 };
  const interp = new Interpolator({ now: () => clock.t });
  feed(interp, clock, 200, () => 0.04);
  assert.equal(interp.delay, INTERP_DELAY);
});

test('a line that stalls is given a deeper buffer to hide it', () => {
  // Every twentieth snapshot is held up by a retransmit, which on an ordered
  // channel is what a single lost packet does to everything behind it.
  const clock = { t: 0 };
  const interp = new Interpolator({ now: () => clock.t });
  feed(interp, clock, 200, (i) => 0.04 + (i % 20 === 0 ? 0.2 : 0));
  assert.ok(interp.delay > 0.15, `buffer only grew to ${interp.delay}`);
  assert.ok(interp.delay <= MAX_INTERP_DELAY);
});

test('the buffer is never opened wider than the cap', () => {
  const clock = { t: 0 };
  const interp = new Interpolator({ now: () => clock.t });
  feed(interp, clock, 200, (i) => 0.04 + (i % 3 === 0 ? 2.5 : 0));
  assert.equal(interp.delay, MAX_INTERP_DELAY);
});

test('a line that heals does not give its buffer straight back', () => {
  // One quiet second is not evidence: it has to stay quiet for a while.
  const clock = { t: 0 };
  const interp = new Interpolator({ now: () => clock.t });
  feed(interp, clock, 200, (i) => 0.04 + (i % 20 === 0 ? 0.2 : 0));
  const opened = interp.delay;
  for (let i = 0; i < 30; i += 1) {
    const sent = (200 + i) / 30;
    clock.t = sent + 0.04;
    interp.push(snapAt(sent));
  }
  assert.ok(interp.delay > opened * 0.8, 'the buffer collapsed after one quiet second');
});

test('a snapshot says which input from each seat it has acted on', () => {
  const game = {
    netClock: 1, state: 'playing', continueTimer: 0, eraIndex: 0, kills: 0,
    quota: 10, score: 0, squadRank: 1, rankKills: 0, netEvents: [],
    enemies: [], bullets: [], flares: [], parachutists: [], pickups: [],
    boss: null, spectateTarget: () => ({ x: 0, y: 0 }),
    players: [
      { x: 0, y: 0, angle: 0, hp: 3, lives: 2, alive: true, out: false, boosting: false, braking: false, chute: null, stranded: false, invulnerable: 0, craft: { id: 'viper' }, modules: [], pods: [] },
      { x: 0, y: 0, angle: 0, hp: 3, lives: 2, alive: true, out: false, boosting: false, braking: false, chute: null, stranded: false, invulnerable: 0, craft: { id: 'eagle' }, modules: [], pods: [] },
    ],
    room: { controllerFor: (seat) => (seat === 1 ? { seq: 42 } : null) },
  };
  const snap = encode(game);
  assert.deepEqual(snap.ak, [-1, 42]);
});

test('a packed player row survives the round trip', () => {
  const row = [12, -34, 1.25, 3, 2, 1 | 4, 0, 0.5, 'raptor', ['engine'], [1, 2, 3]];
  const state = readPlayer(row);
  assert.equal(state.x, 12);
  assert.equal(state.y, -34);
  assert.equal(state.alive, true);
  assert.equal(state.boosting, true);
  assert.equal(state.craftId, 'raptor');
});
