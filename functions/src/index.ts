import { setGlobalOptions } from "firebase-functions/options";
import { onCall, HttpsError } from "firebase-functions/https";
import { onSchedule } from "firebase-functions/scheduler";
import { defineBoolean, defineInt } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { FUNCTIONS_REGION } from "../../shared/types";
import { GameError } from "./core/errors";
import { dispatchHost } from "./game/callables";
import { runCleanup } from "./game/cleanup";

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });

/** Keep N instances warm during an event (e.g. 1), back to 0 afterwards. */
const MIN_INSTANCES = defineInt("MIN_INSTANCES", {
  default: 0,
  description: "Warm instances for the host callable (set 1 during an event).",
});
/** Turn on once the web client initializes App Check (off by default so local/emulator works). */
const ENFORCE_APP_CHECK = defineBoolean("ENFORCE_APP_CHECK", {
  default: false,
  description: "Reject host calls without a valid App Check token.",
});

/** Single dispatcher for every host action, so one warm instance serves the whole event. */
export const host = onCall({ minInstances: MIN_INSTANCES, enforceAppCheck: ENFORCE_APP_CHECK }, async (req) => {
  try {
    return (await dispatchHost(req.auth, req.data)).result;
  } catch (e) {
    if (e instanceof GameError) throw new HttpsError(e.code, e.message);
    if (e instanceof HttpsError) throw e;
    const action = (req.data as { action?: unknown } | null)?.action;
    logger.error(`host(${String(action)}) failed`, e);
    throw new HttpsError("internal", "Beklenmeyen bir hata oluştu.");
  }
});

export const cleanupGames = onSchedule(
  { schedule: "every 30 minutes", timeZone: "Europe/Istanbul", region: FUNCTIONS_REGION },
  async () => {
    const summary = await runCleanup(Date.now());
    logger.info("cleanupGames", summary);
  },
);
