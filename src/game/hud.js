import { clamp } from '../core/math.js';
import { drawPlayer } from '../render/sprites.js';
import { UI_DIM, UI_INK, UI_PANEL } from '../render/ui.js';
import { MODULES } from './gear.js';
import { drawLoadout } from './loadout.js';
import { drawModeSelect, drawSelect } from './selectscreen.js';

const INK = UI_INK;
const DIM = UI_DIM;

function label(ctx, text, x, y, { size = 16, color = INK, align = 'left', weight = 'bold' } = {}) {
  ctx.font = `${weight} ${size}px "Courier New", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

function panel(ctx, x, y, w, h, alpha = 0.35) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = UI_PANEL;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

/** Where a point off screen would cross the edge of the view. */
function edgePoint(cam, x, y, margin) {
  const angle = Math.atan2(y - cam.y, x - cam.x);
  const rx = cam.width / 2 - margin;
  const ry = cam.height / 2 - margin;
  const reach = Math.min(
    rx / Math.abs(Math.cos(angle) || 1e-6),
    ry / Math.abs(Math.sin(angle) || 1e-6),
  );
  return {
    x: cam.width / 2 + Math.cos(angle) * reach,
    y: cam.height / 2 + Math.sin(angle) * reach,
    angle,
  };
}

function isOffScreen(cam, x, y, margin) {
  const sx = x - cam.x + cam.width / 2;
  const sy = y - cam.y + cam.height / 2;
  return sx < margin || sx > cam.width - margin || sy < margin || sy > cam.height - margin;
}

/**
 * Off-screen markers. Escorts get a small, quiet chevron in the era's own
 * colour; the flagship gets a large red arrowhead with a pulsing ring behind
 * it, so at a glance you can tell what is closing on you and from where.
 */
function offScreenMarkers(ctx, game, cam) {
  const margin = 34;

  let shown = 0;
  for (const enemy of game.enemies) {
    if (enemy.dead || shown >= 12) continue;
    if (!isOffScreen(cam, enemy.x, enemy.y, margin + 12)) continue;
    shown += 1;
    const at = edgePoint(cam, enemy.x, enemy.y, margin);
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(at.angle);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = game.era.colors.body;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, 5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  const boss = game.boss;
  if (!boss || !isOffScreen(cam, boss.x, boss.y, 52)) return;
  const at = edgePoint(cam, boss.x, boss.y, 48);
  const pulse = 0.6 + Math.sin(game.time * 8) * 0.35;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.globalAlpha = pulse * 0.5;
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 19, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate(at.angle);
  ctx.globalAlpha = Math.min(1, pulse + 0.35);
  ctx.fillStyle = '#ff5a5a';
  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-11, 12);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-11, -12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Modules fitted during this run, stacked counts shown as xN. */
function moduleChips(ctx, game, x, y) {
  if (!game.modules.length) return;
  const counts = new Map();
  for (const id of game.modules) counts.set(id, (counts.get(id) ?? 0) + 1);
  let left = x;
  for (const [id, count] of counts) {
    const module = MODULES[id];
    const text = count > 1 ? `${module.name} x${count}` : module.name;
    const width = text.length * 7 + 12;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = UI_PANEL;
    ctx.fillRect(left, y - 11, width, 16);
    ctx.globalAlpha = 1;
    label(ctx, text, left + 6, y, { size: 11, color: module.color });
    left += width + 5;
  }
}

/** Armour remaining on the current craft, as one pip per point. */
function armourGauge(ctx, game, x, y) {
  const player = game.player;
  const pipWidth = 15;
  const gap = 3;
  label(ctx, 'ARMOR', x, y - 8, { size: 10, color: DIM });
  for (let i = 0; i < player.maxHp; i += 1) {
    const left = x + i * (pipWidth + gap);
    const held = i < player.hp;
    ctx.globalAlpha = held ? 1 : 0.28;
    ctx.fillStyle = held ? (player.hp <= 2 ? '#ff6b6b' : '#7cf5ff') : '#22344a';
    ctx.fillRect(left, y, pipWidth, 7);
    ctx.globalAlpha = 1;
  }
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

  if (game.state === 'mode') {
    drawModeSelect(ctx, game, cam);
    return;
  }
  if (game.state === 'select') {
    drawSelect(ctx, game, cam);
    return;
  }
  if (game.state === 'loadout') {
    drawLoadout(ctx, game, cam);
    return;
  }

  panel(ctx, 0, 0, w, 42, 0.4);
  label(ctx, `SCORE ${String(game.score).padStart(7, '0')}`, 16, 27, { size: 18 });
  label(ctx, `HI ${String(game.highScore).padStart(7, '0')}`, w / 2, 27, { size: 18, color: DIM, align: 'center' });
  // On a narrow view (a phone held upright) the subtitle would run into the hi-score.
  label(ctx, w < 760 ? era.label : `${era.label}  ${era.subtitle}`, w - 16, 27,
    { size: 15, color: DIM, align: 'right' });

  armourGauge(ctx, game, 18, h - 30);
  moduleChips(ctx, game, 16, 58);

  // Spare craft, drawn with the actual player sprite.
  for (let i = 0; i < Math.min(game.lives, 6); i += 1) {
    ctx.save();
    ctx.translate(26 + i * 30, h - 62);
    ctx.scale(0.62, 0.62);
    ctx.rotate(-Math.PI / 2);
    drawPlayer(ctx, { id: game.craft.id, colors: game.craft.colors, thrust: false });
    ctx.restore();
  }
  if (game.lives > 6) label(ctx, `x${game.lives}`, 26 + 6 * 30, h - 56, { size: 15, color: DIM });

  if (game.boss) {
    const bw = 260;
    const bx = w / 2 - bw / 2;
    panel(ctx, bx - 6, h - 52, bw + 12, 34, 0.5);
    label(ctx, era.bossName, w / 2, h - 34, { size: 13, color: '#ff9f9f', align: 'center' });
    ctx.fillStyle = '#2a3a4d';
    ctx.fillRect(bx, h - 28, bw, 8);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(bx, h - 28, bw * clamp(game.boss.hp / game.boss.maxHp, 0, 1), 8);
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

  if (game.state === 'playing' || game.state === 'paused' || game.state === 'respawn') {
    offScreenMarkers(ctx, game, cam);
  }

  switch (game.state) {
    case 'title':
      centeredMessage(ctx, cam, [
        { text: 'CHRONO PILOT', size: Math.min(44, w / 17), color: '#ffd166' },
        { text: 'FLY THROUGH TIME. SHOOT DOWN THE FLAGSHIP.', size: Math.min(15, w / 46), color: DIM },
        { text: game.touchMode ? 'TAP TO START' : 'PRESS ENTER OR SPACE TO START',
          size: Math.min(18, w / 40), color: INK },
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

  if (game.lootBanner && game.lootTimer > 0) {
    ctx.globalAlpha = Math.min(1, game.lootTimer);
    label(ctx, game.lootBanner, w / 2, 128, {
      size: Math.max(13, Math.min(19, w / 40)), color: '#7cf5ff', align: 'center',
    });
    ctx.globalAlpha = 1;
  }

  if (game.muted) label(ctx, 'MUTE', w - 16, 60, { size: 13, color: DIM, align: 'right' });
}
