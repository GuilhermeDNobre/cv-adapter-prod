import { ProntoScreen } from './pronto-screen';

interface ProntoPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProntoPage({
  searchParams,
}: ProntoPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const rawResumeId = params['resumeId'];
  const resumeId = typeof rawResumeId === 'string' ? rawResumeId : undefined;
  const rawVaga = params['vaga'];
  const jobDescriptionId = typeof rawVaga === 'string' ? rawVaga : undefined;
  const rawArquivo = params['arquivo'];
  const fileName = typeof rawArquivo === 'string' ? rawArquivo : undefined;
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 p-6">
      <ProntoScreen resumeId={resumeId} jobDescriptionId={jobDescriptionId} fileName={fileName} />
    </main>
  );
}
