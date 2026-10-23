import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReviewBar } from './review-bar';
import { resumeDocumentFixture } from '../resume-editor/editor-fixtures';

describe('ReviewBar', () => {
  it('should show the empty message when there are no changes', () => {
    render(
      <ReviewBar
        total={0}
        currentIndex={null}
        removed={[]}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(
      screen.getByText('O Tailored Resume é igual ao Base Resume em conteúdo.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anterior/ })).not.toBeInTheDocument();
  });

  it('should show the current position over the total', () => {
    render(
      <ReviewBar
        total={3}
        currentIndex={1}
        removed={[]}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getByText('2 de 3 alterações')).toBeInTheDocument();
  });

  it('should disable previous on the first highlight and next on the last', () => {
    const { rerender } = render(
      <ReviewBar
        total={2}
        currentIndex={0}
        removed={[]}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Alteração anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próxima alteração' })).not.toBeDisabled();

    rerender(
      <ReviewBar
        total={2}
        currentIndex={1}
        removed={[]}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Alteração anterior' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próxima alteração' })).toBeDisabled();
  });

  it('should call previous and next actions', async () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(
      <ReviewBar
        total={3}
        currentIndex={1}
        removed={[]}
        onPrevious={onPrevious}
        onNext={onNext}
        onRestore={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alteração anterior' }));
    });
    expect(onPrevious).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Próxima alteração' }));
    });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('should show the removed chip when there are pending removals', async () => {
    const onRestore = vi.fn();
    render(
      <ReviewBar
        total={1}
        currentIndex={0}
        removed={[{ id: '33333333-3333-4333-8333-333333333333', statement: 'Removed one.' }]}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRestore={onRestore}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1 retirada' }));
    });
    expect(await screen.findByText('Removed one.')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    });
    expect(onRestore).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
  });

  it('should open the coverage panel in a popover', async () => {
    const document = resumeDocumentFixture();
    render(
      <ReviewBar
        total={1}
        currentIndex={0}
        removed={[]}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRestore={vi.fn()}
        coverage={{
          matchScore: document.matchScore,
          coverages: document.requirementCoverages,
          sections: document.sections,
          languageFallback: document.languageFallback,
        }}
        onCoverageSectionSelect={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cobertura' }));
    });
    expect(await screen.findByText('Cobertura da vaga')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
  });

  it('should forward the coverage section select', async () => {
    const document = resumeDocumentFixture();
    const onCoverageSectionSelect = vi.fn();
    render(
      <ReviewBar
        total={0}
        currentIndex={null}
        removed={[]}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRestore={vi.fn()}
        coverage={{
          matchScore: document.matchScore,
          coverages: document.requirementCoverages,
          sections: document.sections,
          languageFallback: document.languageFallback,
        }}
        onCoverageSectionSelect={onCoverageSectionSelect}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cobertura' }));
    });
    const bulletButton = await screen.findByRole('button', { name: /Ver Bullet de TypeScript/ });
    await act(async () => {
      fireEvent.click(bulletButton);
    });
    expect(onCoverageSectionSelect).toHaveBeenCalledWith(document.sections[1]?.id);
  });

  it('should show the position immediately without waiting for the animation to end', () => {
    render(
      <ReviewBar
        total={2}
        currentIndex={0}
        removed={[]}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getByText('1 de 2 alterações')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alteração anterior' })).toBeInTheDocument();
  });

  it('should stack the heading above the counter and navigation', () => {
    render(
      <ReviewBar
        total={7}
        currentIndex={0}
        removed={[]}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Mudanças da IA' });
    expect(heading.parentElement?.className).toMatch(/flex-col/);
    expect(screen.getByText('1 de 7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alteração anterior' })).toHaveClass(
      'bg-transparent',
    );
    expect(screen.getByRole('button', { name: 'Próxima alteração' })).toHaveClass(
      'bg-transparent',
    );
  });

  it('should list the pending changes with status and select one', async () => {
    const onItemSelect = vi.fn();
    render(
      <ReviewBar
        total={2}
        currentIndex={0}
        removed={[]}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRestore={vi.fn()}
        items={[
          { bulletId: 'bullet-one', label: 'Resumo · First snippet', status: 'Pendente' },
          { bulletId: 'bullet-two', label: 'Resumo · Second snippet', status: 'Pendente' },
        ]}
        onItemSelect={onItemSelect}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Mudanças da IA' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /First snippet/ }));
    });
    expect(onItemSelect).toHaveBeenCalledWith('bullet-one');
  });
});
