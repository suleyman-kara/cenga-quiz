import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Leaderboard, biggestClimber, isHotStreak } from "./Leaderboard";
import { translate } from "../i18n";
import { club } from "../club.config";

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);

describe("biggestClimber", () => {
  it("picks the row that climbed the most places", () => {
    expect(
      biggestClimber([
        { rank: 1, prevRank: 2 },
        { rank: 2, prevRank: 1 },
        { rank: 3, prevRank: 7 },
        { rank: 4, prevRank: 6 },
      ]),
    ).toBe(2);
  });

  it("breaks ties in favour of the better current rank", () => {
    expect(
      biggestClimber([
        { rank: 1, prevRank: 1 },
        { rank: 2, prevRank: 4 },
        { rank: 3, prevRank: 5 },
      ]),
    ).toBe(1);
  });

  it("returns -1 when nobody moved up (first question, or only drops)", () => {
    expect(biggestClimber([{ rank: 1 }, { rank: 2 }])).toBe(-1);
    expect(
      biggestClimber([
        { rank: 1, prevRank: 1 },
        { rank: 2, prevRank: 2 },
        { rank: 3, prevRank: 2 },
      ]),
    ).toBe(-1);
    expect(biggestClimber([])).toBe(-1);
  });
});

describe("isHotStreak", () => {
  it("is true from 3 correct answers in a row", () => {
    expect(isHotStreak(undefined)).toBe(false);
    expect(isHotStreak(2)).toBe(false);
    expect(isHotStreak(3)).toBe(true);
    expect(isHotStreak(7)).toBe(true);
  });
});

describe("<Leaderboard movement>", () => {
  const entries = [
    { name: "Ali", score: 900, rank: 1, prevRank: 2, streak: 4 },
    { name: "Veli", score: 800, rank: 2, prevRank: 1, streak: 2 },
    { name: "Can", score: 700, rank: 3, prevRank: 6 },
    { name: "Ece", score: 600, rank: 4, prevRank: 4 },
  ];

  it("crowns the leader, calls out the biggest climber and marks hot streaks", () => {
    render(<Leaderboard entries={entries} movement />);
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(within(rows[0]).getByRole("img", { name: t("leaderboard.leader") })).toBeInTheDocument();
    expect(within(rows[1]).queryByRole("img", { name: t("leaderboard.leader") })).not.toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("Ali");

    expect(rows[2]).toHaveAttribute("data-climber");
    expect(within(rows[2]).getByText(t("leaderboard.topClimber"))).toBeInTheDocument();
    expect(screen.getAllByText(t("leaderboard.topClimber"))).toHaveLength(1);

    expect(within(rows[0]).getByLabelText(t("leaderboard.streak", { streak: 4 }))).toHaveAttribute("data-hot");
    expect(within(rows[1]).getByLabelText(t("leaderboard.streak", { streak: 2 }))).not.toHaveAttribute("data-hot");
  });

  it("final standings (no movement) have no crown, climber callout or hot flame", () => {
    render(<Leaderboard entries={entries} detailed />);
    expect(screen.queryByRole("img", { name: t("leaderboard.leader") })).not.toBeInTheDocument();
    expect(screen.queryByText(t("leaderboard.topClimber"))).not.toBeInTheDocument();
  });
});
