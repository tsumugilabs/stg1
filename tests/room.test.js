import test from 'node:test';
import assert from 'node:assert/strict';
import { LoopTransport } from '../src/net/transport.js';
import { Room, TIMEOUT } from '../src/net/room.js';
import { HELD } from '../src/net/protocol.js';

/** An empty world, which is all hostTick needs to put on the wire. */
function stubGame() {
  return {
    netClock: 0, netEvents: [], state: 'playing', continueTimer: 0,
    eraIndex: 0, kills: 0, quota: 10, score: 0, squadRank: 1, rankKills: 0,
    players: [], enemies: [], bullets: [], flares: [], parachutists: [],
    pickups: [], boss: null,
    spectateTarget: () => ({ x: 0, y: 0 }),
  };
}

function joined({ size = 4 } = {}) {
  const [hostEnd, guestEnd] = LoopTransport.pair();
  const host = new Room({ host: true, name: 'P1', size });
  const guest = new Room({ host: false, name: 'P2' });
  host.accept(hostEnd);
  guest.connect(guestEnd);
  return { host, guest };
}

function run(host, guest, seconds) {
  const game = stubGame();
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    host.hostTick(1 / 60, game);
    guest.guestTick(1 / 60);
  }
}

test('a guest that says hello gets a seat', () => {
  const { host, guest } = joined();
  assert.equal(guest.seat, 1);
  assert.equal(host.humans, 2);
});

test('a guest choosing an aircraft is not aged out of the lobby', () => {
  // The host drops a peer that has gone quiet, and a guest in the lobby has
  // nothing to send for as long as it takes to look at five aircraft. Once
  // hostTick started running on every screen rather than only in flight, that
  // ageing began firing in the lobby: you got a seat, went to choose, and the
  // room threw you out from under you.
  const { host, guest } = joined();
  let closed = null;
  guest.on('closed', (why) => { closed = why; });
  run(host, guest, TIMEOUT * 3);
  assert.equal(closed, null, `the guest was thrown out: ${closed}`);
  assert.equal(host.humans, 2);
  assert.equal(host.slots[1].kind, 'peer');
});

test('a pick made after a long look still reaches the host', () => {
  const { host, guest } = joined();
  run(host, guest, TIMEOUT * 2);
  guest.sendPick('raptor');
  assert.equal(host.slots[1].craft, 'raptor');
});

test('a guest in front of the continue prompt keeps its seat', () => {
  // The prompt stands for ten seconds and a guest sends no stick while it is
  // up — the same silence as the lobby, well past the host's eight-second
  // patience. Snapshots keep coming the other way, so this checks both
  // directions of a screen where nobody is flying.
  const { host, guest } = joined();
  host.beginFlight();
  guest.started = true;
  let closed = null;
  guest.on('closed', (why) => { closed = why; });
  run(host, guest, TIMEOUT + 4);
  assert.equal(closed, null, `the guest was thrown out: ${closed}`);
  assert.equal(host.humans, 2);
});

test('a guest that stops sending input in flight is still dropped', () => {
  const { host, guest } = joined();
  host.beginFlight();
  guest.started = true;
  const game = stubGame();
  // One frame of a stick, then nothing at all.
  guest.sendInput({ direction: () => ({ x: 1, y: 0 }), isHeld: () => false });
  for (let i = 0; i < Math.round((TIMEOUT + 1) * 60); i += 1) host.hostTick(1 / 60, game);
  assert.equal(host.humans, 1, 'a silent pilot in flight must lose the seat to the AI');
  assert.equal(host.slots[1].kind, 'ai');
});

test('a guest notices a host that has gone quiet in flight', () => {
  const { host, guest } = joined();
  host.beginFlight();
  guest.started = true;
  let closed = null;
  guest.on('closed', (why) => { closed = why; });
  for (let i = 0; i < Math.round((TIMEOUT + 1) * 60); i += 1) guest.guestTick(1 / 60);
  assert.ok(closed, 'silence from the host has to surface');
});

test('held buttons survive the round trip', () => {
  assert.equal(HELD.fire | HELD.brake, 3);
});
