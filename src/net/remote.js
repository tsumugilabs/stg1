/**
 * A seat flown from somewhere else.
 *
 * This is the whole reason stage one built wingmen the way it did: this class
 * presents exactly the interface Input and Wingman present, so Game does not
 * know — and has no way to find out — whether a craft is being flown by the
 * keyboard, by the AI, or by somebody on another continent.
 *
 * It holds the last input that arrived and keeps applying it. A dropped or
 * late packet therefore means the craft keeps doing what it was last told,
 * which reads as a moment of drift rather than as a craft that stops dead.
 */
export class RemoteController {
  constructor(name = 'peer') {
    this.name = name;
    this.dir = null;
    this.bits = 0;
    this.seq = -1;
    this.silence = 0;
    this.recentCodes = [];
    this.touch = null;
  }

  /**
   * Takes an input message. Out-of-order packets are dropped: a stale input
   * applied after a fresh one would show up as a visible twitch.
   */
  accept({ n, d, h }) {
    if (typeof n === 'number' && n <= this.seq) return false;
    if (typeof n === 'number') this.seq = n;
    this.dir = d ? { x: d[0], y: d[1] } : null;
    this.bits = h || 0;
    this.silence = 0;
    return true;
  }

  /** Seconds since anything arrived, for the host to show a lost connection. */
  tick(dt) {
    this.silence += dt;
  }

  direction() {
    return this.dir;
  }

  isHeld(action) {
    const bit = { fire: 1, brake: 2, boost: 4, start: 8 }[action];
    return bit ? (this.bits & bit) !== 0 : false;
  }

  wasPressed() {
    return false;
  }

  wantsStart() {
    return false;
  }

  endFrame() {}
}
