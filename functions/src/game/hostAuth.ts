import { GameError } from "../core/errors";
import { requireSignedIn, requireVerifiedEmail, type AuthLike } from "../core/auth";
import { firestore } from "./firebase";

/** Caller must be signed in with a verified e-mail listed in allowedHosts. Returns the uid. */
export async function requireAllowedHost(auth: AuthLike | undefined): Promise<string> {
  const uid = requireSignedIn(auth);
  const email = requireVerifiedEmail(auth!);
  const doc = await (await firestore()).doc(`allowedHosts/${email}`).get();
  if (!doc.exists) throw new GameError("permission-denied", "Bu hesap oyun sunmak için yetkili değil.");
  return uid;
}
