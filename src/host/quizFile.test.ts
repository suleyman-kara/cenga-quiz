import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { validateQuiz } from "../../shared/quizValidate";
import { copyTitle, downloadQuiz, quizFileName, quizToJson } from "./quizFile";

const schema = JSON.parse(readFileSync(join(__dirname, "../../quizzes/quiz.schema.json"), "utf8"));
const schemaValid = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

const quiz = {
  title: "Genel Kültür",
  description: "Isınma",
  questions: [
    { text: "Başkent?", options: ["İzmir", "Ankara"], correct: 1, seconds: 15 },
    { text: "Su?", options: ["H2O", "CO2", "O2"], correct: 0, imageUrl: "https://a.b/c.png" },
  ],
};

describe("quizToJson", () => {
  it("produces a file that matches quiz.schema.json and imports back unchanged", () => {
    const parsed = JSON.parse(quizToJson(quiz));
    expect(schemaValid(parsed)).toBe(true);
    expect(validateQuiz(parsed)).toEqual({ ok: true, quiz });
  });

  it("has no $schema reference, stable key order and a trailing newline", () => {
    const json = quizToJson({
      questions: [{ imageUrl: undefined, correct: 0, options: ["a", "b"], text: "S" }],
      title: "T",
    } as never);
    expect(json).not.toContain("$schema");
    expect(json.endsWith("\n")).toBe(true);
    expect(Object.keys(JSON.parse(json))).toEqual(["title", "questions"]);
    expect(Object.keys(JSON.parse(json).questions[0])).toEqual(["text", "options", "correct"]);
  });
});

describe("quizFileName", () => {
  it("turns the title into a safe ASCII file name", () => {
    expect(quizFileName("Genel Kültür: Tur 1")).toBe("genel-kultur-tur-1.json");
    expect(quizFileName("İŞÇİ ĞÜÖ ışık")).toBe("isci-guo-isik.json");
    expect(quizFileName("  ***  ")).toBe("quiz.json");
  });
});

describe("copyTitle", () => {
  it("adds the suffix and stays within the title limit", () => {
    expect(copyTitle("Tarih", " (kopya)")).toBe("Tarih (kopya)");
    const long = copyTitle("x".repeat(120), " (kopya)");
    expect(long).toHaveLength(120);
    expect(long.endsWith(" (kopya)")).toBe(true);
  });
});

describe("downloadQuiz", () => {
  afterEach(() => vi.restoreAllMocks());

  it("downloads a JSON Blob via a temporary link", async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => ((blob = b), "blob:quiz"));
    URL.revokeObjectURL = vi.fn();
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
    downloadQuiz(quiz);
    expect(clicked).toEqual([{ href: "blob:quiz", download: "genel-kultur.json" }]);
    expect(blob?.type).toContain("application/json");
    expect(JSON.parse(await blob!.text())).toEqual(quiz);
    await vi.waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:quiz"));
  });
});
