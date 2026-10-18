import { useCallback } from 'react';
import { create } from 'zustand';
import de from './locales/de';
import en from './locales/en';
import type { PartialShape, Paths, Plural, Shape, Vars } from './types';

export type Messages = Shape<typeof en>;
export type Translation = PartialShape<Messages>;
export type MessageKey = Paths<Messages>;
export type { Vars };
export type TFunction = (key: MessageKey, vars?: Vars) => string;

export interface LocaleInfo {
  /** Name of the language in itself, shown in the language picker. */
  name: string;
  messages: Translation;
  /** Minecraft's language file for item/mob names, e.g. `de_de` (see assets/minecraft/lang). */
  minecraftLang: string;
}

/**
 * Supported UI languages. To add one: create locales/<code>.ts (copy en.ts, type it as `Translation`)
 * and register it here. Missing messages fall back to English.
 */
export const LOCALES = {
  en: { name: 'English', messages: en, minecraftLang: 'en_us' },
  de: { name: 'Deutsch', messages: de, minecraftLang: 'de_de' },
} satisfies Record<string, LocaleInfo>;

export type Locale = keyof typeof LOCALES;
const STORAGE_KEY = 'locale';

const isLocale = (l: string | null | undefined): l is Locale => !!l && l in LOCALES;

/** Saved choice, else the first browser language we support, else English. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {}
  const langs = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  for (const l of langs) {
    const base = l?.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

function lookup(messages: Translation, key: string): string | Plural | undefined {
  let cur: unknown = messages;
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' || (cur && typeof cur === 'object' && 'other' in cur) ? (cur as string | Plural) : undefined;
}

const pluralRules = new Map<string, Intl.PluralRules>();

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  let msg = lookup(LOCALES[locale].messages, key) ?? lookup(en, key);
  if (msg === undefined) return key;
  if (typeof msg !== 'string') {
    let rules = pluralRules.get(locale);
    if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(locale)));
    const n = Number(vars?.count ?? 0);
    msg = msg[rules.select(n)] ?? msg.other;
  }
  return vars ? msg.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : msg;
}

interface LocaleState {
  locale: Locale;
  setLocale(locale: Locale): void;
}

export const useLocale = create<LocaleState>((set) => ({
  locale: detectLocale(),
  setLocale(locale) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {}
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
    set({ locale });
  },
}));

if (typeof document !== 'undefined') document.documentElement.lang = useLocale.getState().locale;

/** Translate outside React (errors, status messages) using the current language. */
export function t(key: MessageKey, vars?: Vars): string {
  return translate(useLocale.getState().locale, key, vars);
}

/** Translate inside React components; re-renders when the language changes. */
export function useT(): TFunction {
  const locale = useLocale((s) => s.locale);
  return useCallback((key, vars) => translate(locale, key, vars), [locale]);
}
