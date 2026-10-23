import { Suspense } from 'react';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { DeepSeekKeyGate } from '../../components/deepseek-key-gate';
import { FunnelHeader } from '../../components/wizard/funnel-header';
import { WizardStepTransition } from '../../components/wizard/wizard-step-transition';

interface FunilLayoutProps {
  readonly children: React.ReactNode;
}

export default function FunilLayout({ children }: FunilLayoutProps): React.JSX.Element {
  return (
    <MotionConfig reducedMotion="user">
      <DeepSeekKeyGate>
        <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-7 px-8 pb-8 pt-7">
          <Suspense fallback={null}>
            <FunnelHeader />
          </Suspense>
          <div className="flex flex-1 flex-col">
            <WizardStepTransition>{children}</WizardStepTransition>
          </div>
        </div>
        <Toaster
          position="bottom-right"
          duration={4000}
          visibleToasts={3}
          toastOptions={{
            style: {
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              boxShadow: 'var(--shadow-lg)',
              color: 'var(--text)',
              fontSize: '13px',
              minWidth: '260px',
              maxWidth: '380px',
            },
            actionButtonStyle: {
              background: 'transparent',
              color: 'var(--accent-text)',
              fontSize: '13px',
              fontWeight: 600,
            },
          }}
        />
      </DeepSeekKeyGate>
    </MotionConfig>
  );
}
