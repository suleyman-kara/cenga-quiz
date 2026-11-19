import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { app, useEmulators } from "./firebase";

export const firestore = getFirestore(app);
if (useEmulators) connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
