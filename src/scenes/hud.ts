import { drawSprite, drawText, type Sprite } from './draw';
import { textWidth, type Font } from './font';

/** The in-game HUD and container screens, laid out like the game's GUI code (GUI pixels). */

const S = (p: string) => `minecraft:gui/sprites/${p}`;

export const HUD_SPRITES = [
  'hud/hotbar',
  'hud/hotbar_selection',
  'hud/hotbar_offhand_left',
  'hud/crosshair',
  'hud/experience_bar_background',
  'hud/experience_bar_progress',
  'hud/heart/container',
  'hud/heart/container_hardcore',
  'hud/heart/full',
  'hud/heart/half',
  'hud/heart/hardcore_full',
  'hud/heart/hardcore_half',
  'hud/food_empty',
  'hud/food_full',
  'hud/food_half',
  'hud/armor_empty',
  'hud/armor_full',
  'hud/armor_half',
  'hud/air',
  'hud/air_empty',
  'container/slot_highlight_back',
  'container/slot_highlight_front',
  'tooltip/background',
  'tooltip/frame',
  'container/furnace/lit_progress',
  'container/furnace/burn_progress',
].map(S);

export interface HudState {
  health: number;
  food: number;
  armor: number;
  air: number;
  level: number;
  progress: number;
  selected: number;
  hardcore: boolean;
  underwater: boolean;
}

export type ItemImages = Map<string, CanvasImageSource>;

export interface Stack {
  id: string;
  count?: number;
}

/** An item at its slot position (16×16) with its count, like the game draws it. */
export function drawStack(ctx: CanvasRenderingContext2D, font: Font, images: ItemImages, stack: Stack | undefined, x: number, y: number) {
  if (!stack) return;
  const img = images.get(stack.id);
  if (img) ctx.drawImage(img, x, y, 16, 16);
  if (stack.count && stack.count > 1) {
    const text = String(stack.count);
    drawText(ctx, font, text, x + 19 - 2 - textWidth(font, text), y + 6 + 3);
  }
}

/** Text with a one pixel black outline, like the experience level. */
function outlined(ctx: CanvasRenderingContext2D, font: Font, text: string, x: number, y: number, color: string) {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    drawText(ctx, font, text, x + dx, y + dy, { color: '#000000', shadow: false });
  drawText(ctx, font, text, x, y, { color, shadow: false });
}

/** Hotbar, offhand, experience, hearts, armour, food, air and crosshair. */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  font: Font,
  s: Record<string, Sprite>,
  images: ItemImages,
  hotbar: (Stack | undefined)[],
  offhand: Stack | undefined,
  st: HudState,
) {
  const sp = (p: string) => s[S(p)];
  const cx = Math.floor(w / 2);
  drawSprite(ctx, sp('hud/crosshair'), Math.floor((w - 15) / 2), Math.floor((h - 15) / 2), 15, 15);

  drawSprite(ctx, sp('hud/hotbar'), cx - 91, h - 22, 182, 22);
  drawSprite(ctx, sp('hud/hotbar_selection'), cx - 91 - 1 + st.selected * 20, h - 22 - 1, 24, 23);
  if (offhand) {
    drawSprite(ctx, sp('hud/hotbar_offhand_left'), cx - 91 - 29, h - 23, 29, 24);
    drawStack(ctx, font, images, offhand, cx - 91 - 26, h - 16 - 3);
  }
  hotbar.forEach((stack, i) => drawStack(ctx, font, images, stack, cx - 90 + i * 20 + 2, h - 16 - 3));

  // experience
  drawSprite(ctx, sp('hud/experience_bar_background'), cx - 91, h - 29, 182, 5);
  const filled = Math.floor(st.progress * 183);
  if (filled > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 91, h - 29, filled, 5);
    ctx.clip();
    drawSprite(ctx, sp('hud/experience_bar_progress'), cx - 91, h - 29, 182, 5);
    ctx.restore();
  }
  if (st.level > 0) {
    const text = String(st.level);
    outlined(ctx, font, text, cx - Math.floor(textWidth(font, text) / 2), h - 35, '#80ff20');
  }

  // hearts, armour above them, food and air on the right
  const left = cx - 91;
  const top = h - 39;
  const hc = st.hardcore ? 'hardcore_' : '';
  for (let i = 0; i < 10; i++) {
    const x = left + i * 8;
    drawSprite(ctx, sp(`hud/heart/container${st.hardcore ? '_hardcore' : ''}`), x, top, 9, 9);
    if (i * 2 + 1 < st.health) drawSprite(ctx, sp(`hud/heart/${hc}full`), x, top, 9, 9);
    else if (i * 2 + 1 === st.health) drawSprite(ctx, sp(`hud/heart/${hc}half`), x, top, 9, 9);
  }
  if (st.armor > 0) {
    for (let i = 0; i < 10; i++) {
      const x = left + i * 8;
      const p = i * 2 + 1 < st.armor ? 'full' : i * 2 + 1 === st.armor ? 'half' : 'empty';
      drawSprite(ctx, sp(`hud/armor_${p}`), x, top - 10, 9, 9);
    }
  }
  const right = cx + 91;
  for (let i = 0; i < 10; i++) {
    const x = right - i * 8 - 9;
    drawSprite(ctx, sp('hud/food_empty'), x, top, 9, 9);
    if (i * 2 + 1 < st.food) drawSprite(ctx, sp('hud/food_full'), x, top, 9, 9);
    else if (i * 2 + 1 === st.food) drawSprite(ctx, sp('hud/food_half'), x, top, 9, 9);
  }
  if (st.underwater) {
    for (let i = 0; i < 10; i++) drawSprite(ctx, sp(i < st.air ? 'hud/air' : 'hud/air_empty'), right - i * 8 - 9, top - 10, 9, 9);
  }
}

export interface ContainerDef {
  id: string;
  /** Background texture id. */
  texture: string;
  width: number;
  height: number;
  /** Rows of a chest texture: the top part and the inventory part are drawn separately. */
  chestRows?: number;
  title: { key: string; x: number; y: number };
  /** The "Inventory" label, if the screen has one. */
  inventoryLabel?: [number, number];
  /** Slots of the container itself (positions of their item). */
  slots: [number, number][];
  /** Where the player's 3×9 inventory starts; the hotbar is 58 below. */
  playerInv: [number, number];
  furnace?: boolean;
}

const grid = (x: number, y: number, cols: number, rows: number): [number, number][] =>
  Array.from({ length: cols * rows }, (_, i) => [x + (i % cols) * 18, y + Math.floor(i / cols) * 18]);

export const CONTAINERS: ContainerDef[] = [
  {
    id: 'inventory',
    texture: 'minecraft:gui/container/inventory',
    width: 176,
    height: 166,
    title: { key: 'container.crafting', x: 97, y: 8 },
    slots: [...grid(8, 8, 1, 4), [77, 62], ...grid(98, 18, 2, 2), [154, 28]],
    playerInv: [8, 84],
  },
  {
    id: 'chest',
    texture: 'minecraft:gui/container/generic_54',
    width: 176,
    height: 168,
    chestRows: 3,
    title: { key: 'container.chest', x: 8, y: 6 },
    inventoryLabel: [8, 74],
    slots: grid(8, 18, 9, 3),
    playerInv: [8, 85],
  },
  {
    id: 'crafting_table',
    texture: 'minecraft:gui/container/crafting_table',
    width: 176,
    height: 166,
    title: { key: 'container.crafting', x: 29, y: 6 },
    inventoryLabel: [8, 72],
    slots: [...grid(30, 17, 3, 3), [124, 35]],
    playerInv: [8, 84],
  },
  {
    id: 'furnace',
    texture: 'minecraft:gui/container/furnace',
    width: 176,
    height: 166,
    title: { key: 'container.furnace', x: 0, y: 6 },
    inventoryLabel: [8, 72],
    slots: [
      [56, 17],
      [56, 53],
      [116, 35],
    ],
    playerInv: [8, 84],
    furnace: true,
  },
];

/** The slots of a container screen in order: its own, then the inventory, then the hotbar. */
export function containerSlots(c: ContainerDef): [number, number][] {
  const [ix, iy] = c.playerInv;
  return [...c.slots, ...grid(ix, iy, 9, 3), ...grid(ix, iy + 58, 9, 1)];
}

export interface ContainerScene {
  def: ContainerDef;
  bg: Sprite;
  /** One stack per slot (see containerSlots). */
  stacks: (Stack | undefined)[];
  names: Record<string, string>;
  /** Display names of items, by id. */
  itemName: (id: string) => string;
  /** The player, drawn into the inventory's black box. */
  player?: CanvasImageSource & { width: number; height: number };
}

/** Draws a container screen centred in w×h, with hover highlight and tooltip; returns the hovered slot. */
export function drawContainer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  font: Font,
  s: Record<string, Sprite>,
  images: ItemImages,
  scene: ContainerScene,
  time: number,
  mouse?: [number, number],
) {
  const { def, bg } = scene;
  const ox = Math.floor((w - def.width) / 2);
  const oy = Math.floor((h - def.height) / 2);
  // the background textures are 256×256 with the screen in the top-left corner
  const k = bg.tex.width / 256;
  const img = bg.tex.canvas;
  if (def.chestRows) {
    const topH = def.chestRows * 18 + 17;
    ctx.drawImage(img, 0, 0, def.width * k, topH * k, ox, oy, def.width, topH);
    ctx.drawImage(img, 0, 126 * k, def.width * k, 96 * k, ox, oy + topH, def.width, 96);
  } else {
    ctx.drawImage(img, 0, 0, def.width * k, def.height * k, ox, oy, def.width, def.height);
  }
  if (def.id === 'inventory' && scene.player) {
    // the box at 26,8 is 49×70; the render is fitted into it, standing on its bottom
    const { width: pw, height: ph } = scene.player;
    const k2 = Math.min(49 / pw, 66 / ph);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(scene.player, ox + 26 + (49 - pw * k2) / 2, oy + 8 + 68 - ph * k2, pw * k2, ph * k2);
    ctx.imageSmoothingEnabled = false;
  }
  const label = { color: '#404040', shadow: false };
  let title = scene.names[def.title.key] ?? def.title.key;
  const tx = def.id === 'furnace' ? Math.floor((def.width - textWidth(font, title)) / 2) : def.title.x;
  drawText(ctx, font, title, ox + tx, oy + def.title.y, label);
  if (def.inventoryLabel) drawText(ctx, font, scene.names['container.inventory'] ?? 'Inventory', ox + def.inventoryLabel[0], oy + def.inventoryLabel[1], label);

  if (def.furnace) {
    // flame burning down and the arrow filling, on a loop
    const lit = s[S('container/furnace/lit_progress')];
    const burn = s[S('container/furnace/burn_progress')];
    const f = 1 - ((time / 4000) % 1);
    const fh = Math.ceil(f * 13) + 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox + 56, oy + 36 + 14 - fh, 14, fh);
    ctx.clip();
    drawSprite(ctx, lit, ox + 56, oy + 36, 14, 14);
    ctx.restore();
    const aw = Math.ceil(((time / 2000) % 1) * 24);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox + 79, oy + 34, aw, 16);
    ctx.clip();
    drawSprite(ctx, burn, ox + 79, oy + 34, 24, 16);
    ctx.restore();
  }

  const slots = containerSlots(def);
  let hovered = -1;
  slots.forEach(([x, y], i) => {
    if (mouse && mouse[0] >= ox + x - 1 && mouse[0] < ox + x + 17 && mouse[1] >= oy + y - 1 && mouse[1] < oy + y + 17) hovered = i;
  });
  slots.forEach(([x, y], i) => {
    if (i === hovered) drawSprite(ctx, s[S('container/slot_highlight_back')], ox + x - 4, oy + y - 4, 24, 24);
    drawStack(ctx, font, images, scene.stacks[i], ox + x, oy + y);
    if (i === hovered) drawSprite(ctx, s[S('container/slot_highlight_front')], ox + x - 4, oy + y - 4, 24, 24);
  });
  const stack = hovered >= 0 ? scene.stacks[hovered] : undefined;
  if (stack && mouse) drawTooltip(ctx, font, s, scene.itemName(stack.id), mouse[0] + 12, mouse[1] - 12, w, h);
  return hovered;
}

/** A tooltip with the pack's tooltip background and frame. */
export function drawTooltip(ctx: CanvasRenderingContext2D, font: Font, s: Record<string, Sprite>, text: string, x: number, y: number, w: number, h: number) {
  const tw = textWidth(font, text);
  const th = 8;
  x = Math.min(Math.round(x), w - tw - 4);
  y = Math.max(4, Math.min(Math.round(y), h - th - 4));
  const rect: [number, number, number, number] = [x - 3 - 9, y - 3 - 9, tw + 6 + 18, th + 6 + 18];
  drawSprite(ctx, s[S('tooltip/background')], ...rect);
  drawSprite(ctx, s[S('tooltip/frame')], ...rect);
  drawText(ctx, font, text, x, y);
}
