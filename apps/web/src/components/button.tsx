import type { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'md' | 'sm' | 'xs';

interface ButtonProps {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly type?: 'button' | 'submit';
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
  readonly iconLeft?: ReactNode;
  readonly iconRight?: ReactNode;
  readonly ['aria-describedby']?: string;
}

const BASE_CLASSES = [
  'inline-flex items-center justify-center gap-2 font-medium transition-[background-color,transform] duration-press ease-out-motion',
  'motion-safe:active:scale-[0.97]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3 disabled:border-dashed disabled:border disabled:border-border-strong disabled:shadow-none',
].join(' ');

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: [
    'border border-transparent bg-accent font-semibold text-accent-fg shadow-btn',
    'hover:bg-accent-hover',
    'active:bg-accent-press',
    'focus-visible:outline-focus',
  ].join(' '),
  secondary: [
    'border border-border-strong bg-surface text-text shadow',
    'hover:bg-surface-2 hover:border-border-hover',
    'active:bg-surface-3',
    'focus-visible:outline-focus',
  ].join(' '),
  ghost: [
    'border border-transparent bg-transparent text-text-2',
    'hover:bg-surface-2 hover:text-text',
    'active:bg-surface-3',
    'focus-visible:outline-focus',
  ].join(' '),
  danger: [
    'border border-transparent bg-danger font-semibold text-white shadow-btn',
    'hover:bg-danger-hover',
    'active:bg-danger-press',
    'focus-visible:outline-danger',
  ].join(' '),
  'danger-ghost': [
    'border border-transparent bg-transparent text-danger-text',
    'hover:bg-danger-soft',
    'active:bg-danger-soft',
    'focus-visible:outline-danger',
  ].join(' '),
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'h-9 px-[14px] text-sm rounded-lg',
  sm: 'h-8 px-3 text-[13px] rounded-[7px]',
  xs: 'h-[30px] px-[10px] text-[13px] rounded-[7px]',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
): string {
  return `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  onClick,
  className,
  iconLeft,
  iconRight,
  ['aria-describedby']: ariaDescribedBy,
}: ButtonProps): React.JSX.Element {
  const sizePadding =
    size === 'md'
      ? `${iconLeft !== undefined ? 'pl-3' : ''} ${iconRight !== undefined ? 'pr-3' : ''}`.trim()
      : '';
  const classes = [buttonClasses(variant, size), sizePadding, className].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-describedby={ariaDescribedBy}
      className={classes}
    >
      {iconLeft !== undefined && (
        <span aria-hidden="true" className="flex">
          {iconLeft}
        </span>
      )}
      {children}
      {iconRight !== undefined && (
        <span aria-hidden="true" className="flex">
          {iconRight}
        </span>
      )}
    </button>
  );
}

interface IconButtonProps {
  readonly children: ReactNode;
  readonly ['aria-label']: string;
  readonly onClick?: () => void;
  readonly type?: 'button' | 'submit';
  readonly disabled?: boolean;
  readonly className?: string;
}

const ICON_BUTTON_CLASSES = [
  'flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-text-2 transition-[background-color,transform] duration-press ease-out-motion',
  'motion-safe:active:scale-[0.94]',
  'hover:bg-surface-2 hover:text-text',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3 disabled:border-dashed disabled:border-border-strong disabled:shadow-none',
].join(' ');

export function IconButton({
  children,
  ['aria-label']: ariaLabel,
  onClick,
  type = 'button',
  disabled = false,
  className,
}: IconButtonProps): React.JSX.Element {
  const classes = [ICON_BUTTON_CLASSES, className].filter(Boolean).join(' ');
  return (
    <button type={type} aria-label={ariaLabel} disabled={disabled} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
