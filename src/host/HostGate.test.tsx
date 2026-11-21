import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { translate } from "../i18n";
import { club } from "../club.config";
import { HostGate } from "./HostGate";
import { useHostAuth, type HostAuth, type HostStatus } from "../game/host";

vi.mock("../game/host", () => ({ useHostAuth: vi.fn() }));

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);
const withCode = (code: string) => Object.assign(new Error(code), { code });
const user = { uid: "h1", email: "host@example.org", displayName: null };

const api = {
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  resendVerification: vi.fn(),
  refreshVerification: vi.fn(),
  signOut: vi.fn(),
};

function mockAuth(status: HostStatus, u: HostAuth["user"] = status === "signedOut" ? null : user) {
  vi.mocked(useHostAuth).mockReturnValue({ status, user: u, ...api });
}

const resetApi = () => Object.values(api).forEach((f) => f.mockReset().mockResolvedValue(undefined));
const emailBox = () => screen.getByLabelText(t("host.email"));
const passwordBox = () => screen.getByLabelText(t("host.password"));
const fill = async (email: string, password: string) => {
  if (email) await userEvent.type(emailBox(), email);
  if (password) await userEvent.type(passwordBox(), password);
};
const openSignUp = () => userEvent.click(screen.getByRole("tab", { name: t("host.signUp") }));

describe("HostGate: sign-in screen", () => {
  beforeEach(() => {
    resetApi();
    mockAuth("signedOut");
  });

  it("offers Sign in / Sign up tabs, proper inputs and no Google button", () => {
    render(<HostGate>{() => null}</HostGate>);
    expect(screen.getByRole("tab", { name: t("host.signIn") })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: t("host.signUp") })).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByText(/google/i)).not.toBeInTheDocument();
    expect(emailBox()).toHaveAttribute("autocomplete", "email");
    expect(emailBox()).toHaveAttribute("type", "email");
    expect(passwordBox()).toHaveAttribute("autocomplete", "current-password");
    expect(passwordBox()).toHaveAttribute("type", "password");
  });

  it("signs in with email + password", async () => {
    render(<HostGate>{() => null}</HostGate>);
    await fill("host@example.org", "secret123");
    await userEvent.click(screen.getByRole("button", { name: t("host.submitSignIn") }));
    expect(api.signIn).toHaveBeenCalledWith("host@example.org", "secret123");
  });

  it.each(["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"])(
    "maps %s to a neutral wrong-credentials message",
    async (c) => {
      api.signIn.mockRejectedValue(withCode(c));
      render(<HostGate>{() => null}</HostGate>);
      await fill("host@example.org", "secret123");
      await userEvent.click(screen.getByRole("button", { name: t("host.submitSignIn") }));
      expect(await screen.findByRole("alert")).toHaveTextContent("E-posta veya şifre hatalı.");
    },
  );

  it("explains too many attempts and network problems", async () => {
    api.signIn
      .mockRejectedValueOnce(withCode("auth/too-many-requests"))
      .mockRejectedValueOnce(withCode("auth/network-request-failed"));
    render(<HostGate>{() => null}</HostGate>);
    await fill("host@example.org", "secret123");
    const submit = screen.getByRole("button", { name: t("host.submitSignIn") });
    await userEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(t("host.tooManyAttempts"));
    await userEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.network"));
  });

  it("sign up uses new-password autocomplete and requires at least 8 characters", async () => {
    render(<HostGate>{() => null}</HostGate>);
    await openSignUp();
    expect(passwordBox()).toHaveAttribute("autocomplete", "new-password");
    await fill("host@example.org", "short");
    await userEvent.click(screen.getByRole("button", { name: t("host.submitSignUp") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t("host.weakPassword"));
    expect(api.signUp).not.toHaveBeenCalled();
  });

  it("sign up calls signUp with email + password", async () => {
    render(<HostGate>{() => null}</HostGate>);
    await openSignUp();
    await fill("host@example.org", "longenough");
    await userEvent.click(screen.getByRole("button", { name: t("host.submitSignUp") }));
    expect(api.signUp).toHaveBeenCalledWith("host@example.org", "longenough");
  });

  it("sign up for an email not on the list shows the list message", async () => {
    api.signUp.mockRejectedValue(withCode("host/email-not-allowed"));
    render(<HostGate>{() => null}</HostGate>);
    await openSignUp();
    await fill("x@example.org", "longenough");
    await userEvent.click(screen.getByRole("button", { name: t("host.submitSignUp") }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu e-posta sunucu listesinde değil.");
  });

  it("explains an existing account and points to password reset", async () => {
    api.signUp.mockRejectedValue(withCode("auth/email-already-in-use"));
    render(<HostGate>{() => null}</HostGate>);
    await openSignUp();
    await fill("host@example.org", "longenough");
    await userEvent.click(screen.getByRole("button", { name: t("host.submitSignUp") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t("host.emailInUse"));
  });

  it("server-side weak-password is explained too", async () => {
    api.signUp.mockRejectedValue(withCode("auth/weak-password"));
    render(<HostGate>{() => null}</HostGate>);
    await openSignUp();
    await fill("host@example.org", "longenough");
    await userEvent.click(screen.getByRole("button", { name: t("host.submitSignUp") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t("host.weakPassword"));
  });

  it("rejects a malformed email before calling Firebase", async () => {
    render(<HostGate>{() => null}</HostGate>);
    await fill("not-an-email", "secret123");
    await userEvent.click(screen.getByRole("button", { name: t("host.submitSignIn") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t("host.invalidEmail"));
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it("forgot password always shows the neutral message (no account enumeration)", async () => {
    api.resetPassword.mockRejectedValueOnce(withCode("auth/user-not-found"));
    render(<HostGate>{() => null}</HostGate>);
    await fill("nobody@example.org", "");
    await userEvent.click(screen.getByRole("button", { name: t("host.forgotPassword") }));
    expect(api.resetPassword).toHaveBeenCalledWith("nobody@example.org");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Bu adres kayıtlıysa şifre sıfırlama bağlantısı gönderildi.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("forgot password works from the sign-up tab too and needs an email first", async () => {
    render(<HostGate>{() => null}</HostGate>);
    await openSignUp();
    await userEvent.click(screen.getByRole("button", { name: t("host.forgotPassword") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t("host.invalidEmail"));
    expect(api.resetPassword).not.toHaveBeenCalled();
  });
});

describe("HostGate: verification screen", () => {
  beforeEach(() => {
    resetApi();
    mockAuth("unverified");
  });

  it("shows the verify screen instead of the panel", () => {
    render(<HostGate>{() => <p>PANEL</p>}</HostGate>);
    expect(screen.getByRole("heading", { name: t("host.verifyTitle") })).toBeInTheDocument();
    expect(screen.getByText(t("host.verifyBody", { email: user.email }))).toBeInTheDocument();
    expect(screen.queryByText("PANEL")).not.toBeInTheDocument();
  });

  it("resends the verification email", async () => {
    render(<HostGate>{() => null}</HostGate>);
    await userEvent.click(screen.getByRole("button", { name: t("host.resendVerification") }));
    expect(api.resendVerification).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent(t("host.verificationSent"));
  });

  it("'I verified' refreshes and says so when still unverified", async () => {
    api.refreshVerification.mockResolvedValue(false);
    render(<HostGate>{() => null}</HostGate>);
    await userEvent.click(screen.getByRole("button", { name: t("host.verifiedContinue") }));
    expect(api.refreshVerification).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent(t("host.stillUnverified"));
  });

  it("can sign out", async () => {
    render(<HostGate>{() => null}</HostGate>);
    await userEvent.click(screen.getByRole("button", { name: t("host.signOut") }));
    expect(api.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("HostGate: access", () => {
  beforeEach(resetApi);

  it("unauthorized (verified, not on the list) keeps the not-authorized screen with sign-out", async () => {
    mockAuth("unauthorized");
    render(<HostGate>{() => <p>PANEL</p>}</HostGate>);
    expect(screen.getByText(t("host.notAuthorized", { email: user.email }))).toBeInTheDocument();
    expect(screen.queryByText("PANEL")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("host.signOut") }));
    expect(api.signOut).toHaveBeenCalledTimes(1);
  });

  it("authorized renders the panel", () => {
    mockAuth("authorized");
    render(<HostGate>{(u) => <p>PANEL {u.email}</p>}</HostGate>);
    expect(screen.getByText(`PANEL ${user.email}`)).toBeInTheDocument();
  });
});
