import { useCallback, useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import type { Quiz, QuizDoc } from "../../shared/types";
import { auth } from "../firebase";
import { firestore } from "../firestore";

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
        // rules key allowedHosts by the lowercased email
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
