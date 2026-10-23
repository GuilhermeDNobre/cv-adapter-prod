'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';

interface SectionDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly onRequestFocus?: () => void;
  readonly kicker?: string | null;
}

const DEFAULT_KICKER = 'Editar seção';

export function SectionDrawer({
  open,
  onOpenChange,
  title,
  children,
  onRequestFocus,
  kicker = DEFAULT_KICKER,
}: SectionDrawerProps): React.JSX.Element {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(open);
  const onRequestFocusRef = useRef(onRequestFocus);
  onRequestFocusRef.current = onRequestFocus;

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    if (!open && wasOpenRef.current) {
      const restore = onRequestFocusRef.current;
      if (restore !== undefined) {
        restore();
      } else {
        previousFocusRef.current?.focus();
      }
    }
    wasOpenRef.current = open;
  }, [open]);

  function handleCloseAutoFocus(event: Event): void {
    event.preventDefault();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-scrim data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out motion-reduce:data-[state=open]:animate-fade-in-150 motion-reduce:data-[state=closed]:animate-fade-out-150" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-[min(440px,100vw)] flex-col border-l border-border bg-surface shadow-lg data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out motion-reduce:data-[state=open]:animate-fade-in-150 motion-reduce:data-[state=closed]:animate-fade-out-150"
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <div className="flex min-w-0 flex-col">
              {kicker !== null && <span className="text-xs text-text-3">{kicker}</span>}
              <Dialog.Title className="truncate text-[15px] font-semibold text-text">
                {title}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="ml-auto grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] text-text-3 transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <X aria-hidden="true" className="h-[13px] w-[13px]" />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
