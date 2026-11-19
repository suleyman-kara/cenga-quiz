import type { Quiz } from "../../../shared/types";
import type { GameConfig, Room } from "./room";

export const config: GameConfig = {
  defaultQuestionSeconds: 20,
  maxPoints: 1000,
  streakBonus: { enabled: true, perStreak: 100, max: 500 },
  leaderboardSize: 2,
  maxPlayers: 3,
};

export const quiz: Quiz = {
  title: "Deneme",
  questions: [
    { text: "S1", options: ["a", "b", "c", "d"], correct: 2, seconds: 10 },
    { text: "S2", options: ["evet", "hayır"], correct: 0, imageUrl: "https://example.com/x.png" },
  ],
};

export function lobbyRoom(players: Record<string, string> = { p1: "Ali", p2: "Ayşe" }): Room {
  return {
    meta: { hostUid: "host", quizId: "q1", title: "Deneme", createdAt: 1000, questionCount: 2 },
    state: { phase: "lobby", qIndex: -1, startedAt: 0, endsAt: 0, updatedAt: 1000 },
    players: Object.fromEntries(Object.entries(players).map(([uid, name]) => [uid, { name, joinedAt: 1500 }])),
  };
}
