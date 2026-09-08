import { lerp } from '../core/math.js';

/**
 * The world, as the host sees it, small enough to send twenty times a second.
 *
 * Guests hold two snapshots and draw the world a fixed slice of time in the
 * past, interpolating between them. Rendering slightly behind is what buys
 * smooth motion out of infrequent updates; the alternative — drawing the
 * newest snapshot the instant it lands — gives you the truth and a jitter.
 *
 * The guest's own craft is the exception. That one is predicted forward from
 * local input and pulled gently back towards the host's version, so your own
 * aircraft answers the stick immediately even though everything else is a
 * fraction of a second old.
 */

/**
 * How far behind the newest snapshot a guest draws everything except its own
 * craft. A little over one snapshot interval: enough that there is always a
 * pair to interpolate between, and no more, because every millisecond here is
 * a millisecond of lag on everybody else's aircraft.
 */
export const INTERP_DELAY = 0.07;

export function encode(game) {
  const snap = {
    t: 'sn',
    c: game.netClock,
    st: game.state,
    ct: Math.round(game.continueTimer * 10) / 10,
    e: game.eraIndex,
    k: game.kills,
    q: game.quota,
    s: game.score,
    r: game.squadRank,
    rk: game.rankKills,
    p: game.players.map((player) => ([
      Math.round(player.x), Math.round(player.y),
      Math.round(player.angle * 1000) / 1000,
      player.hp, player.lives,
      (player.alive ? 1 : 0) | (player.out ? 2 : 0) | (player.boosting ? 4 : 0)
        | (player.braking ? 8 : 0) | (player.chute ? 16 : 0)
        | (player.stranded ? 32 : 0),
      player.chute ? Math.round(player.chute.timer * 10) / 10 : 0,
      Math.round(player.invulnerable * 10) / 10,
      player.craft.id,
    ])),
    n: game.enemies.filter((enemy) => !enemy.dead).map((enemy) => ([
      enemy.netId,
      Math.round(enemy.x), Math.round(enemy.y),
      Math.round(enemy.angle * 1000) / 1000,
      enemy.hp,
    ])),
    b: game.bullets.map((bullet) => ([
      Math.round(bullet.x), Math.round(bullet.y),
      Math.round(bullet.angle * 1000) / 1000,
      bullet.team === 'player' ? 1 : 0,
      bullet.radius,
      bullet.color,
      bullet.homing ? 1 : 0,
    ])),
    f: game.flares.map((flare) => [Math.round(flare.x), Math.round(flare.y), Math.round(flare.radius)]),
    u: game.parachutists.map((chute) => [Math.round(chute.x), Math.round(chute.y), Math.round(chute.phase * 100) / 100]),
    m: game.pickups.map((pickup) => [Math.round(pickup.x), Math.round(pickup.y), pickup.moduleId]),
    // Everything that happened since the last snapshot: explosions, banners,
    // the flagship going up. A guest simulates none of it and would otherwise
    // fly through a silent, still sky.
    ev: game.netEvents,
  };
  snap.w = game.boss ? null : (() => {
    // Where a stranded pilot should be looking before the flagship shows up.
    const eye = game.spectateTarget();
    return eye ? [Math.round(eye.x), Math.round(eye.y)] : null;
  })();
  snap.o = game.boss ? [
    Math.round(game.boss.x), Math.round(game.boss.y),
    Math.round(game.boss.angle * 1000) / 1000,
    game.boss.hp, game.boss.maxHp,
  ] : null;
  return snap;
}

/** Reads one packed player row back into something legible. */
export function readPlayer(row) {
  const flags = row[5];
  return {
    x: row[0], y: row[1], angle: row[2], hp: row[3], lives: row[4],
    alive: (flags & 1) !== 0,
    out: (flags & 2) !== 0,
    boosting: (flags & 4) !== 0,
    braking: (flags & 8) !== 0,
    downed: (flags & 16) !== 0,
    stranded: (flags & 32) !== 0,
    chuteTimer: row[6],
    invulnerable: row[7],
    craftId: row[8],
  };
}

/** Shortest-way-round interpolation, so a craft crossing north does not spin. */
function lerpAngle(a, b, t) {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

/**
 * Holds the last few snapshots and hands back the world as it was at a chosen
 * moment. Anything that appears in only one of the two bracketing snapshots is
 * taken whole from the one that has it: half of a spawning aircraft is worse
 * than one that arrives a frame late.
 */
export class Interpolator {
  constructor() {
    this.buffer = [];
    this.clock = 0;
    this.latest = null;
  }

  push(snap) {
    this.latest = snap;
    this.buffer.push(snap);
    // Two to interpolate between plus a little history; more is memory for
    // nothing, since anything older can never be asked for again.
    while (this.buffer.length > 6) this.buffer.shift();
    // The guest's clock chases the host's, so a slow or fast tab converges
    // instead of drifting apart for ever.
    if (this.clock === 0) this.clock = snap.c - INTERP_DELAY;
  }

  advance(dt) {
    if (!this.latest) return;
    const target = this.latest.c - INTERP_DELAY;
    const drift = target - this.clock;
    // Nudge by up to 20%: a hard snap is a visible jump, and doing nothing is
    // a guest that falls further behind every second.
    this.clock += dt + Math.max(-dt * 0.2, Math.min(dt * 0.2, drift * dt * 4));
    if (Math.abs(drift) > 1.5) this.clock = target;
  }

  /** The two snapshots the current clock sits between, and where between. */
  bracket() {
    if (!this.buffer.length) return null;
    let prev = this.buffer[0];
    let next = this.buffer[this.buffer.length - 1];
    for (let i = 0; i < this.buffer.length - 1; i += 1) {
      if (this.buffer[i].c <= this.clock && this.buffer[i + 1].c >= this.clock) {
        prev = this.buffer[i];
        next = this.buffer[i + 1];
        break;
      }
    }
    const span = next.c - prev.c;
    const t = span > 1e-6 ? Math.max(0, Math.min(1, (this.clock - prev.c) / span)) : 1;
    return { prev, next, t };
  }

  /** Players, interpolated. Rows keep the packed order. */
  players() {
    const at = this.bracket();
    if (!at) return [];
    const { prev, next, t } = at;
    return next.p.map((row, i) => {
      const before = prev.p[i];
      const now = readPlayer(row);
      if (!before) return now;
      const was = readPlayer(before);
      now.x = lerp(was.x, now.x, t);
      now.y = lerp(was.y, now.y, t);
      now.angle = lerpAngle(was.angle, now.angle, t);
      return now;
    });
  }

  /** Escorts, matched by id so one that spawned mid-span is not smeared in. */
  enemies() {
    const at = this.bracket();
    if (!at) return [];
    const { prev, next, t } = at;
    const was = new Map(prev.n.map((row) => [row[0], row]));
    return next.n.map((row) => {
      const before = was.get(row[0]);
      if (!before) return { id: row[0], x: row[1], y: row[2], angle: row[3], hp: row[4] };
      return {
        id: row[0],
        x: lerp(before[1], row[1], t),
        y: lerp(before[2], row[2], t),
        angle: lerpAngle(before[3], row[3], t),
        hp: row[4],
      };
    });
  }

  boss() {
    const at = this.bracket();
    if (!at || !at.next.o) return null;
    const { prev, next, t } = at;
    const row = next.o;
    if (!prev.o) return { x: row[0], y: row[1], angle: row[2], hp: row[3], maxHp: row[4] };
    return {
      x: lerp(prev.o[0], row[0], t),
      y: lerp(prev.o[1], row[1], t),
      angle: lerpAngle(prev.o[2], row[2], t),
      hp: row[3],
      maxHp: row[4],
    };
  }

  /**
   * Bullets are not interpolated. They have no identity in the snapshot, so
   * there is nothing to match one frame's bullet to the next one's; they are
   * small, fast and short-lived, and the newest set is the honest answer.
   */
  bullets() {
    return (this.latest ? this.latest.b : []).map((row) => ({
      x: row[0], y: row[1], angle: row[2],
      team: row[3] ? 'player' : 'enemy',
      radius: row[4], color: row[5], homing: row[6] ? {} : null,
    }));
  }

  extras() {
    const snap = this.latest;
    if (!snap) return { flares: [], parachutists: [], pickups: [] };
    return {
      flares: snap.f.map((row) => ({ x: row[0], y: row[1], radius: row[2] })),
      parachutists: snap.u.map((row) => ({ x: row[0], y: row[1], phase: row[2] })),
      pickups: snap.m.map((row) => ({ x: row[0], y: row[1], moduleId: row[2] })),
    };
  }
}
