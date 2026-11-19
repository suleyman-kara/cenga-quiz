import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
});
