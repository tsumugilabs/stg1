import {
  CLOSED, HELLO, INPUT, LEAVE, LOBBY, PICK, READY, SEAT, SNAPSHOT, START,
  packDirection, packHeld,
} from './protocol.js';
import { RemoteController } from './remote.js';
import { encode, Interpolator } from './snapshot.js';

/**
 * The room: who is in it, which seat they have, and the pump that moves
 * messages in both directions.
 *
 * One machine hosts. It runs the game and nobody else does. Everyone else
 * sends their stick and their buttons and draws what comes back. That is not
 * the fanciest arrangement available, but it is the one where four people
 * cannot disagree about who died, and for a game whose whole subject is a
 * shared dogfight that matters more than shaving a frame off input lag.
 *
 * Empty seats are flown by the AI from stage one. Two people plus two wingmen
 * is a real game, so nobody waits for a fourth.
 */

/** Twenty a second. Below this it reads as stutter; above it buys nothing. */
export const SNAPSHOT_HZ = 20;
/** A peer that has said nothing for this long is treated as gone. */
export const TIMEOUT = 8;

export class Room {
  constructor({ host, name = 'P1', size = 4 } = {}) {
    this.isHost = host;
    this.name = name;
    this.size = size;
    this.seat = host ? 0 : -1;
    this.slots = [];
    this.started = false;
    this.closed = false;
    this.error = '';
    // Host only.
    this.peers = [];
    this.sinceSnapshot = 0;
    this.clock = 0;
    // Guest only.
    this.link = null;
    this.interp = new Interpolator();
    this.inputSeq = 0;
    this.listeners = {};
    if (host) this.resetSlots();
  }

  on(event, fn) {
    (this.listeners[event] = this.listeners[event] || []).push(fn);
  }

  emit(event, payload) {
    for (const fn of this.listeners[event] || []) fn(payload);
  }

  // --- host ---------------------------------------------------------------

  resetSlots() {
    this.slots = [];
    for (let i = 0; i < this.size; i += 1) {
      this.slots.push(i === 0
        ? { kind: 'host', name: this.name, craft: null, ready: true }
        : { kind: 'ai', name: `CPU${i + 1}`, craft: null, ready: true });
    }
  }

  setSize(size) {
    if (!this.isHost || this.started) return;
    this.size = size;
    const taken = this.peers.filter((p) => p.seat < size);
    for (const peer of this.peers) {
      if (peer.seat >= size) peer.transport.send({ t: CLOSED, why: 'この編隊は満席になりました' });
    }
    this.peers = taken;
    this.resetSlots();
    for (const peer of this.peers) this.fillSeat(peer);
    this.broadcastLobby();
  }

  fillSeat(peer) {
    this.slots[peer.seat] = {
      kind: 'peer', name: peer.name, craft: peer.craft, ready: peer.ready,
    };
  }

  freeSeat() {
    for (let i = 1; i < this.size; i += 1) {
      if (this.slots[i].kind === 'ai') return i;
    }
    return -1;
  }

  /** A new connection arrived. Give it a seat, or turn it away politely. */
  accept(transport) {
    if (!this.isHost) return;
    const peer = {
      transport, seat: -1, name: 'PILOT', craft: null, ready: false,
      controller: null, silence: 0,
    };
    transport.onMessage((message) => this.fromPeer(peer, message));
    transport.onClose(() => this.dropPeer(peer));
    this.pending = this.pending || [];
    this.pending.push(peer);
  }

  fromPeer(peer, message) {
    if (!message || this.closed) return;
    switch (message.t) {
      case HELLO: {
        if (peer.seat !== -1) break;
        const seat = this.started ? -1 : this.freeSeat();
        if (seat === -1) {
          peer.transport.send({ t: CLOSED, why: this.started ? 'すでに出撃中です' : '満席です' });
          peer.transport.close();
          break;
        }
        peer.seat = seat;
        peer.name = String(message.name || `P${seat + 1}`).slice(0, 10).toUpperCase();
        peer.controller = new RemoteController(peer.name);
        this.peers.push(peer);
        this.pending = (this.pending || []).filter((p) => p !== peer);
        this.fillSeat(peer);
        peer.transport.send({ t: SEAT, seat, size: this.size, name: peer.name });
        this.broadcastLobby();
        this.emit('join', peer);
        break;
      }
      case PICK:
        peer.craft = message.craft;
        if (peer.seat !== -1) this.fillSeat(peer);
        this.broadcastLobby();
        break;
      case READY:
        peer.ready = Boolean(message.on);
        if (peer.seat !== -1) this.fillSeat(peer);
        this.broadcastLobby();
        break;
      case INPUT:
        if (peer.controller) peer.controller.accept(message);
        peer.silence = 0;
        break;
      case LEAVE:
        this.dropPeer(peer);
        break;
      default:
        break;
    }
  }

  dropPeer(peer) {
    if (!this.isHost) return;
    const wasSeated = peer.seat !== -1;
    this.peers = this.peers.filter((p) => p !== peer);
    this.pending = (this.pending || []).filter((p) => p !== peer);
    if (wasSeated && this.slots[peer.seat]) {
      // The seat does not empty — the AI takes it over mid-flight, so a
      // dropped connection costs the flight a pilot, not an aircraft.
      this.slots[peer.seat] = { kind: 'ai', name: `CPU${peer.seat + 1}`, craft: null, ready: true };
    }
    this.broadcastLobby();
    this.emit('leave', peer);
  }

  broadcast(message) {
    for (const peer of this.peers) peer.transport.send(message);
  }

  broadcastLobby() {
    if (!this.isHost) return;
    this.broadcast({ t: LOBBY, size: this.size, slots: this.slots });
    this.emit('lobby', this.slots);
  }

  /** Everyone who is actually connected has pressed ready. */
  get allReady() {
    return this.peers.every((peer) => peer.ready);
  }

  get humans() {
    return 1 + this.peers.length;
  }

  /**
   * Marks the room in flight. Split from the announcement because the host has
   * to build its roster — which is what decides the AI seats' airframes —
   * before it can tell anybody what everyone is flying, and building the
   * roster is what needs `started` to already be true.
   */
  beginFlight() {
    if (!this.isHost) return;
    this.started = true;
    this.clock = 0;
  }

  announceStart(craftBySeat) {
    if (!this.isHost) return;
    this.broadcast({ t: START, size: this.size, craft: craftBySeat });
  }

  /** The controller for a seat, or null when the AI should take it. */
  controllerFor(seat) {
    if (!this.isHost) return null;
    const peer = this.peers.find((p) => p.seat === seat);
    return peer ? peer.controller : null;
  }

  /** Host side of a frame: age the peers out, and send a snapshot on time. */
  hostTick(dt, game) {
    if (!this.isHost) return;
    this.clock += dt;
    game.netClock = this.clock;
    for (const peer of [...this.peers]) {
      peer.silence += dt;
      if (peer.controller) peer.controller.tick(dt);
      if (peer.silence > TIMEOUT) {
        peer.transport.close();
        this.dropPeer(peer);
      }
    }
    if (!this.started || !this.peers.length) return;
    this.sinceSnapshot += dt;
    if (this.sinceSnapshot < 1 / SNAPSHOT_HZ) return;
    this.sinceSnapshot = 0;
    this.broadcast(encode(game));
  }

  // --- guest --------------------------------------------------------------

  connect(transport) {
    this.link = transport;
    transport.onMessage((message) => this.fromHost(message));
    transport.onClose(() => {
      this.closed = true;
      this.emit('closed', this.error || '接続が切れました');
    });
    transport.send({ t: HELLO, name: this.name });
  }

  fromHost(message) {
    if (!message) return;
    switch (message.t) {
      case SEAT:
        this.seat = message.seat;
        this.size = message.size;
        this.name = message.name;
        this.emit('seat', message);
        break;
      case LOBBY:
        this.size = message.size;
        this.slots = message.slots;
        this.emit('lobby', message.slots);
        break;
      case START:
        this.started = true;
        this.emit('start', message);
        break;
      case SNAPSHOT:
        this.interp.push(message);
        break;
      case CLOSED:
        this.error = message.why || '';
        this.closed = true;
        this.emit('closed', this.error);
        break;
      default:
        break;
    }
  }

  sendPick(craft) {
    if (this.link) this.link.send({ t: PICK, craft });
  }

  sendReady(on) {
    if (this.link) this.link.send({ t: READY, on });
  }

  /** One frame of the guest's hands, on the wire. */
  sendInput(input) {
    if (!this.link || !this.started) return;
    this.inputSeq += 1;
    this.link.send({
      t: INPUT,
      n: this.inputSeq,
      d: packDirection(input.direction()),
      h: packHeld(input),
    });
  }

  leave() {
    if (this.link) {
      this.link.send({ t: LEAVE });
      this.link.close();
    }
    for (const peer of this.peers) {
      peer.transport.send({ t: CLOSED, why: 'ホストが退出しました' });
      peer.transport.close();
    }
    this.peers = [];
    this.closed = true;
  }
}
