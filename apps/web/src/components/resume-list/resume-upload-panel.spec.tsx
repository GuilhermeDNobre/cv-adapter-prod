import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiError, getCareerProfile } from '../../lib/api-client';
import { ResumeUploadPanel } from './resume-upload-panel';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, getCareerProfile: vi.fn() };
});

const mockedProfile = vi.mocked(getCareerProfile);

describe('ResumeUploadPanel', () => {
  afterEach(() => {
    mockedProfile.mockReset();
    vi.restoreAllMocks();
  });

  it('should link to the upload screen of the resume area', () => {
    mockedProfile.mockReturnValue(new Promise<never>(() => undefined));
    render(<ResumeUploadPanel baseCount={null} />);

    expect(screen.getByRole('link', { name: 'Enviar currículo' })).toHaveAttribute(
      'href',
      '/importacao',
    );
    expect(screen.getByText('Verificando seu Career Profile.')).toBeInTheDocument();
  });

  it('should say the upload creates everything when there is no career profile', async () => {
    mockedProfile.mockRejectedValue(new ApiError(404, 'Career profile not found.'));
    render(<ResumeUploadPanel baseCount={0} />);

    expect(
      await screen.findByText(/cria seu Career Profile e um Base Resume novo/),
    ).toBeInTheDocument();
  });

  it('should say the upload merges when a career profile already exists', async () => {
    mockedProfile.mockResolvedValue({ experiences: [], educationEntries: [], evidences: [] });
    render(<ResumeUploadPanel baseCount={0} />);

    const message = await screen.findByText(/junta ao existente sem duplicar/);
    expect(message).not.toHaveTextContent('Você já tem 0');
  });

  it('should count the Base Resumes already saved', async () => {
    mockedProfile.mockResolvedValue({ experiences: [], educationEntries: [], evidences: [] });
    const { rerender } = render(<ResumeUploadPanel baseCount={1} />);

    expect(await screen.findByText(/Você já tem 1 Base Resume\./)).toBeInTheDocument();

    rerender(<ResumeUploadPanel baseCount={2} />);
    expect(screen.getByText(/Você já tem 2 Base Resumes\./)).toBeInTheDocument();
  });

  it('should fall back to a neutral message and log without payload when the profile cannot be read', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedProfile.mockRejectedValue(new ApiError(500, 'boom', { message: 'boom' }));
    render(<ResumeUploadPanel baseCount={null} />);

    expect(await screen.findByText(/para montar ou juntar ao seu Career Profile/)).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith('resume_upload_panel.profile_failed', { status: 500 });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('boom');
  });
});
