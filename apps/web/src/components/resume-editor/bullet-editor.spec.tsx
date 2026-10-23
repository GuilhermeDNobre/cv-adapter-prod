import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { updateBullet, updateEvidence } from '../../lib/api-client';
import { BulletEditor } from './bullet-editor';
import {
  assumedBulletFixture,
  EXPERIENCE_REF_ID,
  RESUME_ID,
  resumeDocumentFixture,
  reviewBulletFixture,
} from './editor-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    getCareerProfile: vi.fn().mockRejectedValue(new Error('network down')),
    updateBullet: vi.fn(),
    updateEvidence: vi.fn(),
    updateExperience: vi.fn(),
  };
});

const mockedUpdateBullet = vi.mocked(updateBullet);
const mockedUpdateEvidence = vi.mocked(updateEvidence);
const onDocumentChange = vi.fn();

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

describe('BulletEditor', () => {
  afterEach(() => {
    mockedUpdateBullet.mockReset();
    mockedUpdateEvidence.mockReset();
    onDocumentChange.mockReset();
  });

  it('should show the bullet text with an edit action', () => {
    render(
      <BulletEditor
        bullet={assumedBulletFixture()}
        experienceId={EXPERIENCE_REF_ID}
        resumeId={RESUME_ID}
        onDocumentChange={onDocumentChange}
      />,
    );

    expect(screen.getByText('Cut API latency by 30% with caching.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('should save the edited text and announce it inside a status region', async () => {
    const nextDocument = resumeDocumentFixture();
    mockedUpdateBullet.mockResolvedValue(nextDocument);
    render(
      <BulletEditor
        bullet={assumedBulletFixture()}
        experienceId={EXPERIENCE_REF_ID}
        resumeId={RESUME_ID}
        onDocumentChange={onDocumentChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Texto do Bullet'), {
      target: { value: 'Cut API latency by half.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await flushPromises();

    expect(mockedUpdateBullet).toHaveBeenCalledWith(assumedBulletFixture().id, {
      text: 'Cut API latency by half.',
    });
    expect(onDocumentChange).toHaveBeenCalledWith(nextDocument);
    expect(screen.getByRole('status')).toHaveTextContent('Bullet salvo.');
  });

  it('should keep save disabled while the text is blank', () => {
    render(
      <BulletEditor
        bullet={assumedBulletFixture()}
        experienceId={EXPERIENCE_REF_ID}
        resumeId={RESUME_ID}
        onDocumentChange={onDocumentChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Texto do Bullet'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(mockedUpdateBullet).not.toHaveBeenCalled();
  });

  it('should warn by text when the bullet needs review after a fact correction', () => {
    render(
      <BulletEditor
        bullet={reviewBulletFixture()}
        experienceId={EXPERIENCE_REF_ID}
        resumeId={RESUME_ID}
        onDocumentChange={onDocumentChange}
      />,
    );

    expect(screen.getByText(/precisa de revisão/)).toBeInTheDocument();
  });

  it('should open the fact correction with the shared-fact warning and return focus on close', async () => {
    render(
      <BulletEditor
        bullet={assumedBulletFixture()}
        experienceId={EXPERIENCE_REF_ID}
        resumeId={RESUME_ID}
        onDocumentChange={onDocumentChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Corrigir fato de origem' }));

    expect(screen.getByText(/vale para todos os currículos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Corrigir fato de origem' }),
    );
    expect(mockedUpdateEvidence).not.toHaveBeenCalled();
    await flushPromises();
  });

  it('should show an alert when saving fails', async () => {
    mockedUpdateBullet.mockRejectedValue(new Error('network down'));
    render(
      <BulletEditor
        bullet={assumedBulletFixture()}
        experienceId={EXPERIENCE_REF_ID}
        resumeId={RESUME_ID}
        onDocumentChange={onDocumentChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Texto do Bullet'), { target: { value: 'New text.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar o Bullet.');
    expect(onDocumentChange).not.toHaveBeenCalled();
  });
});
