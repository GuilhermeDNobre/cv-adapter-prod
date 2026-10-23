import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type {
  EducationDraft,
  EvidenceDraft,
  ExperienceDraft,
  ResumeImportDraft,
  ResumeImportResponse,
} from 'schema/contracts/resume-import';
import {
  ApiError,
  NetworkError,
  confirmResumeImport,
  getResumeImport,
  saveResumeImportDraft,
} from '../../../lib/api-client';
import { ReviewScreen } from './review-screen';

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  return {
    ...actual,
    getResumeImport: vi.fn(),
    saveResumeImportDraft: vi.fn(),
    confirmResumeImport: vi.fn(),
  };
});

const mockedGet = vi.mocked(getResumeImport);
const mockedPut = vi.mocked(saveResumeImportDraft);
const mockedConfirm = vi.mocked(confirmResumeImport);

const IMPORT_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';

const CONTACT = {
  fullName: 'Ana Souza',
  email: 'ana@exemplo.com',
  phone: '(11) 91234-5678',
  links: [{ title: null as string | null, url: 'https://linkedin.com/in/anasouza' }],
};
const EXP_ACME: ExperienceDraft = {
  company: 'Acme Tecnologia',
  role: 'Analista de dados',
  startedOn: '03/2021',
  endedOn: '11/2023',
};
const EXP_BETA: ExperienceDraft = {
  company: 'Beta Logística',
  role: 'Estagiária',
  startedOn: '01/2020',
  endedOn: null,
};
const EDU_USP: EducationDraft = {
  institution: 'USP',
  degree: 'Bacharelado em Estatística',
  startedOn: '2018',
  endedOn: '2022',
};
const EV_LINKED: EvidenceDraft = {
  statement: 'Reduzi o tempo de relatório em 40% automatizando no Python.',
  experienceIndex: 0,
};
const EV_PLAIN: EvidenceDraft = {
  statement: 'Modelei o banco de dados de fretes usado pelo time de operações.',
};

function draftFixture(): ResumeImportDraft {
  return {
    contactDetails: { ...CONTACT, links: [...(CONTACT.links ?? [])] },
    experiences: [{ ...EXP_ACME }, { ...EXP_BETA }],
    education: [{ ...EDU_USP }],
    evidences: [{ ...EV_LINKED }, { ...EV_PLAIN }],
  };
}

function importFixture(
  status: ResumeImportResponse['status'],
  draft: ResumeImportResponse['draft'],
): ResumeImportResponse {
  return {
    id: IMPORT_ID,
    status,
    failureReason: null,
    draft,
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function renderReview(jobDescriptionId?: string): Promise<{ container: HTMLElement }> {
  const result = render(<ReviewScreen resumeImportId={IMPORT_ID} jobDescriptionId={jobDescriptionId} />);
  await flushPromises();
  return result;
}

function editAndBlur(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

// Fails when any form control on the screen loses its associated label.
function expectEveryFieldLabeled(container: HTMLElement): void {
  const labelTargets = new Set(
    Array.from(container.querySelectorAll('label')).map((label) => label.htmlFor),
  );
  const unlabeled = Array.from(container.querySelectorAll('input, textarea, select'))
    .filter((field) => {
      const id = field.getAttribute('id');
      return id === null || id === '' || !labelTargets.has(id);
    })
    .map((field) => `${field.tagName.toLowerCase()}#${field.getAttribute('id') ?? '(sem id)'}`);
  expect(unlabeled).toEqual([]);
}

describe('ReviewScreen', () => {
  beforeEach(() => {
    mockedGet.mockResolvedValue(importFixture('ready_for_review', draftFixture()));
    mockedPut.mockImplementation(async (_id, draft) => importFixture('ready_for_review', draft));
    mockedConfirm.mockResolvedValue(importFixture('confirmed', draftFixture()));
  });

  afterEach(() => {
    mockedGet.mockReset();
    mockedPut.mockReset();
    mockedConfirm.mockReset();
  });

  it('should render the draft with the values extracted from the file', async () => {
    const { container } = await renderReview();

    expect(screen.getByRole('region', { name: 'Dados de contato' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Experiência 1' })).toBeInTheDocument();
    expect(screen.getByLabelText('Empresa', { selector: '#experience-0-company' })).toHaveValue(
      'Acme Tecnologia',
    );
    expect(screen.getByLabelText('Instituição')).toHaveValue('USP');
    expect(
      screen.getByLabelText('O que você fez ou conquistou', {
        selector: '#experience-0-evidence-0-statement',
      }),
    ).toHaveValue(EV_LINKED.statement);
    expect(
      screen.getByLabelText('O que você fez ou conquistou', {
        selector: '#evidence-1-statement',
      }),
    ).toHaveValue(EV_PLAIN.statement);
    expect(screen.getByLabelText('Vínculo com experiência', { selector: '#evidence-1-link' })).toHaveValue('');
    expect(screen.getByRole('region', { name: 'Habilidades' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Idiomas' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Certificações' })).toBeInTheDocument();
    expectEveryFieldLabeled(container);
  });

  it('should offer confirmation without requiring a single field to be touched', async () => {
    await renderReview();

    expect(screen.getByRole('button', { name: 'Confirmar revisão' })).toBeEnabled();
    expect(screen.queryByText(/Complete o texto dos itens/)).not.toBeInTheDocument();
  });

  it('should show the permanence warning before any confirmation step', async () => {
    await renderReview();

    expect(
      screen.getByText(/vale para todos os currículos que você criar daqui para frente/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirmar e criar meu Career Profile' }),
    ).not.toBeInTheDocument();
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('should correct an item by saving the whole corrected draft through the PUT', async () => {
    await renderReview();

    editAndBlur(
      screen.getByLabelText('Empresa', { selector: '#experience-0-company' }),
      'Acme Tecnologia S.A.',
    );
    await flushPromises();

    expect(mockedPut).toHaveBeenCalledWith(IMPORT_ID, {
      ...draftFixture(),
      experiences: [{ ...EXP_ACME, company: 'Acme Tecnologia S.A.' }, EXP_BETA],
    });
    expect(screen.getByRole('status')).toHaveTextContent('Alterações salvas.');
  });

  it('should remove an experience, reindexing the evidences that pointed at it', async () => {
    await renderReview();

    fireEvent.click(screen.getByRole('button', { name: 'Remover experiência 1' }));
    await flushPromises();

    expect(mockedPut).toHaveBeenCalledWith(IMPORT_ID, {
      contactDetails: draftFixture().contactDetails,
      experiences: [EXP_BETA],
      education: [EDU_USP],
      evidences: [{ statement: EV_LINKED.statement }, { statement: EV_PLAIN.statement }],
    });
  });

  it('should add an experience and save it', async () => {
    await renderReview();

    fireEvent.click(screen.getByRole('button', { name: 'Acrescentar experiência' }));
    editAndBlur(
      screen.getByLabelText('Empresa', { selector: '#experience-2-company' }),
      'Gama Varejo',
    );
    await flushPromises();

    expect(mockedPut).toHaveBeenLastCalledWith(IMPORT_ID, {
      ...draftFixture(),
      experiences: [
        EXP_ACME,
        EXP_BETA,
        { company: 'Gama Varejo', role: '', startedOn: '', endedOn: null },
      ],
    });
  });

  it('should hold an added Evidence unsaved until its text exists and then save it', async () => {
    const { container } = await renderReview();

    const addButtons = screen.getAllByRole('button', { name: 'Acrescentar Evidence' });
    const addGeneral = addButtons[addButtons.length - 1];
    if (addGeneral === undefined) throw new Error('Expected the general Acrescentar Evidence button');
    fireEvent.click(addGeneral);
    await flushPromises();
    expect(mockedPut).not.toHaveBeenCalled();
    expect(screen.getByText(/Complete o texto dos itens/)).toBeInTheDocument();

    editAndBlur(
      screen.getByLabelText('O que você fez ou conquistou', { selector: '#evidence-2-statement' }),
      'Certifiquei a equipe na ISO 27001.',
    );
    await flushPromises();
    expectEveryFieldLabeled(container);

    expect(mockedPut).toHaveBeenCalledWith(IMPORT_ID, {
      ...draftFixture(),
      evidences: [
        EV_LINKED,
        EV_PLAIN,
        { statement: 'Certifiquei a equipe na ISO 27001.' },
      ],
    });
  });

  it('should remove an Evidence', async () => {
    await renderReview();

    fireEvent.click(screen.getByRole('button', { name: 'Remover Evidence 2' }));
    await flushPromises();

    expect(mockedPut).toHaveBeenCalledWith(IMPORT_ID, { ...draftFixture(), evidences: [EV_LINKED] });
  });

  it('should link an unlinked Evidence to an experience through the labeled select', async () => {
    await renderReview();

    const select = screen.getByLabelText('Vínculo com experiência', {
      selector: '#evidence-1-link',
    });
    fireEvent.change(select, { target: { value: '1' } });
    await flushPromises();

    expect(mockedPut).toHaveBeenCalledWith(IMPORT_ID, {
      ...draftFixture(),
      evidences: [EV_LINKED, { statement: EV_PLAIN.statement, experienceIndex: 1 }],
    });
  });

  it('should keep contact data in its own area, apart and never sent to the AI', async () => {
    await renderReview();

    const region = screen.getByRole('region', { name: 'Dados de contato' });
    expect(within(region).getByLabelText('E-mail')).toHaveValue('ana@exemplo.com');
    expect(within(region).getByText(/nunca são enviados ao provedor de IA/)).toBeInTheDocument();
    expect(screen.getByLabelText('Empresa', { selector: '#experience-0-company' })).toBeInTheDocument();
  });

  it('should save a corrected contact field without sending it anywhere else', async () => {
    await renderReview();

    editAndBlur(screen.getByLabelText('Telefone'), '+55 11 91234-5678');
    await flushPromises();

    expect(mockedPut).toHaveBeenCalledWith(IMPORT_ID, {
      ...draftFixture(),
      contactDetails: { ...CONTACT, phone: '+55 11 91234-5678' },
    });
  });

  it('should flush the pending correction through the PUT before materializing the profile', async () => {
    await renderReview();

    fireEvent.change(
      screen.getByLabelText('Empresa', { selector: '#experience-0-company' }),
      { target: { value: 'Acme Tecnologia S.A.' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revisão' }));
    await flushPromises();

    expect(mockedPut).toHaveBeenCalledTimes(1);
    const [, flushedDraft] = mockedPut.mock.calls[0] ?? [];
    expect(flushedDraft?.experiences[0]?.company).toBe('Acme Tecnologia S.A.');
    expect(mockedConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e criar meu Career Profile' }));
    await flushPromises();

    expect(mockedPut).toHaveBeenCalledTimes(1);
    expect(mockedConfirm).toHaveBeenCalledWith(IMPORT_ID);
    expect(screen.getByRole('link', { name: 'Continuar para a vaga' })).toHaveAttribute(
      'href',
      '/vaga',
    );
  });

  it('should say the draft does not exist when the API answers 404', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(404, 'Resume import not found.'));

    await renderReview();

    expect(screen.getByRole('alert')).toHaveTextContent('Não encontramos esse rascunho');
    expect(screen.getByRole('link', { name: 'Voltar ao envio' })).toHaveAttribute('href', '/importacao');
  });

  it('should say the import is not in a reviewable state while the draft is still being read', async () => {
    mockedGet.mockResolvedValueOnce(importFixture('extracting', null));

    await renderReview();

    expect(screen.getByRole('alert')).toHaveTextContent('não está pronto para revisão');
    expect(screen.getByRole('link', { name: 'Acompanhar na tela de envio' })).toHaveAttribute(
      'href',
      '/importacao',
    );
  });

  it('should show the evaluation path without the editor when the import was already confirmed', async () => {
    mockedGet.mockResolvedValueOnce(importFixture('confirmed', draftFixture()));

    await renderReview();

    expect(screen.getByRole('heading', { name: 'Seu Career Profile está pronto' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuar para a vaga' })).toHaveAttribute(
      'href',
      '/vaga',
    );
    expect(screen.queryByRole('region', { name: 'Dados de contato' })).not.toBeInTheDocument();
  });

  it('should continue the adaptation at the resume step of the same vaga when the review carries it', async () => {
    const jobId = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
    mockedGet.mockResolvedValueOnce(importFixture('confirmed', draftFixture()));

    await renderReview(jobId);

    expect(screen.getByRole('link', { name: 'Continuar a adaptação' })).toHaveAttribute(
      'href',
      `/curriculo?vaga=${jobId}`,
    );
    expect(screen.queryByRole('link', { name: 'Continuar para a vaga' })).not.toBeInTheDocument();
  });

  it('should send a missing draft back to the resume step when the review carries a vaga', async () => {
    const jobId = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
    mockedGet.mockRejectedValueOnce(new ApiError(404, 'Resume import not found.'));

    await renderReview(jobId);

    expect(screen.getByRole('link', { name: 'Voltar ao envio' })).toHaveAttribute(
      'href',
      `/curriculo?vaga=${jobId}`,
    );
  });

  it('should say the cv-adapter is not answering when the draft never arrives', async () => {
    mockedGet.mockRejectedValueOnce(new NetworkError());

    await renderReview();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o cv-adapter. Nada do que você já salvou foi perdido — confira se ele está rodando (docker compose ps) e recarregue esta página.',
    );
  });

  it('should show its own message when a save fails and save again on retry', async () => {
    mockedPut.mockRejectedValueOnce(new ApiError(500, 'boom'));
    await renderReview();

    editAndBlur(
      screen.getByLabelText('Empresa', { selector: '#experience-0-company' }),
      'Acme Tecnologia S.A.',
    );
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar suas correções');
    expect(screen.getByRole('button', { name: 'Salvar as alterações agora' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar as alterações agora' }));
    await flushPromises();

    expect(mockedPut).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Alterações salvas.');
  });

  it('should show its own message when the confirmation fails and let the person try again', async () => {
    mockedConfirm.mockRejectedValueOnce(new NetworkError());
    await renderReview();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revisão' }));
    await flushPromises();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e criar meu Career Profile' }));
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível confirmar agora');
    expect(screen.getByRole('button', { name: 'Confirmar e criar meu Career Profile' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Continuar para a vaga' })).not.toBeInTheDocument();
  });

  it('should say which date formats work when confirming fails on a date', async () => {
    mockedConfirm.mockRejectedValueOnce(
      new ApiError(422, 'A date in the draft is not in a supported format.', {
        code: 'invalid_draft_date',
        field: 'experiences[0].startedOn',
        message: 'A date in the draft is not in a supported format.',
      }),
    );
    await renderReview();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revisão' }));
    await flushPromises();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e criar meu Career Profile' }));
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Uma das datas não está num formato que dê para guardar. Use só o ano (2019), mês e ano (03/2019) ou a data completa (2019-03-15), corrija e confirme de novo.',
    );
    expect(screen.getByRole('button', { name: 'Confirmar e criar meu Career Profile' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Continuar para a vaga' })).not.toBeInTheDocument();
  });

  it('should keep every field labeled after a new contact link is added', async () => {
    const { container } = await renderReview();

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar link' }));

    expectEveryFieldLabeled(container);
    expect(screen.getByLabelText('Título do link 2 (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('URL do link 2')).toBeInTheDocument();
  });

  it('should show the summary in an editable textarea and save it without touching evidences', async () => {
    mockedGet.mockResolvedValueOnce(
      importFixture('ready_for_review', {
        ...draftFixture(),
        summary: 'Estudante de Engenharia de Software buscando estágio Fullstack.',
      }),
    );
    const { container } = await renderReview();

    const summary = screen.getByLabelText('Resumo', {
      selector: '#draft-summary',
    }) as HTMLTextAreaElement;
    expect(summary.tagName.toLowerCase()).toBe('textarea');
    expect(summary).toHaveValue('Estudante de Engenharia de Software buscando estágio Fullstack.');

    editAndBlur(summary, 'Estudante buscando estágio em desenvolvimento Fullstack.');
    await flushPromises();

    expect(mockedPut).toHaveBeenCalledWith(
      IMPORT_ID,
      expect.objectContaining({ summary: 'Estudante buscando estágio em desenvolvimento Fullstack.' }),
    );
    const [, saved] = mockedPut.mock.calls[0] ?? [];
    expect(
      (saved as ResumeImportDraft).evidences.some((evidence) =>
        evidence.statement.includes('Estudante buscando'),
      ),
    ).toBe(false);
    expectEveryFieldLabeled(container);
  });

  it('should move a skill to another group and save the updated draft', async () => {
    mockedGet.mockResolvedValueOnce(
      importFixture('ready_for_review', {
        ...draftFixture(),
        skills: [
          { name: 'React', group: 'Front-end' },
          { name: 'Kubernetes', group: null },
        ],
      }),
    );
    const { container } = await renderReview();
    const chip = screen.getByText('React').closest('li');
    expect(chip).not.toBeNull();
    fireEvent.dragStart(chip as HTMLElement, { dataTransfer: { setData: vi.fn() } });
    fireEvent.drop(screen.getByTestId('skill-group-ungrouped'), {
      dataTransfer: { getData: (): string => '0' },
    });
    await flushPromises();
    expect(mockedPut).toHaveBeenCalledWith(
      IMPORT_ID,
      expect.objectContaining({
        skills: [
          { name: 'React', group: null },
          { name: 'Kubernetes', group: null },
        ],
      }),
    );
    expectEveryFieldLabeled(container);
  });
});
