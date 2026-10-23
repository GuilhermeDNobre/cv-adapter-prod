'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import { aiErrorCodeOf, deleteResume, updateResumeSettings } from '../../lib/api-client';
import { aiErrorMessageForCode } from '../../lib/ai-error-messages';
import { Button } from '../button';
import { ErrorMessage } from '../error-message';
import { LabeledInput } from '../labeled-input';
import { LabeledSelect } from '../labeled-select';
import { StatusRegion } from '../status-region';

const SAVED_ANNOUNCEMENT = 'Configurações do documento salvas.';
const SAVING_ANNOUNCEMENT = 'Salvando as configurações do documento.';
const UNREACHABLE_MESSAGE =
  'Não foi possível concluir agora. Confira se o cv-adapter está rodando ' +
  '(docker compose ps) e tente de novo.';

function failureMessageOf(error: unknown): string {
  const code = aiErrorCodeOf(error);
  if (code !== null) return aiErrorMessageForCode(code);
  return UNREACHABLE_MESSAGE;
}

interface DocumentSettingsPanelProps {
  readonly resume: ResumeDocumentResponse;
  readonly onDocumentChange: (document: ResumeDocumentResponse) => void;
}

export function DocumentSettingsPanel({
  resume,
  onDocumentChange,
}: DocumentSettingsPanelProps): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState<string>(resume.name);
  const [template, setTemplate] = useState<string>(resume.template);
  const [lengthTarget, setLengthTarget] = useState(String(resume.lengthTarget));
  const [writingMethod, setWritingMethod] = useState<string>(resume.writingMethod);
  const [tone, setTone] = useState<string>(resume.tone);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);
  const wasConfirmingRef = useRef(false);

  useEffect(() => {
    if (confirmingDelete && !wasConfirmingRef.current) {
      deleteCancelRef.current?.focus();
    }
    if (!confirmingDelete && wasConfirmingRef.current) {
      deleteTriggerRef.current?.focus();
    }
    wasConfirmingRef.current = confirmingDelete;
  }, [confirmingDelete]);

  const dirty =
    name.trim() !== resume.name ||
    template !== resume.template ||
    lengthTarget !== String(resume.lengthTarget) ||
    writingMethod !== resume.writingMethod ||
    tone !== resume.tone;

  function save(): void {
    if (!dirty || isBusy) return;
    if (name.trim() === '') return;
    setIsBusy(true);
    setFailure(null);
    setSaved(false);
    void (async () => {
      try {
        const document = await updateResumeSettings(resume.id, {
          name: name.trim(),
          template: template as ResumeDocumentResponse['template'],
          lengthTarget: (lengthTarget === '1' ? 1 : 2) as 1 | 2,
          writingMethod: writingMethod as ResumeDocumentResponse['writingMethod'],
          tone: tone as ResumeDocumentResponse['tone'],
        });
        onDocumentChange(document);
        setSaved(true);
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function confirmDelete(): void {
    setIsBusy(true);
    setFailure(null);
    void (async () => {
      try {
        await deleteResume(resume.id);
        router.replace('/curriculos');
      } catch (error: unknown) {
        setFailure(failureMessageOf(error));
        setIsBusy(false);
        setConfirmingDelete(false);
      }
    })();
  }

  return (
    <section aria-label="Configurações do documento" className="flex flex-col gap-3">
      <h3 className="text-xl font-bold text-text">Configurações do documento</h3>
      <LabeledInput
        id={`settings-${resume.id}-name`}
        label="Nome do currículo"
        value={name}
        onChange={setName}
      />
      <LabeledSelect
        id={`settings-${resume.id}-template`}
        label="Template"
        value={template}
        options={[
          { value: 'comfortable', label: 'Confortável' },
          { value: 'dense', label: 'Denso' },
        ]}
        onCommit={setTemplate}
      />
      <LabeledSelect
        id={`settings-${resume.id}-length`}
        label="Length Target"
        value={lengthTarget}
        options={[
          { value: '1', label: '1 página' },
          { value: '2', label: '2 páginas' },
        ]}
        onCommit={setLengthTarget}
      />
      <LabeledSelect
        id={`settings-${resume.id}-method`}
        label="Writing Method"
        value={writingMethod}
        options={[
          { value: 'star', label: 'STAR' },
          { value: 'xyz', label: 'XYZ' },
          { value: 'car', label: 'CAR' },
          { value: 'apr', label: 'APR' },
          { value: 'free', label: 'Livre' },
        ]}
        onCommit={setWritingMethod}
      />
      <LabeledSelect
        id={`settings-${resume.id}-tone`}
        label="Tone"
        value={tone}
        options={[
          { value: 'formal', label: 'Formal' },
          { value: 'direct', label: 'Direto' },
          { value: 'technical', label: 'Técnico' },
        ]}
        onCommit={setTone}
      />
      <p className="text-sm text-text-2">
        Trocar o Writing Method ou o Tone reescreve os Bullets afetados neste documento, sem tocar
        no Base Resume.
      </p>
      <div>
        <Button type="button" disabled={!dirty || isBusy || name.trim() === ''} onClick={save}>
          Salvar configurações
        </Button>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div>
          <button
            ref={deleteTriggerRef}
            type="button"
            disabled={confirmingDelete}
            onClick={() => setConfirmingDelete(true)}
            className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3"
          >
            Apagar este currículo
          </button>
        </div>
        {confirmingDelete && (
          <div className="flex flex-col gap-2">
            <p className="font-medium text-text">
              Tem certeza? O documento e seus PDFs exportados somem. O Career Profile continua
              intacto. Não há como desfazer.
            </p>
            <div className="flex gap-2">
              <Button type="button" disabled={isBusy} onClick={confirmDelete}>
                Confirmar apagar currículo
              </Button>
              <button
                ref={deleteCancelRef}
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-md border border-border-strong px-4 py-2 font-semibold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{isBusy ? SAVING_ANNOUNCEMENT : saved ? SAVED_ANNOUNCEMENT : ''}</StatusRegion>
    </section>
  );
}
