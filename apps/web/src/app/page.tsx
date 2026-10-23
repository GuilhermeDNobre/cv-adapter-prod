'use client';

import { useEffect, useState } from 'react';
import { BriefcaseBusiness, FileUser, Settings } from 'lucide-react';
import { DeepSeekKeyGate } from '../components/deepseek-key-gate';
import { StatusRegion } from '../components/status-region';
import { HomeEntryCard } from '../components/home-entry-card';
import { ERASE_EVERYTHING_MESSAGE } from '../components/data-erasure-panel';

const ADAPT_DESCRIPTION =
  'Cole o anúncio, escolha um currículo salvo ou envie um novo e veja a avaliação antes de gerar a ' +
  'versão adaptada.';
const RESUMES_DESCRIPTION =
  'Envie um currículo, confira o que a IA leu e gerencie os currículos que você já salvou.';
const SETTINGS_DESCRIPTION = 'Chave da DeepSeek, saldo da conta e apagar dados.';

export default function HomePage(): React.JSX.Element {
  const [erasureMessage, setErasureMessage] = useState('');
  const [jobDescriptionId, setJobDescriptionId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('dados') === 'zerados') {
      setErasureMessage(ERASE_EVERYTHING_MESSAGE);
    }
    const vaga = params.get('vaga');
    if (vaga !== null && vaga !== '') setJobDescriptionId(vaga);
  }, []);
  const adaptHref =
    jobDescriptionId === undefined ? '/vaga' : `/vaga?vaga=${encodeURIComponent(jobDescriptionId)}`;
  return (
    <DeepSeekKeyGate>
      <main className="mx-auto flex w-full max-w-[1160px] flex-col gap-7 px-8 pb-8 pt-7">
        <StatusRegion>{erasureMessage}</StatusRegion>
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">cv-adapter</h1>
          <p className="text-text-2">Adapte seu currículo a uma vaga com IA. Escolha por onde começar.</p>
        </header>
        <nav aria-label="O que você quer fazer">
          <ul className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <li className="md:row-span-2">
              <HomeEntryCard
                variant="primary"
                href={adaptHref}
                icon={BriefcaseBusiness}
                title="Adaptar para uma vaga"
                description={ADAPT_DESCRIPTION}
              />
            </li>
            <li>
              <HomeEntryCard
                href="/curriculos"
                icon={FileUser}
                title="Meus currículos"
                description={RESUMES_DESCRIPTION}
              />
            </li>
            <li>
              <HomeEntryCard
                href="/configuracoes"
                icon={Settings}
                title="Configurações"
                description={SETTINGS_DESCRIPTION}
              />
            </li>
          </ul>
        </nav>
      </main>
    </DeepSeekKeyGate>
  );
}
