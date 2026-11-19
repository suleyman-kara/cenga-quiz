import { club } from "../club.config";

export function Logo({ className }: { className?: string }) {
  return (
    <img
      className={["logo", className].filter(Boolean).join(" ")}
      src={club.logo.src}
      alt={club.logo.alt}
      width={club.logo.width}
      height={club.logo.height}
    />
  );
}
