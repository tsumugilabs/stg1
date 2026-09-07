/**
 * On-screen controls for touch devices.
 *
 * The controls are drawn onto the game canvas rather than as DOM elements, so
 * they scale with the canvas on every screen size and need no separate layout.
 * Hit testing therefore works in canvas coordinates too, and LAYOUT below is
 * the single source of truth for both drawing and hit testing.
 */

const DEAD_ZONE = 14;

/**
 * Control placement, derived from the current canvas size so the buttons stay
 * under the same thumbs whatever aspect ratio the device has.
 */
function layout(w, h) {
  const unit = Math.min(w, h);
  const button = Math.max(44, Math.min(unit * 0.105, 66));
  const inset = button + unit * 0.055;
  return {
    stickHome: { x: inset + 8, y: h - inset - 8 },
    stickRadius: button * 1.12,
    stickTravel: button * 1.28,
    knobRadius: button * 0.44,
    fire: { x: w - inset, y: h - inset, r: button },
    auto: { x: w - inset, y: h - inset - button - 42, w: 124, h: 38 },
    pause: { x: w - 48, y: 78, r: 27 },
  };
}

const UI_INK = '#eaf3ff';
const UI_DIM = '#9fb6d1';

function inCircle(point, circle) {
  return Math.hypot(point.x - circle.x, point.y - circle.y) <= circle.r;
}

function inBox(point, box) {
  return Math.abs(point.x - box.x) <= box.w / 2 && Math.abs(point.y - box.y) <= box.h / 2;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function centeredText(ctx, text, x, y, size, color) {
  ctx.font = `bold ${size}px "Courier New", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export class TouchControls {
  constructor() {
    this.enabled = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    // Steering needs a thumb of its own, so shooting is automatic by default
    // and the game stays playable one-handed. The AUTO chip turns it off.
    this.autoFire = true;
    this.stick = null;
    this.firePointer = null;
    this.pauseTapped = false;
    this.tapped = false;
    this.canvas = null;
  }

  attach(canvas) {
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._up(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (event.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  _layout() {
    return layout(this.canvas.width, this.canvas.height);
  }

  _down(event) {
    if (event.pointerType === 'touch') this.enabled = true;
    if (!this.enabled) return;
    event.preventDefault();
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer can already be gone; capture is an optimisation, not a need */
    }
    const point = this._point(event);
    const ui = this._layout();

    if (inCircle(point, ui.pause)) {
      this.pauseTapped = true;
      return;
    }
    if (inBox(point, ui.auto)) {
      this.autoFire = !this.autoFire;
      return;
    }

    // Everything else counts as "tap to start" on the title and game over screens.
    this.tapped = true;

    if (inCircle(point, ui.fire)) {
      this.firePointer = event.pointerId;
      return;
    }
    this.stick = { id: event.pointerId, ox: point.x, oy: point.y, x: point.x, y: point.y };
  }

  _move(event) {
    if (!this.stick || this.stick.id !== event.pointerId) return;
    event.preventDefault();
    const point = this._point(event);
    this.stick.x = point.x;
    this.stick.y = point.y;
  }

  _up(event) {
    if (this.stick && this.stick.id === event.pointerId) this.stick = null;
    if (this.firePointer === event.pointerId) this.firePointer = null;
  }

  /** Steering vector from the stick, or null while it is inside the dead zone. */
  direction() {
    if (!this.enabled || !this.stick) return null;
    const dx = this.stick.x - this.stick.ox;
    const dy = this.stick.y - this.stick.oy;
    const length = Math.hypot(dx, dy);
    if (length < DEAD_ZONE) return null;
    return { x: dx / length, y: dy / length };
  }

  get firing() {
    return this.enabled && (this.autoFire || this.firePointer !== null);
  }

  endFrame() {
    this.pauseTapped = false;
    this.tapped = false;
  }

  draw(ctx, { showSticks }) {
    if (!this.enabled) return;
    ctx.save();
    const ui = this._layout();

    // Pause / resume.
    const p = ui.pause;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#04101d';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = UI_DIM;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = UI_INK;
    if (showSticks) {
      ctx.fillRect(p.x - 8, p.y - 9, 6, 18);
      ctx.fillRect(p.x + 2, p.y - 9, 6, 18);
    } else {
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y - 9);
      ctx.lineTo(p.x + 10, p.y);
      ctx.lineTo(p.x - 6, p.y + 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!showSticks) {
      ctx.restore();
      return;
    }

    // Steering stick: a faint home ring until a thumb lands, then it follows.
    const base = this.stick ? { x: this.stick.ox, y: this.stick.oy } : ui.stickHome;
    const knob = this.direction();
    const travel = this.stick
      ? Math.min(Math.hypot(this.stick.x - this.stick.ox, this.stick.y - this.stick.oy), ui.stickTravel)
      : 0;
    ctx.globalAlpha = this.stick ? 0.4 : 0.2;
    ctx.strokeStyle = UI_INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(base.x, base.y, ui.stickRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = this.stick ? 0.75 : 0.28;
    ctx.fillStyle = UI_INK;
    ctx.beginPath();
    ctx.arc(base.x + (knob ? knob.x * travel : 0), base.y + (knob ? knob.y * travel : 0), ui.knobRadius, 0, Math.PI * 2);
    ctx.fill();

    // Fire button.
    const f = ui.fire;
    const pressed = this.firePointer !== null;
    ctx.globalAlpha = pressed ? 0.8 : 0.42;
    ctx.fillStyle = pressed ? '#ff8f5e' : '#04101d';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = pressed ? '#ffd166' : UI_DIM;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
    centeredText(ctx, 'FIRE', f.x, f.y, Math.round(f.r * 0.34), pressed ? '#1a0f06' : UI_INK);

    // Auto-fire toggle.
    const a = ui.auto;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = this.autoFire ? '#1d3a4d' : '#04101d';
    roundedRect(ctx, a.x - a.w / 2, a.y - a.h / 2, a.w, a.h, 12);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = this.autoFire ? '#7cf5ff' : UI_DIM;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    centeredText(ctx, this.autoFire ? 'AUTO ON' : 'AUTO OFF', a.x, a.y, 15, this.autoFire ? '#7cf5ff' : UI_DIM);

    ctx.restore();
  }
}
