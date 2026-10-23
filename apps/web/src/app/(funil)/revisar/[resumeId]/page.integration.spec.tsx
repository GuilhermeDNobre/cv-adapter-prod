import { afterEach, describe, expect, it, vi } from 'vitest';
import { Suspense } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import RevisarPage from './page';
import {
  RESUME_ID,
  SECTION_EXPERIENCE_ID,
  resumeDocumentFixture,
} from '../../../../components/resume-editor/editor-fixtures';

const API_URL = 'http://localhost:3001';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => `/revisar/${RESUME_ID}`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

function apiJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubApiServer(document: unknown): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${API_URL}/resumes/${RESUME_ID}` && (init?.method ?? 'GET') === 'GET') {
      return apiJson(document, 200);
    }
    return apiJson({ statusCode: 404, message: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function renderRevisar(): Promise<void> {
  await act(async () => {
    render(
      <Suspense>
        {await RevisarPage({
          params: Promise.resolve({ resumeId: RESUME_ID }),
          searchParams: Promise.resolve({}),
        })}
      </Suspense>,
    );
  });
  await flushPromises();
}

describe('RevisarPage against a simulated API server', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should load the preview as the largest element without a side column', async () => {
    stubApiServer(resumeDocumentFixture());
    await renderRevisar();

    expect(await screen.findByRole('heading', { name: 'Backend focus' })).toBeInTheDocument();
    expect(screen.getByTitle('Pré-visualização do currículo')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Configurações do documento' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Escolha uma Section na pré-visualização/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Exportar PDF' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'O que mudou em relação ao Base Resume' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Cobertura dos Requirements' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Configurações do documento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('O que mudou em relação ao Base Resume')).not.toBeInTheDocument();
  });

  it('should open the coverage panel through the Cobertura button', async () => {
    stubApiServer(resumeDocumentFixture());
    await renderRevisar();

    await screen.findByTitle('Pré-visualização do currículo');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cobertura' }));
    });
    expect(await screen.findByText('Cobertura da vaga')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
  });

  it('should open the document settings in the drawer', async () => {
    stubApiServer(resumeDocumentFixture());
    await renderRevisar();

    await screen.findByTitle('Pré-visualização do currículo');
    expect(
      screen.queryByRole('region', { name: 'Configurações do documento' }),
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Configurações do documento' }));
    });
    expect(
      await screen.findByRole('region', { name: 'Configurações do documento' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nome do currículo')).toBeInTheDocument();
  });

  it('should open the section drawer on preview section select', async () => {
    stubApiServer(resumeDocumentFixture());
    await renderRevisar();

    const frame = await screen.findByTitle('Pré-visualização do currículo');
    if (!(frame instanceof HTMLIFrameElement)) throw new Error('Expected the preview frame');
    const fakeSource = { postMessage: vi.fn() };
    Object.defineProperty(frame, 'contentWindow', { value: fakeSource, configurable: true });
    await act(async () => {
      const event = new MessageEvent('message', {
        data: {
          source: 'resume-preview',
          type: 'section-selected',
          sectionId: SECTION_EXPERIENCE_ID,
        },
      });
      Object.defineProperty(event, 'source', { value: fakeSource });
      window.dispatchEvent(event);
    });
    expect(
      await screen.findByRole('dialog', { name: 'Professional Experience' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cut API latency by 30% with caching.')).toBeInTheDocument();
  });

  it('should show the generation progress as 1 de 3 while generating', async () => {
    stubApiServer({
      ...resumeDocumentFixture({ generationStatus: 'generating' }),
      generationStep: 'planning',
    });
    await renderRevisar();

    const texts = await screen.findAllByRole('status').then((regions) =>
      regions.map((region) => region.textContent ?? ''),
    );
    expect(texts.some((text) => text.includes('Montando o Adaptation Plan'))).toBe(true);
    expect(texts.some((text) => text.includes('1 de 3'))).toBe(true);
  });

  it('should reject a highlight, render the new document and offer Desfazer', async () => {
    const { toast } = await import('sonner');
    const successMock = vi.mocked(toast.success);
    successMock.mockClear();

    const EVIDENCE_ADDED = '11111111-1111-4111-8111-111111111111';
    const BULLET_ADDED = '55555555-5555-4555-8555-555555555555';
    const base = resumeDocumentFixture({
      sections: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          kind: 'experience',
          title: null,
          ordinal: 0,
          entries: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              ordinal: 0,
              experienceId: null,
              educationEntryId: null,
              heading: null,
              company: 'Acme',
              role: 'Engineer',
              institution: null,
              degree: null,
              period: '2020-2024',
              bullets: [
                {
                  id: BULLET_ADDED,
                  ordinal: 0,
                  text: 'Added bullet for review.',
                  evidenceId: EVIDENCE_ADDED,
                  status: 'assumed',
                  suggestionQuestion: null,
                  requirementId: null,
                  gapKind: null,
                  needsReview: false,
                  editedByPerson: false,
                },
              ],
            },
          ],
          comments: [],
        },
      ],
      requirementCoverages: [
        {
          requirementId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          literalTerm: 'Kubernetes',
          coverage: 'covered',
          bulletId: BULLET_ADDED,
        },
      ],
    });
    const withChanges = {
      ...base,
      adaptationChanges: {
        addedEvidences: [{ id: EVIDENCE_ADDED, statement: 'Added one.' }],
        removedEvidences: [],
      },
      adaptationReview: {},
    };
    const rejected = {
      ...withChanges,
      adaptationReview: { [EVIDENCE_ADDED]: 'rejected' },
      sections: [
        {
          ...withChanges.sections[0],
          entries: [{ ...withChanges.sections[0]?.entries[0], bullets: [] }],
        },
      ],
    };
    let current: unknown = withChanges;
    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push(`${method} ${url}`);
      if (url === `${API_URL}/resumes/${RESUME_ID}` && method === 'GET') {
        return apiJson(current, 200);
      }
      if (url === `${API_URL}/resumes/${RESUME_ID}/adaptation-review` && method === 'POST') {
        current = rejected;
        return apiJson(rejected, 200);
      }
      if (url === `${API_URL}/resumes/${RESUME_ID}/adaptation-review/undo` && method === 'POST') {
        current = withChanges;
        return apiJson(withChanges, 200);
      }
      return apiJson({ statusCode: 404, message: 'Not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderRevisar();

    expect(await screen.findByText('1 de 1 alterações')).toBeInTheDocument();

    const frame = screen.getByTitle('Pré-visualização do currículo');
    if (!(frame instanceof HTMLIFrameElement)) throw new Error('Expected the preview frame');
    const fakeSource = { postMessage: vi.fn() };
    Object.defineProperty(frame, 'contentWindow', { value: fakeSource, configurable: true });
    await act(async () => {
      const event = new MessageEvent('message', {
        data: {
          source: 'resume-preview',
          type: 'change-rect',
          bulletId: BULLET_ADDED,
          rect: { top: 10, left: 20, width: 100, height: 30 },
          zoom: 1,
        },
      });
      Object.defineProperty(event, 'source', { value: fakeSource });
      window.dispatchEvent(event);
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Rejeitar' }));
    });

    expect(
      await screen.findByText('O Tailored Resume é igual ao Base Resume em conteúdo.'),
    ).toBeInTheDocument();
    expect(requests).toContain(`POST ${API_URL}/resumes/${RESUME_ID}/adaptation-review`);
    expect(successMock).toHaveBeenCalled();
    const toastCall = successMock.mock.calls[0];
    expect(toastCall?.[0]).toMatch(/rejeitada/i);
    const toastOptions = toastCall?.[1] as { duration?: number; action?: { label?: string } };
    expect(toastOptions.duration).toBe(4000);
    expect(toastOptions.action?.label).toBe('Desfazer');

    const undoAction = toastOptions.action as { onClick: () => void };
    await act(async () => {
      undoAction.onClick();
    });

    expect(await screen.findByText('1 de 1 alterações')).toBeInTheDocument();
    expect(requests).toContain(`POST ${API_URL}/resumes/${RESUME_ID}/adaptation-review/undo`);
  });

  it('should disable Aceitar todas without pendings and show Tudo revisado', async () => {
    stubApiServer(resumeDocumentFixture());
    await renderRevisar();

    expect(await screen.findByText('Tudo revisado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceitar todas' })).toBeDisabled();
  });

  it('should accept every pending change in order with Aceitar todas', async () => {
    const { toast } = await import('sonner');
    const successMock = vi.mocked(toast.success);
    successMock.mockClear();

    const EVIDENCE_ONE = '11111111-1111-4111-8111-111111111111';
    const EVIDENCE_TWO = '22222222-2222-4222-8222-222222222222';
    const BULLET_ONE = '55555555-5555-4555-8555-555555555555';
    const BULLET_TWO = '66666666-6666-4666-8666-666666666666';
    const base = resumeDocumentFixture({
      sections: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          kind: 'experience',
          title: null,
          ordinal: 0,
          entries: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              ordinal: 0,
              experienceId: null,
              educationEntryId: null,
              heading: null,
              company: 'Acme',
              role: 'Engineer',
              institution: null,
              degree: null,
              period: '2020-2024',
              bullets: [
                {
                  id: BULLET_ONE,
                  ordinal: 0,
                  text: 'First added bullet for review.',
                  evidenceId: EVIDENCE_ONE,
                  status: 'assumed',
                  suggestionQuestion: null,
                  requirementId: null,
                  gapKind: null,
                  needsReview: false,
                  editedByPerson: false,
                },
                {
                  id: BULLET_TWO,
                  ordinal: 1,
                  text: 'Second added bullet for review.',
                  evidenceId: EVIDENCE_TWO,
                  status: 'assumed',
                  suggestionQuestion: null,
                  requirementId: null,
                  gapKind: null,
                  needsReview: false,
                  editedByPerson: false,
                },
              ],
            },
          ],
          comments: [],
        },
      ],
      requirementCoverages: [],
    });
    let review: Record<string, string> = {};
    let current: unknown = {
      ...base,
      adaptationChanges: {
        addedEvidences: [
          { id: EVIDENCE_ONE, statement: 'First added one.' },
          { id: EVIDENCE_TWO, statement: 'Second added one.' },
        ],
        removedEvidences: [],
      },
      adaptationReview: review,
    };
    const decidedInOrder: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === `${API_URL}/resumes/${RESUME_ID}` && method === 'GET') {
        return apiJson(current, 200);
      }
      if (url === `${API_URL}/resumes/${RESUME_ID}/adaptation-review` && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { evidenceId: string; decision: string };
        decidedInOrder.push(body.evidenceId);
        review = { ...review, [body.evidenceId]: body.decision };
        current = { ...(current as object), adaptationReview: review };
        return apiJson(current, 200);
      }
      return apiJson({ statusCode: 404, message: 'Not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderRevisar();

    expect(await screen.findByText('2 pendentes')).toBeInTheDocument();
    const sidebarItems = screen.getAllByRole('button', { name: /Pendente/ });
    expect(sidebarItems).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: /First added bullet for review/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Second added bullet for review/ }),
    ).toBeInTheDocument();
    const acceptAll = screen.getByRole('button', { name: 'Aceitar todas' });
    expect(acceptAll).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(acceptAll);
    });

    expect(await screen.findByText('Tudo revisado')).toBeInTheDocument();
    expect(decidedInOrder).toEqual([EVIDENCE_ONE, EVIDENCE_TWO]);
    expect(successMock).toHaveBeenCalledWith(
      'Todas as mudanças aceitas.',
      expect.objectContaining({ duration: 4000 }),
    );
    expect(screen.getByRole('button', { name: 'Aceitar todas' })).toBeDisabled();
  });

  it('should count pending skill proposals and accept them with Aceitar todas', async () => {
    const { toast } = await import('sonner');
    const successMock = vi.mocked(toast.success);
    successMock.mockClear();

    const EVIDENCE_ONE = '11111111-1111-4111-8111-111111111111';
    const BULLET_ONE = '55555555-5555-4555-8555-555555555555';
    const SKILL_PROPOSAL_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const base = resumeDocumentFixture({
      sections: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          kind: 'experience',
          title: null,
          ordinal: 0,
          entries: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              ordinal: 0,
              experienceId: null,
              educationEntryId: null,
              heading: null,
              company: 'Acme',
              role: 'Engineer',
              institution: null,
              degree: null,
              period: '2020-2024',
              bullets: [
                {
                  id: BULLET_ONE,
                  ordinal: 0,
                  text: 'First added bullet for review.',
                  evidenceId: EVIDENCE_ONE,
                  status: 'assumed',
                  suggestionQuestion: null,
                  requirementId: null,
                  gapKind: null,
                  needsReview: false,
                  editedByPerson: false,
                },
              ],
            },
          ],
          comments: [],
        },
      ],
      requirementCoverages: [],
    });
    let review: Record<string, string> = {};
    let skillProposals: unknown[] = [
      {
        id: SKILL_PROPOSAL_ID,
        kind: 'addition',
        name: 'Docker',
        group: 'DevOps',
        replacesSkillId: null,
        replacesSkillName: null,
        requirementId: null,
        literalTerm: null,
        status: 'pending',
        ordinal: 0,
      },
    ];
    let current: unknown = {
      ...base,
      adaptationChanges: {
        addedEvidences: [{ id: EVIDENCE_ONE, statement: 'First added one.' }],
        removedEvidences: [],
      },
      adaptationReview: review,
      skillProposals,
    };
    const decidedInOrder: string[] = [];
    const acceptedSkills: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === `${API_URL}/resumes/${RESUME_ID}` && method === 'GET') {
        return apiJson(current, 200);
      }
      if (url === `${API_URL}/resumes/${RESUME_ID}/adaptation-review` && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { evidenceId: string; decision: string };
        decidedInOrder.push(body.evidenceId);
        review = { ...review, [body.evidenceId]: body.decision };
        current = { ...(current as object), adaptationReview: review };
        return apiJson(current, 200);
      }
      if (
        url === `${API_URL}/resumes/${RESUME_ID}/skill-proposals/${SKILL_PROPOSAL_ID}/accept` &&
        method === 'POST'
      ) {
        acceptedSkills.push(SKILL_PROPOSAL_ID);
        skillProposals = [
          {
            id: SKILL_PROPOSAL_ID,
            kind: 'addition',
            name: 'Docker',
            group: 'DevOps',
            replacesSkillId: null,
            replacesSkillName: null,
            requirementId: null,
            literalTerm: null,
            status: 'accepted',
            ordinal: 0,
          },
        ];
        current = { ...(current as object), skillProposals };
        return apiJson(current, 200);
      }
      return apiJson({ statusCode: 404, message: 'Not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderRevisar();

    expect(await screen.findByText('2 pendentes')).toBeInTheDocument();
    const acceptAll = screen.getByRole('button', { name: 'Aceitar todas' });
    expect(acceptAll).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(acceptAll);
    });

    expect(await screen.findByText('Tudo revisado')).toBeInTheDocument();
    expect(decidedInOrder).toEqual([EVIDENCE_ONE]);
    expect(acceptedSkills).toEqual([SKILL_PROPOSAL_ID]);
    expect(successMock).toHaveBeenCalledWith(
      'Todas as mudanças aceitas.',
      expect.objectContaining({ duration: 4000 }),
    );
  });

  it('should open the section drawer from the sidebar Seções list', async () => {
    stubApiServer(resumeDocumentFixture());
    await renderRevisar();

    await screen.findByTitle('Pré-visualização do currículo');
    expect(screen.getByRole('heading', { name: 'Seções' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Editar seção Professional Experience' }));
    });
    expect(
      await screen.findByRole('dialog', { name: 'Professional Experience' }),
    ).toBeInTheDocument();
  });
});
