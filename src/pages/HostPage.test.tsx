import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { translate } from "../i18n";
import { club } from "../club.config";
import { HostPage } from "./HostPage";
import { useHostAuth, useMyQuizzes, saveQuiz, deleteQuiz, loadQuiz } from "../game/host";
import { validateQuiz } from "../../shared/quizValidate";
import { hostCall } from "../firebase";

vi.mock("../firebase", () => ({ hostCall: vi.fn() }));
vi.mock("../game/host", () => ({
  useHostAuth: vi.fn(),
  useMyQuizzes: vi.fn(),
  saveQuiz: vi.fn(),
  deleteQuiz: vi.fn(),
  loadQuiz: vi.fn(),
}));
vi.mock("../../shared/quizValidate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../shared/quizValidate")>()),
  validateQuiz: vi.fn(),
}));

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);
const signIn = vi.fn();
const authApi = () => ({ signIn, signUp: vi.fn(), resetPassword: vi.fn(), resendVerification: vi.fn(), refreshVerification: vi.fn(), signOut: vi.fn() });
const user = { uid: "h1", email: "host@example.org", displayName: "Host" };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/host"]}>
      <Routes>
        <Route path="/host" element={<HostPage />} />
        <Route path="/host/game/:pin" element={<div>BIG SCREEN</div>} />
        <Route path="/host/quiz/:id" element={<EditorProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function EditorProbe() {
  const { id } = useParams();
  return <div>EDITOR {id}</div>;
}

const validQuiz = { title: "Genel kültür", questions: [{ text: "S1", options: ["a", "b"], correct: 0 }] };

describe("HostPage", () => {
  beforeEach(() => {
    signIn.mockReset().mockResolvedValue(undefined);
    vi.mocked(useHostAuth).mockReturnValue({ status: "authorized", user, ...authApi() });
    vi.mocked(useMyQuizzes).mockReturnValue({
      quizzes: [{ id: "quiz1", title: "Tarih", questionCount: 7, updatedAt: 0 }],
      loading: false,
      error: null,
    });
    vi.mocked(saveQuiz).mockReset().mockResolvedValue("newId");
    vi.mocked(deleteQuiz).mockReset().mockResolvedValue(undefined);
    vi.mocked(validateQuiz).mockReset();
    vi.mocked(hostCall).mockReset();
  });

  it("signed out: offers email + password sign-in", async () => {
    vi.mocked(useHostAuth).mockReturnValue({ status: "signedOut", user: null, ...authApi() });
    renderPage();
    expect(screen.getByAltText(club.logo.alt)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(t("host.email")), "host@example.org");
    await userEvent.type(screen.getByLabelText(t("host.password")), "secret123");
    await userEvent.click(screen.getByRole("button", { name: t("host.submitSignIn") }));
    expect(signIn).toHaveBeenCalledWith("host@example.org", "secret123");
  });

  it("unverified: shows the verify screen, not the dashboard", () => {
    vi.mocked(useHostAuth).mockReturnValue({ status: "unverified", user, ...authApi() });
    renderPage();
    expect(screen.getByRole("heading", { name: t("host.verifyTitle") })).toBeInTheDocument();
    expect(screen.queryByText(t("host.myQuizzes"))).not.toBeInTheDocument();
  });

  it("not on the allow-list: shows not-authorized message", () => {
    vi.mocked(useHostAuth).mockReturnValue({ status: "unauthorized", user, ...authApi() });
    renderPage();
    expect(screen.getByText(t("host.notAuthorized", { email: user.email }))).toBeInTheDocument();
    expect(screen.queryByText(t("host.myQuizzes"))).not.toBeInTheDocument();
    expect(useMyQuizzes).not.toHaveBeenCalledWith("h1");
  });

  it("dashboard lists own quizzes", () => {
    renderPage();
    expect(useMyQuizzes).toHaveBeenCalledWith("h1");
    expect(screen.getByText("Tarih")).toBeInTheDocument();
    expect(screen.getByText(t("host.questionsCount", { count: 7 }))).toBeInTheDocument();
  });

  it("Start game calls createGame and opens the big screen", async () => {
    vi.mocked(hostCall).mockResolvedValue({ pin: "123456" });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: t("host.createGame") }));
    expect(hostCall).toHaveBeenCalledWith("createGame", { quizId: "quiz1" });
    expect(await screen.findByText("BIG SCREEN")).toBeInTheDocument();
  });

  it("import: invalid JSON shows a parse error and saves nothing", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(t("host.importPaste")), { target: { value: "{nope" } });
    await userEvent.click(screen.getByRole("button", { name: t("host.importSave") }));
    expect(screen.getByRole("alert")).toHaveTextContent(t("host.importInvalidJson", { message: "" }).trim().slice(0, 10));
    expect(validateQuiz).not.toHaveBeenCalled();
    expect(saveQuiz).not.toHaveBeenCalled();
  });

  it("import: shows validateQuiz errors as a list and saves nothing", async () => {
    vi.mocked(validateQuiz).mockReturnValue({ ok: false, errors: ["questions[0].correct out of range", "title is required"] });
    renderPage();
    fireEvent.change(screen.getByLabelText(t("host.importPaste")), { target: { value: '{"title":""}' } });
    await userEvent.click(screen.getByRole("button", { name: t("host.importSave") }));
    expect(validateQuiz).toHaveBeenCalledWith({ title: "" });
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toContain("questions[0].correct out of range");
    expect(items).toContain("title is required");
    expect(saveQuiz).not.toHaveBeenCalled();
  });

  it("import: saves a valid quiz with the owner uid", async () => {
    vi.mocked(validateQuiz).mockReturnValue({ ok: true, quiz: validQuiz });
    renderPage();
    fireEvent.change(screen.getByLabelText(t("host.importPaste")), { target: { value: JSON.stringify(validQuiz) } });
    await userEvent.click(screen.getByRole("button", { name: t("host.importSave") }));
    expect(saveQuiz).toHaveBeenCalledWith("h1", validQuiz);
    expect(await screen.findByText(t("host.importSaved", { title: "Genel kültür" }))).toBeInTheDocument();
  });

  it("import: reads a chosen .json file", async () => {
    vi.mocked(validateQuiz).mockReturnValue({ ok: true, quiz: validQuiz });
    renderPage();
    const file = new File([JSON.stringify(validQuiz)], "quiz.json", { type: "application/json" });
    await userEvent.upload(screen.getByLabelText(t("host.importFile")), file);
    expect(await screen.findByDisplayValue(/Genel kültür/)).toBeInTheDocument();
  });

  it("New quiz opens the editor", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("link", { name: t("host.newQuiz") }));
    expect(screen.getByText("EDITOR yeni")).toBeInTheDocument();
  });

  it("Edit opens the editor for that quiz", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("link", { name: t("host.editQuiz") }));
    expect(screen.getByText("EDITOR quiz1")).toBeInTheDocument();
  });

  it("Delete asks first, then deletes", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: t("host.deleteQuiz") }));
    expect(screen.getByText(t("host.deleteConfirm", { title: "Tarih" }))).toBeInTheDocument();
    expect(deleteQuiz).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t("host.deleteOk") }));
    expect(deleteQuiz).toHaveBeenCalledWith("quiz1");
  });

  describe("quiz card extras", () => {
    const stored = {
      title: "Tarih",
      questions: [{ text: "İlk soru", options: ["a", "b"], correct: 1, seconds: 20 }],
    };
    let click: ReturnType<typeof vi.spyOn>;
    let downloads: { href: string; download: string }[];
    let blob: Blob | undefined;

    beforeEach(() => {
      vi.mocked(loadQuiz).mockReset().mockResolvedValue(stored);
      downloads = [];
      blob = undefined;
      URL.createObjectURL = vi.fn((b: Blob) => ((blob = b), "blob:quiz"));
      URL.revokeObjectURL = vi.fn();
      click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ href: this.href, download: this.download });
      });
    });
    afterEach(() => click.mockRestore());

    it("JSON download loads the quiz and saves it as a .json file", async () => {
      renderPage();
      await userEvent.click(screen.getByRole("button", { name: t("host.downloadQuiz") }));
      expect(loadQuiz).toHaveBeenCalledWith("quiz1");
      await waitFor(() => expect(downloads).toEqual([{ href: "blob:quiz", download: "tarih.json" }]));
      expect(JSON.parse(await blob!.text())).toEqual(stored);
    });

    it("Copy saves a duplicate titled '<title> (kopya)'", async () => {
      renderPage();
      await userEvent.click(screen.getByRole("button", { name: t("host.copyQuiz") }));
      const title = t("host.copyTitle", { title: "Tarih" });
      await waitFor(() => expect(saveQuiz).toHaveBeenCalledWith("h1", { ...stored, title }));
      expect(await screen.findByText(t("host.copied", { title }))).toBeInTheDocument();
    });

    it("a missing quiz shows an error instead of downloading or copying", async () => {
      vi.mocked(loadQuiz).mockResolvedValue(null);
      renderPage();
      await userEvent.click(screen.getByRole("button", { name: t("host.copyQuiz") }));
      expect(await screen.findByRole("alert")).toHaveTextContent(t("editor.notFound"));
      await userEvent.click(screen.getByRole("button", { name: t("host.downloadQuiz") }));
      expect(saveQuiz).not.toHaveBeenCalled();
      expect(downloads).toEqual([]);
    });
  });
});
