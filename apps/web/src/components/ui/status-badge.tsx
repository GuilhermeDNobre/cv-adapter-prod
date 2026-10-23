import { Check, Circle, CircleDot } from 'lucide-react';

export type CoverageStatus = 'covered' | 'partial' | 'gap';

interface StatusBadgeProps {
  readonly status: CoverageStatus;
  readonly className?: string;
}

const STATUS_TEXT: Record<CoverageStatus, string> = {
  covered: 'Coberto',
  partial: 'Parcial',
  gap: 'Gap',
};

const STATUS_CLASSES: Record<CoverageStatus, string> = {
  covered: 'bg-ok-soft text-ok',
  partial: 'bg-warn-soft text-warn',
  gap: 'border border-border-strong bg-surface-2 text-text-2',
};

export function StatusBadge({ status, className }: StatusBadgeProps): React.JSX.Element {
  const classes = [
    'inline-flex h-[22px] items-center gap-1 rounded-md px-2 text-xs font-semibold tabular-nums',
    STATUS_CLASSES[status],
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes}>
      {status === 'covered' && <Check size={10} strokeWidth={2.2} aria-hidden="true" />}
      {status === 'partial' && <CircleDot size={10} aria-hidden="true" />}
      {status === 'gap' && <Circle size={10} aria-hidden="true" />}
      {STATUS_TEXT[status]}
    </span>
  );
}
