/** Shared chrome primitives: the HUD, the craft select and the touch
 *  controls all draw panels, rounded buttons and centred labels, and they
 *  should agree on how those look. */

export const UI_INK = '#eaf3ff';
export const UI_DIM = '#9fb6d1';
export const UI_LOCKED = '#66809c';
export const UI_PANEL = '#04101d';

export function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text on a text baseline, for lines that sit in a layout. */
export function uiText(ctx, value, x, y, size, color, align = 'center', weight = 'bold') {
  ctx.font = `${weight} ${size}px "Courier New", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
  ctx.textAlign = 'left';
}

/** Text centred on a point in both axes, for labels inside buttons. */
export function centeredText(ctx, value, x, y, size, color) {
  ctx.font = `bold ${size}px "Courier New", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
