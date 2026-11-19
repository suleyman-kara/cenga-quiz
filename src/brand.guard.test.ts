/**
 * Fork-safety guard: the club's name may only live in src/club.config.ts.
 * Also guards against other quiz product names appearing anywhere in the code.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { club } from "./club.config";

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["src", "shared", "functions/src", "rules", "scripts", "tests", "quizzes"];
const SCAN_FILES = ["index.html", "firebase.json", "package.json"];
const ALLOWED = new Set(["src/club.config.ts"]);
const EXT = /\.(ts|tsx|js|mjs|json|html|css|rules)$/;

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === "lib") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (EXT.test(e)) out.push(p);
  }
  return out;
}

const files = [
  ...SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))),
  ...SCAN_FILES.map((f) => join(ROOT, f)),
].filter((f) => !ALLOWED.has(relative(ROOT, f)) && !f.endsWith("brand.guard.test.ts"));

// Encoded so that the names themselves never appear in the repository.
const BANNED = ["S2Fob290", "UXVpemxldA==", "TWVudGltZXRlcg=="].map((b) =>
  Buffer.from(b, "base64").toString("utf8").toLowerCase(),
);

describe("brand guard", () => {
  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("club name/shortName is not hard-coded outside club.config.ts", () => {
    const needles = [club.name, club.shortName].map((s) => s.toLowerCase());
    const offenders = files.filter((f) => {
      const text = readFileSync(f, "utf8").toLowerCase();
      return needles.some((n) => text.includes(n));
    });
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it("no other quiz product names appear in the code", () => {
    const offenders = files.filter((f) => {
      const text = readFileSync(f, "utf8").toLowerCase();
      return BANNED.some((n) => text.includes(n));
    });
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
