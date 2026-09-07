/** Keyboard input with both "held" and "pressed this frame" queries. */

const BINDINGS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'fire', KeyZ: 'fire', KeyJ: 'fire',
  Enter: 'start', NumpadEnter: 'start',
  KeyP: 'pause', Escape: 'pause',
  KeyM: 'mute',
};

const SWALLOWED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor(target = window) {
    this.target = target;
    this.touch = null;
    this.held = new Set();
    this.pressed = new Set();
    this.anyKeyPressed = false;
    this._onKeyDown = (event) => this._handleDown(event);
    this._onKeyUp = (event) => this._handleUp(event);
    this._onBlur = () => this.held.clear();
  }

  attach() {
    this.target.addEventListener('keydown', this._onKeyDown);
    this.target.addEventListener('keyup', this._onKeyUp);
    this.target.addEventListener('blur', this._onBlur);
  }

  detach() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    this.target.removeEventListener('blur', this._onBlur);
  }

  _handleDown(event) {
    if (SWALLOWED.has(event.code)) event.preventDefault();
    const action = BINDINGS[event.code];
    if (!action) return;
    if (!event.repeat) {
      this.pressed.add(action);
      this.anyKeyPressed = true;
    }
    this.held.add(action);
  }

  _handleUp(event) {
    const action = BINDINGS[event.code];
    if (action) this.held.delete(action);
  }

  /** Touch controls stand in for the keyboard when one is attached. */
  useTouch(touch) {
    this.touch = touch;
  }

  isHeld(action) {
    if (action === 'fire' && this.touch && this.touch.firing) return true;
    return this.held.has(action);
  }

  wasPressed(action) {
    if (action === 'pause' && this.touch && this.touch.pauseTapped) return true;
    return this.pressed.has(action);
  }

  /** True for the dedicated start keys, the fire button, or a tap. */
  wantsStart() {
    if (this.touch && this.touch.tapped) return true;
    return this.wasPressed('start') || this.wasPressed('fire');
  }

  /** Normalised 8-way steering vector, or null when the stick is centred. */
  direction() {
    let x = 0;
    let y = 0;
    if (this.isHeld('left')) x -= 1;
    if (this.isHeld('right')) x += 1;
    if (this.isHeld('up')) y -= 1;
    if (this.isHeld('down')) y += 1;
    if (x === 0 && y === 0) return this.touch ? this.touch.direction() : null;
    const length = Math.hypot(x, y);
    return { x: x / length, y: y / length };
  }

  /** Call once at the end of every frame to expire edge-triggered presses. */
  endFrame() {
    this.pressed.clear();
    this.anyKeyPressed = false;
    if (this.touch) this.touch.endFrame();
  }
}
