'use client';

import { AnimatePresence, motion } from 'motion/react';
import { EASE_OUT, PROGRESS_BAR_MS, PROGRESS_SWAP_MS } from '../../lib/motion';

interface AiActivityProps {
  readonly message: string;
  readonly current?: number;
  readonly total?: number;
  readonly progress?: number;
  readonly className?: string;
}

export function AiActivity({
  message,
  current,
  total,
  progress,
  className,
}: AiActivityProps): React.JSX.Element {
  const counter =
    current !== undefined && total !== undefined ? `${String(current)} de ${String(total)}` : null;
  const classes = ['flex flex-col gap-2', className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <div className="flex items-center gap-2">
        <motion.span
          aria-hidden="true"
          className="h-[6px] w-[6px] rounded-full bg-accent"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity }}
        />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={message}
            aria-hidden="true"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: PROGRESS_SWAP_MS / 1000, ease: EASE_OUT }}
            className="text-[13px] text-text-2"
          >
            {message}
          </motion.span>
        </AnimatePresence>
        {counter !== null && (
          <span aria-hidden="true" className="ml-auto text-xs tabular-nums text-text-3">
            {counter}
          </span>
        )}
      </div>
      {progress !== undefined && (
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-[3px] w-full overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{
              width: `${String(progress)}%`,
              transition: `width ${String(PROGRESS_BAR_MS)}ms ease-out`,
            }}
          />
        </div>
      )}
    </div>
  );
}
