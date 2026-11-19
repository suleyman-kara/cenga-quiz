import { useEffect, useState, useSyncExternalStore } from "react";
import { goOffline, goOnline, onValue, ref } from "firebase/database";
import { db } from "../firebase";
import { createReconnectWatchdog } from "./watchdog";

/**
 * Realtime Database connection state from `.info/connected`, shared by every screen
 * (one listener for the whole app) plus the reconnect watchdog.
 */
interface ConnState {
  connected: boolean;
  /** connected at least once since the page loaded */
  everConnected: boolean;
}

let state: ConnState = { connected: false, everConnected: false };
const listeners = new Set<() => void>();
let started = false;

function start() {
  if (started) return;
  started = true;
  onValue(ref(db, ".info/connected"), (snap) => {
    const connected = snap.val() === true;
    state = { connected, everConnected: state.everConnected || connected };
    listeners.forEach((l) => l());
  });
  createReconnectWatchdog({
    isConnected: () => state.connected,
    reconnect: () => {
      goOffline(db);
      goOnline(db);
    },
  });
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useConnection(): ConnState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Banner signal: the connection was up and is now lost. */
export function useConnectionLost(): boolean {
  const { connected, everConnected } = useConnection();
  return everConnected && !connected;
}

/** True once the realtime connection has been down for `ms` in a row (e.g. WebSockets blocked). */
export function useOfflineFor(ms: number): boolean {
  const { connected } = useConnection();
  const [long, setLong] = useState(false);
  useEffect(() => {
    if (connected) {
      setLong(false);
      return;
    }
    const id = setTimeout(() => setLong(true), ms);
    return () => clearTimeout(id);
  }, [connected, ms]);
  return long && !connected;
}
