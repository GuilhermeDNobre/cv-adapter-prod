'use client';

import { useId } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export type HomeEntryVariant = 'primary' | 'secondary';

interface HomeEntryCardProps {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly variant?: HomeEntryVariant;
}

const CARD_BASE_CLASSES = [
  'flex h-full rounded-xl border border-border bg-surface shadow',
  'transition-[border-color,transform] duration-press ease-out-motion motion-safe:active:scale-[0.99]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
].join(' ');

const CARD_VARIANT_CLASSES: Readonly<Record<HomeEntryVariant, string>> = {
  primary: 'flex-col justify-between gap-10 p-6 hover:border-accent',
  secondary: 'items-start gap-4 p-5 hover:border-border-hover',
};

const ICON_TILE_CLASSES: Readonly<Record<HomeEntryVariant, string>> = {
  primary: 'h-14 w-14 rounded-xl bg-accent text-accent-fg shadow-btn',
  secondary: 'h-12 w-12 rounded-[10px] bg-accent-soft text-accent-text',
};

const ICON_SIZES: Readonly<Record<HomeEntryVariant, number>> = {
  primary: 28,
  secondary: 24,
};

const TITLE_CLASSES: Readonly<Record<HomeEntryVariant, string>> = {
  primary: 'text-xl font-semibold tracking-[-0.015em] text-text',
  secondary: 'text-base font-semibold tracking-[-0.01em] text-text',
};

export function HomeEntryCard({
  href,
  title,
  description,
  icon: Icon,
  variant = 'secondary',
}: HomeEntryCardProps): React.JSX.Element {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Link
      href={href}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`${CARD_BASE_CLASSES} ${CARD_VARIANT_CLASSES[variant]}`}
    >
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center ${ICON_TILE_CLASSES[variant]}`}
      >
        <Icon size={ICON_SIZES[variant]} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span id={titleId} className={TITLE_CLASSES[variant]}>
          {title}
        </span>
        <span id={descriptionId} className="text-pretty text-sm leading-relaxed text-text-2">
          {description}
        </span>
      </span>
    </Link>
  );
}
