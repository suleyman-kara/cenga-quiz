import { useCallback, useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type ActionCodeSettings,
  type User,
} from "firebase/auth";
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import type { Quiz, QuizDoc } from "../../shared/types";
import { auth, checkHostEmail } from "../firebase";
import { firestore } from "../firestore";

/** "unverified": signed in with e-mail + password, but the address is not verified yet. */
export type HostStatus = "loading" | "signedOut" | "unverified" | "unauthorized" | "authorized";

export interface HostUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface HostAuth {
  status: HostStatus;
  user: HostUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Rejects with code "host/email-not-allowed" (no account created) for addresses not on the list. */
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  /** Reloads the user and forces a fresh ID token; resolves true once the e-mail is verified. */
  refreshVerification: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

export const EMAIL_NOT_ALLOWED = "host/email-not-allowed";

/** Links in verification / reset e-mails lead back to the host panel. */
function actionSettings(): ActionCodeSettings | undefined {
  if (typeof window === "undefined" || !window.location?.origin) return undefined;
  return { url: `${window.location.origin}/host` };
}

const CONTINUE_URL_ERRORS = new Set(["auth/unauthorized-continue-uri", "auth/invalid-continue-uri", "auth/missing-continue-uri"]);

/** Sends with a continue URL; retries without one if this domain is not authorized for it. */
async function withContinueUrl(send: (s?: ActionCodeSettings) => Promise<void>): Promise<void> {
  const settings = actionSettings();
  try {
    await send(settings);
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    if (!settings || typeof code !== "string" || !CONTINUE_URL_ERRORS.has(code)) throw err;
    await send();
  }
}

type HostState = { status: HostStatus; user: HostUser | null };

/**
 * E-mail + password host sign-in, with mandatory e-mail verification and the allowedHosts/{email}
 * check. Anonymous (player) users count as signed out.
 */
export function useHostAuth(): HostAuth {
  const [state, setState] = useState<HostState>({ status: "loading", user: null });
  const alive = useRef(true);
  /** Bumped per evaluation so a slow allow-list read cannot overwrite a newer answer. */
  const seq = useRef(0);

  const evaluate = useCallback(async (u: User | null) => {
    const run = ++seq.current;
    const set = (s: HostState) => {
      if (alive.current && run === seq.current) setState(s);
    };
    if (!u || u.isAnonymous || !u.email) return set({ status: "signedOut", user: null });
    const user = { uid: u.uid, email: u.email, displayName: u.displayName };
    if (!u.emailVerified) return set({ status: "unverified", user });
    set({ status: "loading", user });
    let allowed = false;
    try {
      // rules key allowedHosts by the lowercased email
      allowed = (await getDoc(doc(firestore, "allowedHosts", u.email.toLowerCase()))).exists();
    } catch {
      allowed = false;
    }
    set({ status: allowed ? "authorized" : "unauthorized", user });
  }, []);

  useEffect(() => {
    alive.current = true;
    const unsub = onAuthStateChanged(auth, (u) => void evaluate(u));
    return () => {
      alive.current = false;
      unsub();
    };
  }, [evaluate]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const address = email.trim();
    if (!(await checkHostEmail(address))) {
      throw Object.assign(new Error("Bu e-posta sunucu listesinde değil."), { code: EMAIL_NOT_ALLOWED });
    }
    const cred = await createUserWithEmailAndPassword(auth, address, password);
    // The account exists now; if this send fails the verify screen offers "resend".
    await withContinueUrl((s) => sendEmailVerification(cred.user, s)).catch(() => {});
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    // Also works for an existing Google-provider account: it adds a password to that account.
    await withContinueUrl((s) => (s ? sendPasswordResetEmail(auth, email.trim(), s) : sendPasswordResetEmail(auth, email.trim())));
  }, []);

  const resendVerification = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return;
    await withContinueUrl((s) => sendEmailVerification(u, s));
  }, []);

  const refreshVerification = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return false;
    await u.reload();
    if (!u.emailVerified) return false;
    // New ID token carries email_verified=true for the Firestore rules and the host callable.
    await u.getIdToken(true);
    await evaluate(u);
    return true;
  }, [evaluate]);

  const signOut = useCallback(() => fbSignOut(auth), []);

  return { ...state, signIn, signUp, resetPassword, resendVerification, refreshVerification, signOut };
}

export interface QuizListItem {
  id: string;
  title: string;
  questionCount: number;
  updatedAt: number;
}

export function useMyQuizzes(uid: string | null): {
  quizzes: QuizListItem[];
  loading: boolean;
  error: string | null;
} {
  const [state, setState] = useState<{ uid: string | null; quizzes: QuizListItem[]; error: string | null }>({
    uid: null,
    quizzes: [],
    error: null,
  });
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(firestore, "quizzes"), where("ownerUid", "==", uid));
    return onSnapshot(
      q,
      (snap) => {
        const quizzes = snap.docs
          .map((d) => {
            const data = d.data() as Partial<QuizDoc>;
            return {
              id: d.id,
              title: data.title ?? d.id,
              questionCount: data.questions?.length ?? 0,
              updatedAt: data.updatedAt ?? 0,
            };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt);
        setState({ uid, quizzes, error: null });
      },
      (err) => setState({ uid, quizzes: [], error: err.message }),
    );
  }, [uid]);
  return { quizzes: state.quizzes, loading: !!uid && state.uid !== uid, error: state.error };
}

/** Saves a validated quiz; returns the new document id. */
export async function saveQuiz(uid: string, quiz: Quiz): Promise<string> {
  const now = Date.now();
  // JSON round-trip drops `undefined` optionals, which Firestore rejects.
  const clean = JSON.parse(JSON.stringify(quiz)) as Quiz;
  const data: QuizDoc = { ...clean, ownerUid: uid, createdAt: now, updatedAt: now };
  const ref = await addDoc(collection(firestore, "quizzes"), data);
  return ref.id;
}

/** Reads one of the host's own quizzes for editing; null when missing. */
export async function loadQuiz(id: string): Promise<Quiz | null> {
  const snap = await getDoc(doc(firestore, "quizzes", id));
  if (!snap.exists()) return null;
  const d = snap.data() as Partial<QuizDoc>;
  const quiz: Quiz = { title: d.title ?? "", questions: d.questions ?? [] };
  if (d.description) quiz.description = d.description;
  return quiz;
}

/** Replaces title, description and questions of an existing quiz (owner and createdAt stay). */
export async function updateQuiz(id: string, quiz: Quiz): Promise<void> {
  const clean = JSON.parse(JSON.stringify(quiz)) as Quiz;
  await updateDoc(doc(firestore, "quizzes", id), {
    title: clean.title,
    description: clean.description ?? deleteField(),
    questions: clean.questions,
    updatedAt: Date.now(),
  });
}

export async function deleteQuiz(id: string): Promise<void> {
  await deleteDoc(doc(firestore, "quizzes", id));
}
