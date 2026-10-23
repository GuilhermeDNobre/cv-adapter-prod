import { ResumeStep } from './resume-step';

interface CurriculoPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CurriculoPage({
  searchParams,
}: CurriculoPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const rawVaga = params['vaga'];
  const rawAvaliacao = params['avaliacao'];
  const rawBase = params['base'];
  const jobDescriptionId = typeof rawVaga === 'string' ? rawVaga : undefined;
  const evaluationId = typeof rawAvaliacao === 'string' ? rawAvaliacao : undefined;
  const baseResumeId = typeof rawBase === 'string' ? rawBase : undefined;
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Escolha o currículo</h1>
        <p className="text-text-2">
          A Evaluation compara a vaga com todo o seu Career Profile. Escolha o Base Resume que
          serve de ponto de partida para a adaptação, ou envie um currículo novo.
        </p>
      </header>
      <ResumeStep
        jobDescriptionId={jobDescriptionId}
        evaluationId={evaluationId}
        initialBaseResumeId={baseResumeId}
      />
    </main>
  );
}
