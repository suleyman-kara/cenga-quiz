import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from "firebase/auth";
import { getDoc } from "firebase/firestore";
import { checkHostEmail } from "../firebase";
import { useHostAuth } from "./host";

type FakeUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  emailVerified: boolean;
  reload: () => Promise<void>;
  getIdToken: (force?: boolean) => Promise<string>;
};

const fakeAuth = vi.hoisted(() => ({ currentUser: null as FakeUser | null }));
let emit: (u: FakeUser | null) => void = () => {};

vi.mock("../firebase", () => ({ auth: fakeAuth, checkHostEmail: vi.fn() }));
vi.mock("../firestore", () => ({ firestore: {} }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

function makeUser(over: Partial<FakeUser> = {}): FakeUser {
  return {
    uid: "h1",
    email: "Host@Example.org",
    displayName: null,
    isAnonymous: false,
    emailVerified: true,
    reload: vi.fn(async () => {}),
    getIdToken: vi.fn(async () => "token"),
    ...over,
  };
}

const allowList = (emails: string[]) =>
  vi.mocked(getDoc).mockImplementation(async (ref) => {
    const path = (ref as unknown as { path: string }).path;
    return { exists: () => emails.some((e) => path === `allowedHosts/${e}`) } as never;
  });

async function setup(user: FakeUser | null) {
  const hook = renderHook(() => useHostAuth());
  await act(async () => {
    fakeAuth.currentUser = user;
    emit(user);
  });
  return hook;
}

describe("useHostAuth (email + password)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeAuth.currentUser = null;
    vi.mocked(onAuthStateChanged).mockImplementation(((_a: unknown, cb: (u: FakeUser | null) => void) => {
      emit = cb;
      return () => {};
    }) as never);
    allowList(["host@example.org"]);
  });

  it("anonymous player sessions count as signed out", async () => {
    const { result } = await setup(makeUser({ isAnonymous: true, email: null }));
    expect(result.current.status).toBe("signedOut");
  });

  it("verified + allow-listed → authorized (lowercased allowedHosts key)", async () => {
    const { result } = await setup(makeUser());
    await waitFor(() => expect(result.current.status).toBe("authorized"));
    expect(result.current.user?.email).toBe("Host@Example.org");
  });

  it("verified but not allow-listed → unauthorized", async () => {
    allowList([]);
    const { result } = await setup(makeUser());
    await waitFor(() => expect(result.current.status).toBe("unauthorized"));
  });

  it("unverified → 'unverified' without reading the allow-list", async () => {
    const { result } = await setup(makeUser({ emailVerified: false }));
    await waitFor(() => expect(result.current.status).toBe("unverified"));
    expect(getDoc).not.toHaveBeenCalled();
  });

  it("signIn uses email + password (trimmed email)", async () => {
    const { result } = await setup(null);
    await act(() => result.current.signIn(" host@example.org ", "secret123"));
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(fakeAuth, "host@example.org", "secret123");
  });

  it("signUp refuses an email that is not on the list and creates no account", async () => {
    vi.mocked(checkHostEmail).mockResolvedValue(false);
    const { result } = await setup(null);
    await expect(result.current.signUp("x@y.org", "secret123")).rejects.toMatchObject({ code: "host/email-not-allowed" });
    expect(checkHostEmail).toHaveBeenCalledWith("x@y.org");
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it("signUp for an allowed email creates the account and sends verification", async () => {
    vi.mocked(checkHostEmail).mockResolvedValue(true);
    const created = makeUser({ emailVerified: false });
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({ user: created } as never);
    const { result } = await setup(null);
    await act(() => result.current.signUp(" Host@Example.org", "secret123"));
    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(fakeAuth, "Host@Example.org", "secret123");
    expect(sendEmailVerification).toHaveBeenCalledWith(created, expect.anything());
  });

  it("refreshVerification reloads the user, forces a new ID token and re-evaluates", async () => {
    const u = makeUser({ emailVerified: false });
    const { result } = await setup(u);
    await waitFor(() => expect(result.current.status).toBe("unverified"));
    vi.mocked(u.reload).mockImplementation(async () => {
      u.emailVerified = true;
    });
    let verified = false;
    await act(async () => {
      verified = await result.current.refreshVerification();
    });
    expect(verified).toBe(true);
    expect(u.getIdToken).toHaveBeenCalledWith(true);
    await waitFor(() => expect(result.current.status).toBe("authorized"));
  });

  it("refreshVerification reports false while still unverified", async () => {
    const u = makeUser({ emailVerified: false });
    const { result } = await setup(u);
    let verified = true;
    await act(async () => {
      verified = await result.current.refreshVerification();
    });
    expect(verified).toBe(false);
    expect(result.current.status).toBe("unverified");
  });

  it("resendVerification sends to the current user", async () => {
    const u = makeUser({ emailVerified: false });
    const { result } = await setup(u);
    await act(() => result.current.resendVerification());
    expect(sendEmailVerification).toHaveBeenCalledWith(u, expect.anything());
  });

  it("resetPassword calls sendPasswordResetEmail (also for accounts created with Google)", async () => {
    const { result } = await setup(null);
    await act(() => result.current.resetPassword(" host@example.org "));
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(fakeAuth, "host@example.org", expect.anything());
  });

  it("falls back to no continue URL when the domain is not authorized for it", async () => {
    vi.mocked(sendPasswordResetEmail)
      .mockRejectedValueOnce(Object.assign(new Error("x"), { code: "auth/unauthorized-continue-uri" }))
      .mockResolvedValueOnce(undefined);
    const { result } = await setup(null);
    await act(() => result.current.resetPassword("host@example.org"));
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendPasswordResetEmail).mock.calls[1]).toEqual([fakeAuth, "host@example.org"]);
  });

  it("signOut signs out of Firebase", async () => {
    const { result } = await setup(makeUser());
    await act(() => result.current.signOut());
    expect(fbSignOut).toHaveBeenCalledWith(fakeAuth);
  });
});
