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

const CRAFT_SHAPES = {
  viper: drawViper,
  dragon: drawDragon,
  eagle: drawEagle,
  swind: drawSwind,
};

/** Draws a player craft, nose along +X. `id` selects the airframe. */
export function drawPlayer(ctx, { id = 'viper', colors, thrust = true, time = 0 } = {}) {
  const palette = colors ?? {
    body: '#e9f2ff', wing: '#8fb6e0', wingAlt: '#7aa3d0', glass: '#1c3a5c', accent: '#ffb347',
  };
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

function drawBiplane(ctx, colors) {
  polygon(ctx, [[-1, -16], [5, -16], [5, 16], [-1, 16]], colors.wing);
  polygon(ctx, [[4, -12], [9, -12], [9, 12], [4, 12]], colors.wingAlt);
  polygon(ctx, [[14, 0], [4, 5], [-11, 4], [-13, 0], [-11, -4], [4, -5]], colors.body);
  polygon(ctx, [[-13, -6], [-9, -6], [-9, 6], [-13, 6]], colors.wing);
  ctx.beginPath();
  ctx.arc(2, 0, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
}

function drawFighter(ctx, colors) {
  polygon(ctx, [[2, -15], [8, -4], [8, 4], [2, 15], [-3, 13], [-1, 0], [-3, -13]], colors.wing);
  polygon(ctx, [[15, 0], [5, 4.5], [-12, 4], [-14, 0], [-12, -4], [5, -4.5]], colors.body);
  polygon(ctx, [[-11, -8], [-7, -7], [-7, 7], [-11, 8]], colors.wingAlt);
  ctx.beginPath();
  ctx.arc(4, 0, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
}

function drawJet(ctx, colors) {
  polygon(ctx, [[6, 0], [-8, -16], [-12, -14], [-6, 0], [-12, 14], [-8, 16]], colors.wing);
  polygon(ctx, [[17, 0], [6, 4], [-13, 5], [-13, -5], [6, -4]], colors.body);
  polygon(ctx, [[-13, -9], [-8, -8], [-8, 8], [-13, 9]], colors.wingAlt);
  polygon(ctx, [[-13, -2.5], [-19, 0], [-13, 2.5]], '#ff9a3c');
  ctx.beginPath();
  ctx.arc(7, 0, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
}

function drawHelicopter(ctx, colors, time) {
  polygon(ctx, [[13, 0], [4, 6], [-6, 6], [-8, 0], [-6, -6], [4, -6]], colors.body);
  polygon(ctx, [[-6, -2.5], [-18, -1.5], [-18, 1.5], [-6, 2.5]], colors.wing);
  polygon(ctx, [[-18, -6], [-15, -6], [-15, 4], [-18, 4]], colors.wingAlt);
  ctx.beginPath();
  ctx.arc(6, 0, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
  ctx.save();
  ctx.rotate(time * 26);
  ctx.strokeStyle = colors.rotor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-17, 0); ctx.lineTo(17, 0);
  ctx.moveTo(0, -17); ctx.lineTo(0, 17);
  ctx.stroke();
  ctx.restore();
}

function drawUfo(ctx, colors, time) {
  ctx.save();
  ctx.scale(1, 0.72);
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fillStyle = colors.body;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(1, 0, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + time * 3;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 12, Math.sin(a) * 8, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? colors.wing : colors.wingAlt;
    ctx.fill();
  }
  polygon(ctx, [[16, 0], [10, 3], [10, -3]], colors.wingAlt);
}

export function drawEnemy(ctx, kind, colors, time = 0) {
  switch (kind) {
    case 'biplane': drawBiplane(ctx, colors); break;
    case 'fighter': drawFighter(ctx, colors); break;
    case 'jet': drawJet(ctx, colors); break;
    case 'helicopter': drawHelicopter(ctx, colors, time); break;
    default: drawUfo(ctx, colors, time); break;
  }
}

function drawZeppelin(ctx, colors, time) {
  ctx.save();
  ctx.scale(1, 0.42);
  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, Math.PI * 2);
  ctx.fillStyle = colors.body;
  ctx.fill();
  ctx.restore();
  polygon(ctx, [[-50, -20], [-64, -30], [-64, 30], [-50, 20]], colors.wingAlt);
  ctx.fillStyle = colors.wing;
  ctx.fillRect(-16, 18, 32, 9);
  ctx.fillStyle = colors.glass;
  for (let i = -2; i <= 2; i += 1) ctx.fillRect(i * 10 - 2, 20, 4, 4);
  ctx.beginPath();
  ctx.arc(46, 0, 4 + Math.sin(time * 6) * 1.2, 0, Math.PI * 2);
  ctx.fillStyle = '#ff6b6b';
  ctx.fill();
}

function drawBomber(ctx, colors, time) {
  polygon(ctx, [[6, -52], [16, -46], [16, 46], [6, 52], [-10, 44], [-6, 0], [-10, -44]], colors.wing);
  polygon(ctx, [[52, 0], [22, 12], [-34, 14], [-40, 0], [-34, -14], [22, -12]], colors.body);
  polygon(ctx, [[-30, -24], [-20, -22], [-20, 22], [-30, 24]], colors.wingAlt);
  ctx.fillStyle = colors.wingAlt;
  [-38, -20, 20, 38].forEach((y) => ctx.fillRect(4, y - 4, 16, 8));
  ctx.beginPath();
  ctx.arc(28, 0, 7, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-36, 0, 3 + Math.sin(time * 8) * 1.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd166';
  ctx.fill();
}

function drawStealth(ctx, colors, time) {
  polygon(ctx, [[48, 0], [-14, -50], [-34, -44], [-24, 0], [-34, 44], [-14, 50]], colors.body);
  polygon(ctx, [[24, 0], [-8, -26], [-18, -22], [-12, 0], [-18, 22], [-8, 26]], colors.wing);
  polygon(ctx, [[-24, -6], [-40, 0], [-24, 6]], '#ff9a3c');
  ctx.beginPath();
  ctx.arc(20, 0, 6, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
  ctx.strokeStyle = colors.wingAlt;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6 + Math.sin(time * 5) * 0.3;
  ctx.beginPath();
  ctx.moveTo(40, 0); ctx.lineTo(-20, -34);
  ctx.moveTo(40, 0); ctx.lineTo(-20, 34);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawGunship(ctx, colors, time) {
  polygon(ctx, [[44, 0], [18, 18], [-16, 18], [-24, 0], [-16, -18], [18, -18]], colors.body);
  polygon(ctx, [[-16, -7], [-58, -5], [-58, 5], [-16, 7]], colors.wing);
  polygon(ctx, [[-58, -20], [-50, -20], [-50, 12], [-58, 12]], colors.wingAlt);
  polygon(ctx, [[6, -30], [14, -30], [14, -14], [6, -14]], colors.wingAlt);
  polygon(ctx, [[6, 14], [14, 14], [14, 30], [6, 30]], colors.wingAlt);
  ctx.beginPath();
  ctx.arc(22, 0, 10, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
  ctx.save();
  ctx.rotate(time * 18);
  ctx.strokeStyle = colors.rotor;
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 54, Math.sin(a) * 54);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMothership(ctx, colors, time) {
  ctx.save();
  ctx.scale(1, 0.6);
  ctx.beginPath();
  ctx.arc(0, 0, 54, 0, Math.PI * 2);
  ctx.fillStyle = colors.body;
  ctx.fill();
  ctx.strokeStyle = colors.wingAlt;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(4, 0, 22, 0, Math.PI * 2);
  ctx.fillStyle = colors.glass;
  ctx.fill();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + time * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 44, Math.sin(a) * 26, 4, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#ff6bd6' : '#7cf5ff';
    ctx.fill();
  }
  polygon(ctx, [[58, 0], [40, 8], [40, -8]], colors.wingAlt);
}

export function drawBossCraft(ctx, kind, colors, time = 0) {
  switch (kind) {
    case 'zeppelin': drawZeppelin(ctx, colors, time); break;
    case 'bomber': drawBomber(ctx, colors, time); break;
    case 'stealth': drawStealth(ctx, colors, time); break;
    case 'gunship': drawGunship(ctx, colors, time); break;
    default: drawMothership(ctx, colors, time); break;
  }
}

/** Parachutist is drawn upright in world space, not rotated with a heading. */
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
