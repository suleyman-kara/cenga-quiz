import { setGlobalOptions } from "firebase-functions/options";
import { onCall, HttpsError } from "firebase-functions/https";
import { onSchedule } from "firebase-functions/scheduler";
import { onValueCreated, onValueDeleted } from "firebase-functions/database";
import { defineBoolean, defineInt } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { FUNCTIONS_REGION } from "../../shared/types";
import { GameError, type GameErrorCode } from "./core/errors";
import { callLog } from "./core/callLog";
import { dispatchHost } from "./game/callables";
import { createCheckHostEmail } from "./game/checkHost";
import { hostCheck } from "./game/hostAuth";
import { runCleanup } from "./game/cleanup";
import { onPlayerJoined, onPlayerLeft } from "./game/joins";
import { databaseTriggerRegion } from "./game/firebase";

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });

/** Keep N instances warm during an event (e.g. 1), back to 0 afterwards. */
const MIN_INSTANCES = defineInt("MIN_INSTANCES", {
  default: 0,
  description: "Warm instances for the host callables and the join/leave triggers (set 1 during an event).",
});
/** Turn on once the web client initializes App Check (off by default so local/emulator works). */
const ENFORCE_APP_CHECK = defineBoolean("ENFORCE_APP_CHECK", {
  default: false,
  description: "Reject host calls without a valid App Check token.",
});

/** Single dispatcher for every host action, so one warm instance serves the whole event. */
export const host = onCall({ minInstances: MIN_INSTANCES, enforceAppCheck: ENFORCE_APP_CHECK }, async (req) => {
  const t0 = Date.now();
  try {
    const { result } = await dispatchHost(req.auth, req.data);
    const { fields } = callLog(req.data, Date.now() - t0);
    logger.info("host", fields);
    return result;
  } catch (e) {
    // an HttpsError is a deliberate refusal too (same as GameError), logged with its own code
    const asGame = e instanceof HttpsError ? new GameError(e.code as GameErrorCode, e.message) : e;
    const { severity, fields } = callLog(req.data, Date.now() - t0, asGame);
    if (severity === "error") logger.error("host", fields, e);
    else if (severity === "warn") logger.warn("host", fields);
    else logger.info("host", fields);
    if (e instanceof GameError) throw new HttpsError(e.code, e.message);
    if (e instanceof HttpsError) throw e;
    throw new HttpsError("internal", "Beklenmeyen bir hata oluştu.");
  }
});

const checkHostEmailImpl = createCheckHostEmail((email) => hostCheck.isAllowed(email));

/**
 * Sign-up pre-check: `{ email }` → `{ allowed }` for that one address (callers need not be signed in).
 * A UX gate only; access is enforced by the rules and `host` (verified e-mail + allowedHosts).
 */
export const checkHostEmail = onCall(
  { minInstances: MIN_INSTANCES, enforceAppCheck: ENFORCE_APP_CHECK },
  async (req) => {
    try {
      return await checkHostEmailImpl(req.data);
    } catch (e) {
      if (e instanceof GameError) throw new HttpsError(e.code, e.message);
      logger.error("checkHostEmail failed", e);
      throw new HttpsError("internal", "Beklenmeyen bir hata oluştu.");
    }
  },
);

export const cleanupGames = onSchedule(
  { schedule: "every 30 minutes", timeZone: "Europe/Istanbul", region: FUNCTIONS_REGION },
  async () => {
    const summary = await runCleanup(Date.now());
    logger.info("cleanupGames", summary);
  },
);

/**
 * Join/leave triggers on the default RTDB instance ("<project>-default-rtdb"; in the emulator the
 * demo project's "<id>-default-rtdb" namespace the clients use). A 2nd-gen database trigger must
 * run in the database's own location: FUNCTIONS_REGION must be the instance's region.
 */
const PLAYER_REF = {
  ref: "/games/{pin}/players/{uid}",
  instance: "*-default-rtdb",
  region: databaseTriggerRegion(process.env, FUNCTIONS_REGION),
  // the first wave of joins must not wait for cold starts either
  minInstances: MIN_INSTANCES,
};

/** Sanitizes the name right away and keeps meta.playerCount / full / lastActivityAt current. */
export const playerJoined = onValueCreated(PLAYER_REF, async (event) => {
  const t0 = Date.now();
  const out = await onPlayerJoined(event.params.pin, event.params.uid, event.data.val());
  // delay = time from the join write to the trigger finishing (lobby lag under load)
  logger.info("playerJoined", { pin: event.params.pin, ms: Date.now() - t0, delayMs: Date.now() - Date.parse(event.time), ...out });
});

export const playerLeft = onValueDeleted(PLAYER_REF, async (event) => {
  const t0 = Date.now();
  const playerCount = await onPlayerLeft(event.params.pin, event.params.uid, event.data.val());
  logger.info("playerLeft", { pin: event.params.pin, ms: Date.now() - t0, playerCount });
});
