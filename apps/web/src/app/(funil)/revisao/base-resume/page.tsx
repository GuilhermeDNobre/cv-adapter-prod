import { ProposalScreen } from './proposal-screen';

interface BaseResumePageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BaseResumePage({
  searchParams,
}: BaseResumePageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const rawResumeImportId = params['resumeImportId'];
  const resumeImportId = typeof rawResumeImportId === 'string' ? rawResumeImportId : null;
  const rawVaga = params['vaga'];
  const rawAvaliacao = params['avaliacao'];
  const jobDescriptionId = typeof rawVaga === 'string' ? rawVaga : undefined;
  const evaluationId = typeof rawAvaliacao === 'string' ? rawAvaliacao : undefined;
  return (
    <main className="mx-auto flex w-full max-w-[830px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">
          Confira o Base Resume montado
        </h1>
        <p className="text-text-2">
          A IA reescreveu seus bullets no estilo do seu envio. Escolha por bullet o que fica:
          nada é salvo sem a sua aprovação.
        </p>
      </header>
      <ProposalScreen
        resumeImportId={resumeImportId}
        jobDescriptionId={jobDescriptionId}
        evaluationId={evaluationId}
      />
    </main>
  );
}
