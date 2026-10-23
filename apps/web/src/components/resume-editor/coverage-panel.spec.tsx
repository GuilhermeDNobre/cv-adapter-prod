import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CoveragePanel } from './coverage-panel';
import { resumeDocumentFixture } from './editor-fixtures';

describe('CoveragePanel', () => {
  it('should show the match score with each requirement coverage by text', () => {
    const document = resumeDocumentFixture();
    render(
      <CoveragePanel
        matchScore={document.matchScore}
        coverages={document.requirementCoverages}
        sections={document.sections}
        languageFallback={false}
        onSectionSelect={() => undefined}
      />,
    );

    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    expect(screen.getByText('Gap')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Coberto')).toBeInTheDocument();
  });

  it('should show the covering bullet snippet and open its section on click', () => {
    const document = resumeDocumentFixture();
    const onSectionSelect = vi.fn();
    render(
      <CoveragePanel
        matchScore={document.matchScore}
        coverages={document.requirementCoverages}
        sections={document.sections}
        languageFallback={false}
        onSectionSelect={onSectionSelect}
      />,
    );

    const bulletButton = screen.getByRole('button', { name: /Ver Bullet de TypeScript/ });
    expect(bulletButton).toHaveTextContent('Cut API latency by 30%');
    expect(bulletButton).toHaveTextContent('na Section Experience');

    fireEvent.click(bulletButton);

    expect(onSectionSelect).toHaveBeenCalledWith(document.sections[1]?.id);
  });

  it('should warn when the job description language fell back to english', () => {
    const document = resumeDocumentFixture({ languageFallback: true });
    render(
      <CoveragePanel
        matchScore={document.matchScore}
        coverages={document.requirementCoverages}
        sections={document.sections}
        languageFallback={document.languageFallback}
        onSectionSelect={() => undefined}
      />,
    );

    expect(screen.getByText(/não está em português nem inglês/)).toBeInTheDocument();
  });

  it('should stay silent about the fallback when the vacancy is portuguese or english', () => {
    const document = resumeDocumentFixture();
    render(
      <CoveragePanel
        matchScore={document.matchScore}
        coverages={[]}
        sections={document.sections}
        languageFallback={document.languageFallback}
        onSectionSelect={() => undefined}
      />,
    );

    expect(screen.queryByText(/não está em português/)).not.toBeInTheDocument();
    expect(screen.getByText(/Nenhum Requirement/)).toBeInTheDocument();
  });
});
