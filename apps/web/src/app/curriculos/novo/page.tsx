import { redirect } from 'next/navigation';

interface NovoRedirectProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NovoBaseResumePage({
  searchParams,
}: NovoRedirectProps): Promise<never> {
  const params = await searchParams;
  const query = new URLSearchParams();
  const vaga = params['vaga'];
  const avaliacao = params['avaliacao'];
  if (typeof vaga === 'string') query.set('vaga', vaga);
  if (typeof avaliacao === 'string') query.set('avaliacao', avaliacao);
  const suffix = query.toString() === '' ? '' : `?${query.toString()}`;
  redirect(`/adaptar${suffix}`);
}
