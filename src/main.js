import { Sfx } from './core/audio.js';
import { Input } from './core/input.js';
import { startLoop } from './core/loop.js';
import { Game } from './game/game.js';

const canvas = document.getElementById('screen');
const input = new Input();
const sfx = new Sfx();
const game = new Game(canvas, input, sfx);

input.attach();

// Browsers only allow audio after a user gesture, so wake the synth on the
// first key press or tap and then stop listening.
function unlockAudio() {
  sfx.resume();
  window.removeEventListener('keydown', unlockAudio);
  window.removeEventListener('pointerdown', unlockAudio);
}
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);

// Exposed so the browser console and the headless smoke test can poke at the
// running game (jump eras, summon the flagship) without extra plumbing.
window.game = game;

startLoop({
  update(dt) {
    game.update(dt);
    input.endFrame();
  },
  render() {
    game.render();
  },
});
