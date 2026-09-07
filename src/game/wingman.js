import { angleDiff, distance } from '../core/math.js';

/**
 * A wingman flies one of the squadron's craft. It presents the same shape as
 * the keyboard: a direction and a set of held buttons, nothing else. That is
 * deliberate — the seat a wingman occupies is exactly the seat a networked
 * peer will occupy, and neither the craft nor the world will know which is
 * which.
 */

/** How far a wingman will stray from the flight before it breaks off and
 *  comes back. Kept short deliberately: a flight that spreads across two
 *  screens is four people playing alone. */
const LEASH = 330;
/** Escorts further than this from the leader are somebody else's problem. */
const AREA = 560;
/** Break off rather than trade a collision at this range. */
const STANDOFF = 110;

export class Wingman {
  constructor(player) {
    this.player = player;
    // Seat order doubles as a lane: wingman n takes the n-th nearest escort,
    // so a flight spreads across the fight instead of stacking on one mark.
    this.slot = Math.max(0, player.index - 1);
    this.held = new Set(['fire']);
    this.dir = null;
    this.recentCodes = [];
    this.touch = null;
  }

  /**
   * The escort this wingman is responsible for. Only things near the leader
   * count, so the flight fights over one patch of sky rather than drifting
   * apart chasing its own marks; within that, seat order picks which one.
   */
  pickTarget(game, lead) {
    const anchor = lead ?? this.player;
    const ranked = game.enemies
      .filter((e) => !e.dead && distance(e.x, e.y, anchor.x, anchor.y) < AREA)
      .map((e) => ({ e, d: distance(this.player.x, this.player.y, e.x, e.y) }))
      .sort((a, b) => a.d - b.d);
    if (!ranked.length) {
      if (game.boss && distance(game.boss.x, game.boss.y, anchor.x, anchor.y) < AREA * 1.6) {
        return game.boss;
      }
      return null;
    }
    return ranked[Math.min(this.slot, ranked.length - 1)].e;
  }

  /** Where this wingman sits when there is nothing to chase. */
  station(lead) {
    const side = this.slot % 2 === 0 ? 1 : -1;
    const rank = Math.floor(this.slot / 2) + 1;
    return {
      x: lead.x - Math.cos(lead.angle) * rank * 70 - Math.sin(lead.angle) * side * 90,
      y: lead.y - Math.sin(lead.angle) * rank * 70 + Math.cos(lead.angle) * side * 90,
    };
  }

  /** The input object the craft is flown with this frame. */
  control(dt, game) {
    const me = this.player;
    const lead = game.players[game.localIndex];
    const target = this.pickTarget(game, lead);

    // Regroup first: a wingman that wanders off is no use to anyone.
    const strayed = lead && lead !== me && distance(me.x, me.y, lead.x, lead.y) > LEASH;
    let aim;
    if (strayed) {
      // Cut the corner rather than tailing: a slower craft can never catch a
      // faster one by flying at where it currently is.
      const gap = distance(me.x, me.y, lead.x, lead.y);
      const ahead = Math.min(gap * 0.5, 180);
      aim = Math.atan2(
        lead.y + Math.sin(lead.angle) * ahead - me.y,
        lead.x + Math.cos(lead.angle) * ahead - me.x,
      );
    } else if (target) {
      const range = distance(me.x, me.y, target.x, target.y);
      const toTarget = Math.atan2(target.y - me.y, target.x - me.x);
      // Peel off an escort at knife range; a flagship cannot be out-circled.
      aim = target !== game.boss && range < STANDOFF ? toTarget + Math.PI / 2 : toTarget;
    } else if (lead && lead !== me) {
      const spot = this.station(lead);
      aim = Math.atan2(spot.y - me.y, spot.x - me.x);
    } else {
      aim = me.angle;
    }

    this.dir = { x: Math.cos(aim), y: Math.sin(aim) };

    // Use the air brake for the corners it was put there for.
    const hardCorner = Math.abs(angleDiff(me.angle, aim)) > 1.1;
    this.held.delete('brake');
    if (hardCorner && me.brakeCharge > 0.35) this.held.add('brake');

    return this;
  }

  direction() {
    return this.dir;
  }

  isHeld(action) {
    return this.held.has(action);
  }

  wasPressed() {
    return false;
  }

  wantsStart() {
    return false;
  }

  endFrame() {}
}
