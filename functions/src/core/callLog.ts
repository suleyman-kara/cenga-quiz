/** One structured log line per host call: duration and outcome, for Cloud Logging metrics/alerts. */
import { GameError } from "./errors";
import { busyError } from "./lock";

export type LogSeverity = "info" | "warn" | "error";

export interface CallLog {
  severity: LogSeverity;
  fields: { action: string | null; pin: string | null; ms: number; outcome: string };
}

const BUSY_MESSAGE = busyError().message;
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Only the action and PIN of the request are logged: never names, e-mails or uids. */
export function callLog(data: unknown, ms: number, error?: unknown): CallLog {
  const req = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const base = { action: str(req.action), pin: str(req.pin), ms: Math.round(ms) };
  if (error === undefined) return { severity: "info", fields: { ...base, outcome: "ok" } };
  if (error instanceof GameError) {
    if (error.message === BUSY_MESSAGE) return { severity: "warn", fields: { ...base, outcome: "busy" } };
    return { severity: "info", fields: { ...base, outcome: `refused:${error.code}` } };
  }
  return { severity: "error", fields: { ...base, outcome: "error" } };
}
