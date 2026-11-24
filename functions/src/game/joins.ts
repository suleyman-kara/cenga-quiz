/**
 * IO side of the join/leave database triggers on games/{pin}/players/{uid}.
 *
 * Built for a burst of hundreds of joins at once: no transaction on the shared meta node and no
 * read of the whole players list. The count uses a server-side increment; each name is reserved
 * with a small transaction on its own key (nameClaims/{pin}/k/{nameKey}), so joins with different
 * names never contend. The start transition re-checks every name and recounts (core/ops.planStart).
 */
import { ServerValue } from "firebase-admin/database";
import type { PlayerEntry } from "../../../shared/types";
import { isNameAllowed } from "../../../shared/profanity";
import { fullAfterCount, nameClaimKey, suffixedName } from "../core/joins";
import { gameConfig, namePrefix } from "./config";
import { database } from "./firebase";

const claimRef = async (pin: string, name: string) =>
  (await database()).ref(`nameClaims/${pin}/k/${nameClaimKey(name)}`);

/** Who holds a name: the earlier joiner wins (joinedAt, then uid — the order start uses). */
interface Claim {
  uid: string;
  joinedAt: number;
}
const before = (a: Claim, b: Claim) => a.joinedAt < b.joinedAt || (a.joinedAt === b.joinedAt && a.uid < b.uid);

/**
 * Reserves `name` for `me`. Triggers run concurrently, so a later joiner may have reserved it
 * first: an earlier joiner takes it over and the later one is renamed (see displace).
 */
async function tryClaim(
  pin: string,
  me: Claim,
  name: string,
  opts: { takeOver?: boolean; staleHolder?: string } = {},
): Promise<{ ok: boolean; displaced?: string; holder?: string }> {
  let displaced: string | undefined;
  let holder: string | undefined;
  const res = await (await claimRef(pin, name)).transaction(
    (cur: Claim | null) => {
      displaced = undefined;
      holder = cur?.uid;
      if (cur === null || cur.uid === me.uid) return me;
      if (opts.staleHolder !== undefined && cur.uid === opts.staleHolder) return me;
      if (opts.takeOver && before(me, cur)) {
        displaced = cur.uid;
        return me;
      }
      return undefined;
    },
    undefined,
    false,
  );
  const ok = res.committed && (res.snapshot.val() as Claim | null)?.uid === me.uid;
  return ok ? { ok, displaced: displaced === opts.staleHolder ? undefined : displaced } : { ok, holder };
}

const playerExists = async (pin: string, uid: string) =>
  (await (await database()).ref(`games/${pin}/players/${uid}`).get()).exists();

/** Next free " (n)" number for a name: one small counter per name, no walk over taken ones. */
async function nextSuffix(pin: string, name: string): Promise<number> {
  const res = await (await database())
    .ref(`nameClaims/${pin}/n/${nameClaimKey(name)}`)
    .transaction((n: number | null) => Math.max(1, n ?? 1) + 1, undefined, false);
  return res.snapshot.val() as number;
}

/**
 * The display name `me` gets: its own if free (or held by a later joiner, or by someone who left),
 * else "name (2)", "name (3)"…; a blocked name becomes "<prefix> N". Each step is one small
 * transaction, so a crowd typing the same name costs O(1) per joiner.
 */
async function claimName(pin: string, me: Claim, name: string, takeOver = true): Promise<string> {
  if (isNameAllowed(name)) {
    const first = await tryClaim(pin, me, name, { takeOver });
    if (first.ok) {
      if (first.displaced) await displace(pin, first.displaced, name);
      return name;
    }
    if (first.holder && !(await playerExists(pin, first.holder))) {
      if ((await tryClaim(pin, me, name, { staleHolder: first.holder })).ok) return name;
    }
    for (let tries = 0; tries < 50; tries++) {
      const candidate = suffixedName(name, await nextSuffix(pin, name));
      if ((await tryClaim(pin, me, candidate)).ok) return candidate;
    }
  }
  const seq = (await database()).ref(`nameClaims/${pin}/seq`);
  for (let tries = 0; tries < 50; tries++) {
    const res = await seq.transaction((n: number | null) => (n ?? 0) + 1, undefined, false);
    const candidate = `${namePrefix} ${res.snapshot.val() as number}`;
    if ((await tryClaim(pin, me, candidate)).ok) return candidate;
  }
  // give up: the start transition makes every name unique anyway
  return name;
}

/** A later joiner lost `name` to an earlier one: give them the next free variant. */
async function displace(pin: string, uid: string, name: string): Promise<void> {
  const db = await database();
  const entry = (await db.ref(`games/${pin}/players/${uid}`).get()).val() as PlayerEntry | null;
  if (!entry || nameClaimKey(entry.name) !== nameClaimKey(name)) return;
  const renamed = await claimName(pin, { uid, joinedAt: entry.joinedAt }, entry.name, false);
  await renameIfUnchanged(pin, uid, entry.name, renamed);
}

async function renameIfUnchanged(pin: string, uid: string, from: string, to: string): Promise<void> {
  if (from === to) return;
  await updateIfExists<PlayerEntry>(`games/${pin}/players/${uid}`, (cur) => (cur.name === from ? { ...cur, name: to } : undefined));
}

/** Frees `name` if `uid` still holds it. */
async function release(pin: string, uid: string, name: string): Promise<void> {
  await (await claimRef(pin, name)).transaction(
    (cur: Claim | null) => (cur?.uid === uid ? null : undefined),
    undefined,
    false,
  );
}

/** Transaction that only ever changes an existing node: a player removed meanwhile stays removed. */
async function updateIfExists<T>(path: string, change: (cur: T) => T | undefined): Promise<void> {
  const db = await database();
  await db.ref(path).transaction((cur: T | null) => (cur === null ? null : change(cur)), undefined, false);
}

/**
 * The room was removed while this trigger ran (cleanup, a crashed create): undo what our writes
 * re-created — a ghost meta with only the counter, and the room's name claims.
 */
async function roomGone(pin: string): Promise<boolean> {
  const db = await database();
  if ((await db.ref(`games/${pin}/meta/createdAt`).get()).exists()) return false;
  await Promise.all([db.ref(`games/${pin}/meta`).remove(), db.ref(`nameClaims/${pin}`).remove()]);
  return true;
}

/** meta.full from the current count (written only when it changes). */
async function syncFull(pin: string): Promise<number | null> {
  const db = await database();
  const meta = db.ref(`games/${pin}/meta`);
  const [count, full] = await Promise.all([meta.child("playerCount").get(), meta.child("full").get()]);
  if (!count.exists()) return null;
  const playerCount = Math.max(0, Number(count.val()) || 0);
  const shouldBeFull = fullAfterCount(playerCount, gameConfig.maxPlayers);
  if (full.val() !== shouldBeFull) await meta.update({ full: shouldBeFull });
  return playerCount;
}

export interface JoinOutcome {
  /** false: the room was gone, nothing written */
  counted: boolean;
  renamed: boolean;
  playerCount: number | null;
}

export async function onPlayerJoined(pin: string, uid: string, entry: unknown): Promise<JoinOutcome> {
  const db = await database();
  const meta = db.ref(`games/${pin}/meta`);
  // a room removed meanwhile is never re-created (the increment below would write into it)
  if (!(await meta.child("createdAt").get()).exists()) return { counted: false, renamed: false, playerCount: null };
  const e = (entry ?? {}) as Partial<PlayerEntry>;
  const joinedAt = typeof e.joinedAt === "number" ? e.joinedAt : Date.now();
  // lastActivityAt only feeds the 6 h abandon check: a concurrent join's time is close enough
  await meta.update({ playerCount: ServerValue.increment(1), lastActivityAt: joinedAt });
  const playerCount = await syncFull(pin);
  if (await roomGone(pin)) return { counted: false, renamed: false, playerCount: null };
  // Names are fixed right away, so the lobby screen never shows a blocked name for long.
  if (typeof e.name !== "string") return { counted: true, renamed: false, playerCount };
  const original = e.name;
  const name = await claimName(pin, { uid, joinedAt }, original);
  if (await roomGone(pin)) return { counted: false, renamed: false, playerCount: null };
  // left (or was kicked) while we were claiming: the leave trigger may have run first
  if (!(await playerExists(pin, uid))) {
    await release(pin, uid, name);
    return { counted: true, renamed: false, playerCount };
  }
  await renameIfUnchanged(pin, uid, original, name);
  return { counted: true, renamed: name !== original, playerCount };
}

export async function onPlayerLeft(pin: string, uid: string, entry: unknown): Promise<number | null> {
  const db = await database();
  const name = (entry as Partial<PlayerEntry> | null)?.name;
  // free the name for the next joiner (only if this player still holds it)
  if (typeof name === "string") await release(pin, uid, name);
  const meta = db.ref(`games/${pin}/meta`);
  if (!(await meta.child("createdAt").get()).exists()) return null;
  await meta.update({ playerCount: ServerValue.increment(-1) });
  // never below 0 (a lost join event, or a leave delivered twice)
  const count = Number((await meta.child("playerCount").get()).val()) || 0;
  if (count < 0) await meta.update({ playerCount: 0 });
  const playerCount = await syncFull(pin);
  return (await roomGone(pin)) ? null : playerCount;
}
