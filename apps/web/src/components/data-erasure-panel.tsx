'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertDialog } from 'radix-ui';
import { motion } from 'motion/react';
import { eraseData, type DataErasureScope } from '../lib/api-client';
import { Button, buttonClasses } from './button';
import { Card, CardHeader } from './ui/card';
import { ErrorMessage } from './error-message';
import { StatusRegion } from './status-region';
import { DIALOG_MS, EASE_OUT } from '../lib/motion';

const CONFIRM_WORD = 'APAGAR';

export const ERASE_EVERYTHING_MESSAGE =
  'Todos os dados foram apagados. A chave da DeepSeek continua salva e o cv-adapter está pronto para uso.';

const ERASED_MESSAGES: Readonly<Record<Exclude<DataErasureScope, 'everything'>, string>> = {
  job_descriptions: 'Vagas e avaliações apagadas. Seu Career Profile continua intacto.',
  career_profile: 'Career Profile apagado, com importações e arquivos. As vagas continuam salvas.',
  resumes: 'Currículos apagados, com os PDFs exportados. Career Profile, vagas e avaliações continuam salvos.',
};

const ERASE_FAILED_MESSAGE = 'Não foi possível apagar agora. Tente de novo.';

interface PartialOptionProps {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly isBusy: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}

function PartialOption({
  title,
  description,
  confirmLabel,
  isBusy,
  open,
  onOpenChange,
  onConfirm,
}: PartialOptionProps): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      cancelRef.current?.focus();
    }
    if (!open && wasOpenRef.current) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  return (
    <Card className="flex flex-col gap-2 p-4">
      <h3 className="font-semibold text-text">{title}</h3>
      <p className="text-sm text-text-2">{description}</p>
      <div>
        <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
          <AlertDialog.Trigger asChild>
            <button
              ref={triggerRef}
              type="button"
              disabled={isBusy}
              className={`${buttonClasses('danger', 'md')} w-fit`}
            >
              {title}
            </button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 bg-scrim" />
            <AlertDialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.97, x: '-50%', y: 'calc(-50% + 4px)' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                transition={{ duration: DIALOG_MS / 1000, ease: EASE_OUT }}
                className="fixed left-1/2 top-1/2 w-[min(420px,100%)] rounded-xl bg-surface p-5 shadow-lg"
              >
                <AlertDialog.Title className="text-base font-semibold text-text">
                  {title}
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-2 text-sm text-text-2">
                  Tem certeza? Não há como desfazer.
                </AlertDialog.Description>
                <div className="mt-4 flex justify-end gap-2">
                  <AlertDialog.Cancel asChild>
                    <button
                      ref={cancelRef}
                      type="button"
                      className={buttonClasses('secondary', 'md')}
                    >
                      Cancelar
                    </button>
                  </AlertDialog.Cancel>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={isBusy}
                    onClick={onConfirm}
                  >
                    {confirmLabel}
                  </Button>
                </div>
              </motion.div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
    </Card>
  );
}

export function DataErasurePanel(): React.JSX.Element {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Exclude<DataErasureScope, 'everything'> | null>(null);
  const [isWipeOpen, setIsWipeOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [lastErased, setLastErased] = useState<Exclude<DataErasureScope, 'everything'> | null>(null);
  const wipeInputId = 'erase-everything-confirm';
  const wipeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wipeCancelRef = useRef<HTMLButtonElement | null>(null);
  const wasWipeOpenRef = useRef(false);

  useEffect(() => {
    if (isWipeOpen && !wasWipeOpenRef.current) {
      wipeCancelRef.current?.focus();
    }
    if (!isWipeOpen && wasWipeOpenRef.current) {
      wipeTriggerRef.current?.focus();
    }
    wasWipeOpenRef.current = isWipeOpen;
  }, [isWipeOpen]);

  const wipeEnabled = confirmText === CONFIRM_WORD && !isBusy;

  async function runErase(scope: DataErasureScope): Promise<void> {
    setIsBusy(true);
    setFailure(null);
    try {
      await eraseData(scope);
      if (scope === 'everything') {
        router.push('/?dados=zerados');
        return;
      }
      setLastErased(scope);
      setConfirmText('');
      setConfirming(null);
    } catch {
      setFailure(ERASE_FAILED_MESSAGE);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section aria-label="Apagar dados">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold tracking-[-0.01em] text-text">Apagar dados</h2>
        </CardHeader>
        <div className="flex flex-col gap-4 p-4">
          <PartialOption
            title="Apagar vagas e avaliações"
            description="Remove todas as vagas coladas, seus Requirements, todas as Evaluations e os Tailored Resumes daquelas vagas. O Career Profile fica intacto. Não há como desfazer."
            confirmLabel="Confirmar apagar vagas"
            isBusy={isBusy}
            open={confirming === 'job_descriptions'}
            onOpenChange={(open) => setConfirming(open ? 'job_descriptions' : null)}
            onConfirm={() => void runErase('job_descriptions')}
          />
          <PartialOption
            title="Apagar Career Profile"
            description="Remove contatos, experiências, formação, Evidences, as respostas “não tenho isso”, todas as importações, todos os arquivos enviados e todos os currículos. As Evaluations também são apagadas, porque foram calculadas sobre este perfil. As vagas ficam. Não há como desfazer."
            confirmLabel="Confirmar apagar perfil"
            isBusy={isBusy}
            open={confirming === 'career_profile'}
            onOpenChange={(open) => setConfirming(open ? 'career_profile' : null)}
            onConfirm={() => void runErase('career_profile')}
          />
          <PartialOption
            title="Apagar currículos"
            description="Remove todos os Base Resumes, Tailored Resumes e PDFs exportados. O Career Profile, as vagas, as Evaluations e a chave continuam salvos. Não há como desfazer."
            confirmLabel="Confirmar apagar currículos"
            isBusy={isBusy}
            open={confirming === 'resumes'}
            onOpenChange={(open) => setConfirming(open ? 'resumes' : null)}
            onConfirm={() => void runErase('resumes')}
          />
          <Card className="flex flex-col gap-2 p-4">
            <h3 className="font-semibold text-text">Zerar tudo</h3>
            <p className="text-sm text-text-2">
              Remove todos os dados de todas as opções acima. A chave da DeepSeek continua salva. Não há
              como desfazer.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={wipeInputId} className="text-[13px] font-medium text-text-2">
                Digite {CONFIRM_WORD} para habilitar
              </label>
              <input
                id={wipeInputId}
                type="text"
                value={confirmText}
                autoComplete="off"
                onChange={(event) => setConfirmText(event.target.value)}
                className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-text hover:border-border-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              />
            </div>
            <div>
              <AlertDialog.Root open={isWipeOpen} onOpenChange={setIsWipeOpen}>
                <AlertDialog.Trigger asChild>
                  <button
                    ref={wipeTriggerRef}
                    type="button"
                    disabled={!wipeEnabled}
                    className={`${buttonClasses('danger', 'md')} w-fit`}
                  >
                    Zerar tudo
                  </button>
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className="fixed inset-0 bg-scrim" />
                  <AlertDialog.Content asChild>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97, x: '-50%', y: 'calc(-50% + 4px)' }}
                      animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                      transition={{ duration: DIALOG_MS / 1000, ease: EASE_OUT }}
                      className="fixed left-1/2 top-1/2 w-[min(420px,100%)] rounded-xl bg-surface p-5 shadow-lg"
                    >
                      <AlertDialog.Title className="text-base font-semibold text-text">
                        Zerar tudo
                      </AlertDialog.Title>
                      <AlertDialog.Description className="mt-2 text-sm text-text-2">
                        Tem certeza? Não há como desfazer. Remove todos os dados de todas as opções
                        acima. A chave da DeepSeek continua salva.
                      </AlertDialog.Description>
                      <div className="mt-4 flex justify-end gap-2">
                        <AlertDialog.Cancel asChild>
                          <button
                            ref={wipeCancelRef}
                            type="button"
                            className={buttonClasses('secondary', 'md')}
                          >
                            Cancelar
                          </button>
                        </AlertDialog.Cancel>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={isBusy}
                          onClick={() => void runErase('everything')}
                        >
                          Confirmar zerar tudo
                        </Button>
                      </div>
                    </motion.div>
                  </AlertDialog.Content>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            </div>
          </Card>
          {failure !== null && <ErrorMessage message={failure} />}
          <StatusRegion>{lastErased === null ? '' : ERASED_MESSAGES[lastErased]}</StatusRegion>
        </div>
      </Card>
    </section>
  );
}
