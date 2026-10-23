'use client';

interface SegmentOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number;
}

interface SegmentedControlProps {
  readonly options: ReadonlyArray<SegmentOption>;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly className?: string;
  readonly ariaLabel?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: SegmentedControlProps): React.JSX.Element {
  const classes = ['inline-flex rounded-lg border border-border bg-surface-2 p-[2px]', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={classes}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={[
              'flex h-7 items-center gap-1 rounded-md px-[10px] text-[13px] font-medium tabular-nums transition-colors',
              checked
                ? 'bg-surface text-text shadow'
                : 'bg-transparent text-text-2 hover:text-text',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            ].join(' ')}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="text-xs tabular-nums text-text-3">{String(option.count)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
