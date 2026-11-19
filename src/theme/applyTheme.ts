import type { ClubConfig, FontSpec } from "../club.config";

/** Relative luminance (WCAG) of a #rrggbb color. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Returns white or near-black, whichever reads better on `bg`. */
export function readableTextOn(bg: string): string {
  const l = luminance(bg);
  const dark = "#111111";
  return contrast(l, 1) >= contrast(l, luminance(dark)) ? "#ffffff" : dark;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
const fontStack = (f: FontSpec) => `"${f.family}", ${f.fallback}`;

/** Pure: config → CSS custom properties. */
export function buildThemeVars(cfg: ClubConfig): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.colors)) vars[`--color-${kebab(k)}`] = v;
  vars["--color-on-primary"] = readableTextOn(cfg.colors.primary);
  vars["--color-on-accent"] = readableTextOn(cfg.colors.accent);
  vars["--color-on-stage"] = readableTextOn(cfg.colors.stage);
  cfg.choices.forEach((c, i) => {
    vars[`--choice-${i}`] = c.color;
    vars[`--choice-${i}-on`] = readableTextOn(c.color);
  });
  vars["--font-heading"] = fontStack(cfg.fonts.heading);
  vars["--font-body"] = fontStack(cfg.fonts.body);
  vars["--font-display"] = fontStack(cfg.fonts.display);
  return vars;
}

export function googleFontsUrl(cfg: ClubConfig): string {
  const byFamily = new Map<string, Set<number>>();
  for (const f of Object.values(cfg.fonts)) {
    const set = byFamily.get(f.family) ?? new Set<number>();
    f.weights.forEach((w) => set.add(w));
    byFamily.set(f.family, set);
  }
  const families = [...byFamily.entries()]
    .map(([fam, ws]) => `family=${encodeURIComponent(fam).replace(/%20/g, "+")}:wght@${[...ws].sort((a, b) => a - b).join(";")}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

function upsert<T extends HTMLElement>(doc: Document, selector: string, create: () => T): T {
  const found = doc.head.querySelector<T>(selector);
  if (found) return found;
  const el = create();
  doc.head.appendChild(el);
  return el;
}

/** Applies the club theme to a document: CSS vars, title, favicon, theme-color, fonts. */
export function applyTheme(cfg: ClubConfig, doc: Document = document): void {
  const root = doc.documentElement;
  for (const [k, v] of Object.entries(buildThemeVars(cfg))) root.style.setProperty(k, v);
  root.lang = cfg.locale;
  doc.title = `${cfg.shortName} · ${cfg.tagline[cfg.locale]}`;

  const icon = upsert(doc, 'link[rel="icon"]', () => {
    const l = doc.createElement("link");
    l.rel = "icon";
    return l;
  });
  icon.setAttribute("href", cfg.favicon);

  const meta = upsert(doc, 'meta[name="theme-color"]', () => {
    const m = doc.createElement("meta");
    m.name = "theme-color";
    return m;
  });
  meta.content = cfg.colors.primary;

  const fonts = upsert(doc, "link[data-club-fonts]", () => {
    const l = doc.createElement("link");
    l.rel = "stylesheet";
    l.setAttribute("data-club-fonts", "");
    return l;
  });
  fonts.setAttribute("href", googleFontsUrl(cfg));
}
