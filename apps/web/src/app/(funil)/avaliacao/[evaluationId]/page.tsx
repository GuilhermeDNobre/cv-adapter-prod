import { EvaluationScreen } from '../components/evaluation-screen';
import { WizardFooter } from '../../../../components/wizard/wizard-footer';

interface AvaliacaoDetailPageProps {
  readonly params: Promise<{ readonly evaluationId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AvaliacaoDetailPage({
  params,
  searchParams,
}: AvaliacaoDetailPageProps): Promise<React.JSX.Element> {
  const { evaluationId } = await params;
  const query = await searchParams;
  const rawJobId = query['vaga'];
  const jobDescriptionId = typeof rawJobId === 'string' ? rawJobId : null;
  const rawBaseResumeId = query['base'];
  const baseResumeId = typeof rawBaseResumeId === 'string' ? rawBaseResumeId : undefined;

  return (
    <main className="mx-auto flex w-full max-w-[860px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Sua Evaluation</h1>
        <p className="text-text-2">
          O Match Score diz quanto da vaga seu Career Profile já comprova. A lista item a item
          mostra onde está a prova — e o que ainda está em aberto.
        </p>
      </header>
      <EvaluationScreen evaluationId={evaluationId} jobDescriptionId={jobDescriptionId} />
      <WizardFooter
        current="avaliacao"
        ids={{ jobDescriptionId: jobDescriptionId ?? undefined, evaluationId, baseResumeId }}
      />
    </main>
  );
}
