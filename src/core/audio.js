/**
 * Tiny WebAudio blip synth. No asset files: every sound is generated, which
 * keeps the game a single static folder you can open from any web server.
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noise = null;
  }

  /** Must be called from a user gesture before the first sound. */
  resume() {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  _ready() {
    return Boolean(this.ctx) && !this.muted;
  }

  _blip({ from, to, duration, type = 'square', gain = 0.25, delay = 0 }) {
    if (!this._ready()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + duration);
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noiseBuffer() {
    if (this.noise) return this.noise;
    const length = Math.floor(this.ctx.sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }

  _burst({ duration = 0.4, gain = 0.4, cutoff = 1200 }) {
    if (!this._ready()) return;
    const t0 = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this._noiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(120, t0 + duration);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter).connect(env).connect(this.master);
    source.start(t0);
    source.stop(t0 + duration);
  }

  playerShot() { this._blip({ from: 880, to: 220, duration: 0.08, type: 'square', gain: 0.16 }); }
  enemyShot() { this._blip({ from: 320, to: 140, duration: 0.1, type: 'sawtooth', gain: 0.1 }); }
  hit() { this._blip({ from: 260, to: 120, duration: 0.06, type: 'square', gain: 0.14 }); }
  explosion() { this._burst({ duration: 0.35, gain: 0.35, cutoff: 1400 }); }
  bigExplosion() { this._burst({ duration: 0.9, gain: 0.5, cutoff: 900 }); }
  rescue() {
    this._blip({ from: 660, to: 990, duration: 0.09, type: 'triangle', gain: 0.2 });
    this._blip({ from: 990, to: 1320, duration: 0.12, type: 'triangle', gain: 0.2, delay: 0.09 });
  }
  extraLife() {
    [523, 659, 784, 1046].forEach((freq, i) => {
      this._blip({ from: freq, to: freq, duration: 0.11, type: 'triangle', gain: 0.18, delay: i * 0.09 });
    });
  }
  eraJump() {
    [392, 523, 659, 880, 1174].forEach((freq, i) => {
      this._blip({ from: freq, to: freq * 1.02, duration: 0.14, type: 'square', gain: 0.14, delay: i * 0.1 });
    });
  }
  gameOver() {
    [440, 349, 262, 196].forEach((freq, i) => {
      this._blip({ from: freq, to: freq * 0.98, duration: 0.3, type: 'sawtooth', gain: 0.16, delay: i * 0.22 });
    });
  }
}
