import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProntoScreen } from './pronto-screen';

describe('ProntoScreen', () => {
  it('should announce the approval and offer both paths', () => {
    render(<ProntoScreen />);

    expect(screen.getByRole('status')).toHaveTextContent('Base Resume aprovado.');
    expect(
      screen.getByRole('heading', { name: 'Seu currículo base está pronto' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Colar a primeira vaga →' })).toHaveAttribute(
      'href',
      '/vaga',
    );
    expect(screen.getByRole('link', { name: 'Ver meu Base Resume' })).toHaveAttribute(
      'href',
      '/curriculos',
    );
  });

  it('should continue the adaptation of the same vaga with the new Base Resume when the flow brought one', () => {
    const vagaId = '5e4d3c2b-1a09-4876-9543-21fedcba0987';

    render(<ProntoScreen resumeId="resume-1" jobDescriptionId={vagaId} fileName="curriculo.pdf" />);

    expect(screen.getByRole('link', { name: 'Continuar a adaptação' })).toHaveAttribute(
      'href',
      `/curriculo?vaga=${vagaId}&base=resume-1`,
    );
    expect(screen.queryByRole('link', { name: 'Colar a primeira vaga →' })).not.toBeInTheDocument();
    expect(screen.getByText(/Continue a adaptação para ver o encaixe/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver meu Base Resume' })).toHaveAttribute(
      'href',
      '/curriculos/resume-1',
    );
    expect(screen.getByText('Montado a partir de curriculo.pdf')).toBeInTheDocument();
    expect(screen.getByText('Salvo')).toBeInTheDocument();
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
  });
});
