import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiProgress } from './ai-progress';

describe('AiProgress', () => {
  it('should show the queued import step as 1 de 3 in a live region', () => {
    render(<AiProgress importStatus="queued" />);

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('fila para o processamento');
    expect(region).toHaveTextContent('1 de 3');
  });

  it('should show the extracting import step as 2 de 3', () => {
    render(<AiProgress importStatus="extracting" />);

    expect(screen.getByRole('status')).toHaveTextContent('Lendo o texto do arquivo.');
    expect(screen.getByRole('status')).toHaveTextContent('2 de 3');
  });

  it('should show the structuring import step as 3 de 3', () => {
    render(<AiProgress importStatus="structuring" />);

    expect(screen.getByRole('status')).toHaveTextContent('Organizando as experiências');
    expect(screen.getByRole('status')).toHaveTextContent('3 de 3');
  });

  it('should render no readable text for a finished import', () => {
    const { rerender } = render(<AiProgress importStatus="ready_for_review" />);

    expect(screen.getByRole('status').querySelector('.sr-only')?.textContent).toBe('');

    rerender(<AiProgress importStatus="confirmed" />);

    expect(screen.getByRole('status').querySelector('.sr-only')?.textContent).toBe('');

    rerender(<AiProgress importStatus="failed" />);

    expect(screen.getByRole('status').querySelector('.sr-only')?.textContent).toBe('');
  });

  it('should show evaluation progress as a single step without N de M', () => {
    render(<AiProgress evaluationStatus="analyzing" />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Cruzando as Evidences');
    expect(region).not.toHaveTextContent('de 3');
  });

  it('should render no readable text for a ready or failed evaluation', () => {
    const { rerender } = render(<AiProgress evaluationStatus="ready" />);

    expect(screen.getByRole('status').querySelector('.sr-only')?.textContent).toBe('');

    rerender(<AiProgress evaluationStatus="failed" />);

    expect(screen.getByRole('status').querySelector('.sr-only')?.textContent).toBe('');
  });

  it('should show planning as 1 de 3', () => {
    render(<AiProgress generationStatus="generating" generationStep="planning" />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Montando o Adaptation Plan');
    expect(region).toHaveTextContent('1 de 3');
  });

  it('should show writing and suggesting as the same 2 de 3 step', () => {
    const { rerender } = render(
      <AiProgress generationStatus="generating" generationStep="writing" />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Escrevendo as Sections e as Suggestions',
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 de 3');

    rerender(<AiProgress generationStatus="generating" generationStep="suggesting" />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Escrevendo as Sections e as Suggestions',
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 de 3');
  });

  it('should show saving as 3 de 3', () => {
    render(<AiProgress generationStatus="generating" generationStep="saving" />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Salvando o currículo');
    expect(region).toHaveTextContent('3 de 3');
  });

  it('should treat undefined generationStep like null with no step in course', () => {
    const { rerender } = render(
      <AiProgress generationStatus="generating" generationStep={null} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Gerando o currículo.');
    expect(screen.getByRole('status')).not.toHaveTextContent('de 3');

    rerender(<AiProgress generationStatus="generating" generationStep={undefined} />);

    expect(screen.getByRole('status')).toHaveTextContent('Gerando o currículo.');
  });

  it('should swap the step text immediately without waiting for the animation to end', () => {
    const { rerender } = render(
      <AiProgress generationStatus="generating" generationStep="planning" />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Montando o Adaptation Plan');

    rerender(<AiProgress generationStatus="generating" generationStep="saving" />);

    expect(screen.getByRole('status')).toHaveTextContent('Salvando o currículo');
  });

  it('should announce the step from a stable node while the animated node stays hidden', () => {
    render(<AiProgress generationStatus="generating" generationStep="planning" />);

    const region = screen.getByRole('status');
    const announced = region.querySelector('.sr-only');
    expect(announced).not.toBeNull();
    expect(announced).toHaveTextContent('Montando o Adaptation Plan. 1 de 3');

    expect(region).toHaveTextContent('Montando o Adaptation Plan');
    expect(region).toHaveTextContent('1 de 3');

    const hiddenMessage = Array.from(region.querySelectorAll('span[aria-hidden="true"]')).find(
      (node) => node.textContent === 'Montando o Adaptation Plan.',
    );
    expect(hiddenMessage).not.toBeUndefined();

    const hiddenCounter = Array.from(region.querySelectorAll('span[aria-hidden="true"]')).find(
      (node) => node.textContent === '1 de 3',
    );
    expect(hiddenCounter).not.toBeUndefined();

    const readable = Array.from(region.querySelectorAll('span')).filter(
      (node) => node.getAttribute('aria-hidden') !== 'true',
    );
    expect(readable).toHaveLength(1);
    expect(readable[0]).toHaveClass('sr-only');
  });

  it('should keep only the new step in the announced text after a swap', () => {
    const { rerender } = render(
      <AiProgress generationStatus="generating" generationStep="planning" />,
    );

    rerender(<AiProgress generationStatus="generating" generationStep="saving" />);

    const region = screen.getByRole('status');
    const announced = region.querySelector('.sr-only');
    expect(announced).toHaveTextContent('Salvando o currículo. 3 de 3');
    expect(announced).not.toHaveTextContent('Montando o Adaptation Plan');
  });

  it('should render no readable text when there is nothing to announce', () => {
    render(<AiProgress />);

    const region = screen.getByRole('status');
    const announced = region.querySelector('.sr-only');
    expect(announced?.textContent).toBe('');
  });
});
