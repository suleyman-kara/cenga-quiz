import { useSyncExternalStore } from "react";
import { t } from "../i18n";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Browser-level connectivity (navigator.onLine). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * "Connection lost" pill. Pass `offline` to drive it from a data-layer signal;
 * without it, the browser's own online/offline events are used.
 */
export function ConnectionBanner({ offline }: { offline?: boolean }) {
  const online = useOnline();
  const show = offline ?? !online;
  if (!show) return null;
  return (
    <div className="conn-banner" role="status" aria-live="assertive">
      <span className="conn-banner__dot" aria-hidden="true" />
      {t("common.offline")}
    </div>
  );
}
