'use client';

import { useState, type FormEvent } from 'react';
import { ApiError, aiErrorCodeOf, saveDeepSeekKey } from '../lib/api-client';
import { Button } from './button';
import { ErrorMessage } from './error-message';
import { StatusRegion } from './status-region';

const KEY_FIELD_ID = 'deepseek-key';
const HTTP_UNPROCESSABLE_ENTITY = 422;

const KEY_REJECTED_MESSAGE = 'A DeepSeek recusou essa chave. Confira a chave e tente de novo.';
const UNCHECKABLE_MESSAGE = 'Não foi possível conferir a chave agora. Tente de novo.';
const ZERO_BALANCE_MESSAGE =
  'Chave salva, mas o saldo da sua conta na DeepSeek está zerado. Recarregue na DeepSeek: as próximas ações de IA vão falhar até lá.';
const SAVED_MESSAGE = 'Chave salva.';

interface DeepSeekKeyFormProps {
  readonly onSaved?: (isAvailable: boolean) => void;
}

export function DeepSeekKeyForm({ onSaved }: DeepSeekKeyFormProps): React.JSX.Element {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submitDisabled = apiKey.trim().length === 0 || isSaving;

  function submitKey(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitDisabled) return;
    setIsSaving(true);
    setFailure(null);
    setNotice(null);
    void (async () => {
      try {
        const result = await saveDeepSeekKey(apiKey.trim());
        if (!result.balance.isAvailable) {
          setNotice(ZERO_BALANCE_MESSAGE);
        } else {
          setNotice(SAVED_MESSAGE);
        }
        setApiKey('');
        onSaved?.(result.balance.isAvailable);
      } catch (error: unknown) {
        setFailure(describeSaveFailure(error));
      } finally {
        setIsSaving(false);
      }
    })();
  }

  return (
    <form onSubmit={submitKey} className="flex flex-col gap-3">
      <p className="text-sm text-text-2">
        A chave libera as chamadas de IA e o custo é cobrado da sua conta na DeepSeek.{' '}
        <a
          href="https://platform.deepseek.com/api_keys"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-accent-text underline"
        >
          Crie uma chave na DeepSeek
        </a>
        .
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={KEY_FIELD_ID} className="text-[13px] font-medium text-text-2">
          Chave da DeepSeek
        </label>
        <div className="flex gap-2">
          <input
            id={KEY_FIELD_ID}
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface px-3 text-text hover:border-border-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          />
          <Button type="button" variant="secondary" onClick={() => setShowKey(!showKey)}>
            {showKey ? 'Ocultar' : 'Mostrar'}
          </Button>
        </div>
      </div>
      {failure !== null && <ErrorMessage message={failure} />}
      <StatusRegion>{notice ?? ''}</StatusRegion>
      <Button type="submit" disabled={submitDisabled}>
        Salvar chave
      </Button>
    </form>
  );
}

function describeSaveFailure(error: unknown): string {
  if (error instanceof ApiError) {
    const code = aiErrorCodeOf(error);
    if (code === 'ai_key_rejected' || error.status === HTTP_UNPROCESSABLE_ENTITY) {
      return KEY_REJECTED_MESSAGE;
    }
  }
  return UNCHECKABLE_MESSAGE;
}
