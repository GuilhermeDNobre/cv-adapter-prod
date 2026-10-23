'use client';

import { Popover } from 'radix-ui';
import { X } from 'lucide-react';

export interface RemovedEvidenceItem {
  readonly id: string;
  readonly statement: string;
}

interface RemovedChangesPopoverProps {
  readonly removed: readonly RemovedEvidenceItem[];
  readonly onRestore: (evidenceId: string) => void;
}

function removedLabel(count: number): string {
  return count === 1 ? '1 retirada' : `${String(count)} retiradas`;
}

export function RemovedChangesPopover({
  removed,
  onRestore,
}: RemovedChangesPopoverProps): React.JSX.Element | null {
  if (removed.length === 0) return null;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="rounded-md border border-border-strong bg-surface px-3 py-1 font-semibold text-text shadow transition-[background-color,transform] duration-press ease-out-motion hover:bg-surface-2 motion-safe:active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {removedLabel(removed.length)}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          aria-label="Evidences retiradas"
          className="z-50 flex max-h-[70vh] w-[340px] max-w-[90vw] flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-surface p-[14px] shadow-lg [transform-origin:var(--radix-popover-content-transform-origin)] data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out motion-reduce:data-[state=open]:animate-popover-fade-in motion-reduce:data-[state=closed]:animate-popover-fade-out"
        >
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-text">Evidences retiradas</p>
            <Popover.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="ml-auto grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md text-text-3 transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </Popover.Close>
          </div>
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {removed.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-lg bg-accent-soft p-2.5"
              >
                <span className="text-[13px] text-text">{item.statement}</span>
                <span>
                  <button
                    type="button"
                    onClick={() => onRestore(item.id)}
                    className="inline-flex h-8 items-center rounded-lg border border-transparent bg-accent px-3 text-[13px] font-semibold text-accent-fg shadow-btn transition-[background-color,transform] duration-press ease-out-motion hover:bg-accent-hover motion-safe:active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Restaurar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
