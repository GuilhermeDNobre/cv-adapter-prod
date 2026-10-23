import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FunnelHeader } from './funnel-header';
import {
  ApiError,
  getCareerProfile,
  getDeepSeekKeyStatus,
  getEvaluationByJobDescription,
  listResumes,
} from '../../lib/api-client';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    getCareerProfile: vi.fn(),
    getEvaluation: vi.fn(),
    getEvaluationByJobDescription: vi.fn(),
    getResume: vi.fn(),
    getResumeImport: vi.fn(),
    getDeepSeekKeyStatus: vi.fn(),
    listResumes: vi.fn(),
  };
});

const navigationState = vi.hoisted(() => ({ pathname: '/vaga', search: '' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
  useSearchParams: () => new URLSearchParams(navigationState.search),
}));

const JOB_ID = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
const notFound = new ApiError(404, undefined, undefined);

async function renderHeader(pathname: string, search: string): Promise<void> {
  navigationState.pathname = pathname;
  navigationState.search = search;
  render(<FunnelHeader />);
  await act(async () => {});
}

describe('FunnelHeader', () => {
  beforeEach(() => {
    vi.mocked(getCareerProfile).mockRejectedValue(notFound);
    vi.mocked(getDeepSeekKeyStatus).mockResolvedValue({ configured: true, lastFour: '1234' });
    vi.mocked(getEvaluationByJobDescription).mockRejectedValue(notFound);
    vi.mocked(listResumes).mockRejectedValue(notFound);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(['/importacao', '/revisao', '/revisao/base-resume', '/pronto'])(
    'should frame %s as the resume area, without the wizard steps',
    async (pathname) => {
      await renderHeader(pathname, '');

      expect(screen.getByText('Meus currículos')).toBeInTheDocument();
      expect(screen.getByText('Enviar currículo')).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Etapas' })).not.toBeInTheDocument();
      expect(screen.queryByText('Nova adaptação')).not.toBeInTheDocument();
    },
  );

  it('should frame the import review as the resume step of the wizard when a vaga is carried', async () => {
    await renderHeader('/revisao', `vaga=${JOB_ID}`);

    expect(screen.getByText('Nova adaptação')).toBeInTheDocument();
    const steps = screen.getByRole('navigation', { name: 'Etapas' });
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('Currículo');
    expect(screen.queryByText('Meus currículos')).not.toBeInTheDocument();
  });

  it.each(['/vaga', '/curriculo', '/avaliacao', '/adaptar'])(
    'should show the wizard steps on %s',
    async (pathname) => {
      await renderHeader(pathname, '');

      expect(screen.getByText('Nova adaptação')).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Etapas' })).toBeInTheDocument();
    },
  );
});
