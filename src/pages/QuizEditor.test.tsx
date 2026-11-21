import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { translate } from "../i18n";
import { club } from "../club.config";
import { QuizEditor } from "./QuizEditor";
import { useHostAuth, loadQuiz, saveQuiz, updateQuiz } from "../game/host";

vi.mock("../firebase", () => ({ hostCall: vi.fn() }));
vi.mock("../game/host", () => ({
  useHostAuth: vi.fn(),
  loadQuiz: vi.fn(),
  saveQuiz: vi.fn(),
  updateQuiz: vi.fn(),
}));

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);
const user = { uid: "h1", email: "host@example.org", displayName: "Host" };

function renderEditor(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/host/quiz/${id}`]}>
      <Routes>
        <Route path="/host" element={<div>PANEL</div>} />
        <Route path="/host/quiz/:id" element={<QuizEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

const q1 = () => screen.getByRole("group", { name: t("editor.question", { n: 1 }) });

describe("QuizEditor", () => {
  beforeEach(() => {
    vi.mocked(useHostAuth).mockReturnValue({ status: "authorized", user, signIn: vi.fn(), signOut: vi.fn() });
    vi.mocked(loadQuiz).mockReset();
    vi.mocked(saveQuiz).mockReset().mockResolvedValue("newId");
    vi.mocked(updateQuiz).mockReset().mockResolvedValue(undefined);
  });

  it("creates a new quiz from scratch", async () => {
    renderEditor("yeni");
    expect(screen.getByRole("heading", { name: t("editor.newTitle") })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(t("editor.title")), "Genel Kültür");
    await userEvent.type(within(q1()).getByLabelText(t("editor.text")), "Başkent neresi?");
    await userEvent.type(within(q1()).getByLabelText(t("editor.option", { n: 1 })), "İzmir");
    await userEvent.type(within(q1()).getByLabelText(t("editor.option", { n: 2 })), "Ankara");
    await userEvent.click(within(q1()).getByLabelText(t("editor.correct", { n: 2 })));
    await userEvent.type(within(q1()).getByLabelText(t("editor.seconds")), "15");
    await userEvent.click(screen.getByRole("button", { name: t("editor.save") }));
    expect(saveQuiz).toHaveBeenCalledWith("h1", {
      title: "Genel Kültür",
      questions: [{ text: "Başkent neresi?", options: ["İzmir", "Ankara"], correct: 1, seconds: 15 }],
    });
    expect(await screen.findByText("PANEL")).toBeInTheDocument();
  });

  it("shows validation problems next to the question and saves nothing", async () => {
    renderEditor("yeni");
    await userEvent.type(within(q1()).getByLabelText(t("editor.option", { n: 1 })), "a");
    await userEvent.click(screen.getByRole("button", { name: t("editor.save") }));
    expect(saveQuiz).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Başlık: boş olamaz");
    expect(within(q1()).getByText("Soru metni: boş olamaz")).toBeInTheDocument();
    expect(within(q1()).getByText("2. şık: boş olamaz")).toBeInTheDocument();
  });

  it("after a failed save, errors update live as fields are fixed", async () => {
    renderEditor("yeni");
    await userEvent.click(screen.getByRole("button", { name: t("editor.save") }));
    expect(within(q1()).getByText("Soru metni: boş olamaz")).toBeInTheDocument();
    await userEvent.type(within(q1()).getByLabelText(t("editor.text")), "Soru");
    expect(within(q1()).queryByText("Soru metni: boş olamaz")).not.toBeInTheDocument();
    expect(within(q1()).getByText("1. şık: boş olamaz")).toBeInTheDocument();
  });

  it("adds and removes questions and options within the limits", async () => {
    renderEditor("yeni");
    const addOpt = within(q1()).getByRole("button", { name: t("editor.addOption") });
    await userEvent.click(addOpt);
    await userEvent.click(addOpt);
    expect(within(q1()).getByLabelText(t("editor.option", { n: 4 }))).toBeInTheDocument();
    expect(addOpt).toBeDisabled();
    await userEvent.click(within(q1()).getByRole("button", { name: t("editor.removeOption", { n: 4 }) }));
    expect(within(q1()).queryByLabelText(t("editor.option", { n: 4 }))).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: t("editor.removeQuestion", { n: 1 }) })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: t("editor.addQuestion") }));
    expect(screen.getByRole("group", { name: t("editor.question", { n: 2 }) })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("editor.removeQuestion", { n: 2 }) }));
    expect(screen.queryByRole("group", { name: t("editor.question", { n: 2 }) })).not.toBeInTheDocument();
  });

  it("edits an existing quiz and updates it in place", async () => {
    vi.mocked(loadQuiz).mockResolvedValue({
      title: "Tarih",
      questions: [
        { text: "İlk soru", options: ["a", "b"], correct: 0 },
        { text: "İkinci soru", options: ["c", "d", "e"], correct: 2, seconds: 30 },
      ],
    });
    renderEditor("quiz1");
    const title = await screen.findByLabelText(t("editor.title"));
    expect(title).toHaveValue("Tarih");
    expect(loadQuiz).toHaveBeenCalledWith("quiz1");
    await userEvent.clear(title);
    await userEvent.type(title, "Tarih 2");
    await userEvent.click(screen.getByRole("button", { name: t("editor.moveDown", { n: 1 }) }));
    await userEvent.click(screen.getByRole("button", { name: t("editor.save") }));
    await waitFor(() => expect(updateQuiz).toHaveBeenCalled());
    expect(updateQuiz).toHaveBeenCalledWith("quiz1", {
      title: "Tarih 2",
      questions: [
        { text: "İkinci soru", options: ["c", "d", "e"], correct: 2, seconds: 30 },
        { text: "İlk soru", options: ["a", "b"], correct: 0 },
      ],
    });
    expect(saveQuiz).not.toHaveBeenCalled();
  });

  it("unknown quiz: shows not found", async () => {
    vi.mocked(loadQuiz).mockResolvedValue(null);
    renderEditor("nope");
    expect(await screen.findByText(t("editor.notFound"))).toBeInTheDocument();
  });

  it("asks before leaving with unsaved changes", async () => {
    renderEditor("yeni");
    await userEvent.type(screen.getByLabelText(t("editor.title")), "x");
    await userEvent.click(screen.getByRole("button", { name: t("editor.back") }));
    expect(screen.getByText(t("editor.leaveConfirm"))).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t("editor.leaveOk") }));
    expect(screen.getByText("PANEL")).toBeInTheDocument();
  });

  it("leaves right away when nothing changed", async () => {
    renderEditor("yeni");
    await userEvent.click(screen.getByRole("button", { name: t("editor.back") }));
    expect(screen.getByText("PANEL")).toBeInTheDocument();
  });

  describe("extras", () => {
    const PASTE = `Quiz başlığı

1. Başkent neresi?
A) İzmir
B) Ankara
Doğru Cevap: B
2. En büyük gezegen?
A) Mars
B) Jüpiter
C) Venüs
3. Hangisi renk?
A) Masa
B) Mavi
Cevap: b`;

    async function pasteQuestions(text: string) {
      await userEvent.click(screen.getByRole("button", { name: t("editor.pasteTitle") }));
      fireEvent.change(screen.getByLabelText(t("editor.pasteLabel")), { target: { value: text } });
    }

    const group = (n: number) => screen.getByRole("group", { name: t("editor.question", { n }) });
    const texts = () => screen.getAllByLabelText(t("editor.text")).map((el) => (el as HTMLTextAreaElement).value);

    it("adds questions from pasted text, replacing the empty first question", async () => {
      renderEditor("yeni");
      await pasteQuestions(PASTE);
      expect(screen.getByText(t("editor.pasteFound", { count: 3 }))).toBeInTheDocument();
      expect(screen.getByText("2. soru: doğru cevap bulunamadı")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: t("editor.pasteAdd") }));
      expect(texts()).toEqual(["Başkent neresi?", "En büyük gezegen?", "Hangisi renk?"]);
      expect(within(group(1)).getByLabelText(t("editor.correct", { n: 2 }))).toBeChecked();
      expect(within(group(2)).getByLabelText(t("editor.option", { n: 3 }))).toHaveValue("Venüs");
      expect(screen.queryByLabelText(t("editor.pasteLabel"))).not.toBeInTheDocument();
      expect(screen.getByText(t("editor.pasteAdded", { count: 3 }))).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText(t("editor.title")), "Karışık");
      await userEvent.click(screen.getByRole("button", { name: t("editor.save") }));
      expect(saveQuiz).toHaveBeenCalledWith("h1", {
        title: "Karışık",
        questions: [
          { text: "Başkent neresi?", options: ["İzmir", "Ankara"], correct: 1 },
          { text: "En büyük gezegen?", options: ["Mars", "Jüpiter", "Venüs"], correct: 0 },
          { text: "Hangisi renk?", options: ["Masa", "Mavi"], correct: 1 },
        ],
      });
    });

    it("pasted questions are appended after existing ones", async () => {
      vi.mocked(loadQuiz).mockResolvedValue({ title: "Tarih", questions: [{ text: "İlk soru", options: ["a", "b"], correct: 0 }] });
      renderEditor("quiz1");
      await screen.findByDisplayValue("Tarih");
      await pasteQuestions("1. Yeni soru?\nA) x\nB) y\nCevap: A");
      expect(screen.getByText(t("editor.pasteFound", { count: 1 }))).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: t("editor.pasteAdd") }));
      expect(texts()).toEqual(["İlk soru", "Yeni soru?"]);
    });

    it("the add button stays disabled until questions are found", async () => {
      renderEditor("yeni");
      await pasteQuestions("Sadece bir başlık");
      expect(screen.getByText(t("editor.pasteNone"))).toBeInTheDocument();
      expect(screen.getByRole("button", { name: t("editor.pasteAdd") })).toBeDisabled();
    });

    it("duplicates a question right after itself", async () => {
      renderEditor("yeni");
      await userEvent.type(within(q1()).getByLabelText(t("editor.text")), "Kopyalanacak");
      await userEvent.click(screen.getByRole("button", { name: t("editor.duplicate", { n: 1 }) }));
      expect(texts()).toEqual(["Kopyalanacak", "Kopyalanacak"]);
    });

    it("collapses a card to a one-line summary and expands it again", async () => {
      renderEditor("yeni");
      await pasteQuestions(PASTE);
      await userEvent.click(screen.getByRole("button", { name: t("editor.pasteAdd") }));
      const toggle = screen.getByRole("button", { name: t("editor.collapse", { n: 1 }) });
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      await userEvent.click(toggle);
      expect(within(group(1)).queryByLabelText(t("editor.text"))).not.toBeInTheDocument();
      expect(
        within(group(1)).getByText(t("editor.summary", { n: 1, text: "Başkent neresi?", count: 2, letter: "B" })),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: t("editor.expand", { n: 1 }) }));
      expect(within(group(1)).getByLabelText(t("editor.text"))).toHaveValue("Başkent neresi?");
    });

    it("collapse all / expand all", async () => {
      renderEditor("yeni");
      await pasteQuestions(PASTE);
      await userEvent.click(screen.getByRole("button", { name: t("editor.pasteAdd") }));
      await userEvent.click(screen.getByRole("button", { name: t("editor.collapseAll") }));
      expect(screen.queryAllByLabelText(t("editor.text"))).toHaveLength(0);
      await userEvent.click(screen.getByRole("button", { name: t("editor.expandAll") }));
      expect(screen.getAllByLabelText(t("editor.text"))).toHaveLength(3);
    });

    it("cards with validation errors are forced open", async () => {
      renderEditor("yeni");
      await userEvent.click(screen.getByRole("button", { name: t("editor.collapse", { n: 1 }) }));
      expect(within(q1()).queryByLabelText(t("editor.text"))).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: t("editor.save") }));
      expect(within(q1()).getByLabelText(t("editor.text"))).toBeInTheDocument();
      expect(within(q1()).getByText("Soru metni: boş olamaz")).toBeInTheDocument();
    });

    it("reorders questions by dragging the handle onto another card", async () => {
      renderEditor("yeni");
      await pasteQuestions(PASTE);
      await userEvent.click(screen.getByRole("button", { name: t("editor.pasteAdd") }));
      const handle = group(1).querySelector("[data-drag-handle]")!;
      expect(handle).toHaveAttribute("draggable", "true");
      const dataTransfer = { setData: vi.fn(), getData: vi.fn(), setDragImage: vi.fn(), effectAllowed: "", dropEffect: "" };
      fireEvent.dragStart(handle, { dataTransfer });
      fireEvent.dragOver(group(3), { dataTransfer });
      fireEvent.drop(group(3), { dataTransfer });
      fireEvent.dragEnd(handle, { dataTransfer });
      expect(texts()).toEqual(["En büyük gezegen?", "Hangisi renk?", "Başkent neresi?"]);
    });

    it("shows a thumbnail for a valid https image and hides it on load error", async () => {
      renderEditor("yeni");
      const input = within(q1()).getByLabelText(t("editor.image"));
      fireEvent.change(input, { target: { value: "http://a.b/c.png" } });
      expect(within(q1()).queryByRole("img", { name: t("editor.imagePreview", { n: 1 }) })).not.toBeInTheDocument();
      fireEvent.change(input, { target: { value: "https://a.b/c.png" } });
      const img = within(q1()).getByRole("img", { name: t("editor.imagePreview", { n: 1 }) });
      expect(img).toHaveAttribute("src", "https://a.b/c.png");
      fireEvent.error(img);
      expect(within(q1()).queryByRole("img", { name: t("editor.imagePreview", { n: 1 }) })).not.toBeInTheDocument();
    });

    it("downloads the current draft as JSON only when it is valid", async () => {
      let blob: Blob | undefined;
      URL.createObjectURL = vi.fn((b: Blob) => ((blob = b), "blob:x"));
      URL.revokeObjectURL = vi.fn();
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      try {
        renderEditor("yeni");
        await userEvent.click(screen.getByRole("button", { name: t("editor.download") }));
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent("Başlık: boş olamaz");

        await pasteQuestions("1. Başkent?\nA) İzmir\nB) Ankara\nCevap: B");
        await userEvent.click(screen.getByRole("button", { name: t("editor.pasteAdd") }));
        await userEvent.type(screen.getByLabelText(t("editor.title")), "Coğrafya");
        await userEvent.click(screen.getByRole("button", { name: t("editor.download") }));
        expect(click).toHaveBeenCalledTimes(1);
        expect(JSON.parse(await blob!.text())).toEqual({
          title: "Coğrafya",
          questions: [{ text: "Başkent?", options: ["İzmir", "Ankara"], correct: 1 }],
        });
        expect(saveQuiz).not.toHaveBeenCalled();
      } finally {
        click.mockRestore();
      }
    });
  });
});
