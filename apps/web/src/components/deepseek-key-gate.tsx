'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDeepSeekKeyStatus } from '../lib/api-client';
import { StatusRegion } from './status-region';
import { ErrorMessage } from './error-message';

const KEY_ROUTE = '/chave';
const CHECKING_MESSAGE = 'Verificando a chave da DeepSeek.';
const UNREACHABLE_MESSAGE =
  'Não foi possível falar com o cv-adapter. Confira se ele está rodando (docker compose ps) e tente de novo.';

type GateStage = { readonly kind: 'checking' } | { readonly kind: 'open' } | { readonly kind: 'unreachable' };

interface DeepSeekKeyGateProps {
  readonly children: React.ReactNode;
}

export function DeepSeekKeyGate({ children }: DeepSeekKeyGateProps): React.JSX.Element {
  const router = useRouter();
  const [stage, setStage] = useState<GateStage>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await getDeepSeekKeyStatus();
        if (cancelled) return;
        if (status.configured) {
          setStage({ kind: 'open' });
        } else {
          router.replace(KEY_ROUTE);
        }
      } catch {
        if (cancelled) return;
        setStage({ kind: 'unreachable' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (stage.kind === 'unreachable') {
    return (
      <div className="flex flex-col gap-4">
        <ErrorMessage message={UNREACHABLE_MESSAGE} />
        <StatusRegion>{''}</StatusRegion>
      </div>
    );
  }
  if (stage.kind === 'checking') {
    return <StatusRegion>{CHECKING_MESSAGE}</StatusRegion>;
  }
  return <>{children}</>;
}
