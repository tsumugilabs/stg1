import { clamp } from '../core/math.js';
import { roundedRect, uiText, UI_DIM, UI_INK, UI_PANEL } from '../render/ui.js';
import { AFFIXES, RARITIES, SLOTS } from './gear.js';

/**
 * The locker. Two panes: the five slots on the left, and the parts that fit
 * the highlighted slot on the right. As everywhere else in this game, one
 * layout function feeds both the drawing and the hit testing.
 */

export const ROWS_VISIBLE = 6;

export function loadoutLayout(width, height) {
  const top = height * 0.20;
  const bodyH = height * 0.62;
  const gap = Math.max(10, width * 0.02);
  const slotW = Math.min(width * 0.34, 260);
  const listW = Math.min(width - slotW - gap * 3, 430);
  const left = (width - (slotW + listW + gap)) / 2;
  const rowH = Math.min(bodyH / SLOTS.length, 58);
  const listRowH = Math.min(bodyH / ROWS_VISIBLE, 52);

  const slots = SLOTS.map((slot, i) => ({
    x: left, y: top + i * (rowH + 4), w: slotW, h: rowH, slot: slot.id,
  }));
  const rows = Array.from({ length: ROWS_VISIBLE }, (_, i) => ({
    x: left + slotW + gap, y: top + i * (listRowH + 4), w: listW, h: listRowH,
  }));
  // Sit the button under whichever column is taller, rather than at a fixed
  // fraction of the screen: on a tall phone that left a lot of dead space.
  const bottom = Math.max(
    slots[slots.length - 1].y + rowH,
    rows[rows.length - 1].y + listRowH,
  );
  return {
    slots,
    rows,
    back: { x: width / 2 - 90, y: bottom + 34, w: 180, h: 42 },
  };
}

export function rowAt(point, boxes) {
  return boxes.findIndex(
    (b) => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h,
  );
}

export function rarityOf(part) {
  return RARITIES.find((r) => r.id === part.rarity) ?? RARITIES[0];
}

export function describeAffix({ key, value }) {
  const affix = AFFIXES[key];
  return `${affix.label} ${affix.format(value)}`;
}

function drawRow(ctx, box, { selected, focused, accent }) {
  ctx.globalAlpha = selected ? 0.85 : 0.45;
  ctx.fillStyle = UI_PANEL;
  roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = selected ? (focused ? 3 : 2) : 1;
  ctx.strokeStyle = selected ? accent : '#25384d';
  ctx.stroke();
}

export function drawLoadout(ctx, game, cam) {
  const { width: w, height: h } = cam;
  const layout = game.loadoutBoxes ?? loadoutLayout(w, h);
  const scale = clamp(w / 900, 0.68, 1.05);

  ctx.globalAlpha = 0.86;
  ctx.fillStyle = UI_PANEL;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  uiText(ctx, 'LOADOUT', w / 2, h * 0.13, Math.min(30, w / 24), '#ffd166');
  uiText(ctx, `${game.baseCraft.name}  ・  保管庫 ${game.locker.length}`, w / 2, h * 0.165,
    Math.round(13 * scale), UI_DIM);

  // Left pane: what is fitted.
  const fitted = game.equippedParts();
  SLOTS.forEach((slot, i) => {
    const box = layout.slots[i];
    const part = fitted[i];
    const selected = i === game.slotIndex;
    drawRow(ctx, box, {
      selected,
      focused: selected && game.loadoutPane === 'slots',
      accent: part ? rarityOf(part).color : '#7cf5ff',
    });
    uiText(ctx, slot.name, box.x + 12, box.y + box.h * 0.42, Math.round(12 * scale), UI_DIM, 'left');
    uiText(ctx, part ? part.name : '— 未装備 —', box.x + 12, box.y + box.h * 0.78,
      Math.round(13 * scale), part ? rarityOf(part).color : '#4f637d', 'left');
  });

  // Right pane: everything that would fit the highlighted slot.
  const candidates = game.slotCandidates();
  const offset = game.listOffset;
  if (!candidates.length) {
    uiText(ctx, 'このスロットに合うパーツがありません', layout.rows[0].x + layout.rows[0].w / 2,
      layout.rows[0].y + 30, Math.round(13 * scale), UI_DIM);
  }
  for (let i = 0; i < ROWS_VISIBLE; i += 1) {
    const part = candidates[offset + i];
    if (!part) break;
    const box = layout.rows[i];
    const index = offset + i;
    const selected = index === game.partIndex;
    const rarity = rarityOf(part);
    const equipped = game.loadout[SLOTS[game.slotIndex].id] === part.id;
    drawRow(ctx, box, {
      selected, focused: selected && game.loadoutPane === 'parts', accent: rarity.color,
    });
    uiText(ctx, part.name, box.x + 12, box.y + box.h * 0.40, Math.round(13 * scale), rarity.color, 'left');
    uiText(ctx, rarity.name, box.x + box.w - 12, box.y + box.h * 0.40,
      Math.round(10 * scale), rarity.color, 'right');
    uiText(ctx, part.affixes.map(describeAffix).join('   '), box.x + 12, box.y + box.h * 0.78,
      Math.round(11 * scale), UI_INK, 'left');
    if (equipped) {
      uiText(ctx, '装備中', box.x + box.w - 12, box.y + box.h * 0.78,
        Math.round(10 * scale), '#7cf5ff', 'right');
    }
  }
  if (candidates.length > ROWS_VISIBLE) {
    uiText(ctx, `${offset + 1}-${Math.min(offset + ROWS_VISIBLE, candidates.length)} / ${candidates.length}`,
      layout.rows[0].x + layout.rows[0].w - 4, layout.rows[ROWS_VISIBLE - 1].y + layout.rows[0].h + 16,
      Math.round(11 * scale), UI_DIM, 'right');
  }

  const back = layout.back;
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#12283a';
  roundedRect(ctx, back.x, back.y, back.w, back.h, 10);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#7cf5ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  uiText(ctx, '戻る', back.x + back.w / 2, back.y + back.h * 0.64, 15, '#7cf5ff');

  uiText(ctx, game.touchMode
    ? 'スロットとパーツをタップ ・ 長押しで破棄'
    : '←→ 列  ↑↓ 選択  ENTER 装備/解除  X 破棄  P 戻る',
  w / 2, back.y + back.h + 22, Math.round(12 * scale), UI_DIM);
}
