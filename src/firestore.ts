import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { app, useEmulators } from "./firebase";
import { EMULATORS } from "./config/firebaseConfig";

export const firestore = getFirestore(app);
if (import.meta.env.DEV && useEmulators) connectFirestoreEmulator(firestore, EMULATORS.host, EMULATORS.ports.firestore);
