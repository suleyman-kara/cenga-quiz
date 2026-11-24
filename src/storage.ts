/** Cloud Storage, loaded only by the quiz editor (image uploads): never part of the player bundle. */
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { app, useEmulators } from "./firebase";
import { EMULATORS } from "./config/firebaseConfig";

export const storage = getStorage(app);
if (import.meta.env.DEV && useEmulators) connectStorageEmulator(storage, EMULATORS.host, EMULATORS.ports.storage);
