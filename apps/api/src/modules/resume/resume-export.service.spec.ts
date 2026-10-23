import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfRenderer } from '../rendering/pdf-renderer';
import { ResumeExportService } from './resume-export.service';
import type { OwnedResumeExport, ResumeExportRepository } from './resume-export.repository';
import type { ResumeDisplayDetails, ResumeDocument, ResumeRepository } from './resume.repository';

const USER_ID = 'user-id';
const RESUME_ID = '11111111-1111-4111-8111-111111111111';
const EXPORT_ID = '22222222-2222-4222-8222-222222222222';
const EXPERIENCE_ID = '88888888-8888-4888-8888-888888888888';

function makeDocument(
  lengthTarget: 1 | 2 = 1,
  generationStatus: 'ready' | 'generating' | 'failed' = 'ready',
  failureReason: 'rewrite_claims_rejected' | 'nothing_to_rewrite' | null = null,
): ResumeDocument {
  const now = new Date('2026-09-01T00:00:00.000Z');
  return {
    resume: {
      id: RESUME_ID,
      userId: USER_ID,
      kind: 'base',
      name: 'Backend focus',
      language: 'en',
      template: 'comfortable',
      lengthTarget,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: null,
      jobDescriptionId: null,
      generationStatus,
      failureReason,
      adaptationPlan: null,
      createdAt: now,
      updatedAt: now,
    },
    sections: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        resumeId: RESUME_ID,
        kind: 'experience',
        title: null,
        ordinal: 1,
        undoSnapshot: null,
        createdAt: now,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        resumeId: RESUME_ID,
        kind: 'skills',
        title: null,
        ordinal: 0,
        undoSnapshot: null,
        createdAt: now,
      },
    ],
    entries: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        sectionId: '33333333-3333-4333-8333-333333333333',
        ordinal: 0,
        experienceId: EXPERIENCE_ID,
        educationEntryId: null,
        heading: null,
        createdAt: now,
      },
      {
        id: '99999999-9999-4999-8999-999999999999',
        sectionId: '44444444-4444-4444-8444-444444444444',
        ordinal: 0,
        experienceId: null,
        educationEntryId: null,
        heading: null,
        createdAt: now,
      },
    ],
    bullets: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        entryId: '55555555-5555-4555-8555-555555555555',
        ordinal: 1,
        text: 'Draft suggestion text',
        evidenceId: null,
        status: 'suggestion',
        suggestionQuestion: 'Do you have this?',
        requirementId: null,
        gapKind: null,
        needsReview: false,
        editedByPerson: false,
        createdAt: now,
      },
      {
        id: '77777777-7777-4777-8777-777777777777',
        entryId: '55555555-5555-4555-8555-555555555555',
        ordinal: 0,
        text: 'Shipped checkout flow',
        evidenceId: null,
        status: 'assumed',
        suggestionQuestion: null,
        requirementId: null,
        gapKind: null,
        needsReview: false,
        editedByPerson: false,
        createdAt: now,
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        entryId: '99999999-9999-4999-8999-999999999999',
        ordinal: 0,
        text: 'TypeScript',
        evidenceId: null,
        status: 'assumed',
        suggestionQuestion: null,
        requirementId: null,
        gapKind: null,
        needsReview: false,
        editedByPerson: false,
        createdAt: now,
      },
    ],
    comments: [],
    sectionSkills: [
      {
        sectionId: '44444444-4444-4444-8444-444444444444',
        skillId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ordinal: 0,
      },
    ],
    skills: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        careerProfileId: 'profile-1',
        name: 'TypeScript',
        group: null,
        createdAt: now,
      },
    ],
    exports: [],
  } as unknown as ResumeDocument;
}

function makeDetails(): ResumeDisplayDetails {
  return {
    contact: {
      careerProfileId: 'profile-1',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+5511999999999',
      links: [{ title: 'LinkedIn', url: 'https://linkedin.com/in/ada' }],
    },
    experiences: [
      {
        id: EXPERIENCE_ID,
        careerProfileId: 'profile-1',
        company: 'Acme',
        role: 'Engineer',
        startedOn: '2020-01-01',
        endedOn: '2023-01-01',
        createdAt: new Date(),
      },
    ],
    educationEntries: [],
    skills: [],
  } as unknown as ResumeDisplayDetails;
}

function createService(options: { pageCount: number }) {
  const findDocument = vi.fn(async () => makeDocument(1));
  const findDisplayDetails = vi.fn(async () => makeDetails());
  const repository = { findDocument, findDisplayDetails } as unknown as ResumeRepository;
  const createExport = vi.fn(async () => EXPORT_ID);
  const findOwnedExport = vi.fn(async (): Promise<OwnedResumeExport | undefined> => undefined);
  const exportRepository = { createExport, findOwnedExport } as unknown as ResumeExportRepository;
  const render = vi.fn(async (html: string) => ({
    pdf: Buffer.from(`pdf-bytes-${html.length}`),
    pageCount: options.pageCount,
  }));
  const renderer = { render } as unknown as PdfRenderer;
  const service = new ResumeExportService(repository, exportRepository, renderer);
  return { service, findDocument, createExport, findOwnedExport, render };
}

describe('ResumeExportService.exportResume', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('should render print html without unconfirmed suggestions and save the export', async () => {
    const { service, render, createExport } = createService({ pageCount: 1 });

    const result = await service.exportResume(USER_ID, RESUME_ID);

    expect(result).toEqual({ exportId: EXPORT_ID, pageCount: 1, exceedsLengthTarget: false });
    expect(render).toHaveBeenCalledTimes(1);
    const [html] = render.mock.calls[0] as [string];
    expect(html).toContain('Shipped checkout flow');
    expect(html).not.toContain('Draft suggestion text');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('Acme');
    expect(createExport).toHaveBeenCalledWith({ resumeId: RESUME_ID, pdf: expect.any(Buffer), pageCount: 1 });
  });

  it('should render titled contact links with their titles', async () => {
    const { service, render } = createService({ pageCount: 1 });

    await service.exportResume(USER_ID, RESUME_ID);

    const [html] = render.mock.calls[0] as [string];
    expect(html).toContain('<a href="https://linkedin.com/in/ada">LinkedIn</a>');
  });

  it('should order sections and bullets by ordinal like the preview mapping', async () => {
    const { service, render } = createService({ pageCount: 1 });

    await service.exportResume(USER_ID, RESUME_ID);

    const [html] = render.mock.calls[0] as [string];
    const skillsIndex = html.indexOf('Skills');
    const experienceIndex = html.indexOf('Experience');
    expect(skillsIndex).toBeGreaterThan(-1);
    expect(experienceIndex).toBeGreaterThan(-1);
    expect(skillsIndex).toBeLessThan(experienceIndex);
    const assumedIndex = html.indexOf('Shipped checkout flow');
    expect(assumedIndex).toBeGreaterThan(-1);
  });

  it('should print the skills section of a tailored resume in the curriculo.tex structure', async () => {
    const importedAt = new Date('2026-09-25T18:34:16.000Z');
    const skillsSectionId = '44444444-4444-4444-8444-444444444444';
    const profileSkills = [
      ['c0000000-0000-4000-8000-000000000000', 'JavaScript', 'Linguagens'],
      ['c0000000-0000-4000-8000-000000000001', 'TypeScript', 'Linguagens'],
      ['c0000000-0000-4000-8000-000000000002', 'Fastify', 'Back-end'],
      ['c0000000-0000-4000-8000-000000000003', 'NestJS', 'Back-end'],
      ['c0000000-0000-4000-8000-000000000004', 'PostgreSQL', 'Banco de Dados / Mensageria'],
    ].map(([id, name, group], ordinal) => ({ id, careerProfileId: 'profile-1', name, group, ordinal, createdAt: importedAt }));
    const matchedFirst = ['NestJS', 'PostgreSQL', 'TypeScript', 'JavaScript', 'Fastify'].map(
      (name) => profileSkills.find((skill) => skill.name === name)!,
    );
    const base = makeDocument(1);
    const document = {
      ...base,
      resume: { ...base.resume, kind: 'tailored', language: 'pt' },
      sections: base.sections.filter((section) => section.kind === 'skills'),
      entries: [],
      bullets: [],
      sectionSkills: matchedFirst.map((skill, ordinal) => ({ sectionId: skillsSectionId, skillId: skill.id, ordinal })),
      skills: matchedFirst,
    } as unknown as ResumeDocument;
    const details = {
      ...makeDetails(),
      skills: profileSkills,
      languages: [
        { id: 'd0000000-0000-4000-8000-000000000000', careerProfileId: 'profile-1', name: 'Português', level: 'Nativo', createdAt: importedAt },
        { id: 'd0000000-0000-4000-8000-000000000001', careerProfileId: 'profile-1', name: 'Inglês', level: 'Avançado (C1)', createdAt: importedAt },
      ],
      certifications: [],
    } as unknown as ResumeDisplayDetails;
    const render = vi.fn(async (html: string) => ({ pdf: Buffer.from(html), pageCount: 1 }));
    const repository = {
      findDocument: vi.fn(async () => document),
      findDisplayDetails: vi.fn(async () => details),
    } as unknown as ResumeRepository;
    const exportRepository = { createExport: vi.fn(async () => EXPORT_ID) } as unknown as ResumeExportRepository;
    const service = new ResumeExportService(repository, exportRepository, { render } as unknown as PdfRenderer);

    await service.exportResume(USER_ID, RESUME_ID);

    const [html] = render.mock.calls[0] as [string];
    expect(html).toContain(
      '<h2 class="section-title">Habilidades</h2>\n<div class="entry">\n<ul class="bullets skills-list">\n' +
        '<li><strong class="skills-group">Linguagens:</strong> TypeScript, JavaScript</li>\n' +
        '<li><strong class="skills-group">Back-end:</strong> NestJS, Fastify</li>\n' +
        '<li><strong class="skills-group">Banco de Dados / Mensageria:</strong> PostgreSQL</li>\n' +
        '<li><strong class="skills-group">Idiomas:</strong> <span class="language-item">Português: Nativo</span> <span class="language-item">Inglês: Avançado (C1)</span></li>\n' +
        '</ul>\n</div>\n</section>',
    );
  });

  it('should flag exceedsLengthTarget when the page count passes the target', async () => {
    const { service } = createService({ pageCount: 2 });

    const result = await service.exportResume(USER_ID, RESUME_ID);

    expect(result.exceedsLengthTarget).toBe(true);
    expect(result.pageCount).toBe(2);
  });

  it('should log pdf.render.completed with identifiers only', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { service } = createService({ pageCount: 1 });

    await service.exportResume(USER_ID, RESUME_ID);

    expect(logSpy).toHaveBeenCalledWith('pdf.render.completed', {
      resumeId: RESUME_ID,
      pageCount: 1,
      durationMs: expect.any(Number),
    });
    const [message, payload] = logSpy.mock.calls.find(([name]) => name === 'pdf.render.completed') as [
      string,
      Record<string, unknown>,
    ];
    expect(message).toBe('pdf.render.completed');
    expect(JSON.stringify(payload)).not.toContain('Shipped checkout flow');
    expect(JSON.stringify(payload)).not.toContain('Ada Lovelace');
  });

  it('should answer 404 for an unknown resume', async () => {
    const { service } = createService({ pageCount: 1 });
    const repository = { findDocument: vi.fn(async () => undefined), findDisplayDetails: vi.fn() };
    const exportRepository = { createExport: vi.fn(), findOwnedExport: vi.fn() };
    const renderer = { render: vi.fn() };
    const missing = new ResumeExportService(
      repository as unknown as ResumeRepository,
      exportRepository as unknown as ResumeExportRepository,
      renderer as unknown as PdfRenderer,
    );

    await expect(service.exportResume(USER_ID, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
    await expect(missing.exportResume(USER_ID, RESUME_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should answer 422 when the document is still generating', async () => {
    const findDocument = vi.fn(async () => makeDocument(1, 'generating'));
    const findDisplayDetails = vi.fn(async () => makeDetails());
    const repository = { findDocument, findDisplayDetails } as unknown as ResumeRepository;
    const createExport = vi.fn(async () => EXPORT_ID);
    const exportRepository = { createExport, findOwnedExport: vi.fn() } as unknown as ResumeExportRepository;
    const render = vi.fn();
    const renderer = { render } as unknown as PdfRenderer;
    const service = new ResumeExportService(repository, exportRepository, renderer);

    const error = await service.exportResume(USER_ID, RESUME_ID).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getStatus()).toBe(422);
    expect(render).not.toHaveBeenCalled();
    expect(createExport).not.toHaveBeenCalled();
  });

  it('should answer 422 when the document generation failed', async () => {
    const findDocument = vi.fn(async () => makeDocument(1, 'failed'));
    const findDisplayDetails = vi.fn(async () => makeDetails());
    const repository = { findDocument, findDisplayDetails } as unknown as ResumeRepository;
    const createExport = vi.fn(async () => EXPORT_ID);
    const exportRepository = { createExport, findOwnedExport: vi.fn() } as unknown as ResumeExportRepository;
    const render = vi.fn();
    const renderer = { render } as unknown as PdfRenderer;
    const service = new ResumeExportService(repository, exportRepository, renderer);

    const error = await service.exportResume(USER_ID, RESUME_ID).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getStatus()).toBe(422);
    expect(render).not.toHaveBeenCalled();
    expect(createExport).not.toHaveBeenCalled();
  });

  it('should export a ready document that carries a rewrite refusal notice', async () => {
    const findDocument = vi.fn(async () => makeDocument(1, 'ready', 'rewrite_claims_rejected'));
    const findDisplayDetails = vi.fn(async () => makeDetails());
    const repository = { findDocument, findDisplayDetails } as unknown as ResumeRepository;
    const createExport = vi.fn(async () => EXPORT_ID);
    const exportRepository = { createExport, findOwnedExport: vi.fn() } as unknown as ResumeExportRepository;
    const render = vi.fn(async (html: string) => ({ pdf: Buffer.from(html), pageCount: 1 }));
    const renderer = { render } as unknown as PdfRenderer;
    const service = new ResumeExportService(repository, exportRepository, renderer);
    const result = await service.exportResume(USER_ID, RESUME_ID);
    expect(result).toEqual({ exportId: EXPORT_ID, pageCount: 1, exceedsLengthTarget: false });
    expect(render).toHaveBeenCalledTimes(1);
    expect(createExport).toHaveBeenCalledTimes(1);
  });

  it('should log pdf.render.failed with the error message and skip the database write', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const findDocument = vi.fn(async () => makeDocument(1));
    const findDisplayDetails = vi.fn(async () => makeDetails());
    const repository = { findDocument, findDisplayDetails } as unknown as ResumeRepository;
    const createExport = vi.fn(async () => EXPORT_ID);
    const exportRepository = { createExport, findOwnedExport: vi.fn() } as unknown as ResumeExportRepository;
    const renderer = { render: vi.fn(async () => Promise.reject(new Error('chromium boom'))) };
    const service = new ResumeExportService(
      repository,
      exportRepository,
      renderer as unknown as PdfRenderer,
    );

    await expect(service.exportResume(USER_ID, RESUME_ID)).rejects.toThrow('chromium boom');
    expect(createExport).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('pdf.render.failed', {
      resumeId: RESUME_ID,
      pageCount: 0,
      durationMs: expect.any(Number),
      error: 'chromium boom',
    });
    const [, payload] = errorSpy.mock.calls.find(([name]) => name === 'pdf.render.failed') as [
      string,
      Record<string, unknown>,
    ];
    expect(JSON.stringify(payload)).not.toContain('Shipped checkout flow');
  });

  it('should not log pdf.render.failed when the database write fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const findDocument = vi.fn(async () => makeDocument(1));
    const findDisplayDetails = vi.fn(async () => makeDetails());
    const repository = { findDocument, findDisplayDetails } as unknown as ResumeRepository;
    const createExport = vi.fn(async () => Promise.reject(new Error('database down')));
    const exportRepository = { createExport, findOwnedExport: vi.fn() } as unknown as ResumeExportRepository;
    const renderer = { render: vi.fn(async () => ({ pdf: Buffer.from('pdf'), pageCount: 1 })) };
    const service = new ResumeExportService(
      repository,
      exportRepository,
      renderer as unknown as PdfRenderer,
    );

    await expect(service.exportResume(USER_ID, RESUME_ID)).rejects.toThrow('database down');
    expect(errorSpy.mock.calls.filter(([name]) => name === 'pdf.render.failed')).toHaveLength(0);
  });
});

describe('ResumeExportService.downloadExport', () => {
  it('should return the stored pdf with a readable filename', async () => {
    const { service, findOwnedExport } = createService({ pageCount: 1 });
    findOwnedExport.mockResolvedValue({
      id: EXPORT_ID,
      resumeId: RESUME_ID,
      resumeName: 'Backend focus',
      pdf: Buffer.from('pdf-bytes'),
      pageCount: 1,
      createdAt: new Date(),
    });

    const result = await service.downloadExport(USER_ID, EXPORT_ID);

    expect(result.pdf).toBeInstanceOf(Buffer);
    expect(result.filename).toBe('curriculo-backend-focus.pdf');
  });

  it('should strip accents from the filename', async () => {
    const { service, findOwnedExport } = createService({ pageCount: 1 });
    findOwnedExport.mockResolvedValue({
      id: EXPORT_ID,
      resumeId: RESUME_ID,
      resumeName: 'Currículo São Paulo',
      pdf: Buffer.from('pdf-bytes'),
      pageCount: 1,
      createdAt: new Date(),
    });

    const result = await service.downloadExport(USER_ID, EXPORT_ID);

    expect(result.filename).toBe('curriculo-curriculo-sao-paulo.pdf');
  });

  it('should answer 404 for an unknown export', async () => {
    const { service } = createService({ pageCount: 1 });

    await expect(service.downloadExport(USER_ID, EXPORT_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.downloadExport(USER_ID, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
  });
});
