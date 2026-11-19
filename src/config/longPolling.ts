const KEY = "quiz.longPolling";

/**
 * `?lp=1` forces RTDB long polling (for venue networks that block WebSockets); remembered in
 * localStorage so it survives navigation and refreshes. `?lp=0` turns it off.
 */
export function wantsLongPolling(search: string): boolean {
  const lp = new URLSearchParams(search).get("lp");
  try {
    if (lp === "1") localStorage.setItem(KEY, "1");
    else if (lp === "0") localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === "1";
  } catch {
    return lp === "1";
  }
}
