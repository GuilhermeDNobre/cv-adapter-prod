import BaseResumeForm from './base-resume-form';
import { AdaptarScreen } from './adaptar-screen';
import { WizardFooter } from '../../../components/wizard/wizard-footer';

interface AdaptarPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdaptarPage({
  searchParams,
}: AdaptarPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const rawVaga = params['vaga'];
  const rawAvaliacao = params['avaliacao'];
  const rawBase = params['base'];
  const jobDescriptionId = typeof rawVaga === 'string' ? rawVaga : null;
  const evaluationId = typeof rawAvaliacao === 'string' ? rawAvaliacao : null;
  const baseResumeId = typeof rawBase === 'string' ? rawBase : undefined;

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Adaptar</h1>
        <p className="text-text-2">
          Escolha o Base Resume de partida e gere o Tailored Resume para esta vaga. Se ainda não
          tem um Base Resume, crie abaixo.
        </p>
      </header>
      <AdaptarScreen
        jobDescriptionId={jobDescriptionId}
        evaluationId={evaluationId}
        preferredBaseResumeId={baseResumeId}
      />
      <section aria-label="Criar novo Base Resume" className="flex flex-col gap-4">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-text">Criar novo Base Resume</h2>
        <BaseResumeForm />
      </section>
      <WizardFooter
        current="adaptar"
        ids={{
          jobDescriptionId: jobDescriptionId ?? undefined,
          evaluationId: evaluationId ?? undefined,
          baseResumeId,
        }}
      />
    </main>
  );
}
