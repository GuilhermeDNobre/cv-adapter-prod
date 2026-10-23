import { ExportarScreen } from './exportar-screen';
import { WizardFooter } from '../../../../components/wizard/wizard-footer';

interface ExportarPageProps {
  readonly params: Promise<{ readonly resumeId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExportarPage({
  params,
  searchParams,
}: ExportarPageProps): Promise<React.JSX.Element> {
  const { resumeId } = await params;
  const query = await searchParams;
  const rawVaga = query['vaga'];
  const rawAvaliacao = query['avaliacao'];
  const jobDescriptionId = typeof rawVaga === 'string' ? rawVaga : undefined;
  const evaluationId = typeof rawAvaliacao === 'string' ? rawAvaliacao : undefined;

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Exportar</h1>
        <p className="text-text-2">
          Confira a pré-visualização paginada e exporte o PDF no Length Target.
        </p>
      </header>
      <ExportarScreen resumeId={resumeId} />
      <WizardFooter current="exportar" ids={{ jobDescriptionId, evaluationId, resumeId }} />
    </main>
  );
}
