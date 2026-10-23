import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { WizardStepper } from './wizard-stepper';
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

const mockedCareer = vi.mocked(getCareerProfile);
const mockedKey = vi.mocked(getDeepSeekKeyStatus);
const mockedEvaluationByJob = vi.mocked(getEvaluationByJobDescription);
const mockedList = vi.mocked(listResumes);

const JOB_ID = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
const BASE_ID = '8c3a6b0e-2d7c-4a8d-8f2c-4b5e7f9a1c23';

const pathnameState = vi.hoisted(() => ({ pathname: '/vaga', search: '' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.pathname,
  useSearchParams: () => new URLSearchParams(pathnameState.search),
}));

async function flush(): Promise<void> {
  await act(async () => {});
}

describe('WizardStepper', () => {
  beforeEach(() => {
    mockedEvaluationByJob.mockRejectedValue(new ApiError(404, undefined, undefined));
    mockedList.mockRejectedValue(new ApiError(404, undefined, undefined));
  });

  afterEach(() => {
    mockedCareer.mockReset();
    mockedKey.mockReset();
    mockedEvaluationByJob.mockReset();
    mockedList.mockReset();
    pathnameState.pathname = '/vaga';
    pathnameState.search = '';
  });

  it('should mark exactly one step as current on vaga', async () => {
    mockedCareer.mockRejectedValue(new Error('no profile'));
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    render(<WizardStepper />);
    await flush();

    expect(screen.getByRole('navigation', { name: 'Etapas' })).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    const currentItems = document.querySelectorAll('[aria-current="step"]');
    expect(currentItems).toHaveLength(1);
    expect(currentItems[0]).toHaveTextContent('Vaga');
  });

  it('should list Vaga first and Currículo second', async () => {
    mockedCareer.mockRejectedValue(new Error('no profile'));
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    render(<WizardStepper />);
    await flush();

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Vaga');
    expect(items[1]).toHaveTextContent('Currículo');
  });

  it('should render done steps as links with the right href', async () => {
    mockedCareer.mockResolvedValue({ experiences: [], educationEntries: [], evidences: [] });
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    pathnameState.pathname = '/avaliacao';
    pathnameState.search = `vaga=${JOB_ID}`;
    render(<WizardStepper />);
    await flush();

    expect(screen.getByRole('link', { name: /Vaga/ })).toHaveAttribute('href', `/vaga?vaga=${JOB_ID}`);
    expect(screen.getByRole('link', { name: /Currículo/ })).toHaveAttribute(
      'href',
      `/curriculo?vaga=${JOB_ID}`,
    );
  });

  it('should keep the chosen base resume in the done step links', async () => {
    mockedCareer.mockResolvedValue({ experiences: [], educationEntries: [], evidences: [] });
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    pathnameState.pathname = '/avaliacao';
    pathnameState.search = `vaga=${JOB_ID}&base=${BASE_ID}`;
    render(<WizardStepper />);
    await flush();

    expect(screen.getByRole('link', { name: /Currículo/ })).toHaveAttribute(
      'href',
      `/curriculo?vaga=${JOB_ID}&base=${BASE_ID}`,
    );
  });

  it.each(['/curriculo', '/importacao', '/revisao', '/revisao/base-resume', '/pronto'])(
    'should make Currículo the current step on %s inside a flow',
    async (pathname) => {
      mockedCareer.mockRejectedValue(new ApiError(404, undefined, undefined));
      mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
      pathnameState.pathname = pathname;
      pathnameState.search = `vaga=${JOB_ID}`;
      render(<WizardStepper />);
      await flush();

      expect(document.querySelector('[aria-current="step"]')).toHaveTextContent('Currículo');
    },
  );

  it('should not render pending steps as links', async () => {
    mockedCareer.mockRejectedValue(new Error('no profile'));
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    pathnameState.pathname = '/curriculo';
    render(<WizardStepper />);
    await flush();

    expect(screen.queryByRole('link', { name: /Exportar/ })).toBeNull();
    expect(screen.getByText('Exportar').closest('a')).toBeNull();
  });

  it('should announce pending state in sr-only text', async () => {
    mockedCareer.mockRejectedValue(new Error('no profile'));
    mockedKey.mockResolvedValue({ configured: true, lastFour: '1234' });
    pathnameState.pathname = '/curriculo';
    render(<WizardStepper />);
    await flush();

    expect(screen.getAllByText('(pendente)', { exact: false }).length).toBeGreaterThan(0);
  });
});
