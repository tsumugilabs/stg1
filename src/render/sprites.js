import { CRAFT_ART } from './craft-art.js';

/**
 * Vector sprites. Every craft is drawn in local space with its nose pointing
 * along +X, so callers only need translate() + rotate(angle).
 */

function polygon(ctx, points, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawExhaust(ctx, x, length, colors) {
  const inner = length * 0.6;
  polygon(ctx, [[x, -3.5], [x - length, 0], [x, 3.5]], colors.accent);
  polygon(ctx, [[x, -2], [x - inner, 0], [x, 2]], '#fff2c4');
}

function drawViper(ctx, colors) {
  polygon(ctx, [[-2, -15], [5, -13], [6, 13], [-2, 15]], colors.wing);
  polygon(ctx, [[-13, -8], [-9, -7], [-9, 7], [-13, 8]], colors.wingAlt);
  polygon(ctx, [[17, 0], [4, 6], [-12, 5], [-14, 0], [-12, -5], [4, -6]], colors.body);
  polygon(ctx, [[-6, 0], [-13, -1.5], [-13, 1.5]], colors.wingAlt);
  ctx.beginPath();
  ctx.arc(4, 0, 3, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
}

/** Draken: the double delta, a narrow forward wing over a wide rear one. */
function drawDragon(ctx, colors) {
  polygon(ctx, [[8, 0], [-9, -17], [-15, -15], [-9, 0], [-15, 15], [-9, 17]], colors.wing);
  polygon(ctx, [[14, 0], [1, -8], [-4, -7], [-4, 7], [1, 8]], colors.wingAlt);
  polygon(ctx, [[19, 0], [7, 4], [-14, 4.5], [-16, 0], [-14, -4.5], [7, -4]], colors.body);
  polygon(ctx, [[-4, 0], [-15, -2], [-15, 2]], colors.wingAlt);
  ctx.beginPath();
  ctx.arc(7, 0, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
}

/** F-15: broad shoulders, twin canted tails, two engines. */
function drawEagle(ctx, colors) {
  polygon(ctx, [[4, -19], [11, -17], [10, 17], [4, 19], [-8, 16], [-5, 0], [-8, -16]], colors.wing);
  polygon(ctx, [[-9, -13], [-2, -12], [-3, -5], [-10, -6]], colors.wingAlt);
  polygon(ctx, [[-9, 13], [-2, 12], [-3, 5], [-10, 6]], colors.wingAlt);
  polygon(ctx, [[19, 0], [8, 5], [-14, 7], [-16, 0], [-14, -7], [8, -5]], colors.body);
  ctx.fillStyle = colors.wingAlt;
  ctx.fillRect(-15, -7.5, 5, 5);
  ctx.fillRect(-15, 2.5, 5, 5);
  ctx.beginPath();
  ctx.arc(6, 0, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
}

/** Super Sylph: canards up front, delta wing, twin canted fins, lit edges. */
function drawSwind(ctx, colors, time) {
  polygon(ctx, [[6, 0], [-10, -18], [-16, -16], [-11, 0], [-16, 16], [-10, 18]], colors.wing);
  polygon(ctx, [[13, -4], [8, -13], [4, -12], [7, -3]], colors.wingAlt);
  polygon(ctx, [[13, 4], [8, 13], [4, 12], [7, 3]], colors.wingAlt);
  polygon(ctx, [[-8, -12], [-15, -14], [-17, -7], [-11, -6]], colors.wingAlt);
  polygon(ctx, [[-8, 12], [-15, 14], [-17, 7], [-11, 6]], colors.wingAlt);
  polygon(ctx, [[21, 0], [8, 4.5], [-15, 5], [-17, 0], [-15, -5], [8, -4.5]], colors.body);
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.55 + Math.sin(time * 7) * 0.35;
  ctx.beginPath();
  ctx.moveTo(18, -2.4); ctx.lineTo(-13, -3.4);
  ctx.moveTo(18, 2.4); ctx.lineTo(-13, 3.4);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(8, 0, 3, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
}

/** F-22: diamond wings, twin canted tails, stabilators, two nozzles. */
function drawRaptor(ctx, colors) {
  for (const sign of [-1, 1]) {
    polygon(ctx, [[7, sign * 4], [-3, sign * 20], [-13, sign * 20], [-11, sign * 5]], colors.wing);
  }
  for (const sign of [-1, 1]) {
    polygon(ctx, [[-13, sign * 6], [-20, sign * 15], [-24, sign * 14], [-18, sign * 5]], colors.wingAlt);
  }
  for (const sign of [-1, 1]) {
    polygon(ctx, [[-8, sign * 6], [-17, sign * 12], [-19, sign * 10], [-11, sign * 5]], colors.wingAlt);
  }
  polygon(ctx, [[21, 0], [13, 4], [8, 6], [-17, 6.5], [-19, 0], [-17, -6.5], [8, -6], [13, -4]], colors.body);
  ctx.fillStyle = colors.wingAlt;
  ctx.fillRect(-20, -6, 5, 4.5);
  ctx.fillRect(-20, 1.5, 5, 4.5);
  polygon(ctx, [[10, 0], [3, 3], [-1, 0], [3, -3]], colors.glass);
}

const CRAFT_SHAPES = {
  viper: drawViper,
  dragon: drawDragon,
  eagle: drawEagle,
  raptor: drawRaptor,
  swind: drawSwind,
};

// Artwork is decoded once at load. Until it is ready — and if a browser
// refuses the data URI outright — the vector airframes above stand in, so the
// game is never unplayable because of a picture.
const CRAFT_IMAGES = {};
if (typeof Image !== 'undefined') {
  for (const [id, src] of Object.entries(CRAFT_ART)) {
    const image = new Image();
    image.src = src;
    CRAFT_IMAGES[id] = image;
  }
}

/** The artwork is drawn to this wingspan, matching the vector airframes. */
const ART_SPAN = 32;

function artFor(id) {
  const image = CRAFT_IMAGES[id];
  return image && image.complete && image.naturalWidth > 0 ? image : null;
}

/** Draws a player craft, nose along +X. `id` selects the airframe. */
export function drawPlayer(ctx, { id = 'viper', colors, thrust = true, time = 0 } = {}) {
  const palette = colors ?? {
    body: '#e9f2ff', wing: '#8fb6e0', wingAlt: '#7aa3d0', glass: '#1c3a5c', accent: '#ffb347',
  };

  const art = artFor(id);
  if (art) {
    // The artwork carries its own exhaust, so the flicker is a glow behind it
    // rather than a second flame.
    if (thrust) {
      const glow = 5 + Math.sin(time * 40) * 2.5;
      ctx.globalAlpha = 0.5;
      polygon(ctx, [[-ART_SPAN * 0.42, -3], [-ART_SPAN * 0.42 - glow, 0], [-ART_SPAN * 0.42, 3]], palette.accent);
      ctx.globalAlpha = 1;
    }
    const scale = ART_SPAN / art.naturalHeight;
    const width = art.naturalWidth * scale;
    ctx.drawImage(art, -width / 2, -ART_SPAN / 2, width, ART_SPAN);
    return;
  }

  if (thrust) {
    const flicker = 6 + Math.sin(time * 40) * 3;
    drawExhaust(ctx, id === 'eagle' ? -16 : -15, flicker + 7, palette);
  }
  (CRAFT_SHAPES[id] ?? drawViper)(ctx, palette, time);
}

/** A small drone that flies alongside the S.Wind and fires with it. */
export function drawPod(ctx, colors, time) {
  ctx.save();
  ctx.rotate(time * 3);
  polygon(ctx, [[7, 0], [-3, -5], [-5, 0], [-3, 5]], colors.wingAlt);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = colors.accent;
  ctx.fill();
}

// Enemy artwork stays in the original local-space envelope. All airframe
// pigments come from the caller's palette, including the white hit-flash pass.
function airframeMetal(ctx, colors, halfSpan) {
  const paint = ctx.createLinearGradient(0, -halfSpan, 0, halfSpan);
  paint.addColorStop(0, colors.wingAlt);
  paint.addColorStop(0.36, colors.body);
  paint.addColorStop(0.52, colors.body);
  paint.addColorStop(1, colors.wing);
  return paint;
}

function airframeLine(ctx, points, color, width = 0.6, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(...points[i]);
  ctx.stroke();
  ctx.restore();
}

function airframeOval(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function airframeCanopy(ctx, x, length, width, colors) {
  airframeOval(ctx, x, 0, length, width, colors.wingAlt);
  const glass = ctx.createLinearGradient(0, -width, 0, width);
  glass.addColorStop(0, colors.body);
  glass.addColorStop(0.3, colors.glass);
  glass.addColorStop(1, colors.glass);
  airframeOval(ctx, x + 0.25, 0, length * 0.86, width * 0.8, glass);
  airframeLine(ctx, [[x - length * 0.4, -width * 0.65], [x + length * 0.55, -width * 0.45]], colors.body, 0.55, 0.8);
}

/** Propellers seen from above: a narrow swept disc perpendicular to +X. */
function drawPropeller(ctx, x, radius, time, colors, phase = 0) {
  ctx.save();
  ctx.globalAlpha *= 0.16;
  airframeOval(ctx, x, 0, 1.3, radius, colors.rotor ?? colors.body);
  ctx.restore();
  const blade = Math.sin(time * 34 + phase) * radius;
  airframeLine(ctx, [[x - 0.5, -blade], [x + 0.5, blade]], colors.rotor ?? colors.body, 1.1, 0.7);
  airframeOval(ctx, x, 0, 1.3, 1.4, colors.body);
}

/** Fokker D.VII-inspired: square fabric wings, exposed bracing, open cockpit. */
function drawBiplane(ctx, colors, time) {
  polygon(ctx, [[-5, -16], [0, -17], [1, 17], [-5, 16]], colors.wingAlt, colors.wingAlt);
  polygon(ctx, [[-13, -7.5], [-8, -7], [-8, 7], [-13, 7.5], [-14, 0]], colors.wing, colors.wingAlt);
  polygon(ctx, [[12, -2.8], [12, 2.8], [3, 4], [-13, 1.7], [-14, 0], [-13, -1.7], [3, -4]], airframeMetal(ctx, colors, 4), colors.wingAlt);
  airframeCanopy(ctx, -3, 2.6, 1.9, colors);
  // The forward upper wing is offset just enough to reveal the lower plane.
  polygon(ctx, [[2, -18], [7, -18], [9, -16], [9, 16], [7, 18], [2, 18]], airframeMetal(ctx, colors, 18), colors.wingAlt);
  for (const side of [-1, 1]) {
    for (let rib = 6; rib < 17; rib += 2.6) {
      airframeLine(ctx, [[2.4, side * rib], [8.2, side * rib]], colors.body, 0.45, 0.55);
    }
    airframeLine(ctx, [[-3.5, side * 11], [2.8, side * 13], [-2.5, side * 15]], colors.glass, 0.65, 0.8);
    airframeLine(ctx, [[2.3, side * 7], [2.3, side * 16]], colors.wingAlt, 0.7);
    // Simple contrasting wing bands; no new gameplay or faction indicators.
    airframeLine(ctx, [[3.1, side * 14.5], [7.8, side * 14.5]], colors.wingAlt, 1.5);
    airframeLine(ctx, [[5.4, side * 12.5], [5.4, side * 16.5]], colors.wingAlt, 1.5);
  }
  polygon(ctx, [[11, -2.8], [13, -2], [13, 2], [11, 2.8]], colors.wingAlt);
  airframeLine(ctx, [[10.6, -2], [10.6, 2]], colors.body, 0.7);
  airframeLine(ctx, [[-12.5, 0], [-7, 0]], colors.body, 0.7);
  drawPropeller(ctx, 13.5, 7.8, time, colors);
}

/** P-51-inspired: tapered laminar wing, long inline nose and bubble canopy. */
function drawFighter(ctx, colors, time) {
  for (const side of [-1, 1]) {
    polygon(ctx, [[4, side * 3], [2, side * 16], [-1, side * 17], [-5, side * 16], [-5, side * 4]], airframeMetal(ctx, colors, 17), colors.wingAlt);
    airframeLine(ctx, [[-3.7, side * 5], [-3.7, side * 15]], colors.wingAlt, 0.65);
    for (const x of [-1.8, 0.1]) airframeLine(ctx, [[x, side * 6.5], [x, side * 14]], colors.body, 0.75, 0.7);
    airframeLine(ctx, [[2, side * 8], [3.6, side * 8]], colors.wingAlt, 0.75);
    polygon(ctx, [[-10, side * 1], [-11, side * 7.5], [-14.2, side * 8], [-13.6, side * 1]], colors.wing, colors.wingAlt);
  }
  polygon(ctx, [[14.5, 0], [12, 2.7], [3, 3.7], [-6, 2.7], [-14.5, 1], [-15, 0], [-14.5, -1], [-6, -2.7], [3, -3.7], [12, -2.7]], airframeMetal(ctx, colors, 4), colors.wingAlt);
  airframeLine(ctx, [[4, -2], [11.5, -1.7]], colors.wingAlt, 1.1);
  airframeLine(ctx, [[4, 2], [11.5, 1.7]], colors.wingAlt, 1.1);
  airframeCanopy(ctx, 0.7, 3.6, 2.4, colors);
  airframeLine(ctx, [[-12.5, 0], [-6, 0]], colors.wingAlt, 0.9);
  polygon(ctx, [[-7, -1.3], [-4, -1.6], [-4, 1.6], [-7, 1.3]], colors.wingAlt);
  drawPropeller(ctx, 14.2, 8.7, time, colors);
}

/** X-29-inspired: long pencil nose, close-coupled canards, forward wing tips. */
function drawForwardSwept(ctx, colors) {
  for (const side of [-1, 1]) {
    polygon(ctx, [[-5, side * 3], [9, side * 18], [4, side * 19], [-13, side * 4]], airframeMetal(ctx, colors, 19), colors.wingAlt);
    polygon(ctx, [[7.5, side * 16.5], [9, side * 18], [4, side * 19], [2.5, side * 17.5]], colors.body);
    airframeLine(ctx, [[-9.5, side * 5], [4, side * 16.5]], colors.body, 0.65, 0.7);
    polygon(ctx, [[10, side * 2], [7, side * 8.5], [4, side * 8], [5.5, side * 2]], colors.body, colors.wingAlt);
    polygon(ctx, [[-12, side * 3], [-17, side * 5], [-17, side * 2]], colors.wingAlt);
  }
  polygon(ctx, [[20, 0], [11, 2.3], [2, 3.5], [-15.5, 3], [-17, 0], [-15.5, -3], [2, -3.5], [11, -2.3]], airframeMetal(ctx, colors, 3.5), colors.wingAlt);
  for (const side of [-1, 1]) {
    polygon(ctx, [[2, side * 2.3], [-3.5, side * 3.5], [-4, side * 1.5]], colors.wingAlt);
    airframeLine(ctx, [[-13, side * 1.8], [-6, side * 1.8]], colors.wing, 0.7);
  }
  airframeCanopy(ctx, 7, 3.9, 1.8, colors);
  polygon(ctx, [[-6, 0], [-15, -1.1], [-16, 1.1]], colors.wingAlt);
  airframeLine(ctx, [[-16, -2], [-16, 2]], colors.glass, 1.5);
  airframeLine(ctx, [[-17.4, -1.5], [-17.4, 1.5]], colors.body, 1, 0.65);
}

// Retain the unused legacy jet dispatch for callers outside the era table.
function drawJet(ctx, colors) {
  polygon(ctx, [[6, 0], [-8, -16], [-12, -14], [-6, 0], [-12, 14], [-8, 16]], colors.wing);
  polygon(ctx, [[17, 0], [6, 4], [-13, 5], [-13, -5], [6, -4]], colors.body);
  polygon(ctx, [[-13, -9], [-8, -8], [-8, 8], [-13, 9]], colors.wingAlt);
  polygon(ctx, [[-13, -2.5], [-19, 0], [-13, 2.5]], '#ff9a3c');
  airframeOval(ctx, 7, 0, 2.4, 2.4, colors.glass);
}

function airframeRotor(ctx, x, radius, colors, time, speed) {
  ctx.save();
  ctx.translate(x, 0);
  ctx.globalAlpha *= 0.055;
  airframeOval(ctx, 0, 0, radius, radius, colors.rotor ?? colors.body);
  ctx.restore();
  ctx.save();
  ctx.translate(x, 0);
  ctx.rotate(time * speed);
  for (let i = 0; i < 4; i += 1) {
    ctx.rotate(Math.PI / 2);
    ctx.save();
    ctx.globalAlpha *= 0.55;
    polygon(ctx, [[2, -0.5], [radius - 1, -1.2], [radius, 0.5], [3, 0.8]], colors.rotor ?? colors.body);
    ctx.restore();
  }
  ctx.restore();
  airframeOval(ctx, x, 0, radius * 0.08, radius * 0.08, colors.wingAlt);
  airframeOval(ctx, x, 0, radius * 0.04, radius * 0.04, colors.body);
}

/** Slim tandem-seat attack helicopter, with stub wings and a tail rotor. */
function drawHelicopter(ctx, colors, time) {
  polygon(ctx, [[-5, -2.6], [-18, -1], [-18, 1], [-5, 2.6]], colors.wing, colors.wingAlt);
  polygon(ctx, [[-18, -5.5], [-15.5, -4.5], [-16, 4.5], [-18, 5]], colors.wingAlt);
  for (const side of [-1, 1]) {
    polygon(ctx, [[3, side * 4], [0, side * 10], [-4, side * 10], [-3, side * 3]], colors.wing, colors.wingAlt);
    airframeOval(ctx, 0, side * 9, 3.1, 1.2, colors.wingAlt);
    airframeLine(ctx, [[-5, side * 5.5], [6, side * 5.5]], colors.body, 0.8, 0.5);
  }
  polygon(ctx, [[13, 0], [9, 3.1], [0, 4.2], [-7, 2.7], [-8, 0], [-7, -2.7], [0, -4.2], [9, -3.1]], airframeMetal(ctx, colors, 4.2), colors.wingAlt);
  airframeCanopy(ctx, 6.8, 3.8, 2.5, colors);
  airframeLine(ctx, [[5, -2.2], [5, 2.2]], colors.body, 0.75);
  for (const side of [-1, 1]) airframeOval(ctx, -4, side * 3.3, 3, 1.2, colors.wingAlt);
  airframeLine(ctx, [[11.5, 0], [14.5, 0]], colors.wingAlt, 1.3);
  airframeRotor(ctx, -17, 3.1, colors, time, 38);
  airframeRotor(ctx, -1, 16, colors, time, 26);
}

/** A machined saucer: a segmented rim, inset dome and a forward sensor. */
function drawUfo(ctx, colors, time) {
  airframeOval(ctx, 0, 0, 15, 10.6, colors.wingAlt);
  airframeOval(ctx, 0, -0.2, 14, 9.5, airframeMetal(ctx, colors, 10));
  for (let i = 0; i < 10; i += 1) {
    const a = i * Math.PI / 5;
    airframeLine(ctx, [[Math.cos(a) * 9.5, Math.sin(a) * 6.3], [Math.cos(a) * 13.6, Math.sin(a) * 9]], colors.wingAlt, 0.6, 0.65);
  }
  airframeOval(ctx, 0, 0, 8.5, 6, colors.wing);
  airframeOval(ctx, 0.6, 0, 6, 4.8, colors.wingAlt);
  airframeCanopy(ctx, 1.2, 5.3, 4.2, colors);
  for (let i = 0; i < 8; i += 1) {
    const a = i * Math.PI / 4;
    ctx.save();
    ctx.globalAlpha *= 0.55 + 0.2 * Math.sin(time * 2 - a);
    airframeOval(ctx, Math.cos(a) * 12.3, Math.sin(a) * 8.2, 0.9, 0.65, colors.wingAlt);
    ctx.restore();
  }
  polygon(ctx, [[16, 0], [11.5, -2], [12.5, 0], [11.5, 2]], colors.wingAlt);
}

export function drawEnemy(ctx, kind, colors, time = 0) {
  ctx.save();
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'biplane': drawBiplane(ctx, colors, time); break;
    case 'fighter': drawFighter(ctx, colors, time); break;
    case 'fsw': drawForwardSwept(ctx, colors); break;
    case 'jet': drawJet(ctx, colors); break;
    case 'helicopter': drawHelicopter(ctx, colors, time); break;
    default: drawUfo(ctx, colors, time); break;
  }
  ctx.restore();
}

/** Zeppelin-inspired rigid airship, with longitudinal ribs and engine pods. */
function drawZeppelin(ctx, colors, time) {
  for (const side of [-1, 1]) {
    polygon(ctx, [[-37, side * 10], [-57, side * 28], [-63, side * 28], [-59, side * 8]], colors.wing, colors.wingAlt);
    airframeLine(ctx, [[-47, side * 14], [-59, side * 25]], colors.body, 0.7, 0.5);
    for (const x of [-25, 17]) {
      airframeLine(ctx, [[x, side * 15], [x, side * 24]], colors.wingAlt, 1.5);
      airframeOval(ctx, x, side * 23, 6.5, 2.4, colors.wingAlt);
      ctx.save();
      ctx.translate(x + 5, side * 23);
      drawPropeller(ctx, 0, 4.5, time, colors, x);
      ctx.restore();
    }
  }
  const hull = ctx.createLinearGradient(0, -23, 0, 23);
  hull.addColorStop(0, colors.wing);
  hull.addColorStop(0.3, colors.body);
  hull.addColorStop(0.55, colors.body);
  hull.addColorStop(1, colors.wingAlt);
  ctx.beginPath();
  ctx.moveTo(58, 0);
  ctx.bezierCurveTo(51, -26, -27, -30, -59, 0);
  ctx.bezierCurveTo(-27, 30, 51, 26, 58, 0);
  ctx.fillStyle = hull;
  ctx.fill();
  ctx.strokeStyle = colors.wingAlt;
  ctx.lineWidth = 1;
  ctx.stroke();
  // Ribs follow the envelope instead of drawing a flat oval across it.
  for (const offset of [-13, -6, 6, 13]) {
    ctx.beginPath();
    ctx.moveTo(-57, 0);
    ctx.bezierCurveTo(-24, offset * 1.7, 42, offset * 1.45, 57, 0);
    ctx.strokeStyle = offset < 0 ? colors.wing : colors.wingAlt;
    ctx.lineWidth = 0.65;
    ctx.stroke();
  }
  for (const x of [-35, -17, 3, 23, 40]) {
    const height = 21 * Math.sqrt(Math.max(0, 1 - (x / 59) ** 2));
    airframeLine(ctx, [[x, -height * 0.84], [x + 1.4, 0], [x, height * 0.84]], colors.wing, 0.55, 0.7);
  }
  polygon(ctx, [[-6, 15], [23, 15], [25, 20], [20, 23], [-7, 21]], colors.wingAlt);
  for (let x = -2; x < 21; x += 4.5) {
    ctx.fillStyle = colors.glass;
    ctx.fillRect(x, 17, 2.7, 2);
  }
  airframeLine(ctx, [[-57, 0], [-35, 0]], colors.wingAlt, 2);
  airframeLine(ctx, [[-28, -5], [33, -5]], colors.body, 0.8, 0.65);
}

/** B-17-inspired four-engine heavy bomber: broad wings, glazing and turrets. */
function drawBomber(ctx, colors, time) {
  for (const side of [-1, 1]) {
    polygon(ctx, [[13, side * 8], [2, side * 49], [-4, side * 52], [-11, side * 48], [-9, side * 9]], airframeMetal(ctx, colors, 52), colors.wingAlt);
    airframeLine(ctx, [[-6, side * 13], [-7, side * 45]], colors.wingAlt, 0.9);
    airframeLine(ctx, [[7, side * 15], [-1, side * 46]], colors.body, 0.7, 0.6);
    polygon(ctx, [[-27, side * 3], [-30, side * 23], [-38, side * 24], [-36, side * 3]], colors.wing, colors.wingAlt);
    for (const y of [20, 38]) {
      airframeOval(ctx, 8, side * y, 12, 4, colors.wingAlt);
      airframeOval(ctx, 9, side * y, 9, 3, airframeMetal(ctx, colors, 4));
      airframeLine(ctx, [[16, side * y - 3], [16, side * y + 3]], colors.wingAlt, 1.4);
      ctx.save();
      ctx.translate(19, side * y);
      drawPropeller(ctx, 0, 7.5, time, colors, y);
      ctx.restore();
    }
  }
  polygon(ctx, [[48, 0], [44, 6], [24, 8.5], [6, 9], [-21, 6], [-39, 2], [-40, 0], [-39, -2], [-21, -6], [6, -9], [24, -8.5], [44, -6]], airframeMetal(ctx, colors, 9), colors.wingAlt);
  airframeCanopy(ctx, 30, 7, 6.5, colors);
  airframeLine(ctx, [[30, -5], [30, 5]], colors.body, 0.9);
  airframeLine(ctx, [[25, 0], [36, 0]], colors.body, 0.65);
  polygon(ctx, [[48, 0], [44, -4], [41, -3], [41, 3], [44, 4]], colors.glass);
  airframeLine(ctx, [[44, -3], [44, 3]], colors.body, 0.6);
  for (const x of [9, -17]) {
    airframeOval(ctx, x, 0, 3.7, 3.7, colors.wingAlt);
    airframeOval(ctx, x, 0, 2.5, 2.5, colors.body);
    airframeLine(ctx, [[x, -0.9], [x + 6, -0.9]], colors.wingAlt, 0.8);
    airframeLine(ctx, [[x, 0.9], [x + 6, 0.9]], colors.wingAlt, 0.8);
  }
  airframeLine(ctx, [[-37, 0], [-23, 0]], colors.wingAlt, 2);
  for (const side of [-1, 1]) airframeLine(ctx, [[-5, side * 5], [1, side * 5]], colors.body, 0.8, 0.6);
}

/** B-2-inspired flying wing: continuous swept leading edge, sawtooth rear. */
function drawStealth(ctx, colors) {
  polygon(ctx, [[39, 0], [-21, -50], [-31, -49], [-23, -29], [-29, -23], [-21, -16], [-26, -10], [-19, 0], [-26, 10], [-21, 16], [-29, 23], [-23, 29], [-31, 49], [-21, 50]], airframeMetal(ctx, colors, 50), colors.wingAlt);
  for (const side of [-1, 1]) {
    polygon(ctx, [[29, 0], [-21, side * 45], [-17, side * 24], [0, side * 9]], colors.body);
    airframeLine(ctx, [[26, side * 3], [-21, side * 44]], colors.wingAlt, 0.7, 0.6);
    airframeLine(ctx, [[7, side * 10], [-15, side * 12], [-23, side * 24]], colors.wingAlt, 0.6, 0.65);
    polygon(ctx, [[11, side * 6], [3, side * 11], [-9, side * 11], [-3, side * 5]], colors.wing);
    airframeLine(ctx, [[4, side * 7], [-7, side * 9]], colors.wingAlt, 1.7);
    airframeLine(ctx, [[-18, side * 5], [-20, side * 11]], colors.wingAlt, 2.4);
    airframeLine(ctx, [[-19, side * 5.5], [-21, side * 10]], colors.body, 0.65, 0.6);
  }
  polygon(ctx, [[26, 0], [18, -3], [13, -2.2], [13, 2.2], [18, 3]], colors.glass);
  airframeLine(ctx, [[17, -2], [18, 0], [17, 2]], colors.body, 0.6);
  airframeLine(ctx, [[10, 0], [-16, 0]], colors.wingAlt, 0.7, 0.6);
}

/** Armoured tandem-cockpit gunship with twin turbines and stub-wing pods. */
function drawGunship(ctx, colors, time) {
  polygon(ctx, [[-14, -6], [-55, -2.5], [-58, 0], [-55, 2.5], [-14, 6]], colors.wing, colors.wingAlt);
  polygon(ctx, [[-52, -17], [-58, -20], [-57, 13], [-51, 10]], colors.wing, colors.wingAlt);
  airframeLine(ctx, [[-48, -1], [-23, -3]], colors.body, 0.8, 0.5);
  for (const side of [-1, 1]) {
    polygon(ctx, [[8, side * 10], [1, side * 29], [-12, side * 28], [-10, side * 10]], colors.wing, colors.wingAlt);
    airframeOval(ctx, 0, side * 26, 10, 3.5, colors.wingAlt);
    airframeLine(ctx, [[-6, side * 25], [7, side * 25]], colors.body, 0.8, 0.5);
    airframeOval(ctx, 9, side * 26, 1.3, 2.4, colors.glass);
    airframeLine(ctx, [[-12, side * 17], [17, side * 17]], colors.wingAlt, 2);
    airframeLine(ctx, [[-10, side * 16], [16, side * 16]], colors.body, 0.65, 0.7);
  }
  polygon(ctx, [[41, 0], [33, 8], [11, 13], [-14, 12], [-23, 6], [-24, -6], [-14, -12], [11, -13], [33, -8]], airframeMetal(ctx, colors, 13), colors.wingAlt);
  for (const side of [-1, 1]) {
    airframeOval(ctx, -9, side * 9.5, 12, 4.7, colors.wingAlt);
    airframeOval(ctx, -7, side * 9.5, 8.5, 3.5, airframeMetal(ctx, colors, 5));
    airframeLine(ctx, [[-18, side * 7], [-18, side * 12]], colors.glass, 2);
  }
  airframeCanopy(ctx, 24, 13, 7.2, colors);
  airframeLine(ctx, [[21, -5.5], [18, 0], [21, 5.5]], colors.body, 1.3);
  airframeLine(ctx, [[31, -4.5], [29, 0], [31, 4.5]], colors.wingAlt, 0.8);
  airframeOval(ctx, 38, 0, 3.3, 4, colors.wingAlt);
  airframeLine(ctx, [[39, 0], [44, 0]], colors.wingAlt, 2.4);
  airframeRotor(ctx, -54, 5, colors, time, 32);
  airframeRotor(ctx, -1, 52, colors, time, 18);
}

/** An orbital command saucer: layered armour and recessed luminous channels. */
function drawMothership(ctx, colors, time) {
  airframeOval(ctx, 0, 0, 54, 32, colors.wingAlt);
  airframeOval(ctx, 0, -0.7, 52, 30, airframeMetal(ctx, colors, 32));
  airframeOval(ctx, 0, 0, 45, 25, colors.glass);
  airframeOval(ctx, 0, 0, 43.5, 23.5, colors.body);
  for (let i = 0; i < 12; i += 1) {
    const a = i * Math.PI / 6;
    airframeLine(ctx, [[Math.cos(a) * 30, Math.sin(a) * 17], [Math.cos(a) * 50, Math.sin(a) * 28]], colors.wingAlt, 0.8, 0.65);
    const px = Math.cos(a) * 48, py = Math.sin(a) * 27;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.cos(a) * 27, -Math.sin(a) * 48));
    ctx.globalAlpha *= 0.55 + 0.18 * Math.sin(time * 1.8 - a);
    ctx.fillStyle = colors.wingAlt;
    ctx.fillRect(-3.7, -0.8, 7.4, 1.6);
    ctx.restore();
  }
  airframeOval(ctx, 2, 0, 29, 18, colors.wing);
  airframeOval(ctx, 3, 0, 25.5, 15.5, colors.wingAlt);
  airframeOval(ctx, 3, 0, 24, 14, colors.body);
  airframeCanopy(ctx, 6, 19, 11.5, colors);
  airframeLine(ctx, [[-8, -6], [5, -8], [17, -5]], colors.wingAlt, 0.8, 0.7);
  for (const side of [-1, 1]) {
    polygon(ctx, [[15, side * 16], [31, side * 15], [42, side * 8], [30, side * 11]], colors.wing);
    airframeLine(ctx, [[21, side * 16], [33, side * 12]], colors.wingAlt, 1);
  }
  polygon(ctx, [[58, 0], [43, -6], [46, 0], [43, 6]], colors.wingAlt);
  polygon(ctx, [[54, 0], [46, -2], [47, 2]], colors.glass);
}

export function drawBossCraft(ctx, kind, colors, time = 0) {
  ctx.save();
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'zeppelin': drawZeppelin(ctx, colors, time); break;
    case 'bomber': drawBomber(ctx, colors, time); break;
    case 'stealth': drawStealth(ctx, colors, time); break;
    case 'gunship': drawGunship(ctx, colors, time); break;
    default: drawMothership(ctx, colors, time); break;
  }
  ctx.restore();
}


/** Parachutist is drawn upright in world space, not rotated with a heading. */
/**
 * A downed squadron pilot. Deliberately not the same picture as the bonus
 * parachutist: the silk carries the craft's own colour and a rescue ring
 * closes around them as their time runs out, so at a glance you can tell
 * "points" from "one of ours, hurry".
 */
export function drawDownedPilot(ctx, time, colors, left = 1) {
  const sway = Math.sin(time * 2.2) * 0.14;
  const urgent = left < 0.34;
  const pulse = 0.55 + Math.sin(time * (urgent ? 12 : 5)) * 0.35;

  ctx.save();
  ctx.globalAlpha = pulse * 0.7;
  ctx.strokeStyle = urgent ? '#ff5a5a' : '#7cf5ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.stroke();
  // The arc that empties: how long this pilot has left, drawn around them.
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.rotate(sway);
  ctx.beginPath();
  ctx.arc(0, -10, 13, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = colors.accent;
  ctx.fill();
  ctx.strokeStyle = colors.body;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-13, -10); ctx.lineTo(-3, 4);
  ctx.moveTo(13, -10); ctx.lineTo(3, 4);
  ctx.strokeStyle = colors.body;
  ctx.stroke();
  ctx.fillStyle = '#f4f7fb';
  ctx.fillRect(-3.5, 3, 7, 9);
  ctx.beginPath();
  ctx.arc(0, 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawParachutist(ctx, time = 0) {
  const sway = Math.sin(time * 2.2) * 0.12;
  ctx.save();
  ctx.rotate(sway);
  ctx.beginPath();
  ctx.arc(0, -10, 13, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = '#f4f7fb';
  ctx.fill();
  ctx.strokeStyle = '#c2d3e6';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-13, -10); ctx.lineTo(-3, 4);
  ctx.moveTo(13, -10); ctx.lineTo(3, 4);
  ctx.strokeStyle = '#dfe8f3';
  ctx.stroke();
  ctx.fillStyle = '#ffc857';
  ctx.fillRect(-3.5, 3, 7, 9);
  ctx.beginPath();
  ctx.arc(0, 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
