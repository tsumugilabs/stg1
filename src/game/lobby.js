import { roundedRect, uiText, UI_DIM, UI_INK, UI_PANEL } from '../render/ui.js';
import { CRAFT } from './craft.js';

/**
 * The room screen.
 *
 * Everything here is drawn and hit-tested from the same boxes, the way every
 * other screen in this game works, so there is no second copy of the layout to
 * drift out of step with the first.
 *
 * The screen has four faces: pick a way in, type a code, sit in the room, or
 * read why it did not work.
 */

/** Room codes are read out loud, so no I, O, 0 or 1. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function button(x, y, w, h, id) {
  return { x, y, w, h, id };
}

export function menuLayout(width, height) {
  const w = Math.min(width * 0.42, 300);
  const h = Math.min(w * 0.42, height * 0.16);
  const gap = Math.max(14, width * 0.025);
  const left = (width - (w * 2 + gap)) / 2;
  const top = height * 0.42;
  return {
    buttons: [
      button(left, top, w, h, 'host'),
      button(left + w + gap, top, w, h, 'join'),
    ],
    // How the two browsers find each other. Offered as a choice because one of
    // them cannot fail for network reasons and the other one can.
    ways: [
      button(width / 2 - 176, height * 0.27, 172, 42, 'way-tabs'),
      button(width / 2 + 4, height * 0.27, 172, 42, 'way-online'),
    ],
    back: button(width / 2 - 70, top + h + 34, 140, 40, 'back'),
  };
}

export function codeLayout(width, height) {
  const columns = 8;
  const rows = Math.ceil(CODE_ALPHABET.length / columns);
  const gap = Math.max(6, width * 0.008);
  const key = Math.min((width * 0.82 - gap * (columns - 1)) / columns, 62);
  const gridW = columns * key + (columns - 1) * gap;
  const left = (width - gridW) / 2;
  const top = height * 0.38;
  const keys = [];
  for (let i = 0; i < CODE_ALPHABET.length; i += 1) {
    keys.push(button(
      left + (i % columns) * (key + gap),
      top + Math.floor(i / columns) * (key + gap),
      key, key, CODE_ALPHABET[i],
    ));
  }
  const footer = top + rows * (key + gap) + 12;
  return {
    keys,
    key,
    del: button(width / 2 - key * 2.2, footer, key * 2, key * 0.8, 'del'),
    go: button(width / 2 + key * 0.2, footer, key * 2, key * 0.8, 'go'),
    back: button(width / 2 - 70, footer + key * 0.8 + 16, 140, 38, 'back'),
  };
}

export function roomLayout(width, height) {
  const rowW = Math.min(width * 0.78, 460);
  const rowH = Math.max(46, Math.min(58, height * 0.09));
  const left = (width - rowW) / 2;
  const top = height * 0.32;
  const rows = [];
  for (let i = 0; i < 4; i += 1) rows.push(button(left, top + i * (rowH + 8), rowW, rowH, `seat${i}`));
  const footer = top + 4 * (rowH + 8) + 14;
  return {
    rows,
    rowW,
    sizes: [2, 3, 4].map((n, i) => button(left + i * 78, footer, 70, 36, `size${n}`)),
    action: button(left + rowW - 168, footer, 168, 40, 'action'),
    back: button(left, footer + 50, 140, 36, 'back'),
  };
}

export function hitButton(point, boxes) {
  for (const box of boxes) {
    if (!box) continue;
    if (point.x >= box.x && point.x <= box.x + box.w
      && point.y >= box.y && point.y <= box.y + box.h) return box.id;
  }
  return null;
}

function chip(ctx, box, label, { on = false, dim = false, accent = '#7cf5ff' } = {}) {
  ctx.globalAlpha = on ? 0.9 : 0.45;
  ctx.fillStyle = on ? '#1d3a4d' : UI_PANEL;
  roundedRect(ctx, box.x, box.y, box.w, box.h, 10);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = on ? 2.5 : 1.5;
  ctx.strokeStyle = on ? accent : '#2a4159';
  ctx.stroke();
  uiText(ctx, label, box.x + box.w / 2, box.y + box.h * 0.66,
    Math.round(box.h * 0.4), on ? accent : (dim ? '#66809c' : UI_DIM));
}

export function drawLobby(ctx, game, cam) {
  const { width: w, height: h } = cam;
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = UI_PANEL;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  const title = Math.min(32, w / 24);
  const stage = game.netStage;

  if (stage === 'menu') {
    const layout = game.lobbyBoxes;
    uiText(ctx, 'ONLINE SQUADRON', w / 2, h * 0.17, title, '#ffd166');
    uiText(ctx, '仲間と同じ空を飛ぶ', w / 2, h * 0.22, 14, UI_DIM);
    chip(ctx, layout.ways[0], '同じ端末の別タブ', { on: game.netWay === 'tabs' });
    chip(ctx, layout.ways[1], 'オンライン', { on: game.netWay === 'online' });
    uiText(ctx, game.netWay === 'tabs'
      ? '同じブラウザで別タブを開いて参加します。1人で4席ためせます'
      : '離れた相手と直接つなぎます (P2P)',
    w / 2, h * 0.27 + 62, 12, UI_DIM);
    chip(ctx, layout.buttons[0], 'ホストする', { on: true, accent: '#ffd166' });
    chip(ctx, layout.buttons[1], '参加する', { on: true });
    chip(ctx, layout.back, 'もどる');
    return;
  }

  if (stage === 'code') {
    const layout = game.lobbyBoxes;
    uiText(ctx, 'ルームコード', w / 2, h * 0.17, title, '#ffd166');
    const typed = (game.netCode + '____').slice(0, 4).split('').join('  ');
    uiText(ctx, typed, w / 2, h * 0.30, Math.min(52, w / 14), UI_INK);
    for (const key of layout.keys) chip(ctx, key, key.id, {});
    chip(ctx, layout.del, '消す');
    chip(ctx, layout.go, '参加', { on: game.netCode.length === 4, accent: '#ffd166' });
    chip(ctx, layout.back, 'もどる');
    return;
  }

  if (stage === 'error' || stage === 'connecting') {
    uiText(ctx, stage === 'connecting' ? 'つないでいます...' : 'つながりませんでした',
      w / 2, h * 0.42, title, stage === 'connecting' ? UI_INK : '#ff8f8f');
    if (game.netError) uiText(ctx, game.netError, w / 2, h * 0.42 + 34, 15, UI_DIM);
    if (stage === 'error') chip(ctx, game.lobbyBoxes.back, 'もどる');
    return;
  }

  // --- the room itself ----------------------------------------------------
  const layout = game.lobbyBoxes;
  const room = game.room;
  uiText(ctx, room && room.isHost ? 'あなたがホストです' : 'ルームに参加中',
    w / 2, h * 0.13, Math.min(20, w / 38), UI_DIM);
  uiText(ctx, `CODE  ${game.netCode}`, w / 2, h * 0.21, Math.min(46, w / 16), '#ffd166');
  uiText(ctx, game.netWay === 'tabs'
    ? 'このコードを別タブの「参加する」に入れてください'
    : 'このコードを友人に伝えてください',
  w / 2, h * 0.21 + 30, 13, UI_DIM);

  const slots = (room && room.slots) || [];
  layout.rows.forEach((box, i) => {
    const active = i < (room ? room.size : 0);
    const slot = slots[i];
    ctx.globalAlpha = active ? 0.6 : 0.2;
    ctx.fillStyle = UI_PANEL;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    const mine = room && i === room.seat;
    ctx.lineWidth = mine ? 3 : 1.5;
    ctx.strokeStyle = mine ? '#ffd166' : '#2a4159';
    ctx.stroke();
    if (!active) {
      uiText(ctx, '—', box.x + box.w / 2, box.y + box.h * 0.66, 18, '#3d5570');
      return;
    }
    const kind = slot ? slot.kind : 'ai';
    const label = kind === 'ai' ? `CPU  (僚機)` : (slot.name || `P${i + 1}`);
    uiText(ctx, `P${i + 1}`, box.x + 18, box.y + box.h * 0.64, 15, UI_DIM, 'left');
    uiText(ctx, label, box.x + 62, box.y + box.h * 0.64, 17,
      kind === 'ai' ? '#66809c' : UI_INK, 'left');
    const craft = slot && slot.craft ? CRAFT.find((c) => c.id === slot.craft) : null;
    if (craft) {
      uiText(ctx, craft.name, box.x + box.w - 116, box.y + box.h * 0.64, 14,
        craft.colors.accent, 'right');
    }
    if (kind === 'peer') {
      uiText(ctx, slot.ready ? 'READY' : '準備中', box.x + box.w - 18, box.y + box.h * 0.64, 14,
        slot.ready ? '#7cf5ff' : UI_DIM, 'right');
    } else if (kind === 'host') {
      uiText(ctx, 'HOST', box.x + box.w - 18, box.y + box.h * 0.64, 14, '#ffd166', 'right');
    }
  });

  if (room && room.isHost) {
    for (const box of layout.sizes) {
      chip(ctx, box, `${box.id.slice(4)}機`, { on: room.size === Number(box.id.slice(4)) });
    }
    const waiting = room.humans < 2;
    chip(ctx, layout.action, waiting ? '待っています' : '出撃',
      { on: !waiting, accent: '#ffd166' });
  } else {
    chip(ctx, layout.action, game.netReady ? 'READY 解除' : 'READY',
      { on: game.netReady, accent: '#7cf5ff' });
  }
  chip(ctx, layout.back, '退出');

  uiText(ctx, room && room.isHost
    ? '空いた席はAI僚機が飛びます。2人でも出撃できます'
    : 'ホストの出撃を待っています',
  w / 2, layout.back.y + layout.back.h + 24, 12, UI_DIM);
}
