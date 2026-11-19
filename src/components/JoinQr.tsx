import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { t } from "../i18n";

/** Join page URL with the PIN prefilled; JoinPage checks ?pin= and goes straight to the nickname step. */
export function joinUrl(origin: string, pin: string): string {
  return `${origin.replace(/\/+$/, "")}/?pin=${encodeURIComponent(pin)}`;
}

/** QR module grid for `text` (error correction M — readable from the back of a hall). */
export function qrModules(text: string): { size: number; dark: (row: number, col: number) => boolean } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return { size: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) };
}

/** One SVG path of 1×1 squares; drawn in currentColor on a light quiet zone. Generated locally. */
export function JoinQr({ url, className }: { url: string; className?: string }) {
  const { size, d } = useMemo(() => {
    const m = qrModules(url);
    let path = "";
    for (let r = 0; r < m.size; r++) {
      for (let c = 0; c < m.size; c++) if (m.dark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
    return { size: m.size, d: path };
  }, [url]);
  const quiet = 4;
  return (
    <svg
      className={["join-qr", className].filter(Boolean).join(" ")}
      role="img"
      aria-label={t("hostGame.qrLabel")}
      data-url={url}
      viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`}
      shapeRendering="crispEdges"
    >
      <rect x={-quiet} y={-quiet} width={size + quiet * 2} height={size + quiet * 2} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
