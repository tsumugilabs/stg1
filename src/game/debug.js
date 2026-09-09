import { centeredText, roundedRect, uiText, UI_DIM, UI_INK, UI_PANEL } from '../render/ui.js';

/**
 * Debug mode. Opened by tapping ten times on an empty part of the craft
 * select screen, which is a gesture nobody performs by accident but that
 * needs no keyboard — the point being that it can be reached on a phone.
 *
 * The panel sits along the top, clear of the stick and the fire button, and
 * every action is also on a number key so it can be driven from a desk.
 */

export const DEBUG_TAPS = 10;
/** Taps further apart than this start the count again. */
export const DEBUG_TAP_GAP = 1.2;

export const DEBUG_ACTIONS = [
  { key: 'invincible', label: '無敵', toggle: true },
  { key: 'hitboxes', label: '判定', toggle: true },
  { key: 'nextEra', label: '次の面' },
  { key: 'flagship', label: '旗艦' },
  { key: 'canyon', label: '渓谷' },
  { key: 'part', label: 'パーツ' },
  { key: 'module', label: 'モジュール' },
  { key: 'unlock', label: '全解放' },
  { key: 'off', label: 'OFF' },
];

export function debugLayout(width) {
  const columns = width < 700 ? 4 : DEBUG_ACTIONS.length;
  const gap = 5;
  const buttonW = Math.min((width - 24 - gap * (columns - 1)) / columns, 118);
  const buttonH = 30;
  const left = 12;
  const top = 48;
  return {
    buttons: DEBUG_ACTIONS.map((action, i) => ({
      x: left + (i % columns) * (buttonW + gap),
      y: top + Math.floor(i / columns) * (buttonH + gap),
      w: buttonW,
      h: buttonH,
      action,
    })),
  };
}

export function debugButtonAt(point, layout) {
  return layout.buttons.findIndex(
    (b) => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h,
  );
}

export function drawDebug(ctx, game, cam) {
  const layout = game.debugBoxes ?? debugLayout(cam.width);
  const last = layout.buttons[layout.buttons.length - 1];

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = UI_PANEL;
  ctx.fillRect(0, 42, cam.width, last.y + last.h + 30 - 42);
  ctx.globalAlpha = 1;

  for (const box of layout.buttons) {
    const on = box.action.toggle && game.debugFlags[box.action.key];
    ctx.globalAlpha = on ? 0.9 : 0.5;
    ctx.fillStyle = on ? '#1d3a4d' : '#0b1622';
    roundedRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = on ? '#7cf5ff' : '#3a5570';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    centeredText(ctx, box.action.label, box.x + box.w / 2, box.y + box.h / 2 + 1, 12,
      on ? '#7cf5ff' : UI_INK);
  }

  const craft = game.craft;
  const line = [
    `${Math.round(game.fps)}fps`,
    game.state,
    `${game.mode}`,
    `era${game.eraIndex} ${game.era.label}`,
    `kill ${game.kills}/${game.quota}`,
    `e${game.enemies.length} b${game.bullets.length} p${game.pickups.length}`,
    `hp${game.player.hp}/${game.player.maxHp}`,
    `spd${Math.round(craft.speed)} trn${craft.turnRate.toFixed(2)} cd${craft.fireCooldown.toFixed(2)} x${craft.barrels.length}`,
  ].join('  ');
  uiText(ctx, line, 12, last.y + last.h + 20, 11, UI_DIM, 'left', 'normal');
}

/** Outlines every collision circle, which is the only way to see them. */
export function drawHitboxes(ctx, game, cam) {
  const ox = cam.width / 2 - cam.x;
  const oy = cam.height / 2 - cam.y;
  ctx.save();
  ctx.lineWidth = 1;
  const circle = (thing, color) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(thing.x + ox, thing.y + oy, thing.radius, 0, Math.PI * 2);
    ctx.stroke();
  };
  for (const enemy of game.enemies) circle(enemy, '#ff8f5e');
  for (const bullet of game.bullets) circle(bullet, bullet.team === 'player' ? '#ffd166' : '#ff6b6b');
  for (const pickup of game.pickups) circle(pickup, '#7cf5ff');
  for (const chute of game.parachutists) circle(chute, '#9fe8a0');
  if (game.boss) circle(game.boss, '#ff6b6b');
  circle(game.player, '#7cf5ff');
  ctx.restore();
}
