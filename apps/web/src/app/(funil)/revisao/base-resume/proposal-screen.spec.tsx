import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { BaseResumeProposalResponse } from 'schema/contracts/resume-import';
import {
  ApiError,
  NetworkError,
  createBaseResume,
  getBaseResumeProposal,
  getCareerProfile,
} from '../../../../lib/api-client';
import { ProposalScreen } from './proposal-screen';

vi.mock('../../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api-client')>();
  return {
    ...actual,
    getBaseResumeProposal: vi.fn(),
    createBaseResume: vi.fn(),
    getCareerProfile: vi.fn(),
  };
});

const mockedGet = vi.mocked(getBaseResumeProposal);
const mockedCreate = vi.mocked(createBaseResume);
const mockedCareer = vi.mocked(getCareerProfile);

const IMPORT_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';

function proposalFixture(): BaseResumeProposalResponse {
  return {
    status: 'ready',
    failureReason: null,
    proposal: {
      name: 'Analista de dados',
      language: 'pt',
      style: { writingMethod: 'star', tone: 'technical', averageBulletWords: 12 },
      sections: [
        {
          kind: 'experience',
          title: null,
          entries: [
            {
              experienceId: '11111111-1111-4111-8111-111111111111',
              bullets: [
                {
                  evidenceId: '22222222-2222-4222-8222-222222222222',
                  original: 'Fiz relatórios em Python.',
                  text: 'Reduzi o tempo de relatórios em 40% com Python (STAR).',
                },
                {
                  evidenceId: '33333333-3333-4333-8333-333333333333',
                  original: 'Modelei banco de fretes.',
                  text: 'Modelei o banco de fretes usado por operações (STAR).',
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function renderProposal(): Promise<void> {
  mockedCareer.mockRejectedValue(new NetworkError());
  render(<ProposalScreen resumeImportId={IMPORT_ID} />);
  await flushPromises();
}

describe('ProposalScreen', () => {
  afterEach(() => {
    mockedGet.mockReset();
    mockedCreate.mockReset();
    mockedCareer.mockReset();
  });

  it('should show the generating progress while the proposal is not ready', async () => {
    mockedGet.mockResolvedValue({ status: 'generating', proposal: null, failureReason: null });

    await renderProposal();

    expect(screen.getByRole('heading', { name: 'Montando o Base Resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar Base Resume' })).toBeDisabled();
    expect(screen.getByText('Aguarde o Base Resume ficar pronto para conferir.')).toBeInTheDocument();
  });

  it('should show its own message when the import does not exist', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'Resume import not found.'));

    await renderProposal();

    expect(screen.getByRole('alert')).toHaveTextContent('Não encontramos esse envio');
  });

  it('should ask for confirmation first when the import is not confirmed', async () => {
    mockedGet.mockRejectedValue(new ApiError(422, 'Resume import is not confirmed.'));

    await renderProposal();

    expect(screen.getByRole('alert')).toHaveTextContent('ainda não foi confirmado');
    expect(screen.getByRole('link', { name: 'Voltar à revisão' })).toHaveAttribute(
      'href',
      expect.stringContaining('/revisao?resumeImportId='),
    );
  });

  it('should say the cv-adapter is not answering when the proposal never arrives', async () => {
    mockedGet.mockRejectedValue(new NetworkError());

    await renderProposal();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível falar com o cv-adapter');
  });

  it('should show its own message when the proposal generation failed', async () => {
    mockedGet.mockResolvedValue({ status: 'failed', proposal: null, failureReason: 'generation_failed' });

    await renderProposal();

    expect(screen.getByRole('alert')).toHaveTextContent('não conseguiu montar o Base Resume');
  });

  it('should render the style badges, the editable name and the undecided count', async () => {
    mockedGet.mockResolvedValue(proposalFixture());

    await renderProposal();

    expect(screen.getByLabelText('Nome do Base Resume')).toHaveValue('Analista de dados');
    expect(screen.getByText('STAR')).toBeInTheDocument();
    expect(screen.getByText('técnico')).toBeInTheDocument();
    expect(screen.getByText('Bullets curtos')).toBeInTheDocument();
    expect(screen.getByText('0 de 2 bullets decididos')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Aprovar Base Resume' });
    expect(approve).toBeDisabled();
    expect(screen.getByText('2 bullets ainda não confirmados.')).toBeInTheDocument();
  });

  it('should count decisions per bullet and enable approval only when all are decided', async () => {
    mockedGet.mockResolvedValue(proposalFixture());
    mockedCreate.mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444' });

    await renderProposal();

    const useButtons = screen.getAllByRole('button', { name: 'Usar reescrita' });
    fireEvent.click(useButtons[0] as HTMLElement);
    expect(screen.getByText('1 de 2 bullets decididos')).toBeInTheDocument();
    expect(screen.getByText('Reescrita escolhida')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar Base Resume' })).toBeDisabled();

    const keepButtons = screen.getAllByRole('button', { name: 'Manter original' });
    fireEvent.click(keepButtons[0] as HTMLElement);
    expect(screen.getByText('2 de 2 bullets decididos')).toBeInTheDocument();
    expect(screen.getByText('Original mantido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar Base Resume' })).toBeEnabled();
  });

  it('should let the person change a decision back to pending', async () => {
    mockedGet.mockResolvedValue(proposalFixture());

    await renderProposal();

    fireEvent.click(screen.getAllByRole('button', { name: 'Usar reescrita' })[0] as HTMLElement);
    expect(screen.getByText('1 de 2 bullets decididos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Alterar escolha' }));
    expect(screen.getByText('0 de 2 bullets decididos')).toBeInTheDocument();
  });

  it('should save an edited bullet as a confirmed rewritten choice', async () => {
    mockedGet.mockResolvedValue(proposalFixture());

    await renderProposal();

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0] as HTMLElement);
    const textarea = screen.getByLabelText('Sua versão');
    fireEvent.change(textarea, { target: { value: 'Minha versão editada.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar bullet' }));

    expect(screen.getByText('Minha versão editada.')).toBeInTheDocument();
    expect(screen.getByText('1 de 2 bullets decididos')).toBeInTheDocument();
  });

  it('should approve with the chosen texts and offer the pronto path', async () => {
    mockedGet.mockResolvedValue(proposalFixture());
    mockedCreate.mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444' });

    await renderProposal();

    fireEvent.click(screen.getAllByRole('button', { name: 'Usar reescrita' })[0] as HTMLElement);
    fireEvent.click(screen.getAllByRole('button', { name: 'Manter original' })[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar Base Resume' }));
    await flushPromises();

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    const [input] = mockedCreate.mock.calls[0] as unknown as [
      { name: string; sections: Array<{ entries: Array<{ bullets: Array<{ text: string }> }> }> },
    ];
    expect(input.name).toBe('Analista de dados');
    expect(input.sections[0]?.entries[0]?.bullets[0]?.text).toContain('STAR');
    expect(input.sections[0]?.entries[0]?.bullets[1]?.text).toBe('Modelei banco de fretes.');
    expect(screen.getByRole('link', { name: 'Continuar' })).toHaveAttribute(
      'href',
      expect.stringContaining('/pronto?resumeId=44444444-4444-4444-8444-444444444444'),
    );
  });

  it('should require a name before approving', async () => {
    mockedGet.mockResolvedValue(proposalFixture());

    await renderProposal();

    const name = screen.getByLabelText('Nome do Base Resume');
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Usar reescrita' })[0] as HTMLElement);
    fireEvent.click(screen.getAllByRole('button', { name: 'Manter original' })[0] as HTMLElement);

    const approve = screen.getByRole('button', { name: 'Aprovar Base Resume' });
    expect(approve).toBeDisabled();
    expect(screen.getByText('Dê um nome ao Base Resume antes de aprovar.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('should show education and grouped skills with Portuguese titles and no raw kind', async () => {
    const EDU_1 = '88888888-8888-4888-8888-888888888888';
    const EDU_2 = '99999999-9999-4999-8999-999999999999';
    const SKILL_1 = '77777777-7777-4777-8777-777777777777';
    const SKILL_2 = '66666666-6666-4666-8666-666666666666';
    const SKILL_3 = '55555555-5555-4555-8555-555555555555';
    mockedGet.mockResolvedValue({
      status: 'ready',
      failureReason: null,
      proposal: {
        name: 'Base',
        language: 'pt',
        style: { writingMethod: 'free', tone: 'direct', averageBulletWords: 12 },
        sections: [
          {
            kind: 'education',
            title: null,
            entries: [
              { educationEntryId: EDU_1, bullets: [] },
              { educationEntryId: EDU_2, bullets: [] },
            ],
          },
          {
            kind: 'skills',
            title: null,
            entries: [],
            skillIds: [SKILL_1, SKILL_2, SKILL_3],
          },
        ],
      },
    });
    mockedCareer.mockResolvedValue({
      experiences: [],
      educationEntries: [
        { id: EDU_1, institution: 'UFC', degree: 'Bacharelado em Engenharia de Software', startedOn: '2021', endedOn: 'Presente' },
        { id: EDU_2, institution: 'EEEP', degree: 'Curso Técnico em Informática', startedOn: '2017', endedOn: '2019' },
      ],
      evidences: [],
      skills: [
        { id: SKILL_1, name: 'React', group: 'Front-end' },
        { id: SKILL_2, name: 'Node.js', group: 'Back-end' },
        { id: SKILL_3, name: 'TypeScript', group: 'Front-end' },
      ],
    });

    render(<ProposalScreen resumeImportId={IMPORT_ID} />);
    await flushPromises();

    expect(screen.getByRole('heading', { name: 'Formação' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Habilidades' })).toBeInTheDocument();
    expect(screen.getByText('Bacharelado em Engenharia de Software')).toBeInTheDocument();
    expect(screen.getByText('Curso Técnico em Informática')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Front-end')).toBeInTheDocument();
    expect(screen.getByText('Back-end')).toBeInTheDocument();
    expect(screen.queryByText('education')).not.toBeInTheDocument();
  });

  it('should show the unlinked custom section title instead of an empty experience', async () => {
    mockedGet.mockResolvedValue({
      status: 'ready',
      failureReason: null,
      proposal: {
        name: 'Base',
        language: 'pt',
        style: { writingMethod: 'free', tone: 'direct', averageBulletWords: 12 },
        sections: [
          {
            kind: 'custom',
            title: 'Projetos e outras atividades',
            entries: [
              {
                bullets: [
                  { evidenceId: null, original: 'Fiz um app sozinho.', text: 'Fiz um app sozinho.' },
                ],
              },
            ],
          },
        ],
      },
    });
    mockedCareer.mockResolvedValue({
      experiences: [],
      educationEntries: [],
      evidences: [],
      skills: [],
    });

    render(<ProposalScreen resumeImportId={IMPORT_ID} />);
    await flushPromises();

    expect(screen.getByRole('heading', { name: 'Projetos e outras atividades' })).toBeInTheDocument();
    expect(screen.getByText('Fiz um app sozinho.')).toBeInTheDocument();
    expect(screen.queryByText('Experiência 4')).not.toBeInTheDocument();
  });
});
