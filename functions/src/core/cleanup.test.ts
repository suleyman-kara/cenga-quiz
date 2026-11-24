import { describe, it, expect } from "vitest";
import { classifyRoom } from "./cleanup";
import { lobbyRoom } from "./fixtures";
import { applyPatch, type Room } from "./room";

const MIN = 60_000;
const HOUR = 60 * MIN;
const opts = { endedGraceMs: 30 * MIN, abandonedMs: 6 * HOUR, stuckMs: 30 * MIN };
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
    expect(classifyRoom(room("question", now - 29 * MIN), now, opts)).toBe("keep");
  });
  it("ends a started game that has not moved for 30 minutes (host gone): archive, then the normal grace", () => {
    for (const phase of ["question", "reveal", "leaderboard"])
      expect(classifyRoom(room(phase, now - 31 * MIN), now, opts), phase).toBe("end-archive");
    // an already archived one (endGame crashed after archiving) is just ended
    expect(classifyRoom(room("reveal", now - 31 * MIN, { "meta/archived": true }), now, opts)).toBe("end-archive");
  });
  it("a waiting lobby is not 'stuck' (the host may wait for people); it uses the abandon window", () => {
    expect(classifyRoom(room("lobby", now - 5 * HOUR), now, opts)).toBe("keep");
  });
  it("idle time counts from the later of state.updatedAt and meta.lastActivityAt (joins, kicks, lock)", () => {
    // lobby created 7 h ago, someone joined 1 h ago: still in use
    expect(classifyRoom(room("lobby", now - 7 * HOUR, { "meta/lastActivityAt": now - HOUR }), now, opts)).toBe("keep");
    expect(classifyRoom(room("lobby", now - 7 * HOUR, { "meta/lastActivityAt": now - 6.5 * HOUR }), now, opts)).toBe("remove");
    // an ended room's grace period still counts from the end
    expect(classifyRoom(room("ended", now - 31 * MIN, { "meta/archived": true, "meta/lastActivityAt": now - 40 * MIN }), now, opts)).toBe("remove");
  });
  it("removes abandoned rooms without scores", () => {
    expect(classifyRoom(room("lobby", now - 7 * HOUR), now, opts)).toBe("remove");
  });
  it("archives then removes abandoned rooms with scores (past the abandon window: no 'end' step)", () => {
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
