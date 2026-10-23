'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { EASE_OUT, STEP_ENTER_MS, STEP_OFFSET_PX } from '../../lib/motion';
import { WIZARD_STEPS } from './use-wizard-state';
import { stepOfPath } from './wizard-route';

interface WizardStepTransitionProps {
  readonly children: React.ReactNode;
}

export function WizardStepTransition({ children }: WizardStepTransitionProps): React.JSX.Element {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const currentIndex = WIZARD_STEPS.indexOf(stepOfPath(pathname));
  const prevPathRef = useRef(pathname);
  const prevIndexRef = useRef(currentIndex);
  const [hasMounted, setHasMounted] = useState(false);
  const goingBack = currentIndex < prevIndexRef.current;
  const offset = goingBack ? -STEP_OFFSET_PX : STEP_OFFSET_PX;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;
    prevIndexRef.current = currentIndex;
    window.scrollTo(0, 0);
    const heading = document.querySelector('main h1');
    if (heading instanceof HTMLElement) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }, [pathname, currentIndex]);

  return (
    <motion.div
      key={pathname}
      initial={
        !hasMounted
          ? false
          : reduceMotion
            ? { opacity: 0 }
            : { opacity: 0, y: offset }
      }
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: STEP_ENTER_MS / 1000, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
