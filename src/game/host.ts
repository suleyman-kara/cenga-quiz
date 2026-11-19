import { useCallback, useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import { addDoc, collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import type { Quiz, QuizDoc } from "../../shared/types";
import { auth, firestore } from "../firebase";

export type HostStatus = "loading" | "signedOut" | "unauthorized" | "authorized";

export interface HostUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface HostAuth {
  status: HostStatus;
  user: HostUser | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** Google sign-in + allowedHosts/{email} check. Anonymous (player) users count as signed out. */
export function useHostAuth(): HostAuth {
  const [state, setState] = useState<{ status: HostStatus; user: HostUser | null }>({
    status: "loading",
    user: null,
  });

  useEffect(() => {
    let alive = true;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u || u.isAnonymous || !u.email) {
        if (alive) setState({ status: "signedOut", user: null });
        return;
      }
      const user = { uid: u.uid, email: u.email, displayName: u.displayName };
      if (alive) setState({ status: "loading", user });
      let allowed = false;
      try {
        allowed = (await getDoc(doc(firestore, "allowedHosts", u.email.toLowerCase()))).exists();
      } catch {
        allowed = false;
      }
      if (alive) setState({ status: allowed ? "authorized" : "unauthorized", user });
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const signIn = useCallback(async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  }, []);
  const signOut = useCallback(() => fbSignOut(auth), []);

  return { ...state, signIn, signOut };
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
