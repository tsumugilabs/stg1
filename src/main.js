import { Sfx } from './core/audio.js';
import { Input } from './core/input.js';
import { startLoop } from './core/loop.js';
import { TouchControls } from './core/touch.js';
import { Game } from './game/game.js';
import { Room } from './net/room.js';
import { drawEnemy } from './render/sprites.js';
import { ERAS } from './game/levels.js';
import { makePart, MODULES, RARITIES, rollModule } from './game/gear.js';
import { CRAFT } from './game/craft.js';

const canvas = document.getElementById('screen');

// The canvas is laid out by CSS; its backing store is sized here to match the
// box's shape. Keeping the pixel count near the 960x720 reference means a wide
// phone in landscape and a tall one upright both show a comparable slice of
// sky, instead of the game being letterboxed into a corner of the screen.
const REFERENCE_PIXELS = 960 * 720;

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(rect.width, 1);
  const cssHeight = Math.max(rect.height, 1);
  const scale = Math.min(Math.max(Math.sqrt(REFERENCE_PIXELS / (cssWidth * cssHeight)), 0.5), 3);
  const width = Math.round(cssWidth * scale);
  const height = Math.round(cssHeight * scale);
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
}

fitCanvas();

const input = new Input();
const touch = new TouchControls();
const sfx = new Sfx();
const game = new Game(canvas, input, sfx);

input.attach();
input.useTouch(touch);
touch.attach(canvas);

// Browsers only allow audio after a user gesture, so wake the synth on the
// first key press or tap and then stop listening.
function unlockAudio() {
  sfx.resume();
  window.removeEventListener('keydown', unlockAudio);
  window.removeEventListener('pointerdown', unlockAudio);
}
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);

// Exposed so the browser console and the headless checks can poke at the
// running game (jump eras, summon the flagship) without extra plumbing.
// drawEnemy and ERAS are here so escort artwork can be rendered to a plate at
// whatever scale you like, which is how the sprites get reviewed.
window.game = game;
// The classes themselves, so a headless check can stand a second game up and
// wire the two together through a fake wire. Netcode that can only be tested
// by two people on two phones does not get tested.
window.Game = Game;
window.Input = Input;
window.Room = Room;
window.__drawEnemy = drawEnemy;
window.__eras = ERAS;
window.__makePart = makePart;
window.__modules = MODULES;
window.__rarities = RARITIES;
window.__craft = CRAFT;
window.__rollModule = rollModule;

function handleResize() {
  fitCanvas();
  game.resize();
}
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);

// The stop handle is kept so the headless checks can take the wheel: a
// measurement that has to run at sixty frames a second in real time can only
// afford a couple of passes, and flying the same canyon a dozen ways is worth
// more than flying it once at wall-clock speed.
window.__stopLoop = startLoop({
  update(dt) {
    game.update(dt);
    input.endFrame();
  },
  render() {
    game.render();
  },
});
window.__step = (dt = 1 / 60) => {
  game.update(dt);
  input.endFrame();
};
