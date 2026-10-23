'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import {
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  useWizardState,
  wizardHrefFor,
  type WizardRouteIds,
  type WizardStepId,
} from './use-wizard-state';
import { Button, buttonClasses } from '../button';
import { DIALOG_MS, EASE_OUT } from '../../lib/motion';

interface WizardFooterProps {
  readonly current: WizardStepId;
  readonly ids: WizardRouteIds;
}

const BLOCKED_REASON_ID = 'wizard-advance-blocked-reason';
const INVALIDATE_DIALOG_TITLE = 'Voltar pode invalidar etapas seguintes';

function prevOf(current: WizardStepId): WizardStepId | null {
  const index = WIZARD_STEPS.indexOf(current);
  if (index <= 0) return null;
  const prev = WIZARD_STEPS[index - 1];
  return prev ?? null;
}

function nextOf(current: WizardStepId): WizardStepId | null {
  const index = WIZARD_STEPS.indexOf(current);
  if (index < 0 || index >= WIZARD_STEPS.length - 1) return null;
  const next = WIZARD_STEPS[index + 1];
  return next ?? null;
}

export function WizardFooter({ current, ids }: WizardFooterProps): React.JSX.Element {
  const { steps, ids: derivedIds, canAdvance, blockedReason } = useWizardState(current, ids);
  const [confirmingBack, setConfirmingBack] = useState(false);
  const prev = prevOf(current);
  const next = nextOf(current);
  const prevHref = prev === null ? null : wizardHrefFor(prev, derivedIds);
  const nextHref = next === null ? null : wizardHrefFor(next, derivedIds);
  const prevIndex = prev === null ? -1 : WIZARD_STEPS.indexOf(prev);
  const laterDone = steps.filter((step, index) => index > prevIndex && step.done);
  const needsWarning = prev !== null && laterDone.length > 0;

  return (
    <footer className="sticky bottom-0 z-[15] border-t border-border bg-bg">
      <div className="mx-auto flex w-full max-w-[1160px] items-start justify-between gap-4 px-8 py-[14px]">
        <div className="flex">
          {prev !== null && prevHref !== null && !needsWarning && (
            <Link href={prevHref} className={`${buttonClasses('secondary', 'md')} pl-3`}>
              <span aria-hidden="true" className="flex">
                <ArrowLeft size={14} strokeWidth={1.6} aria-hidden="true" />
              </span>
              Voltar para {WIZARD_STEP_LABELS[prev]}
            </Link>
          )}
          {prev !== null && prevHref !== null && needsWarning && (
            <Dialog.Root open={confirmingBack} onOpenChange={setConfirmingBack}>
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  className={`${buttonClasses('secondary', 'md')} pl-3`}
                >
                  <span aria-hidden="true" className="flex">
                    <ArrowLeft size={14} strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  Voltar para {WIZARD_STEP_LABELS[prev]}
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-scrim" />
                <Dialog.Content asChild>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97, x: '-50%', y: 'calc(-50% + 4px)' }}
                    animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                    transition={{ duration: DIALOG_MS / 1000, ease: EASE_OUT }}
                    className="fixed left-1/2 top-1/2 w-[min(420px,100%)] rounded-xl bg-surface p-5 shadow-lg"
                  >
                    <Dialog.Title className="text-base font-semibold text-text">
                      {INVALIDATE_DIALOG_TITLE}
                    </Dialog.Title>
                    <Dialog.Description className="mt-2 text-sm text-text-2">
                      {`Voltar para ${WIZARD_STEP_LABELS[prev]} pode deixar de concluir: ${laterDone.map((step) => WIZARD_STEP_LABELS[step.id]).join(', ')}. O conteúdo já produzido não é apagado, mas um novo insumo invalida as seguintes.`}
                    </Dialog.Description>
                    <div className="mt-4 flex justify-end gap-2">
                      <Dialog.Close asChild>
                        <button type="button" className={buttonClasses('secondary', 'md')}>
                          Cancelar
                        </button>
                      </Dialog.Close>
                      <Link href={prevHref} className={buttonClasses('primary', 'md')}>
                        Voltar mesmo assim
                      </Link>
                    </div>
                  </motion.div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          )}
        </div>
        {next !== null && nextHref !== null && (
          <div className="flex flex-col items-end gap-1.5">
            {canAdvance ? (
              <Link href={nextHref} className={`${buttonClasses('primary', 'md')} pr-3`}>
                Avançar para {WIZARD_STEP_LABELS[next]}
                <span aria-hidden="true" className="flex">
                  <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
                </span>
              </Link>
            ) : (
              <>
                <Button
                  disabled
                  aria-describedby={blockedReason === null ? undefined : BLOCKED_REASON_ID}
                  iconRight={
                    <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
                  }
                >
                  Avançar para {WIZARD_STEP_LABELS[next]}
                </Button>
                {blockedReason !== null && (
                  <p id={BLOCKED_REASON_ID} className="text-xs text-text-2">
                    {blockedReason}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
