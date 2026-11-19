import type { ReactNode } from "react";
import { Logo } from "./Logo";

interface Props {
  /** "app" = phone/light screens; "stage" = projector/dark */
  variant?: "app" | "stage";
  /** right side of the header bar */
  aside?: ReactNode;
  showLogo?: boolean;
  children: ReactNode;
}

export function Layout({ variant = "app", aside, showLogo = true, children }: Props) {
  return (
    <div className={`layout layout--${variant}`}>
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
