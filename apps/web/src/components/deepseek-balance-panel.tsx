'use client';

import { useEffect, useState } from 'react';
import { getDeepSeekBalance } from '../lib/api-client';
import { aiErrorMessageFor } from '../lib/ai-error-messages';
import type { DeepSeekBalance } from 'schema/contracts/settings';
import { ErrorMessage } from './error-message';
import { StatusRegion } from './status-region';
import { Card, CardHeader } from './ui/card';

const LOADING_MESSAGE = 'Consultando o saldo da DeepSeek.';
const ZERO_BALANCE_MESSAGE =
  'O saldo da sua conta na DeepSeek está zerado. Recarregue na DeepSeek: as próximas ações de IA vão falhar até lá.';
const UNAVAILABLE_MESSAGE = 'Não foi possível consultar o saldo agora.';

export function DeepSeekBalancePanel(): React.JSX.Element {
  const [balance, setBalance] = useState<DeepSeekBalance | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await getDeepSeekBalance();
        if (cancelled) return;
        setBalance(current);
      } catch (error) {
        if (cancelled) return;
        setFailureMessage(aiErrorMessageFor(error, UNAVAILABLE_MESSAGE));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (balance === null && failureMessage === null) {
    return <StatusRegion>{LOADING_MESSAGE}</StatusRegion>;
  }

  return (
    <section aria-label="Saldo da DeepSeek">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold tracking-[-0.01em] text-text">
            Saldo da DeepSeek
          </h2>
        </CardHeader>
        <div className="flex flex-col gap-2 p-4">
          {balance !== null && (
            <div className="flex flex-col gap-2">
              <ul className="flex flex-col gap-1">
                {balance.balances.map((entry) => (
                  <li key={entry.currency} className="text-sm tabular-nums text-text">
                    {entry.currency}: {entry.totalBalance}
                  </li>
                ))}
              </ul>
              {!balance.isAvailable && <ErrorMessage message={ZERO_BALANCE_MESSAGE} />}
            </div>
          )}
          {failureMessage !== null && <p className="text-sm text-text-2">{failureMessage}</p>}
          <StatusRegion>{''}</StatusRegion>
        </div>
      </Card>
    </section>
  );
}
