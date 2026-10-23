import { ReviewScreen } from './review-screen';

const RESUME_IMPORT_ID_PARAM = 'resumeImportId';

interface RevisaoPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RevisaoPage({
  searchParams,
}: RevisaoPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const rawResumeImportId = params[RESUME_IMPORT_ID_PARAM];
  const resumeImportId = typeof rawResumeImportId === 'string' ? rawResumeImportId : null;
  const rawVaga = params['vaga'];
  const rawAvaliacao = params['avaliacao'];
  const jobDescriptionId = typeof rawVaga === 'string' ? rawVaga : undefined;
  const evaluationId = typeof rawAvaliacao === 'string' ? rawAvaliacao : undefined;

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">
          Confira o que lemos do seu currículo
        </h1>
        <p className="text-text-2">
          Cada item abaixo já chega marcado como conferido e pronto — você não precisa tocar em
          nada para avançar. Corrija, remova ou acrescente apenas o que estiver errado: as
          correções são salvas conforme você avança, então dá para sair e voltar de onde parou.
        </p>
      </header>
      <ReviewScreen
        resumeImportId={resumeImportId}
        jobDescriptionId={jobDescriptionId}
        evaluationId={evaluationId}
      />
    </main>
  );
}
