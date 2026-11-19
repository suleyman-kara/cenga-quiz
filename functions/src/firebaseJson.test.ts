/** Deploy hygiene checks on firebase.json (hosting headers, functions predeploy). */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cfg = JSON.parse(readFileSync(join(__dirname, "..", "..", "firebase.json"), "utf8"));
type Header = { key: string; value: string };
const headersFor = (source: string): Record<string, string> =>
  Object.fromEntries(
    (cfg.hosting.headers as { source: string; headers: Header[] }[])
      .filter((h) => h.source === source)
      .flatMap((h) => h.headers.map((x) => [x.key, x.value])),
  );

describe("firebase.json", () => {
  it("builds functions before deploy", () => {
    expect(cfg.functions[0].predeploy).toEqual(['npm --prefix "$RESOURCE_DIR" run build']);
  });
  it("sets security headers on every response", () => {
    const h = headersFor("**");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=(), payment=()");
    expect(h["Permissions-Policy"]).not.toMatch(/wake-lock/);
    // CSP starts report-only; COOP is not set (it would break signInWithPopup)
    expect(h["Content-Security-Policy"]).toBeUndefined();
    expect(h["Cross-Origin-Opener-Policy"]).toBeUndefined();
    const csp = h["Content-Security-Policy-Report-Only"];
    for (const part of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "wss://*.firebasedatabase.app",
      "https://*.cloudfunctions.net",
      "https://content-firebaseappcheck.googleapis.com",
      "frame-src https://*.firebaseapp.com https://www.google.com",
      "font-src https://fonts.gstatic.com",
    ]) {
      expect(csp).toContain(part);
    }
  });
  it("caches hashed assets forever and never caches the app shell", () => {
    expect(headersFor("/assets/**")["Cache-Control"]).toBe("public, max-age=31536000, immutable");
    expect(headersFor("/index.html")["Cache-Control"]).toBe("no-cache");
    expect(headersFor("**/!(*.*)")["Cache-Control"]).toBe("no-cache");
  });
});
