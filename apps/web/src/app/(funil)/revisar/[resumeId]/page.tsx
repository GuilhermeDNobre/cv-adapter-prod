import RevisarScreen from './revisar-screen';
import { WizardFooter } from '../../../../components/wizard/wizard-footer';

interface RevisarPageProps {
  readonly params: Promise<{ readonly resumeId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RevisarPage({
  params,
  searchParams,
}: RevisarPageProps): Promise<React.JSX.Element> {
  const { resumeId } = await params;
  const query = await searchParams;
  const rawVaga = query['vaga'];
  const rawAvaliacao = query['avaliacao'];
  const jobDescriptionId = typeof rawVaga === 'string' ? rawVaga : undefined;
  const evaluationId = typeof rawAvaliacao === 'string' ? rawAvaliacao : undefined;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <RevisarScreen params={Promise.resolve({ resumeId })} />
      <WizardFooter current="revisar" ids={{ jobDescriptionId, evaluationId, resumeId }} />
    </div>
  );
}
