import type { ReactNode } from 'react';

interface CardProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function Card({ children, className }: CardProps): React.JSX.Element {
  const classes = ['rounded-xl border border-border bg-surface shadow', className]
    .filter(Boolean)
    .join(' ');
  return <div className={classes}>{children}</div>;
}

interface CardHeaderProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps): React.JSX.Element {
  const classes = ['border-b border-border px-4 py-3', className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}
