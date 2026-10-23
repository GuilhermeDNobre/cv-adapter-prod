'use client';

import { useId } from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps {
  readonly checked: boolean;
  readonly indeterminate?: boolean;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly meta?: string;
  readonly disabledReason?: string;
  readonly ariaLabel?: string;
  readonly onChange: (next: boolean) => void;
}

function boxClasses(checked: boolean, indeterminate: boolean, disabled: boolean): string {
  const base =
    'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus';
  if (disabled) {
    return `${base} border-border bg-surface-2`;
  }
  if (checked || indeterminate) {
    return `${base} border-accent bg-accent group-hover:border-accent`;
  }
  return `${base} border-border-strong bg-surface group-hover:border-text-2`;
}

export function Checkbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  meta,
  disabledReason,
  ariaLabel,
  onChange,
}: CheckboxProps): React.JSX.Element {
  const reasonId = useId();
  const showReason = disabled && disabledReason !== undefined && disabledReason !== '';
  const describedBy = showReason ? reasonId : undefined;
  const mixed = indeterminate && !disabled;
  const isStandalone = label === undefined;

  return (
    <span className={isStandalone ? 'inline-flex flex-col' : 'flex flex-col'}>
      <label
        className={
          isStandalone
            ? `group flex h-7 w-7 items-center justify-center rounded-md focus-within:outline-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`
            : `group flex w-full items-center gap-[10px] rounded-md px-2 py-[7px] text-left ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-surface-2'}`
        }
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-checked={mixed ? 'mixed' : undefined}
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.checked)}
          ref={(node) => {
            if (node !== null) node.indeterminate = mixed;
          }}
          className="peer sr-only"
        />
        <span aria-hidden="true" className={boxClasses(checked, mixed, disabled)}>
          {mixed ? (
            <span className="h-[2px] w-2 rounded-full bg-accent-fg" />
          ) : checked ? (
            <Check size={12} strokeWidth={2} aria-hidden="true" className="text-accent-fg" />
          ) : null}
        </span>
        {label !== undefined && (
          <span className={`flex-1 text-sm text-text ${disabled ? 'text-text-3' : ''}`}>{label}</span>
        )}
        {meta !== undefined && meta !== '' && (
          <span className="shrink-0 text-xs tabular-nums text-text-3">{meta}</span>
        )}
      </label>
      {showReason && (
        <span id={reasonId} className="px-2 text-xs text-text-3">
          {disabledReason}
        </span>
      )}
    </span>
  );
}
