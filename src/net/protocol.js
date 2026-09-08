/**
 * What goes over the wire.
 *
 * The host is authoritative: it runs Game.update() and nobody else does.
 * Guests send what their hands are doing and draw what they are told. That
 * removes every class of disagreement at the cost of one round trip of input
 * lag, which prediction on the guest's own craft hides.
 *
 * Messages are plain objects with a one-or-two-letter tag. They go through
 * JSON on every transport, so nothing here may hold a live object.
 */

/** Guest to host. */
export const HELLO = 'hi';      // { t, name }
export const PICK = 'pk';       // { t, craft }
export const READY = 'rd';      // { t, on }
export const INPUT = 'in';      // { t, n, d: [x, y] | null, h: bitmask }
export const LEAVE = 'by';      // { t }

/** Host to guest. */
export const SEAT = 'st';       // { t, seat, size, name }
export const LOBBY = 'lb';      // { t, size, slots: [...] }
export const START = 'go';      // { t, size, craft: [...] }
export const SNAPSHOT = 'sn';   // { t, ... } see snapshot.js
export const CLOSED = 'cl';     // { t, why }

/**
 * Held buttons as one integer. Four booleans is four fields on every input
 * message at 60Hz; one small number is one field.
 */
export const HELD = { fire: 1, brake: 2, boost: 4, start: 8 };

export function packHeld(input) {
  let bits = 0;
  for (const [action, bit] of Object.entries(HELD)) {
    if (input.isHeld(action)) bits |= bit;
  }
  return bits;
}

export function heldHas(bits, action) {
  return (bits & HELD[action]) !== 0;
}

/** A direction rounded to three decimals; it is a unit vector, not a position. */
export function packDirection(dir) {
  if (!dir) return null;
  return [Math.round(dir.x * 1000) / 1000, Math.round(dir.y * 1000) / 1000];
}

export function unpackDirection(packed) {
  return packed ? { x: packed[0], y: packed[1] } : null;
}
