import { club, type Locale } from "../club.config";
import { en, type MessageKey } from "./en";
import { tr } from "./tr";

export type { MessageKey };
export type Vars = Record<string, string | number>;

const catalogs: Record<Locale, Record<MessageKey, string>> = { tr, en };

/** Pure lookup with `{var}` interpolation; falls back to English, then to the key. */
export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const raw = catalogs[locale]?.[key] || en[key] || key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export const locale: Locale = club.locale;

/** Translate in the club's locale. */
export const t = (key: MessageKey, vars?: Vars) => translate(locale, key, vars);

/** Hook form, so components can later switch locale without changing call sites. */
export function useT() {
  return t;
}
