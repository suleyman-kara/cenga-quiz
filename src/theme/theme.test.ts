import { describe, it, expect, beforeEach } from "vitest";
import { club, type ClubConfig } from "../club.config";
import { buildThemeVars, applyTheme, readableTextOn } from "./applyTheme";

describe("club.config", () => {
  it("has the required identity fields", () => {
    expect(club.name.length).toBeGreaterThan(0);
    expect(club.shortName.length).toBeGreaterThan(0);
    expect(club.logo.src).toMatch(/^\//);
    expect(club.favicon).toMatch(/^\//);
  });

  it("defines 4 distinct answer choices, each with color + svg shape", () => {
    expect(club.choices).toHaveLength(4);
    const colors = new Set(club.choices.map((c) => c.color.toLowerCase()));
    const ids = new Set(club.choices.map((c) => c.id));
    expect(colors.size).toBe(4);
    expect(ids.size).toBe(4);
    for (const c of club.choices) {
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.svgPath.length).toBeGreaterThan(5);
      expect(c.viewBox).toMatch(/^\d+ \d+ \d+ \d+$/);
    }
  });

  it("all palette colors are 6-digit hex", () => {
    for (const v of Object.values(club.colors)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("readableTextOn", () => {
  it("picks white on dark and dark on light backgrounds", () => {
    expect(readableTextOn("#000000")).toBe("#ffffff");
    expect(readableTextOn("#C3073E")).toBe("#ffffff");
    expect(readableTextOn("#ffffff")).toBe("#111111");
    expect(readableTextOn("#E4E0E0")).toBe("#111111");
  });
});

describe("buildThemeVars", () => {
  it("maps every palette color to a --color-* variable", () => {
    const vars = buildThemeVars(club);
    for (const [k, v] of Object.entries(club.colors)) {
      const kebab = k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      expect(vars[`--color-${kebab}`]).toBe(v);
    }
  });

  it("emits choice colors and readable on-colors", () => {
    const vars = buildThemeVars(club);
    club.choices.forEach((c, i) => {
      expect(vars[`--choice-${i}`]).toBe(c.color);
      expect(vars[`--choice-${i}-on`]).toBe(readableTextOn(c.color));
    });
  });

  it("emits font families with fallbacks", () => {
    const vars = buildThemeVars(club);
    expect(vars["--font-heading"]).toContain(club.fonts.heading.family);
    expect(vars["--font-body"]).toContain(club.fonts.body.family);
    expect(vars["--font-display"]).toContain(club.fonts.display.family);
    expect(vars["--font-body"]).toMatch(/sans-serif|serif/);
  });

  it("works for any other club config (fork scenario)", () => {
    const other: ClubConfig = {
      ...club,
      name: "Örnek Kulübü",
      colors: { ...club.colors, primary: "#123456" },
    };
    expect(buildThemeVars(other)["--color-primary"]).toBe("#123456");
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("writes CSS variables onto :root", () => {
    applyTheme(club, document);
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe(club.colors.primary);
  });

  it("sets title, favicon, theme-color and lang from config", () => {
    applyTheme(club, document);
    expect(document.title).toContain(club.shortName);
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(icon?.getAttribute("href")).toBe(club.favicon);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe(club.colors.primary);
    expect(document.documentElement.lang).toBe(club.locale);
  });

  it("loads Google Fonts once, even if called twice", () => {
    applyTheme(club, document);
    applyTheme(club, document);
    const links = document.querySelectorAll('link[data-club-fonts]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toContain("fonts.googleapis.com");
  });
});
