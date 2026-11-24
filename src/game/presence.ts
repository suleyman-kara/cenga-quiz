import { useEffect } from "react";
import { onDisconnect, onValue, ref, remove, set } from "firebase/database";
import { db } from "../firebase";
import { paths } from "./paths";

/**
 * Host big screen: keeps games/{pin}/hostOnline = true while this tab is connected. The server
 * removes it when the connection drops (onDisconnect), so phones can tell the players the game
 * is paused rather than broken. Re-armed after every reconnect.
 */
export function useHostPresence(pin: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const node = ref(db, paths.hostOnline(pin));
    const unsubscribe = onValue(ref(db, ".info/connected"), (snap) => {
      if (snap.val() !== true) return;
      void onDisconnect(node)
        .remove()
        .then(() => set(node, true))
        .catch(() => undefined);
    });
    return () => {
      unsubscribe();
      void onDisconnect(node).cancel().catch(() => undefined);
      void remove(node).catch(() => undefined);
    };
  }, [pin, active]);
}
