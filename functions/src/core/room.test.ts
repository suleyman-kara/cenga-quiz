import { describe, it, expect } from "vitest";
import { applyPatch, toPlain, newRoom, publicQuestion, questionPatch, answersFor, canReveal } from "./room";
import { lobbyRoom, quiz } from "./fixtures";

describe("toPlain", () => {
  it("drops undefined values and turns sparse arrays into objects", () => {
    const sparse: unknown[] = [];
    sparse[0] = { a: 1 };
    sparse[2] = { b: 2 };
    expect(toPlain({ x: undefined, y: sparse, z: [1, 2] })).toEqual({ y: { "0": { a: 1 }, "2": { b: 2 } }, z: [1, 2] });
  });
  it("keeps primitives and null-free objects", () => {
    expect(toPlain(5)).toBe(5);
    expect(toPlain(null)).toBe(null);
    expect(toPlain({ a: { b: "c" } })).toEqual({ a: { b: "c" } });
  });
});

describe("applyPatch", () => {
  it("applies multi-path updates without mutating the input", () => {
    const input = { a: { b: 1, c: 2 }, d: 3 };
    const out = applyPatch(input, { "a/b": 10, "e/f/g": "x", d: null });
    expect(out).toEqual({ a: { b: 10, c: 2 }, e: { f: { g: "x" } } });
    expect(input).toEqual({ a: { b: 1, c: 2 }, d: 3 });
  });
  it("removes empty parents after deleting their last child", () => {
    expect(applyPatch({ a: { b: 1 }, k: 1 }, { "a/b": null })).toEqual({ k: 1 });
  });
  it("works on a null root", () => {
    expect(applyPatch(null, { "x/y": 1 })).toEqual({ x: { y: 1 } });
  });
});

describe("newRoom", () => {
  it("creates meta + lobby state", () => {
    const meta = { hostUid: "h", quizId: "q", title: "T", createdAt: 5, questionCount: 3 };
    expect(newRoom(meta, 5)).toEqual({
      meta,
      state: { phase: "lobby", qIndex: -1, startedAt: 0, endsAt: 0, updatedAt: 5 },
    });
  });
});

describe("publicQuestion", () => {
  it("never contains the correct index and uses effective seconds", () => {
    const pq = publicQuestion(quiz, 1, 20);
    expect(pq).toEqual({ index: 1, text: "S2", options: ["evet", "hayır"], seconds: 20, imageUrl: "https://example.com/x.png" });
    expect(JSON.stringify(pq)).not.toContain("correct");
  });
  it("omits imageUrl when absent", () => {
    expect(publicQuestion(quiz, 0, 20)).toEqual({ index: 0, text: "S1", options: ["a", "b", "c", "d"], seconds: 10 });
  });
});

describe("questionPatch", () => {
  it("writes question, clears reveal and sets timed state in one patch", () => {
    const p = questionPatch(quiz, 0, 10_000, 20);
    expect(p).toEqual({
      question: { index: 0, text: "S1", options: ["a", "b", "c", "d"], seconds: 10 },
      reveal: null,
      state: { phase: "question", qIndex: 0, startedAt: 10_000, endsAt: 20_000, updatedAt: 10_000 },
    });
    expect(JSON.stringify(p)).not.toContain("correct");
  });
  it("lead-in: the question is published now, the clock starts leadInMs later", () => {
    const p = questionPatch(quiz, 0, 10_000, 20, 3000);
    expect(p.state).toEqual({ phase: "question", qIndex: 0, startedAt: 13_000, endsAt: 23_000, updatedAt: 10_000 });
    expect(p.question).toMatchObject({ index: 0, text: "S1" });
  });
});

describe("answersFor / canReveal", () => {
  const room = {
    ...lobbyRoom(),
    state: { phase: "question" as const, qIndex: 1, startedAt: 0, endsAt: 5000, updatedAt: 0 },
  };

  it("reads answers stored as object or (RTDB) array", () => {
    const a = { p1: { choice: 0, at: 1 } };
    expect(answersFor({ ...room, answers: { "1": a } }, 1)).toEqual(a);
    expect(answersFor({ ...room, answers: [undefined, a] as never }, 1)).toEqual(a);
    expect(answersFor(room, 1)).toEqual({});
  });

  it("allows the host to reveal any time after answering opened (even with time left)", () => {
    expect(canReveal({ ...room, answers: { "1": { p1: { choice: 0, at: 1 } } } }, 4999)).toBe(true);
    expect(canReveal(room, 0)).toBe(true);
  });
  it("allows at/after endsAt", () => {
    expect(canReveal(room, 5000)).toBe(true);
  });
  it("refuses during the lead-in (before startedAt), even if answers exist", () => {
    const leadIn = { ...room, state: { ...room.state, startedAt: 3000, endsAt: 8000 } };
    expect(canReveal(leadIn, 2999)).toBe(false);
    expect(canReveal(leadIn, 3000)).toBe(true);
  });
  it("refuses without a state", () => {
    expect(canReveal({ ...room, state: undefined }, 100)).toBe(false);
  });
});
