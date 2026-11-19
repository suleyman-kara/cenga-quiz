import { describe, it, expect } from "vitest";
import { classifyRoom } from "./cleanup";
import { lobbyRoom } from "./fixtures";
import { applyPatch, type Room } from "./room";

const MIN = 60_000;
const HOUR = 60 * MIN;
const opts = { endedGraceMs: 30 * MIN, abandonedMs: 6 * HOUR };
const now = 100 * HOUR;

function room(phase: string, updatedAt: number, extra: Record<string, unknown> = {}): Room {
  return applyPatch(lobbyRoom(), { "state/phase": phase, "state/updatedAt": updatedAt, ...extra }) as Room;
}

describe("classifyRoom", () => {
  it("keeps recently ended rooms", () => {
    expect(classifyRoom(room("ended", now - 29 * MIN), now, opts)).toBe("keep");
  });
  it("removes rooms ended (and archived) more than 30 minutes ago", () => {
    expect(classifyRoom(room("ended", now - 31 * MIN, { "meta/archived": true }), now, opts)).toBe("remove");
  });
  it("archives an ended room that was never archived (e.g. endGame crashed) before removing it", () => {
    expect(classifyRoom(room("ended", now - 31 * MIN), now, opts)).toBe("archive-remove");
  });
  it("never archives an already archived abandoned room again", () => {
    const r = room("reveal", now - 7 * HOUR, { "scores/p1": { score: 1 }, "meta/archived": true });
    expect(classifyRoom(r, now, opts)).toBe("remove");
  });
  it("keeps active rooms", () => {
    expect(classifyRoom(room("question", now - 5 * HOUR), now, opts)).toBe("keep");
  });
  it("removes abandoned rooms without scores", () => {
    expect(classifyRoom(room("lobby", now - 7 * HOUR), now, opts)).toBe("remove");
  });
  it("archives then removes abandoned rooms with scores", () => {
    const r = room("reveal", now - 7 * HOUR, { "scores/p1": { score: 1 } });
    expect(classifyRoom(r, now, opts)).toBe("archive-remove");
  });
  it("removes broken rooms (no state/meta) once stale by meta.createdAt or immediately when empty", () => {
    expect(classifyRoom({}, now, opts)).toBe("remove");
    expect(classifyRoom(null, now, opts)).toBe("remove");
    const noState = { meta: lobbyRoom().meta } as Room;
    expect(classifyRoom(noState, now, opts)).toBe("remove");
    expect(classifyRoom({ meta: { ...lobbyRoom().meta!, createdAt: now - MIN } }, now, opts)).toBe("keep");
  });
});
