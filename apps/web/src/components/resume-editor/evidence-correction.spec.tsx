import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { getCareerProfile, updateEvidence, updateExperience } from '../../lib/api-client';
import { EVIDENCE_ID, EXPERIENCE_REF_ID, RESUME_ID, resumeDocumentFixture } from './editor-fixtures';
import { EvidenceCorrection } from './evidence-correction';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, getCareerProfile: vi.fn(), updateEvidence: vi.fn(), updateExperience: vi.fn() };
});

const mockedGetProfile = vi.mocked(getCareerProfile);
const mockedUpdateEvidence = vi.mocked(updateEvidence);
const mockedUpdateExperience = vi.mocked(updateExperience);
const onDocumentChange = vi.fn();
const onClose = vi.fn();

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

function profileWithLinkedExperience() {
  return {
    experiences: [
      {
        id: EXPERIENCE_REF_ID,
        company: 'Acme',
        role: 'Engineer',
        startedOn: '2020-01',
        endedOn: '2023-06',
      },
    ],
    educationEntries: [],
    evidences: [{ id: EVIDENCE_ID, statement: 'Cut latency by 30%.', experienceId: EXPERIENCE_REF_ID }],
  };
}

function renderCorrection(): void {
  render(
    <EvidenceCorrection
      evidenceId={EVIDENCE_ID}
      experienceId={EXPERIENCE_REF_ID}
      resumeId={RESUME_ID}
      onDocumentChange={onDocumentChange}
      onClose={onClose}
    />,
  );
}

describe('EvidenceCorrection', () => {
  afterEach(() => {
    mockedGetProfile.mockReset();
    mockedUpdateEvidence.mockReset();
    mockedUpdateExperience.mockReset();
    onDocumentChange.mockReset();
    onClose.mockReset();
  });

  it('should explain that the correction reaches every resume before saving', () => {
    mockedGetProfile.mockRejectedValue(new Error('network down'));
    renderCorrection();

    expect(screen.getByText(/vale para todos os currículos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar correção' })).toBeDisabled();
  });

  it('should save the corrected statement and close', async () => {
    mockedGetProfile.mockRejectedValue(new Error('network down'));
    const nextDocument = resumeDocumentFixture();
    mockedUpdateEvidence.mockResolvedValue(nextDocument);
    renderCorrection();

    fireEvent.change(screen.getByLabelText('Fato corrigido'), {
      target: { value: 'Left in 2023.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }));
    await flushPromises();

    expect(mockedUpdateEvidence).toHaveBeenCalledWith(EVIDENCE_ID, { statement: 'Left in 2023.' }, RESUME_ID);
    expect(mockedUpdateExperience).not.toHaveBeenCalled();
    expect(onDocumentChange).toHaveBeenCalledWith(nextDocument);
    expect(onClose).toHaveBeenCalled();
  });

  it('should open with the current statement and the linked experience fields filled', async () => {
    mockedGetProfile.mockResolvedValue(profileWithLinkedExperience());
    renderCorrection();
    await flushPromises();

    expect(screen.getByLabelText('Fato corrigido')).toHaveValue('Cut latency by 30%.');
    expect(screen.getByLabelText('Empresa')).toHaveValue('Acme');
    expect(screen.getByLabelText('Cargo')).toHaveValue('Engineer');
    expect(screen.getByLabelText('Início')).toHaveValue('2020-01');
    expect(screen.getByLabelText('Fim')).toHaveValue('2023-06');
    expect(screen.getByRole('button', { name: 'Salvar correção' })).toBeEnabled();
  });

  it('should label the linked experience group without the fill-in hint', async () => {
    mockedGetProfile.mockResolvedValue(profileWithLinkedExperience());
    renderCorrection();
    await flushPromises();

    expect(screen.getByText('Experiência ligada')).toBeInTheDocument();
    expect(screen.queryByText(/preencha só o que mudou/)).toBeNull();
  });

  it('should send only the changed experience fields together with the statement', async () => {
    mockedGetProfile.mockRejectedValue(new Error('network down'));
    mockedUpdateEvidence.mockResolvedValue(resumeDocumentFixture());
    mockedUpdateExperience.mockResolvedValue(resumeDocumentFixture());
    renderCorrection();

    fireEvent.change(screen.getByLabelText('Fato corrigido'), {
      target: { value: 'Promoted before leaving.' },
    });
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Staff Engineer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }));
    await flushPromises();

    expect(mockedUpdateExperience).toHaveBeenCalledWith(EXPERIENCE_REF_ID, {
      role: 'Staff Engineer',
    }, RESUME_ID);
    expect(onClose).toHaveBeenCalled();
  });

  it('should show an alert when the correction fails', async () => {
    mockedGetProfile.mockRejectedValue(new Error('network down'));
    mockedUpdateEvidence.mockRejectedValue(new Error('network down'));
    renderCorrection();

    fireEvent.change(screen.getByLabelText('Fato corrigido'), {
      target: { value: 'Left in 2023.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }));
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível corrigir o fato.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
