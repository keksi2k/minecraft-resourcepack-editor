import { describe, expect, it } from 'vitest';
import { LOCALES, translate, type Locale } from '../i18n';
import en from '../i18n/locales/en';

type Tree = { [k: string]: string | Tree };

/** Flattens a catalogue to `path → message`; plural objects become `path.one`, `path.other`, … */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === 'string') out.set(prefix + k, v);
    else for (const [p, s] of flatten(v, `${prefix}${k}.`)) out.set(p, s);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const reference = flatten(en as unknown as Tree);
const baseKey = (k: string) => k.replace(/\.(zero|one|two|few|many|other)$/, '');
const pluralKeys = new Set([...reference.keys()].filter((k) => /\.other$/.test(k)).map(baseKey));

describe.each(Object.keys(LOCALES) as Locale[])('locale %s', (code) => {
  const messages = flatten(LOCALES[code].messages as unknown as Tree);

  it('translates every message', () => {
    const missing = [...reference.keys()]
      .filter((k) => !pluralKeys.has(baseKey(k)) || k.endsWith('.other'))
      .filter((k) => !messages.has(k));
    expect(missing).toEqual([]);
  });

  it('has no keys that English does not define', () => {
    const extra = [...messages.keys()].filter((k) => !reference.has(k) && !pluralKeys.has(baseKey(k)));
    expect(extra).toEqual([]);
  });

  it('keeps the placeholders of the English messages', () => {
    const wrong = [...messages].filter(([k, v]) => {
      const ref = reference.get(k) ?? reference.get(`${baseKey(k)}.other`);
      return ref !== undefined && placeholders(ref).join() !== placeholders(v).join();
    });
    expect(wrong).toEqual([]);
  });
});

describe('translate', () => {
  it('interpolates and picks plural forms', () => {
    expect(translate('en', 'header.edits', { count: 1 })).toBe('1 change');
    expect(translate('en', 'header.edits', { count: 3 })).toBe('3 changes');
    expect(translate('de', 'header.edits', { count: 1 })).toBe('1 Änderung');
    expect(translate('de', 'load.suggested', { format: 46 })).toBe('Vorschlag anhand von pack_format 46.');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(translate('en', 'load.suggested')).toBe('Suggested from pack_format {format}.');
  });
});
