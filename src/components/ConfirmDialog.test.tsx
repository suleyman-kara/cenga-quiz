import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

function setup(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <>
      <button type="button">önce</button>
      <ConfirmDialog
        open
        message="Ali çıkarılsın mı?"
        confirmLabel="Çıkar"
        cancelLabel="Vazgeç"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...props}
      />
    </>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("is a labelled modal alertdialog and focuses the safe (cancel) choice", () => {
    setup();
    const dialog = screen.getByRole("alertdialog", { name: "Ali çıkarılsın mı?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Vazgeç" })).toHaveFocus();
  });

  it("confirm and cancel buttons call back", async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Çıkar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Escape cancels", async () => {
    const { onCancel, onConfirm } = setup();
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps Tab focus inside the dialog", async () => {
    setup();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Çıkar" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Vazgeç" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Çıkar" })).toHaveFocus();
  });

  it("renders nothing when closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("restores focus to the element that opened it", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(
      <ConfirmDialog open message="m" confirmLabel="ok" cancelLabel="no" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(opener).not.toHaveFocus();
    rerender(<ConfirmDialog open={false} message="m" confirmLabel="ok" cancelLabel="no" onConfirm={() => {}} onCancel={() => {}} />);
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
