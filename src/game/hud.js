import { clamp } from '../core/math.js';
import { drawPlayer } from '../render/sprites.js';

const INK = '#eaf3ff';
const DIM = '#9fb6d1';

function label(ctx, text, x, y, { size = 16, color = INK, align = 'left', weight = 'bold' } = {}) {
  ctx.font = `${weight} ${size}px "Courier New", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

function panel(ctx, x, y, w, h, alpha = 0.35) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#04101d';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

/** Points an arrow at the flagship while it is off screen. */
function bossArrow(ctx, game, cam) {
  const boss = game.boss;
  if (!boss) return;
  const sx = boss.x - cam.x + cam.width / 2;
  const sy = boss.y - cam.y + cam.height / 2;
  const margin = 46;
  if (sx > margin && sx < cam.width - margin && sy > margin && sy < cam.height - margin) return;

  const angle = Math.atan2(boss.y - cam.y, boss.x - cam.x);
  const rx = cam.width / 2 - margin;
  const ry = cam.height / 2 - margin;
  const scale = Math.min(rx / Math.abs(Math.cos(angle) || 1e-6), ry / Math.abs(Math.sin(angle) || 1e-6));
  const px = cam.width / 2 + Math.cos(angle) * scale;
  const py = cam.height / 2 + Math.sin(angle) * scale;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.globalAlpha = 0.55 + Math.sin(game.time * 8) * 0.3;
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-10, 9);
  ctx.lineTo(-10, -9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function centeredMessage(ctx, cam, lines) {
  const w = cam.width;
  const h = cam.height;
  panel(ctx, 0, h / 2 - 130, w, 260, 0.55);
  let y = h / 2 - 70;
  for (const line of lines) {
    label(ctx, line.text, w / 2, y, {
      size: line.size ?? 22,
      color: line.color ?? INK,
      align: 'center',
    });
    y += (line.gap ?? line.size ?? 22) + 14;
  }
}

export function drawHud(ctx, game, cam) {
  const w = cam.width;
  const h = cam.height;
  const era = game.era;

  panel(ctx, 0, 0, w, 42, 0.4);
  label(ctx, `SCORE ${String(game.score).padStart(7, '0')}`, 16, 27, { size: 18 });
  label(ctx, `HI ${String(game.highScore).padStart(7, '0')}`, w / 2, 27, { size: 18, color: DIM, align: 'center' });
  // On a narrow view (a phone held upright) the subtitle would run into the hi-score.
  label(ctx, w < 760 ? era.label : `${era.label}  ${era.subtitle}`, w - 16, 27,
    { size: 15, color: DIM, align: 'right' });

  // Remaining lives, drawn with the actual player sprite.
  for (let i = 0; i < Math.min(game.lives, 6); i += 1) {
    ctx.save();
    ctx.translate(26 + i * 30, h - 26);
    ctx.scale(0.62, 0.62);
    ctx.rotate(-Math.PI / 2);
    drawPlayer(ctx, { thrust: false });
    ctx.restore();
  }
  if (game.lives > 6) label(ctx, `x${game.lives}`, 26 + 6 * 30, h - 20, { size: 15, color: DIM });

  if (game.boss) {
    const bw = 260;
    const bx = w / 2 - bw / 2;
    panel(ctx, bx - 6, h - 52, bw + 12, 34, 0.5);
    label(ctx, era.bossName, w / 2, h - 34, { size: 13, color: '#ff9f9f', align: 'center' });
    ctx.fillStyle = '#2a3a4d';
    ctx.fillRect(bx, h - 28, bw, 8);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(bx, h - 28, bw * clamp(game.boss.hp / game.boss.maxHp, 0, 1), 8);
    bossArrow(ctx, game, cam);
  } else {
    const progress = clamp(game.kills / game.quota, 0, 1);
    const bw = 200;
    const bx = w / 2 - bw / 2;
    label(ctx, 'FLAGSHIP', w / 2, h - 36, { size: 12, color: DIM, align: 'center' });
    ctx.fillStyle = '#22344a';
    ctx.fillRect(bx, h - 28, bw, 6);
    ctx.fillStyle = '#7cf5ff';
    ctx.fillRect(bx, h - 28, bw * progress, 6);
  }

  if (game.rescueChain > 0) {
    label(ctx, `RESCUE x${game.rescueChain}`, w - 16, h - 22, { size: 14, color: '#ffd166', align: 'right' });
  }

  switch (game.state) {
    case 'title':
      centeredMessage(ctx, cam, [
        { text: 'CHRONO PILOT', size: 44, color: '#ffd166' },
        { text: 'FLY THROUGH TIME. SHOOT DOWN THE FLAGSHIP.', size: 15, color: DIM },
        { text: game.touchMode ? 'TAP TO START' : 'PRESS ENTER OR SPACE TO START', size: 18, color: INK },
      ]);
      break;
    case 'paused':
      centeredMessage(ctx, cam, [
        { text: 'PAUSED', size: 40, color: INK },
        { text: game.touchMode ? 'TAP THE PLAY BUTTON TO RESUME' : 'PRESS P TO RESUME', size: 16, color: DIM },
      ]);
      break;
    case 'eraclear':
      centeredMessage(ctx, cam, [
        { text: `${era.bossName} DOWN`, size: 30, color: '#ffd166' },
        { text: 'TIME JUMP...', size: 20, color: INK },
        { text: `NEXT ERA  ${game.nextEraLabel}`, size: 18, color: DIM },
      ]);
      break;
    case 'gameover':
      centeredMessage(ctx, cam, [
        { text: 'GAME OVER', size: 42, color: '#ff8f8f' },
        { text: `SCORE ${String(game.score).padStart(7, '0')}`, size: 20, color: INK },
        { text: game.touchMode ? 'TAP TO CONTINUE' : 'PRESS ENTER TO CONTINUE', size: 16, color: DIM },
      ]);
      break;
    default:
      break;
  }

  if (game.banner && game.bannerTimer > 0) {
    ctx.globalAlpha = Math.min(1, game.bannerTimer * 2);
    // Shrink with the view so the banner never runs under the pause button.
    label(ctx, game.banner, w / 2, 96, {
      size: Math.max(17, Math.min(30, w / 22)), color: '#ffd166', align: 'center',
    });
    ctx.globalAlpha = 1;
  }

  if (game.muted) label(ctx, 'MUTE', w - 16, 60, { size: 13, color: DIM, align: 'right' });
}
