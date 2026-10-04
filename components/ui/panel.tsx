"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useViewport } from "@/lib/use-viewport";
import { cn } from "@/lib/utils";

export function Panel({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const mode = useViewport();
  const mobile = mode === "mobile";
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35" />
        <Dialog.Content
          className={cn(
            "fixed z-50 overflow-auto bg-card outline-none",
            mobile
              ? "sheet-pop inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[22px] border-t border-border"
              : "drawer-pop inset-y-3 right-3 rounded-[18px] border border-border shadow-[var(--shadow)]",
            !mobile && (wide ? "w-[min(560px,calc(100%-1.5rem))]" : "w-[min(420px,calc(100%-1.5rem))]"),
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="modal-pop fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-border bg-card p-5 shadow-[var(--shadow)] outline-none">
          <Dialog.Title className="font-serif text-2xl font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
