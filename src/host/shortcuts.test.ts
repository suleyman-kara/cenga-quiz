import { describe, it, expect } from "vitest";
import { stageShortcut } from "./shortcuts";

const ev = (key: string, p: Partial<{ target: EventTarget | null; altKey: boolean; ctrlKey: boolean; metaKey: boolean; repeat: boolean }> = {}) => ({
  key,
  target: document.body,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  ...p,
});

describe("stageShortcut", () => {
  it("Space, Enter, PageDown and → go to the next step; R reveals", () => {
    for (const k of [" ", "Enter", "PageDown", "ArrowRight"]) expect(stageShortcut(ev(k))).toBe("next");
    expect(stageShortcut(ev("r"))).toBe("reveal");
    expect(stageShortcut(ev("R"))).toBe("reveal");
    expect(stageShortcut(ev("p"))).toBe("pause");
    expect(stageShortcut(ev("x"))).toBeNull();
  });

  it("ignores modifiers and auto-repeat (a held key must not skip steps)", () => {
    expect(stageShortcut(ev(" ", { ctrlKey: true }))).toBeNull();
    expect(stageShortcut(ev("r", { metaKey: true }))).toBeNull();
    expect(stageShortcut(ev("ArrowRight", { altKey: true }))).toBeNull();
    expect(stageShortcut(ev(" ", { repeat: true }))).toBeNull();
  });

  it("ignores keys aimed at fields, buttons and open dialogs", () => {
    const input = document.createElement("input");
    const button = document.createElement("button");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "alertdialog");
    const inside = document.createElement("span");
    dialog.appendChild(inside);
    for (const target of [input, button, inside]) expect(stageShortcut(ev(" ", { target }))).toBeNull();
  });
});
