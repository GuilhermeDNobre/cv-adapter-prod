import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JobDescriptionResponse } from 'schema/contracts/job-description';
import { ApiError, apiRequest, getJobDescription, NetworkError } from '../../../lib/api-client';
import PasteJobDescriptionPage from './page';

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  return { ...actual, apiRequest: vi.fn(), getJobDescription: vi.fn() };
});

const simulated = vi.hoisted(() => ({ replace: vi.fn(), query: '' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: simulated.replace }),
  usePathname: () => '/vaga',
  useSearchParams: () => new URLSearchParams(simulated.query),
}));


const mockedApiRequest = vi.mocked(apiRequest);
const mockedGetJobDescription = vi.mocked(getJobDescription);

const jobDescriptionFixture: JobDescriptionResponse = {
  id: '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01',
  language: 'en',
  requirements: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      literalTerm: '5+ years of TypeScript',
      concept: 'Senior TypeScript experience',
      normalizedConcept: 'typescript',
      kind: 'mandatory',
      ordinal: 0,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      literalTerm: 'native English',
      concept: 'Fluent English communication',
      normalizedConcept: 'english',
      kind: 'mandatory',
      ordinal: 1,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      literalTerm: 'Open-source contributions',
      concept: 'Public repository activity',
      normalizedConcept: 'open source',
      kind: 'desirable',
      ordinal: 2,
    },
  ],
};

function pasteText(text: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'Anúncio da vaga' }), {
    target: { value: text },
  });
}

function submitForm(): void {
  const form = screen.getByRole('textbox', { name: 'Anúncio da vaga' }).closest('form');
  if (form === null) throw new Error('Expected the paste form to be rendered');
  fireEvent.submit(form);
}

describe('PasteJobDescriptionPage', () => {
  afterEach(() => {
    mockedApiRequest.mockReset();
    mockedGetJobDescription.mockReset();
    simulated.replace.mockReset();
    simulated.query = '';
  });

  it('should render the paste field with an associated label', () => {
    render(<PasteJobDescriptionPage />);

    expect(screen.getByRole('textbox', { name: 'Anúncio da vaga' })).toBeInTheDocument();
  });

  it('should disable submit while nothing was pasted', () => {
    render(<PasteJobDescriptionPage />);

    expect(screen.getByRole('button', { name: 'Ver Requirements' })).toBeDisabled();
  });

  it('should show the character count against the limit before any submit', () => {
    render(<PasteJobDescriptionPage />);

    pasteText('a'.repeat(35));

    const hint = screen.getByText('35 de 20.000 caracteres.');
    expect(hint).toBeInTheDocument();
    const describedBy = screen.getByRole('textbox', { name: 'Anúncio da vaga' }).getAttribute(
      'aria-describedby',
    );
    expect(describedBy).toBe(hint.id);
  });

  it('should communicate the limit before submit when the text goes over the maximum', () => {
    render(<PasteJobDescriptionPage />);

    pasteText('a'.repeat(20001));

    expect(
      screen.getByText(/Limite de 20\.000 caracteres excedido em 1\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver Requirements' })).toBeDisabled();
  });

  it('should announce the loading state inside an aria-live region', async () => {
    let resolveRequest: (value: JobDescriptionResponse) => void = () => undefined;
    mockedApiRequest.mockReturnValue(
      new Promise<JobDescriptionResponse>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    render(<PasteJobDescriptionPage />);
    pasteText('a real job ad');

    submitForm();

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Analisando a vaga.');
    expect(screen.getByRole('button', { name: 'Ver Requirements' })).toBeDisabled();

    resolveRequest(jobDescriptionFixture);
    await screen.findByRole('heading', { name: 'Requirements da vaga' });
  });

  it('should send the pasted text and show the requirements grouped by kind', async () => {
    mockedApiRequest.mockResolvedValue(jobDescriptionFixture);
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    await screen.findByRole('heading', { name: 'Requirements da vaga' });
    expect(screen.getByRole('heading', { name: 'Obrigatórios' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Desejáveis' })).toBeInTheDocument();
    const mandatoryGroup = screen.getByRole('region', { name: 'Obrigatórios' });
    const desirableGroup = screen.getByRole('region', { name: 'Desejáveis' });
    expect(mandatoryGroup).toHaveTextContent('5+ years of TypeScript');
    expect(mandatoryGroup).toHaveTextContent('native English');
    expect(desirableGroup).toHaveTextContent('Open-source contributions');
    expect(desirableGroup).not.toHaveTextContent('TypeScript');
    expect(mockedApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/job-descriptions', method: 'POST' }),
    );
  });

  it('should show the literal term used by the job ad for every requirement', async () => {
    mockedApiRequest.mockResolvedValue(jobDescriptionFixture);
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    await screen.findByRole('heading', { name: 'Requirements da vaga' });
    expect(screen.getByText('5+ years of TypeScript')).toBeInTheDocument();
    expect(screen.getByText('native English')).toBeInTheDocument();
    expect(screen.getByText('Open-source contributions')).toBeInTheDocument();
  });

  it('should expose no funnel shortcut links because the wizard footer owns advance', async () => {
    mockedApiRequest.mockResolvedValue(jobDescriptionFixture);
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    await screen.findByRole('heading', { name: 'Requirements da vaga' });
    expect(screen.queryByRole('link', { name: 'Enviar currículo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continuar para avaliação' })).not.toBeInTheDocument();
  });

  it('should say the text is not a job description when the API answers 422', async () => {
    mockedApiRequest.mockRejectedValue(
      new ApiError(422, 'The text does not look like a job advertisement.'),
    );
    render(<PasteJobDescriptionPage />);

    pasteText('bom dia, tudo bem?');
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não encontramos uma vaga de emprego nesse texto.');
    expect(alert).not.toHaveTextContent('does not look like');
    expect(screen.getByRole('button', { name: 'Ver Requirements' })).toBeEnabled();
  });

  it('should say the text is too long when the API answers 400', async () => {
    mockedApiRequest.mockRejectedValue(
      new ApiError(400, 'text exceeds the 20000-character job description limit'),
    );
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('O texto passou do limite de 20.000 caracteres.');
    expect(alert).toHaveTextContent('Cole só o anúncio da vaga, sem anexos longos, e tente de novo.');
  });

  it('should say the AI did not answer when the API answers 503', async () => {
    mockedApiRequest.mockRejectedValue(new ApiError(503, 'Service Unavailable'));
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A IA não respondeu agora. Tente de novo em alguns minutos.');
  });

  it('should say the cv-adapter is not answering when the request never reaches the API', async () => {
    mockedApiRequest.mockRejectedValue(new NetworkError());
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Não foi possível falar com o cv-adapter. Confira se ele está rodando (docker compose ps) e tente de novo.',
    );
  });

  it('should say the balance is exhausted when the API answers with ai_balance_exhausted', async () => {
    mockedApiRequest.mockRejectedValue(
      new ApiError(422, 'exhausted', { code: 'ai_balance_exhausted', message: 'exhausted' }),
    );
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('O saldo da sua conta na DeepSeek acabou');
  });

  it('should say the key was rejected when the API answers with ai_key_rejected', async () => {
    mockedApiRequest.mockRejectedValue(
      new ApiError(422, 'rejected', { code: 'ai_key_rejected', message: 'rejected' }),
    );
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A DeepSeek recusou a chave salva');
  });

  it('should say there is no key when the API answers with ai_key_missing', async () => {
    mockedApiRequest.mockRejectedValue(
      new ApiError(422, 'missing', { code: 'ai_key_missing', message: 'missing' }),
    );
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não há chave da DeepSeek salva');
  });

  it('should show the requirement concept in portuguese as the api returns it', async () => {
    mockedApiRequest.mockResolvedValue({
      ...jobDescriptionFixture,
      requirements: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          literalTerm: '5+ years of TypeScript',
          concept: 'Experiência sênior com TypeScript',
          normalizedConcept: 'typescript',
          kind: 'mandatory',
          ordinal: 0,
        },
      ],
    });
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    await screen.findByRole('heading', { name: 'Requirements da vaga' });
    const mandatoryGroup = screen.getByRole('region', { name: 'Obrigatórios' });
    expect(mandatoryGroup).toHaveTextContent('Experiência sênior com TypeScript');
    expect(screen.getByText('5+ years of TypeScript')).toBeInTheDocument();
  });

  it('should put the vaga id in the URL after creating it', async () => {
    mockedApiRequest.mockResolvedValue(jobDescriptionFixture);
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    await screen.findByRole('heading', { name: 'Requirements da vaga' });
    expect(simulated.replace).toHaveBeenCalledWith(`/vaga?vaga=${jobDescriptionFixture.id}`);
  });

  it('should show the saved Requirements without the form when the URL carries a vaga id', async () => {
    simulated.query = `vaga=${jobDescriptionFixture.id}`;
    mockedGetJobDescription.mockResolvedValue(jobDescriptionFixture);
    render(<PasteJobDescriptionPage />);

    await screen.findByRole('heading', { name: 'Requirements da vaga' });
    expect(screen.queryByRole('textbox', { name: 'Anúncio da vaga' })).not.toBeInTheDocument();
    expect(mockedGetJobDescription).toHaveBeenCalledWith(jobDescriptionFixture.id);
  });

  it('should go back to the empty form when pasting another vaga', async () => {
    mockedApiRequest.mockResolvedValue(jobDescriptionFixture);
    render(<PasteJobDescriptionPage />);

    pasteText('a real job ad');
    submitForm();

    await screen.findByRole('heading', { name: 'Requirements da vaga' });
    fireEvent.click(screen.getByRole('button', { name: 'Colar outra vaga' }));

    expect(screen.getByRole('textbox', { name: 'Anúncio da vaga' })).toBeInTheDocument();
    expect(simulated.replace).toHaveBeenCalledWith('/vaga');
  });
});
