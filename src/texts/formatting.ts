/**
 * Minecraft text formatting with § codes (colours 0–f, k l m n o, r), as used in the pack
 * description, splashes and language files: parsing for previews, and converting JSON text
 * components to § text so they can be edited as one string.
 */

export const COLOR_CODES: Record<string, { name: string; hex: string }> = {
  '0': { name: 'black', hex: '#000000' },
  '1': { name: 'dark_blue', hex: '#0000aa' },
  '2': { name: 'dark_green', hex: '#00aa00' },
  '3': { name: 'dark_aqua', hex: '#00aaaa' },
  '4': { name: 'dark_red', hex: '#aa0000' },
  '5': { name: 'dark_purple', hex: '#aa00aa' },
  '6': { name: 'gold', hex: '#ffaa00' },
  '7': { name: 'gray', hex: '#aaaaaa' },
  '8': { name: 'dark_gray', hex: '#555555' },
  '9': { name: 'blue', hex: '#5555ff' },
  a: { name: 'green', hex: '#55ff55' },
  b: { name: 'aqua', hex: '#55ffff' },
  c: { name: 'red', hex: '#ff5555' },
  d: { name: 'light_purple', hex: '#ff55ff' },
  e: { name: 'yellow', hex: '#ffff55' },
  f: { name: 'white', hex: '#ffffff' },
};

export const FORMAT_CODES = { l: 'bold', o: 'italic', n: 'underlined', m: 'strikethrough', k: 'obfuscated' } as const;
type Format = (typeof FORMAT_CODES)[keyof typeof FORMAT_CODES];

export interface Segment {
  text: string;
  /** Hex colour, if one is set. */
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

/** Splits § text into runs of equal formatting. A colour code resets the formats, like in game. */
export function parseFormatted(text: string): Segment[] {
  const out: Segment[] = [];
  let style: Omit<Segment, 'text'> = {};
  let buf = '';
  const flush = () => {
    if (buf) out.push({ text: buf, ...style });
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '§' && i + 1 < text.length) {
      const code = text[i + 1].toLowerCase();
      if (code in COLOR_CODES) {
        flush();
        style = { color: COLOR_CODES[code].hex };
        i++;
        continue;
      }
      if (code in FORMAT_CODES) {
        flush();
        style = { ...style, [FORMAT_CODES[code as keyof typeof FORMAT_CODES]]: true };
        i++;
        continue;
      }
      if (code === 'r') {
        flush();
        style = {};
        i++;
        continue;
      }
    }
    buf += ch;
  }
  flush();
  return out;
}

/** Text without § codes. */
export const stripFormatting = (text: string) => parseFormatted(text).map((s) => s.text).join('');

const NAME_TO_CODE = Object.fromEntries(Object.entries(COLOR_CODES).map(([code, c]) => [c.name, code]));

/**
 * A JSON text component as § text. Colours outside the 16 named ones (`#rrggbb`) can't be written
 * that way and are dropped; `translate` keys show as the key.
 */
export function componentToLegacy(c: unknown): string {
  return toLegacy(c, {}, false);
}

/** `restyle`: the text follows a sibling, so it has to set its whole style again. */
function toLegacy(c: unknown, inherited: Omit<Segment, 'text'>, restyle: boolean): string {
  const lead = (style: Omit<Segment, 'text'>, changed: boolean) => (restyle || changed ? prefix(style) : '');
  if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') return (String(c) ? lead(inherited, false) : '') + String(c);
  if (Array.isArray(c)) {
    // the first element is the parent of the others
    const [first, ...rest] = c;
    if (first === undefined) return '';
    const parent = first && typeof first === 'object' && !Array.isArray(first) ? styleOf(first as Record<string, unknown>, inherited) : inherited;
    return toLegacy(first, inherited, restyle) + rest.map((r) => toLegacy(r, parent, true)).join('');
  }
  if (!c || typeof c !== 'object') return '';
  const o = c as Record<string, unknown>;
  const style = styleOf(o, inherited);
  const own = typeof o.text === 'string' ? o.text : typeof o.translate === 'string' ? o.translate : '';
  const extra = Array.isArray(o.extra) ? o.extra.map((e) => toLegacy(e, style, true)).join('') : '';
  return (own ? lead(style, JSON.stringify(style) !== JSON.stringify(inherited)) : '') + own + extra;
}

function styleOf(o: Record<string, unknown>, inherited: Omit<Segment, 'text'>): Omit<Segment, 'text'> {
  const style: Omit<Segment, 'text'> = { ...inherited };
  if (typeof o.color === 'string' && NAME_TO_CODE[o.color]) style.color = COLOR_CODES[NAME_TO_CODE[o.color]].hex;
  for (const f of Object.values(FORMAT_CODES) as Format[]) if (typeof o[f] === 'boolean') style[f] = o[f] as boolean;
  return style;
}

/** § codes that set a style from scratch. */
function prefix(style: Omit<Segment, 'text'>): string {
  const color = Object.entries(COLOR_CODES).find(([, c]) => c.hex === style.color)?.[0];
  let s = color ? `§${color}` : '§r';
  for (const [code, f] of Object.entries(FORMAT_CODES)) if (style[f as Format]) s += `§${code}`;
  return s;
}

/** A language file with one entry set (or removed with `undefined`/empty). */
export function setLangEntry(lang: Record<string, string> | undefined, key: string, value: string | undefined): Record<string, string> {
  const next = { ...lang };
  if (value === undefined || value === '') delete next[key];
  else next[key] = value;
  return next;
}

/** Splash lines as Minecraft reads them: one per line, empty lines skipped. */
export const splashLines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
