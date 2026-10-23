import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CertificationsSection } from './certifications-section';

describe('CertificationsSection', () => {
  it('should render certification rows with name, issuer and year', () => {
    render(
      <CertificationsSection
        certifications={[{ name: 'AWS Solutions Architect', issuer: 'Amazon', year: '2023' }]}
        onChangeCertification={() => undefined}
        onCommitCertification={() => undefined}
        onAddCertification={() => undefined}
        onRemoveCertification={() => undefined}
      />,
    );

    expect(screen.getByRole('region', { name: 'Certificações' })).toBeInTheDocument();
    expect(screen.getByLabelText('Certificação')).toHaveValue('AWS Solutions Architect');
    expect(screen.getByLabelText('Emissor (opcional)')).toHaveValue('Amazon');
    expect(screen.getByLabelText('Ano (opcional)')).toHaveValue('2023');
  });

  it('should remove a certification', () => {
    const onRemoveCertification = vi.fn();
    render(
      <CertificationsSection
        certifications={[{ name: 'AWS', issuer: null, year: null }]}
        onChangeCertification={() => undefined}
        onCommitCertification={() => undefined}
        onAddCertification={() => undefined}
        onRemoveCertification={onRemoveCertification}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remover certificação 1' }));

    expect(onRemoveCertification).toHaveBeenCalledWith(0);
  });
});
