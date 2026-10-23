import { EvaluationKickoff } from './components/evaluation-kickoff';
import { WizardFooter } from '../../../components/wizard/wizard-footer';

const JOB_DESCRIPTION_ID_PARAM = 'vaga';
const BASE_RESUME_ID_PARAM = 'base';

interface AvaliacaoPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AvaliacaoPage({
  searchParams,
}: AvaliacaoPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const rawJobDescriptionId = params[JOB_DESCRIPTION_ID_PARAM];
  const jobDescriptionId =
    typeof rawJobDescriptionId === 'string' ? rawJobDescriptionId : null;
  const rawBaseResumeId = params[BASE_RESUME_ID_PARAM];
  const baseResumeId = typeof rawBaseResumeId === 'string' ? rawBaseResumeId : undefined;

  return (
    <main className="mx-auto flex w-full max-w-[860px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Sua Evaluation</h1>
      </header>
      <EvaluationKickoff jobDescriptionId={jobDescriptionId} baseResumeId={baseResumeId} />
      <WizardFooter
        current="avaliacao"
        ids={{ jobDescriptionId: jobDescriptionId ?? undefined, baseResumeId }}
      />
    </main>
  );
}
