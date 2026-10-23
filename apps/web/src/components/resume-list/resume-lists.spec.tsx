import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ResumeListItem } from 'schema/contracts/resume';
import { ResumeLists } from './resume-lists';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, deleteResume: vi.fn(), downloadResumeExport: vi.fn() };
});

const BASE_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const TAILORED_ID = '7b2f5a9d-1c6b-5f7c-9e1b-3a4d6e8f0b12';
const JOB_ID = '11111111-1111-4111-8111-111111111111';

function baseResume(): ResumeListItem {
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

function tailoredResume(): ResumeListItem {
  return {
    id: TAILORED_ID,
    kind: 'tailored',
    name: 'Backend focus — Senior Full Stack Developer',
    language: 'en',
    template: 'comfortable',
    lengthTarget: 2,
    writingMethod: 'xyz',
    tone: 'direct',
    baseResumeId: BASE_ID,
    jobDescriptionId: JOB_ID,
    jobTitle: 'Senior Full Stack Developer',
    generationStatus: 'ready',
    failureReason: null,
    createdAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T10:00:00.000Z',
    exports: [],
  };
}

describe('ResumeLists', () => {
  it('should group by job title without showing the uuid', () => {
    render(<ResumeLists resumes={[baseResume(), tailoredResume()]} onDeleted={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Senior Full Stack Developer' })).toBeInTheDocument();
    expect(screen.queryByText(JOB_ID)).toBeNull();
    expect(screen.queryByText(JOB_ID.slice(0, 8))).toBeNull();
    expect(screen.getByText('Backend focus — Senior Full Stack Developer')).toBeInTheDocument();
  });
});
