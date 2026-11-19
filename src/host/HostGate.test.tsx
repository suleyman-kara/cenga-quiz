import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { translate } from "../i18n";
import { club } from "../club.config";
import { HostGate } from "./HostGate";
import { useHostAuth } from "../game/host";

vi.mock("../game/host", () => ({ useHostAuth: vi.fn() }));

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);
const withCode = (code: string) => Object.assign(new Error(code), { code });
const signIn = vi.fn();

describe("HostGate sign-in", () => {
  beforeEach(() => {
    signIn.mockReset();
    vi.mocked(useHostAuth).mockReturnValue({ status: "signedOut", user: null, signIn, signOut: vi.fn() });
  });

  const press = () => userEvent.click(screen.getByRole("button", { name: t("host.signIn") }));

  it("shows why a blocked popup failed", async () => {
    signIn.mockRejectedValue(withCode("auth/popup-blocked"));
    render(<HostGate>{() => null}</HostGate>);
    await press();
    expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.popupBlocked"));
  });

  it("explains an unauthorized domain", async () => {
    signIn.mockRejectedValue(withCode("auth/unauthorized-domain"));
    render(<HostGate>{() => null}</HostGate>);
    await press();
    expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.unauthorizedDomain"));
  });

  it("stays silent when the user closes the popup, and clears an old error on retry", async () => {
    signIn.mockRejectedValueOnce(withCode("auth/popup-blocked")).mockRejectedValueOnce(withCode("auth/popup-closed-by-user"));
    render(<HostGate>{() => null}</HostGate>);
    await press();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await press();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
