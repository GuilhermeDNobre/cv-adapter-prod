import { redirect } from 'next/navigation';
import { SourceDocumentForm } from './source-document-form';
import { resumeStepHref } from '../../../components/wizard/wizard-route';

interface ImportacaoPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ImportacaoPage({
  searchParams,
}: ImportacaoPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const rawVaga = params['vaga'];
  const rawAvaliacao = params['avaliacao'];
  const jobDescriptionId = typeof rawVaga === 'string' ? rawVaga : undefined;
  const evaluationId = typeof rawAvaliacao === 'string' ? rawAvaliacao : undefined;
  if (jobDescriptionId !== undefined && jobDescriptionId !== '') {
    redirect(resumeStepHref({ jobDescriptionId, evaluationId }));
  }
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Envie o currículo que você já tem</h1>
        <p className="text-text-2">
          Nada precisa ser digitado de novo: você manda o arquivo e a gente lê dele o conteúdo,
          que depois é conferido por você antes de virar seu perfil. A leitura não é instantânea
          — você verá o andamento aqui, etapa por etapa.
        </p>
      </header>
      <SourceDocumentForm />
    </main>
  );
}
