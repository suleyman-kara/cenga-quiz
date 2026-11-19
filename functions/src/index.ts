import { setGlobalOptions } from "firebase-functions/options";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/https";
import { onSchedule } from "firebase-functions/scheduler";
import { logger } from "firebase-functions";
import { FUNCTIONS_REGION } from "../../shared/types";
import { GameError } from "./core/errors";
import * as game from "./game/callables";
import { runCleanup } from "./game/cleanup";

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });

type Handler<R> = (auth: CallableRequest["auth"], data: unknown) => Promise<R>;

function callable<R>(name: string, handler: Handler<R>) {
  return onCall(async (req) => {
    try {
      return await handler(req.auth, req.data);
    } catch (e) {
      if (e instanceof GameError) throw new HttpsError(e.code, e.message);
      if (e instanceof HttpsError) throw e;
      logger.error(`${name} failed`, e);
      throw new HttpsError("internal", "Beklenmeyen bir hata oluştu.");
    }
  });
}

export const createGame = callable("createGame", game.createGame);
export const startGame = callable("startGame", game.startGame);
export const reveal = callable("reveal", game.reveal);
export const showLeaderboard = callable("showLeaderboard", game.showLeaderboard);
export const nextQuestion = callable("nextQuestion", game.nextQuestion);
export const endGame = callable("endGame", game.endGame);
export const kickPlayer = callable("kickPlayer", game.kickPlayer);
export const setLobbyLocked = callable("setLobbyLocked", game.setLobbyLocked);

export const cleanupGames = onSchedule(
  { schedule: "every 30 minutes", timeZone: "Europe/Istanbul", region: FUNCTIONS_REGION },
  async () => {
    const summary = await runCleanup(Date.now());
    logger.info("cleanupGames", summary);
  },
);
