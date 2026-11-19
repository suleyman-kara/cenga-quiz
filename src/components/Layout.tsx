import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { ConnectionBanner } from "./ConnectionBanner";

interface Props {
  /** "app" = phone/light screens; "stage" = projector/dark */
  variant?: "app" | "stage";
  /** right side of the header bar */
  aside?: ReactNode;
  showLogo?: boolean;
  /** force the connection-lost banner (otherwise follows the browser's online state) */
  offline?: boolean;
  children: ReactNode;
}

export function Layout({ variant = "app", aside, showLogo = true, offline, children }: Props) {
  return (
    <div className={`layout layout--${variant}`}>
      <ConnectionBanner offline={offline} />
      {(showLogo || aside) && (
        <header className="layout__bar">
          {showLogo ? <Logo className="layout__logo" /> : <span />}
          {aside && <div className="layout__aside">{aside}</div>}
        </header>
      )}
      <main className="layout__main">{children}</main>
    </div>
  );
}
