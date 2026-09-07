import { turnToward, wrapAngle } from '../core/math.js';
import { drawPlayer } from '../render/sprites.js';

export const PLAYER_SPEED = 178;
export const PLAYER_TURN_RATE = 3.6;
const FIRE_COOLDOWN = 0.18;
const MAX_SHOTS = 8;

/**
 * The player's craft. It always sits at the centre of the screen — the world
 * scrolls around it, which is what gives the game its free-roaming feel.
 */
export class Player {
  constructor() {
    // Deliberately much smaller than the sprite: near misses should read as
    // near misses, not deaths.
    this.radius = 8;
    this.reset(0, 0);
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.fireTimer = 0;
    this.invulnerable = 2.4;
    this.alive = true;
  }

  update(dt, input, game) {
    if (!this.alive) return;

    const dir = input.direction();
    if (dir) {
      this.angle = turnToward(this.angle, Math.atan2(dir.y, dir.x), PLAYER_TURN_RATE * dt);
    }
    this.x += Math.cos(this.angle) * PLAYER_SPEED * dt;
    this.y += Math.sin(this.angle) * PLAYER_SPEED * dt;

    this.fireTimer -= dt;
    if (this.invulnerable > 0) this.invulnerable -= dt;

    const shotsAlive = game.bullets.reduce((n, b) => (b.team === 'player' ? n + 1 : n), 0);
    if (input.isHeld('fire') && this.fireTimer <= 0 && shotsAlive < MAX_SHOTS) {
      this.fireTimer = FIRE_COOLDOWN;
      game.firePlayerBullet(
        this.x + Math.cos(this.angle) * 18,
        this.y + Math.sin(this.angle) * 18,
        this.angle,
      );
    }
  }

  /** Blink while the respawn shield is up. */
  get visible() {
    return this.invulnerable <= 0 || Math.floor(this.invulnerable * 12) % 2 === 0;
  }

  draw(ctx, cam, time) {
    if (!this.alive || !this.visible) return;
    const sx = this.x - cam.x + cam.width / 2;
    const sy = this.y - cam.y + cam.height / 2;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(wrapAngle(this.angle));
    ctx.scale(1.3, 1.3);
    drawPlayer(ctx, { thrust: true, time });
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
}
