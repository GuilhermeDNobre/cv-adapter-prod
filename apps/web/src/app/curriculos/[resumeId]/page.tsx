import { redirect } from 'next/navigation';

interface ResumeRedirectProps {
  readonly params: Promise<{ readonly resumeId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResumeEditorPage({
  params,
  searchParams,
}: ResumeRedirectProps): Promise<never> {
  const { resumeId } = await params;
  const query = await searchParams;
  const paramsOut = new URLSearchParams();
  const vaga = query['vaga'];
  const avaliacao = query['avaliacao'];
  if (typeof vaga === 'string') paramsOut.set('vaga', vaga);
  if (typeof avaliacao === 'string') paramsOut.set('avaliacao', avaliacao);
  const suffix = paramsOut.toString() === '' ? '' : `?${paramsOut.toString()}`;
  redirect(`/revisar/${resumeId}${suffix}`);
}
