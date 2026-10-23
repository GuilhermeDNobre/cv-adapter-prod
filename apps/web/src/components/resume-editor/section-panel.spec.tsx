import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { requestSectionRewrite, undoSectionRewrite } from '../../lib/api-client';
import { SectionPanel, sectionHeadingOf } from './section-panel';
import {
  experienceSectionFixture,
  RESUME_ID,
  resumeDocumentFixture,
  SECTION_EXPERIENCE_ID,
  summarySectionFixture,
} from './editor-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    requestSectionRewrite: vi.fn(),
    undoSectionRewrite: vi.fn(),
  };
});

const mockedRewrite = vi.mocked(requestSectionRewrite);
const mockedUndo = vi.mocked(undoSectionRewrite);

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

function renderExperience(onDocumentChange = vi.fn()) {
  render(
    <SectionPanel
      section={experienceSectionFixture()}
      sections={[summarySectionFixture(), experienceSectionFixture()]}
      resumeId={RESUME_ID}
      language="en"
      onDocumentChange={onDocumentChange}
      onSectionRemoved={vi.fn()}
    />,
  );
  return onDocumentChange;
}

describe('sectionHeadingOf', () => {
  it('should use the kind label for typed sections', () => {
    expect(sectionHeadingOf(experienceSectionFixture())).toBe('Experience');
  });

  it('should prefer the custom title on a custom section', () => {
    const custom = { ...summarySectionFixture(), kind: 'custom' as const, title: 'Talks' };
    expect(sectionHeadingOf(custom)).toBe('Talks');
  });
});

describe('SectionPanel', () => {
  afterEach(() => {
    mockedRewrite.mockReset();
    mockedUndo.mockReset();
  });

  it('should render bullets and suggestions without the comment panel', () => {
    renderExperience();

    expect(screen.getByText('Cut API latency by 30% with caching.')).toBeInTheDocument();
    expect(screen.getByText('Led a team of 20 engineers.')).toBeInTheDocument();
    expect(screen.queryByText('Make it shorter.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Novo Comment')).not.toBeInTheDocument();
    expect(screen.queryByText('Comments desta Section')).not.toBeInTheDocument();
  });

  it('should render a suggestion through its draft card inside the summary section', () => {
    const section = summarySectionFixture();
    render(
      <SectionPanel
        section={section}
        sections={[section]}
        resumeId={RESUME_ID}
        language="en"
        onDocumentChange={vi.fn()}
        onSectionRemoved={vi.fn()}
      />,
    );

    expect(screen.getByText('Rascunho não confirmado')).toBeInTheDocument();
  });

  it('should move keyboard focus to the panel heading when the section opens', () => {
    renderExperience();

    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Professional Experience' }),
    );
  });

  it('should show the preview label in the resume language', () => {
    const section = experienceSectionFixture();
    render(
      <SectionPanel
        section={section}
        sections={[section]}
        resumeId={RESUME_ID}
        language="pt"
        onDocumentChange={vi.fn()}
        onSectionRemoved={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Experiência Profissional' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Experience' })).not.toBeInTheDocument();
  });

  it('should keep the person title of custom sections', () => {
    const section = { ...summarySectionFixture(), kind: 'custom' as const, title: 'Talks' };
    render(
      <SectionPanel
        section={section}
        sections={[section]}
        resumeId={RESUME_ID}
        language="pt"
        onDocumentChange={vi.fn()}
        onSectionRemoved={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Talks' })).toBeInTheDocument();
  });

  it('should disable applying without text and send the instruction', async () => {
    const onDocumentChange = vi.fn();
    mockedRewrite.mockResolvedValue(resumeDocumentFixture());
    renderExperience(onDocumentChange);

    const apply = screen.getByRole('button', { name: 'Aplicar' });
    expect(apply).toBeDisabled();

    fireEvent.change(screen.getByLabelText('O que mudar nesta seção?'), {
      target: { value: 'Highlight Git and Docker.' },
    });
    expect(screen.getByRole('button', { name: 'Aplicar' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByText('Reescrevendo…')).toBeInTheDocument();
    await flushPromises();

    expect(mockedRewrite).toHaveBeenCalledWith(SECTION_EXPERIENCE_ID, 'Highlight Git and Docker.');
    expect(onDocumentChange).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeInTheDocument();
  });

  it('should undo the last rewrite', async () => {
    mockedRewrite.mockResolvedValue(resumeDocumentFixture());
    mockedUndo.mockResolvedValue(resumeDocumentFixture());
    const onDocumentChange = vi.fn();
    renderExperience(onDocumentChange);

    fireEvent.change(screen.getByLabelText('O que mudar nesta seção?'), {
      target: { value: 'Make it shorter.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await flushPromises();

    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await flushPromises();

    expect(mockedUndo).toHaveBeenCalledWith(SECTION_EXPERIENCE_ID);
    expect(onDocumentChange).toHaveBeenCalledTimes(2);
  });

  it('should keep structure controls inside the options menu', async () => {
    renderExperience();

    expect(screen.queryByRole('button', { name: 'Mover Section para cima' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Opções da seção' }));
    });

    expect(await screen.findByRole('button', { name: 'Mover Section para cima' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover Section' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Mover para cima o Bullet 1:/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^Remover o Bullet 1:/ }).length).toBeGreaterThan(0);
  });

  it('should reveal the add form behind the add button', () => {
    renderExperience();

    expect(screen.queryByRole('button', { name: 'Refinar com a IA' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));

    expect(screen.getByRole('button', { name: 'Refinar com a IA' })).toBeInTheDocument();
  });

  it('should show a clear error without a success message when nothing is rewritable', () => {
    render(
      <SectionPanel
        section={experienceSectionFixture()}
        sections={[summarySectionFixture(), experienceSectionFixture()]}
        resumeId={RESUME_ID}
        language="en"
        onDocumentChange={vi.fn()}
        onSectionRemoved={vi.fn()}
        failureReason="nothing_to_rewrite"
      />,
    );
    expect(screen.getByText('Não há texto nesta seção para a IA reescrever.')).toBeInTheDocument();
    expect(screen.queryByText('Reescrita concluída.')).not.toBeInTheDocument();
  });

  it('should show a clear error without a success message when rewritten claims lack backing', () => {
    render(
      <SectionPanel
        section={experienceSectionFixture()}
        sections={[summarySectionFixture(), experienceSectionFixture()]}
        resumeId={RESUME_ID}
        language="en"
        onDocumentChange={vi.fn()}
        onSectionRemoved={vi.fn()}
        failureReason="rewrite_claims_rejected"
      />,
    );
    expect(screen.getByText('A IA trouxe dados sem lastro e nada foi alterado. Tente uma instrução diferente.')).toBeInTheDocument();
    expect(screen.queryByText('Reescrita concluída.')).not.toBeInTheDocument();
  });
});
