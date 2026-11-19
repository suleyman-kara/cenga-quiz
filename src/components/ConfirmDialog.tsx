import { useEffect, useId, useRef, type KeyboardEvent } from "react";

interface Props {
  open: boolean;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** styles the confirm button as destructive */
  danger?: boolean;
}

/**
 * In-app confirmation (replaces window.confirm, which blocks timers and the realtime listeners).
 * Modal alertdialog: focus starts on Cancel, Tab stays inside, Escape cancels, focus returns to
 * the opener on close.
 */
export function ConfirmDialog({ open, message, confirmLabel, cancelLabel, onConfirm, onCancel, danger = true }: Props) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      const el = opener.current as HTMLElement | null;
      if (el && typeof el.focus === "function" && el.isConnected) el.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current;
      next?.focus();
    }
  };

  return (
    <div className="confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-msg`}
        onKeyDown={onKeyDown}
      >
        <p id={`${id}-msg`} className="confirm__message">
          {message}
        </p>
        <div className="confirm__actions">
          <button ref={cancelRef} type="button" className="btn btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${danger ? "btn--danger" : "btn--primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
