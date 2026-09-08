/**
 * Message transports.
 *
 * Everything above this file speaks one tiny interface — send an object,
 * receive an object, close — so the netcode can be exercised for real without
 * a network. Three implementations share it:
 *
 *   LoopTransport     two ends inside one page. Tests.
 *   ChannelTransport  two ends in two tabs on one machine (BroadcastChannel).
 *                     Real cross-document messaging, no server, and the only
 *                     way one person can test four seats on their own.
 *   PeerTransport     WebRTC through PeerJS. The actual online case.
 *
 * The first two are not scaffolding to be deleted: a transport you can drive
 * deterministically is what makes the rest of this testable at all.
 */

/** Anything that can carry the protocol. Subclasses fill in send/close. */
class Transport {
  constructor() {
    this.handlers = [];
    this.closeHandlers = [];
    this.open = false;
  }

  onMessage(fn) {
    this.handlers.push(fn);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== fn);
    };
  }

  onClose(fn) {
    this.closeHandlers.push(fn);
  }

  /** Called by the implementation when something arrives. */
  deliver(message) {
    for (const handler of this.handlers) handler(message, this);
  }

  fireClose() {
    if (!this.open) return;
    this.open = false;
    for (const handler of this.closeHandlers) handler(this);
  }

  send() {}

  close() {
    this.fireClose();
  }
}

/**
 * Two ends of one wire inside a single page. `latency` and `drop` are there so
 * a test can ask what happens on a bad connection rather than only a perfect
 * one; both default to a perfect wire.
 */
export class LoopTransport extends Transport {
  constructor({ latency = 0, drop = 0 } = {}) {
    super();
    this.latency = latency;
    this.drop = drop;
    this.other = null;
    this.open = true;
    this.queue = [];
  }

  /** Makes a connected pair. */
  static pair(options = {}) {
    const a = new LoopTransport(options);
    const b = new LoopTransport(options);
    a.other = b;
    b.other = a;
    return [a, b];
  }

  send(message) {
    if (!this.open || !this.other || !this.other.open) return;
    if (this.drop > 0 && Math.random() < this.drop) return;
    // Structured-clone the payload, so a test cannot pass a live object
    // reference across the wire and accidentally prove nothing.
    const copy = JSON.parse(JSON.stringify(message));
    if (this.latency <= 0) {
      this.other.deliver(copy);
      return;
    }
    this.queue.push({ at: this.now() + this.latency, message: copy });
  }

  now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  /** Delivers anything whose latency has elapsed. Tests drive this by hand. */
  pump() {
    const now = this.now();
    const due = this.queue.filter((q) => q.at <= now);
    this.queue = this.queue.filter((q) => q.at > now);
    for (const q of due) this.other.deliver(q.message);
  }

  close() {
    this.fireClose();
    if (this.other) this.other.fireClose();
  }
}

/**
 * Two tabs on one machine. BroadcastChannel is same-origin and needs nothing
 * running anywhere, so a single person can open four tabs and play all four
 * seats — which is also how this whole layer gets tested end to end.
 */
export class ChannelTransport extends Transport {
  /**
   * `listen: false` makes a send-only end. The host needs that: it already has
   * one channel open to hear knocks on, and a second channel created part-way
   * through a conversation misses everything posted before it existed — which
   * silently swallowed the join message that followed the first one.
   */
  constructor(room, self, peer, { listen = true } = {}) {
    super();
    this.self = self;
    this.peer = peer;
    this.channel = new BroadcastChannel(`chronopilot.${room}`);
    this.open = true;
    if (!listen) return;
    this.channel.onmessage = (event) => {
      const packet = event.data;
      if (!packet || packet.from === this.self) return;
      // A room channel carries everybody; take only what is addressed here.
      if (packet.to && packet.to !== this.self) return;
      if (this.peer && packet.from !== this.peer) return;
      if (packet.kind === 'bye') {
        this.fireClose();
        return;
      }
      this.deliver(packet.body);
    };
  }

  send(message) {
    if (!this.open) return;
    this.channel.postMessage({ from: this.self, to: this.peer, body: message });
  }

  close() {
    if (this.open) this.channel.postMessage({ from: this.self, to: this.peer, kind: 'bye' });
    this.fireClose();
    try {
      this.channel.close();
    } catch {
      /* already gone */
    }
  }
}

/** A live PeerJS DataConnection, wrapped in the same interface. */
export class PeerTransport extends Transport {
  constructor(connection) {
    super();
    this.connection = connection;
    this.open = connection.open === true;
    connection.on('open', () => {
      this.open = true;
    });
    connection.on('data', (data) => this.deliver(data));
    connection.on('close', () => this.fireClose());
    connection.on('error', () => this.fireClose());
  }

  send(message) {
    if (!this.connection.open) return;
    this.connection.send(message);
  }

  close() {
    try {
      this.connection.close();
    } catch {
      /* already gone */
    }
    this.fireClose();
  }
}
