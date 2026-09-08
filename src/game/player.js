import { turnToward, wrapAngle } from '../core/math.js';
import { drawPlayer, drawPod } from '../render/sprites.js';
import { craftById, DEFAULT_CRAFT } from './craft.js';
import { WEAPONS } from './gear.js';

/**
 * The player's craft. It always sits at the centre of the screen — the world
 * scrolls around it, which is what gives the game its free-roaming feel.
 *
 * Every performance figure comes from the craft table, so switching airframes
 * is the only thing that changes how this behaves.
 */
/** Grace period after a non-fatal hit, so one collision costs one point. */
const HIT_INVULNERABLE = 1.1;

/**
 * The air brake is a resource, not a mode. Held down it drains in a couple of
 * seconds and takes about as long to come back, so it buys one hard corner at
 * a time rather than becoming the way you always fly. Once it empties it has
 * to recover past BRAKE_MIN before it will bite again, which stops it
 * stuttering on and off at the bottom of the gauge.
 */
const BRAKE_DRAIN = 0.5;
const BRAKE_REFILL = 0.42;
const BRAKE_MIN = 0.18;

/**
 * The afterburner is the brake's opposite number and works the same way: a
 * reserve, not a mode. It burns faster than the brake and comes back slower,
 * so it is worth about a second and a half of straight-line speed. Holding it
 * while it is spent does not recharge it, for the same reason the brake
 * behaves that way — otherwise it stutters at the bottom of the gauge.
 *
 * Deliberately not a free upgrade: it costs turn rate, so a burn is a
 * commitment to a straight line. Anyone who burns through a turning fight
 * arrives fast and pointing the wrong way.
 */
const BURNER_DRAIN = 0.62;
const BURNER_REFILL = 0.30;
const BURNER_MIN = 0.25;

/**
 * How long a pilot hangs under the silk before the sky claims them.
 *
 * Long, because of what happens when it runs out: the pilot sits out the rest
 * of the era. A window that expires while nobody has quite got round to you is
 * one thing when it costs a craft, and another when it costs the stage.
 */
export const RESCUE_WINDOW = 40;
/** A drifting pilot steers weakly — enough to meet a rescuer halfway. */
const CHUTE_STEER = 46;
/** However the multipliers stack, a craft never turns faster than this. */
const TURN_CEILING = 8;

export class Player {
  constructor(craftId = DEFAULT_CRAFT, { local = true, name = 'P1', index = 0 } = {}) {
    this.pods = [];
    // Which seat this is. Everything else about a craft is identical whether
    // a person, a wingman or (later) a peer is flying it.
    this.local = local;
    this.name = name;
    this.index = index;
    this.lives = 0;
    this.downTimer = 0;
    this.out = false;
    this.chute = null;
    // Shot down, not rescued, and waiting out the era from the other side.
    this.stranded = false;
    // The airframe this seat started in. Modules are always resolved from
    // here, never from the craft as it currently stands, or a rank would
    // compound on the last one.
    this.baseId = typeof craftId === 'string' ? craftId : craftId.id;
    this.modules = [];
    this.setCraft(craftId);
    this.reset(0, 0);
  }

  setCraft(craft) {
    this.craft = typeof craft === 'string' ? craftById(craft) : craft;
    // The hitbox is deliberately well inside the sprite: a near miss should
    // read as a near miss, not a death.
    this.radius = this.craft.radius;
  }

  /**
   * Swaps in new statistics without interrupting the flight, which is what a
   * module picked up mid-run needs. Armour gained is granted rather than
   * merely raising the ceiling, so the pickup is felt immediately.
   */
  applyCraft(craft) {
    const gained = Math.max(0, craft.hp - this.maxHp);
    this.setCraft(craft);   // also brings the bit count into line
    this.maxHp = craft.hp;
    this.hp = Math.min(this.maxHp, this.hp + gained);
    this.syncPods();
  }

  /** Keeps the escort bits in step with however many the craft now carries. */
  syncPods() {
    const wanted = this.craft.podCount;
    while (this.pods.length > wanted) this.pods.pop();
    while (this.pods.length < wanted) {
      this.pods.push({ x: this.x, y: this.y, angle: this.angle, fireTimer: 0.3 + this.pods.length * 0.12 });
    }
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.maxHp = this.craft.hp;
    this.hp = this.craft.hp;
    this.hitFlash = 0;
    this.brakeCharge = 1;
    this.braking = false;
    this.burnerCharge = 1;
    this.boosting = false;
    this.downTimer = 0;
    this.chute = null;
    this.stranded = false;
    this.fireTimer = 0;
    this.sinceFired = 99;
    this.trailTimer = 0;
    this.invulnerable = this.craft.respawnShield;
    this.alive = true;
    this.pods = [];
    this.syncPods();
    this.missileTimer = this.craft.missile ? WEAPONS.missile(this.craft.missile).interval : 0;
    this.flareTimer = this.craft.flare ? WEAPONS.flare(this.craft.flare).interval : 0;
    this.laserTimer = this.craft.laser ? WEAPONS.laser(this.craft.laser).interval : 0;
    this.laserActive = 0;
    this.laserTick = 0;
    this.swarmTimer = this.craft.swarm ? WEAPONS.swarm(this.craft.swarm).interval : 0;
  }

  /**
   * The afterburner. The brake wins if somebody holds both: asking a craft to
   * speed up and slow down at once should do the safe thing.
   */
  updateBurner(dt, input) {
    if (input.isHeld('boost') && !this.braking) {
      const enough = this.boosting ? this.burnerCharge > 0 : this.burnerCharge >= BURNER_MIN;
      if (enough) {
        this.boosting = true;
        this.burnerCharge = Math.max(0, this.burnerCharge - BURNER_DRAIN * dt);
        if (this.burnerCharge === 0) this.boosting = false;
        return;
      }
      this.boosting = false;
      return;
    }
    this.boosting = false;
    this.burnerCharge = Math.min(1, this.burnerCharge + BURNER_REFILL * dt);
  }

  updateBrake(dt, input) {
    if (input.isHeld('brake')) {
      const enough = this.braking ? this.brakeCharge > 0 : this.brakeCharge >= BRAKE_MIN;
      if (enough) {
        this.braking = true;
        this.brakeCharge = Math.max(0, this.brakeCharge - BRAKE_DRAIN * dt);
        if (this.brakeCharge === 0) this.braking = false;
        return;
      }
      // Held but spent. It stays spent: recharging under the player's thumb
      // would make the brake stutter on and off instead of running out.
      this.braking = false;
      return;
    }
    this.braking = false;
    this.brakeCharge = Math.min(1, this.brakeCharge + BRAKE_REFILL * dt);
  }

  /**
   * Takes one point of damage. Returns what happened so the caller can decide
   * how loud to be about it: 'ignored' while the shield is up, 'damaged' for a
   * hit the craft flies away from, 'destroyed' when the armour is gone.
   */
  takeHit() {
    if (!this.alive || this.invulnerable > 0) return 'ignored';
    this.hp -= 1;
    this.hitFlash = 0.25;
    if (this.hp > 0) {
      this.invulnerable = HIT_INVULNERABLE;
      return 'damaged';
    }
    this.hp = 0;
    this.alive = false;
    this.downTimer = 1.9;
    return 'destroyed';
  }

  /** In the air right now: not destroyed, and not out of craft altogether. */
  get flying() {
    return this.alive && !this.out;
  }

  /**
   * The craft is gone; the pilot is not. They hang under a parachute where
   * they went down and only a mate flying into them puts them back up. It is
   * the one thing in this game nobody can do for themselves.
   */
  bailOut() {
    this.chute = {
      timer: RESCUE_WINDOW,
      window: RESCUE_WINDOW,
      phase: Math.random() * Math.PI * 2,
      drift: (Math.random() - 0.5) * 20,
      fall: 20 + Math.random() * 10,
    };
    this.downTimer = RESCUE_WINDOW;
  }

  /** Hanging under the silk, waiting for someone. */
  get downed() {
    return !this.alive && !this.out && this.chute !== null;
  }

  /**
   * Drifts the pilot. The seat still steers, weakly, so a downed player has
   * something to do with their hands and can close half the gap themselves
   * instead of watching someone else fly.
   */
  updateChute(dt, input) {
    const chute = this.chute;
    if (!chute) return;
    chute.phase += dt;
    chute.timer -= dt;
    this.downTimer = chute.timer;
    const dir = input && input.direction ? input.direction() : null;
    const steerX = dir ? dir.x * CHUTE_STEER : 0;
    const steerY = dir ? dir.y * CHUTE_STEER : 0;
    this.x += (chute.drift + Math.sin(chute.phase * 1.5) * 10 + steerX) * dt;
    this.y += (chute.fall + steerY) * dt;
  }

  /** Throttle setting right now: full, or back on the brake. */
  get speed() {
    if (this.braking) return this.craft.speed * this.craft.brake.speed;
    if (this.boosting) return this.craft.speed * this.craft.burner.speed;
    return this.craft.speed;
  }

  /**
   * True while a stealth craft is holding its fire. Escorts cannot find it;
   * firing gives the position away again for the craft's reveal window.
   */
  get hidden() {
    const stealth = this.craft.stealth;
    return Boolean(stealth) && this.alive && this.sinceFired >= stealth.reveal;
  }

  /** Craft with a glide bonus turn tighter while they hold their fire. */
  get turnRate() {
    const glide = this.craft.glideTurn;
    const base = glide && this.sinceFired >= glide.after ? glide.turnRate : this.craft.turnRate;
    let rate = base;
    if (this.braking) rate *= this.craft.brake.turn;
    else if (this.boosting) rate *= this.craft.burner.turn;
    return Math.min(rate, TURN_CEILING);
  }

  /**
   * Flying, and nothing else: turn, throttle, move. No guns, no timers.
   *
   * A guest predicts its own craft with this while the host remains the only
   * thing that decides whether a shot was fired or a hit landed. Running the
   * whole of update() on a guest would have it firing its own bullets, which
   * the host has never heard of.
   */
  steer(dt, input) {
    if (!this.alive) return;
    this.updateBrake(dt, input);
    this.updateBurner(dt, input);
    const dir = input.direction();
    if (dir) {
      this.angle = turnToward(this.angle, Math.atan2(dir.y, dir.x), this.turnRate * dt);
    }
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
  }

  update(dt, input, game) {
    if (!this.alive) return;
    const craft = this.craft;

    this.updateBrake(dt, input);
    this.updateBurner(dt, input);

    const dir = input.direction();
    if (dir) {
      this.angle = turnToward(this.angle, Math.atan2(dir.y, dir.x), this.turnRate * dt);
    }
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    this.fireTimer -= dt;
    this.sinceFired += dt;
    if (this.invulnerable > 0) this.invulnerable -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // Rounds this pilot has in the air. Counting every player's rounds made
    // the magazine a shared pool: two people firing halved each other's rate
    // of fire, four people quartered it.
    const shotsAlive = game.bullets.reduce(
      (n, b) => (b.team === 'player' && b.owner === this.index ? n + 1 : n), 0,
    );
    if (input.isHeld('fire') && this.fireTimer <= 0 && shotsAlive < craft.maxShots) {
      this.fireTimer = craft.fireCooldown;
      this.sinceFired = 0;
      game.firePlayerVolley(this);
    }

    if (craft.trail) {
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = craft.trail.every;
        game.effects.trail(
          this.x - Math.cos(this.angle) * 16,
          this.y - Math.sin(this.angle) * 16,
          craft.trail.colors,
        );
      }
    }

    this.updateWeapons(dt, game);
    for (let i = 0; i < this.pods.length; i += 1) this.updatePod(dt, game, this.pods[i], i);
  }

  /**
   * Everything that fires on its own clock rather than on the trigger:
   * missiles, flares, the beam and the swarm.
   */
  updateWeapons(dt, game) {
    const craft = this.craft;

    if (craft.missile > 0) {
      const spec = WEAPONS.missile(craft.missile);
      this.missileTimer -= dt;
      if (this.missileTimer <= 0) {
        this.missileTimer = spec.interval;
        game.fireMissiles(this, spec);
      }
    }

    if (craft.flare > 0) {
      const spec = WEAPONS.flare(craft.flare);
      this.flareTimer -= dt;
      if (this.flareTimer <= 0) {
        this.flareTimer = spec.interval;
        game.dropFlare(this, spec);
      }
    }

    if (craft.laser > 0) {
      const spec = WEAPONS.laser(craft.laser);
      if (this.laserActive > 0) {
        this.laserActive -= dt;
        this.laserTick -= dt;
        if (this.laserTick <= 0) {
          this.laserTick = spec.tick;
          game.burnWithBeam(this, spec);
        }
      } else {
        this.laserTimer -= dt;
        if (this.laserTimer <= 0) {
          this.laserTimer = spec.interval;
          this.laserActive = spec.duration;
          this.laserTick = 0;
          game.sfx.playerShot();
        }
      }
    }

    if (craft.swarm > 0) {
      const spec = WEAPONS.swarm(craft.swarm);
      this.swarmTimer -= dt;
      if (this.swarmTimer <= 0) {
        this.swarmTimer = spec.interval;
        game.fireSwarm(this, spec);
      }
    }
  }

  /**
   * The maneuver pod trails the craft and shoots for itself, picking whatever
   * is closest rather than following the player's aim.
   */
  updatePod(dt, game, pod, index) {
    // Bits sit in a fan behind the craft, alternating left and right so a full
    // set of six still reads as a formation rather than a clump.
    const side = index % 2 === 0 ? 1 : -1;
    const rank = Math.floor(index / 2);
    const back = 24 + rank * 15;
    const out = (20 + rank * 13) * side;
    const anchorX = this.x - Math.cos(this.angle) * back - Math.sin(this.angle) * out;
    const anchorY = this.y - Math.sin(this.angle) * back + Math.cos(this.angle) * out;
    pod.x += (anchorX - pod.x) * Math.min(1, dt * 7);
    pod.y += (anchorY - pod.y) * Math.min(1, dt * 7);

    const target = game.nearestTarget(pod.x, pod.y, 460);
    pod.angle = target
      ? Math.atan2(target.y - pod.y, target.x - pod.x)
      : this.angle;

    pod.fireTimer -= dt;
    if (target && pod.fireTimer <= 0) {
      pod.fireTimer = 0.42;
      game.firePodShot(this, pod.x, pod.y, pod.angle);
    }
  }

  /** Blink while the respawn shield is up. */
  get visible() {
    return this.invulnerable <= 0 || Math.floor(this.invulnerable * 12) % 2 === 0;
  }

  draw(ctx, cam, time) {
    if (!this.alive) return;
    const sx = this.x - cam.x + cam.width / 2;
    const sy = this.y - cam.y + cam.height / 2;

    for (const pod of this.pods) {
      ctx.save();
      ctx.translate(pod.x - cam.x + cam.width / 2, pod.y - cam.y + cam.height / 2);
      ctx.rotate(pod.angle);
      drawPod(ctx, this.craft.colors, time);
      ctx.restore();
    }

    if (!this.visible) return;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(wrapAngle(this.angle));
    ctx.scale(1.3, 1.3);
    // Faded while unseen, so the state is legible without reading the HUD.
    if (this.hidden) ctx.globalAlpha = 0.5;
    if (this.braking) {
      // Boards out: two slabs of drag either side of the tail.
      ctx.fillStyle = this.craft.colors.accent;
      ctx.globalAlpha *= 0.75;
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-10, sign * 5);
        ctx.lineTo(-17, sign * 13);
        ctx.lineTo(-21, sign * 10);
        ctx.lineTo(-14, sign * 3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = this.hidden ? 0.5 : 1;
    }
    if (this.boosting) {
      // A long flame off the tail that flickers with the frame, so a burn is
      // obvious to everyone else in the flight, not just to whoever is on it.
      const flicker = 1 + Math.sin(time * 40) * 0.16;
      const grad = ctx.createLinearGradient(-10, 0, -46 * flicker, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.35, 'rgba(255,179,71,0.8)');
      grad.addColorStop(1, 'rgba(255,107,107,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-8, -6);
      ctx.lineTo(-46 * flicker, 0);
      ctx.lineTo(-8, 6);
      ctx.closePath();
      ctx.fill();
    }
    drawPlayer(ctx, { id: this.craft.id, colors: this.craft.colors, thrust: true, time });
    if (this.hitFlash > 0) {
      ctx.globalAlpha = Math.min(0.75, this.hitFlash * 3);
      ctx.globalCompositeOperation = 'lighter';
      drawPlayer(ctx, {
        id: this.craft.id,
        colors: { body: '#ff6b6b', wing: '#ff6b6b', wingAlt: '#ff6b6b', glass: '#ff6b6b', accent: '#ff6b6b' },
        thrust: false,
        time,
      });
    }
    ctx.restore();

    if (this.invulnerable > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(time * 12) * 0.15;
      ctx.strokeStyle = '#7cf5ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Reticle the S.Wind's fire control paints on whatever it has locked. */
  drawLock(ctx, cam, game, time) {
    if (!this.craft.lockOn || !this.alive) return;
    const target = game.nearestTarget(this.x, this.y, 520);
    if (!target) return;
    const sx = target.x - cam.x + cam.width / 2;
    const sy = target.y - cam.y + cam.height / 2;
    const size = target.radius + 14 + Math.sin(time * 6) * 2;
    ctx.save();
    ctx.strokeStyle = this.craft.colors.accent;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.85;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(sx + cx * size, sy + cy * size - cy * size * 0.55);
      ctx.lineTo(sx + cx * size, sy + cy * size);
      ctx.lineTo(sx + cx * size - cx * size * 0.55, sy + cy * size);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(this.x - cam.x + cam.width / 2, this.y - cam.y + cam.height / 2);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.restore();
  }
}
