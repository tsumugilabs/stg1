import { clamp } from '../core/math.js';
import { drawPlayer } from '../render/sprites.js';
import { roundedRect, uiText, UI_DIM, UI_INK, UI_LOCKED, UI_PANEL } from '../render/ui.js';
import { CRAFT, flagshipDps } from './craft.js';

/**
 * Craft select. `selectLayout` is the single source of truth: the screen is
 * drawn from it and taps are hit-tested against it, so the two can never
 * disagree about where a card is.
 */

export function selectLayout(width, height, count = CRAFT.length) {
  // A phone held upright cannot fit four cards in a row; fold to a grid.
  const columns = width < 720 ? 2 : count;
  const rows = Math.ceil(count / columns);
  const gap = Math.max(8, width * 0.016);
  const cardW = Math.min((width * 0.86 - gap * (columns - 1)) / columns, 196);
  const cardH = Math.min(cardW * 1.24, (height * 0.52 - gap * (rows - 1)) / rows);
  const gridW = columns * cardW + (columns - 1) * gap;
  const gridH = rows * cardH + (rows - 1) * gap;
  const left = (width - gridW) / 2;
  const top = height * 0.30 - (rows > 1 ? gridH * 0.12 : 0);

  const cards = [];
  for (let i = 0; i < count; i += 1) {
    const column = i % columns;
    const row = Math.floor(i / columns);
    cards.push({
      x: left + column * (cardW + gap),
      y: top + row * (cardH + gap),
      w: cardW,
      h: cardH,
    });
  }

  const startW = Math.min(240, width * 0.5);
  return {
    cards,
    start: { x: width / 2 - startW / 2, y: top + gridH + Math.min(46, height * 0.07), w: startW, h: 50 },
    blurbY: top + gridH + Math.min(30, height * 0.045),
  };
}

export function cardAt(point, layout) {
  return layout.cards.findIndex(
    (c) => point.x >= c.x && point.x <= c.x + c.w && point.y >= c.y && point.y <= c.y + c.h,
  );
}

export function inStart(point, layout) {
  const s = layout.start;
  return point.x >= s.x && point.x <= s.x + s.w && point.y >= s.y && point.y <= s.y + s.h;
}

// Bars are relative to the best craft on each axis, so a card shows how this
// airframe compares rather than a number nobody can calibrate.
const AXES = [
  { label: 'SPEED', value: (c) => c.speed },
  { label: 'TURN', value: (c) => c.turnRate },
  { label: 'POWER', value: (c) => flagshipDps(c) },
  { label: 'RANGE', value: (c) => c.bulletSpeed * c.bulletLife },
];
const PEAK = AXES.map((axis) => Math.max(...CRAFT.map(axis.value)));

function hitboxLabel(craft) {
  if (craft.radius <= 6) return 'S';
  return craft.radius <= 8 ? 'M' : 'L';
}

function drawCard(ctx, craft, box, { selected, locked, time, holdRatio }) {
  ctx.globalAlpha = selected ? 0.82 : 0.5;
  ctx.fillStyle = UI_PANEL;
  roundedRect(ctx, box.x, box.y, box.w, box.h, 10);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.strokeStyle = selected ? (locked ? UI_LOCKED : craft.colors.accent) : '#2a4159';
  ctx.stroke();

  const cx = box.x + box.w / 2;
  const scale = clamp(box.w / 150, 0.7, 1.15);

  if (locked) {
    uiText(ctx, '? ? ?', cx, box.y + box.h * 0.42, Math.round(26 * scale), UI_LOCKED);
    uiText(ctx, 'LOCKED', cx, box.y + box.h * 0.60, Math.round(12 * scale), UI_LOCKED);
    uiText(ctx, '1周達成で解放', cx, box.y + box.h * 0.74, Math.round(11 * scale), UI_LOCKED);
    if (holdRatio > 0) {
      ctx.strokeStyle = craft.colors.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, box.y + box.h * 0.42, 26 * scale, -Math.PI / 2, -Math.PI / 2 + holdRatio * Math.PI * 2);
      ctx.stroke();
    }
    return;
  }

  ctx.save();
  ctx.translate(cx, box.y + box.h * 0.28);
  ctx.rotate(-Math.PI / 2);
  ctx.scale(scale * 1.15, scale * 1.15);
  drawPlayer(ctx, { id: craft.id, colors: craft.colors, thrust: selected, time });
  ctx.restore();

  uiText(ctx, craft.name, cx, box.y + box.h * 0.52, Math.round(17 * scale), selected ? UI_INK : UI_DIM);
  uiText(ctx, craft.motif, cx, box.y + box.h * 0.62, Math.round(11 * scale), UI_DIM);

  const barLeft = box.x + box.w * 0.16;
  const barWidth = box.w * 0.68;
  let y = box.y + box.h * 0.70;
  for (let i = 0; i < AXES.length; i += 1) {
    const ratio = AXES[i].value(craft) / PEAK[i];
    ctx.fillStyle = '#22344a';
    ctx.fillRect(barLeft, y, barWidth, 4);
    ctx.fillStyle = selected ? craft.colors.accent : '#4d6d90';
    ctx.fillRect(barLeft, y, barWidth * ratio, 4);
    uiText(ctx, AXES[i].label, barLeft - 2, y + 4, Math.round(8 * scale), UI_DIM, 'right');
    y += Math.max(7, box.h * 0.056);
  }
  uiText(ctx, `ARMOR ${craft.hp} · ${craft.lives} UP · HIT ${hitboxLabel(craft)}`, cx, y + 8 * scale,
    Math.round(9.5 * scale), UI_DIM);
}

export function drawSelect(ctx, game, cam) {
  const { width: w, height: h } = cam;
  const layout = game.selectBoxes ?? selectLayout(w, h);

  ctx.globalAlpha = 0.72;
  ctx.fillStyle = UI_PANEL;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  uiText(ctx, 'SELECT CRAFT', w / 2, h * 0.17, Math.min(34, w / 22), '#ffd166');

  const holdRatio = clamp(game.holdTimer / 3, 0, 1);
  for (let i = 0; i < CRAFT.length; i += 1) {
    const craft = CRAFT[i];
    drawCard(ctx, craft, layout.cards[i], {
      selected: i === game.craftIndex,
      locked: !game.isSelectable(craft),
      time: game.time,
      holdRatio: i === game.craftIndex ? holdRatio : 0,
    });
  }

  const chosen = CRAFT[game.craftIndex];
  const ready = game.isSelectable(chosen);
  uiText(ctx, ready ? chosen.blurb : 'ロックされています。1周達成、または長押しで解放。',
    w / 2, layout.blurbY, Math.min(14, w / 46), ready ? UI_INK : UI_LOCKED);

  if (game.sortie) {
    uiText(ctx, game.touchMode ? '装備は LOADOUT ボタンから' : '↓ で LOADOUT',
      w / 2, layout.blurbY + 20, Math.min(12, w / 54), '#7cf5ff');
  }

  if (game.touchMode) {
    const s = layout.start;
    ctx.globalAlpha = ready ? 0.85 : 0.35;
    ctx.fillStyle = ready ? '#1d3a4d' : '#101c28';
    roundedRect(ctx, s.x, s.y, s.w, s.h, 12);
    ctx.fill();
    ctx.strokeStyle = ready ? '#7cf5ff' : UI_LOCKED;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    uiText(ctx, ready ? 'START' : 'HOLD TO UNLOCK', s.x + s.w / 2, s.y + s.h / 2 + 6, 18,
      ready ? '#7cf5ff' : UI_LOCKED);
  } else {
    uiText(ctx, ready ? '←  →  で選択 ・ ENTER で発進' : '←  →  で選択',
      w / 2, layout.start.y + 30, 14, UI_DIM);
  }

  if (game.unlockFlash > 0) {
    ctx.globalAlpha = Math.min(1, game.unlockFlash);
    uiText(ctx, 'S.WIND UNLOCKED', w / 2, h * 0.24, Math.min(24, w / 30), '#7cf5ff');
    ctx.globalAlpha = 1;
  }
}

/** Mode select: two cards, drawn and hit-tested from the same boxes. */
export function modeLayout(width, height) {
  const cardW = Math.min(width * 0.40, 300);
  const cardH = Math.min(cardW * 0.72, height * 0.34);
  const gap = Math.max(12, width * 0.03);
  const left = (width - (cardW * 2 + gap)) / 2;
  const top = height * 0.34;
  return {
    cards: [
      { x: left, y: top, w: cardW, h: cardH },
      { x: left + cardW + gap, y: top, w: cardW, h: cardH },
    ],
  };
}

export const MODES = [
  {
    id: 'arcade',
    name: 'ARCADE',
    blurb: '素の機体で挑む、調整済みのスコアアタック。',
    detail: '装備もドロップもなし。バランスは固定されています。',
  },
  {
    id: 'sortie',
    name: 'SORTIE',
    blurb: '拾って、強くなって、また潜る。',
    detail: '空中でモジュールを拾い、旗艦からパーツを持ち帰ります。',
  },
];

export function drawModeSelect(ctx, game, cam) {
  const { width: w, height: h } = cam;
  const layout = game.modeBoxes ?? modeLayout(w, h);

  ctx.globalAlpha = 0.72;
  ctx.fillStyle = UI_PANEL;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  uiText(ctx, 'SELECT MODE', w / 2, h * 0.22, Math.min(34, w / 22), '#ffd166');

  MODES.forEach((mode, i) => {
    const box = layout.cards[i];
    const selected = i === game.modeIndex;
    ctx.globalAlpha = selected ? 0.85 : 0.5;
    ctx.fillStyle = UI_PANEL;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 12);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.strokeStyle = selected ? '#ffd166' : '#2a4159';
    ctx.stroke();

    const cx = box.x + box.w / 2;
    const scale = clamp(box.w / 280, 0.62, 1.1);
    uiText(ctx, mode.name, cx, box.y + box.h * 0.34, Math.round(28 * scale), selected ? UI_INK : UI_DIM);
    uiText(ctx, mode.blurb, cx, box.y + box.h * 0.58, Math.round(13 * scale), selected ? UI_INK : UI_DIM);
    uiText(ctx, mode.detail, cx, box.y + box.h * 0.78, Math.round(11 * scale), UI_DIM);
  });

  const owned = game.locker.length;
  if (game.modeIndex === 1 && owned > 0) {
    uiText(ctx, `保管庫: ${owned} パーツ`, w / 2, layout.cards[0].y + layout.cards[0].h + 34, 13, '#7cf5ff');
  }
  uiText(ctx, game.touchMode ? 'モードをタップして決定' : '←  →  で選択 ・ ENTER で決定',
    w / 2, layout.cards[0].y + layout.cards[0].h + 62, 14, UI_DIM);
}
