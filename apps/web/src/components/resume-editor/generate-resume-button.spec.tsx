import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ResumeListItem } from 'schema/contracts/resume';
import { createTailoredResume, listResumes } from '../../lib/api-client';
import { GenerateResumeButton } from './generate-resume-button';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, createTailoredResume: vi.fn(), listResumes: vi.fn() };
});

const simulated = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: simulated.replace }),
}));

const mockedList = vi.mocked(listResumes);
const mockedCreate = vi.mocked(createTailoredResume);
const replace = simulated.replace;

const JOB_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const BASE_ID = '7b2f5a9d-1c6b-5f7c-9e1b-3a4d6e8f0b12';
const CREATED_ID = '8c3a6b0e-2d7c-6a8d-0f2c-4b5e7f9a1b23';

function baseResumeItem(): ResumeListItem {
  return {
    id: BASE_ID,
    kind: 'base',
    name: 'Backend focus',
    language: 'pt',
    template: 'comfortable',
    lengthTarget: 2,
    writingMethod: 'xyz',
    tone: 'direct',
    baseResumeId: null,
    jobDescriptionId: null,
    jobTitle: null,
    generationStatus: 'ready',
    failureReason: null,
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
    exports: [],
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

describe('GenerateResumeButton', () => {
  afterEach(() => {
    mockedList.mockReset();
    mockedCreate.mockReset();
    replace.mockReset();
  });

  it('should link back to the vacancy step when there is no job description', () => {
    render(<GenerateResumeButton jobDescriptionId={null} />);

    expect(screen.getByRole('link', { name: 'Colar uma vaga' })).toHaveAttribute('href', '/vaga');
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('should lead to the first base resume creation when none exists', async () => {
    mockedList.mockResolvedValue({ resumes: [] });
    render(<GenerateResumeButton jobDescriptionId={JOB_ID} />);

    await screen.findByRole('link', { name: 'Criar primeiro Base Resume' });

    expect(screen.getByRole('link', { name: 'Criar primeiro Base Resume' })).toHaveAttribute(
      'href',
      '/curriculos/novo',
    );
  });

  it('should generate a tailored resume from the chosen base and open the editor', async () => {
    mockedList.mockResolvedValue({ resumes: [baseResumeItem()] });
    mockedCreate.mockResolvedValue({ id: CREATED_ID });
    render(<GenerateResumeButton jobDescriptionId={JOB_ID} />);

    const generate = await screen.findByRole('button', { name: 'Gerar currículo para esta vaga' });
    fireEvent.click(generate);
    await flushPromises();

    expect(mockedCreate).toHaveBeenCalledWith({ baseResumeId: BASE_ID, jobDescriptionId: JOB_ID });
    expect(replace).toHaveBeenCalledWith(`/curriculos/${CREATED_ID}`);
  });

  it('should announce the generation progress inside a status region', async () => {
    let resolveCreation: (value: { id: string }) => void = () => undefined;
    mockedList.mockResolvedValue({ resumes: [baseResumeItem()] });
    mockedCreate.mockReturnValue(
      new Promise<{ id: string }>((resolve) => {
        resolveCreation = resolve;
      }),
    );
    render(<GenerateResumeButton jobDescriptionId={JOB_ID} />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Gerar currículo para esta vaga' }),
    );

    expect(screen.getByRole('status')).toHaveTextContent('Gerando o currículo para esta vaga.');

    resolveCreation({ id: CREATED_ID });
    await flushPromises();
  });

  it('should show an alert when the generation fails', async () => {
    mockedList.mockResolvedValue({ resumes: [baseResumeItem()] });
    mockedCreate.mockRejectedValue(new Error('network down'));
    render(<GenerateResumeButton jobDescriptionId={JOB_ID} />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Gerar currículo para esta vaga' }),
    );
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o cv-adapter.',
    );
    expect(replace).not.toHaveBeenCalled();
  });
});
