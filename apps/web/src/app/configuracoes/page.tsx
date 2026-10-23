'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DeepSeekKeyStatus } from 'schema/contracts/settings';
import { getDeepSeekKeyStatus } from '../../lib/api-client';
import { DeepSeekKeyForm } from '../../components/deepseek-key-form';
import { DeepSeekBalancePanel } from '../../components/deepseek-balance-panel';
import { DataErasurePanel } from '../../components/data-erasure-panel';
import { StatusRegion } from '../../components/status-region';
import { Card, CardHeader } from '../../components/ui/card';

const LOADING_MESSAGE = 'Carregando configurações.';

export default function ConfiguracoesPage(): React.JSX.Element {
  const [keyStatus, setKeyStatus] = useState<DeepSeekKeyStatus | null>(null);

  const refreshStatus = useCallback(() => {
    void (async () => {
      try {
        const status = await getDeepSeekKeyStatus();
        setKeyStatus(status);
      } catch {
        setKeyStatus(null);
      }
    })();
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Configurações</h1>
      </header>
      <section aria-label="Chave da DeepSeek">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold tracking-[-0.01em] text-text">
              Chave da DeepSeek
            </h2>
          </CardHeader>
          <div className="flex flex-col gap-3 p-4">
            {keyStatus === null ? (
              <StatusRegion>{LOADING_MESSAGE}</StatusRegion>
            ) : keyStatus.configured && keyStatus.lastFour !== null ? (
              <p className="text-sm text-text-2">
                Chave salva terminando em •••• {keyStatus.lastFour}.
              </p>
            ) : (
              <p className="text-sm text-text-2">Nenhuma chave salva ainda.</p>
            )}
            <DeepSeekKeyForm onSaved={refreshStatus} />
          </div>
        </Card>
      </section>
      <DeepSeekBalancePanel />
      <DataErasurePanel />
    </main>
  );
}
