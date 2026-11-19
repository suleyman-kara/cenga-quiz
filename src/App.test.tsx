import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./App";

vi.mock("./pages/JoinPage", async () => {
  const { useLocation } = await import("react-router-dom");
  return { JoinPage: () => <div>JOIN {useLocation().search}</div> };
});
vi.mock("./pages/PlayerGame", () => ({ PlayerGame: () => <div>PLAYER</div> }));
vi.mock("./pages/HostPage", () => ({ HostPage: () => <div>HOST</div> }));
vi.mock("./pages/HostGame", () => ({ HostGame: () => <div>STAGE</div> }));

const at = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <AppRoutes />
    </MemoryRouter>,
  );

describe("routes", () => {
  it("valid PINs reach the game screens", async () => {
    at("/play/123456");
    expect(await screen.findByText("PLAYER")).toBeInTheDocument();
  });

  it("an invalid player PIN goes back to the join page with a message flag", async () => {
    at("/play/12ab");
    expect(await screen.findByText("JOIN ?invalid=1")).toBeInTheDocument();
  });

  it("an invalid host PIN goes back to the join page too", async () => {
    at("/host/game/012345");
    expect(await screen.findByText("JOIN ?invalid=1")).toBeInTheDocument();
  });

  it("valid host PIN reaches the stage", async () => {
    at("/host/game/654321");
    expect(await screen.findByText("STAGE")).toBeInTheDocument();
  });
});
