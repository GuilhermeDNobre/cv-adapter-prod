'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Popover } from 'radix-ui';
import { X } from 'lucide-react';
import type { ChangeRect } from './to-host-rect';

export interface ChangePopoverCoverage {
  readonly requirementId: string;
  readonly literalTerm: string;
}

interface ChangePopoverProps {
  readonly bulletText: string;
  readonly beforeText?: string | null;
  readonly coverages: readonly ChangePopoverCoverage[];
  readonly hostRect: ChangeRect;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAccept: () => void;
  readonly onReject: () => void;
  readonly onRequestFocus?: () => void;
}

const POPOVER_TITLE = 'Alteração no currículo';
const PENDING_STATUS = 'Pendente';

export function ChangePopover({
  bulletText,
  beforeText = null,
  coverages,
  hostRect,
  open,
  onOpenChange,
  onAccept,
  onReject,
  onRequestFocus,
}: ChangePopoverProps): React.JSX.Element {
  const suppressFocusRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const acceptRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    suppressFocusRef.current = false;
    let cancelled = false;
    let removeListeners: (() => void) | undefined;
    function closeWithoutFocus(): void {
      suppressFocusRef.current = true;
      onOpenChangeRef.current(false);
    }
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      acceptRef.current?.focus();
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      if (typeof document.querySelector !== 'function') return;
      window.addEventListener('scroll', closeWithoutFocus, { passive: true, capture: true });
      const previewFrame = document.querySelector(
        'iframe[title="Pré-visualização do currículo"]',
      );
      const frameWindow = (previewFrame as HTMLIFrameElement | null)?.contentWindow;
      frameWindow?.addEventListener?.('scroll', closeWithoutFocus, { passive: true });
      removeListeners = () => {
        window.removeEventListener('scroll', closeWithoutFocus, { capture: true });
        frameWindow?.removeEventListener?.('scroll', closeWithoutFocus);
      };
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      removeListeners?.();
    };
  }, [open]);

  function handleCloseAutoFocus(event: Event): void {
    event.preventDefault();
    if (suppressFocusRef.current) {
      suppressFocusRef.current = false;
      return;
    }
    onRequestFocus?.();
  }

  function handleOpenAutoFocus(event: Event): void {
    event.preventDefault();
  }

  const virtualRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          ({
            x: hostRect.left,
            y: hostRect.top,
            top: hostRect.top,
            left: hostRect.left,
            right: hostRect.left + hostRect.width,
            bottom: hostRect.top + hostRect.height,
            width: hostRect.width,
            height: hostRect.height,
            toJSON: () => ({}),
          }) as DOMRect,
      },
    }),
    [hostRect],
  );

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor virtualRef={virtualRef} />
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={8}
          aria-label={POPOVER_TITLE}
          className="z-50 flex w-[340px] flex-col gap-3 rounded-xl border border-border bg-surface p-[14px] shadow-lg [transform-origin:var(--radix-popover-content-transform-origin)] data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out motion-reduce:data-[state=open]:animate-popover-fade-in motion-reduce:data-[state=closed]:animate-popover-fade-out"
          onCloseAutoFocus={handleCloseAutoFocus}
          onOpenAutoFocus={handleOpenAutoFocus}
        >
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-text">{POPOVER_TITLE}</p>
            <span className="text-xs tabular-nums text-text-3">{PENDING_STATUS}</span>
            <Popover.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="ml-auto grid h-[26px] w-[26px] place-items-center rounded-md text-text-3 transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </Popover.Close>
          </div>
          {beforeText !== null && beforeText.trim() !== '' && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3">
                Antes
              </span>
              <p className="text-[13px] text-text-2">{beforeText}</p>
            </div>
          )}
          <div className="flex flex-col gap-1 rounded-lg bg-accent-soft p-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-accent-text">
              Depois
            </span>
            <p className="text-[13px] text-text">{bulletText}</p>
          </div>
          {coverages.length === 0 ? (
            <p className="text-sm text-text-2">Nenhum Requirement coberto.</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-text">Requirements cobertos</p>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {coverages.map((coverage) => (
                  <li key={coverage.requirementId} className="text-sm text-text">
                    {coverage.literalTerm}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onReject}
              className="inline-flex h-8 items-center rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium text-text shadow transition-[background-color,transform] duration-press ease-out-motion hover:bg-surface-2 motion-safe:active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Rejeitar
            </button>
            <button
              ref={acceptRef}
              type="button"
              onClick={onAccept}
              className="inline-flex h-8 items-center rounded-lg border border-transparent bg-accent px-3 text-[13px] font-semibold text-accent-fg shadow-btn transition-[background-color,transform] duration-press ease-out-motion hover:bg-accent-hover motion-safe:active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Aceitar
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
