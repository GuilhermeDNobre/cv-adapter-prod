import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LanguagesSection } from './languages-section';

describe('LanguagesSection', () => {
  it('should render language rows with name and level', () => {
    render(
      <LanguagesSection
        languages={[{ name: 'Inglês', level: 'Fluente' }]}
        onChangeLanguage={() => undefined}
        onCommitLanguage={() => undefined}
        onAddLanguage={() => undefined}
        onRemoveLanguage={() => undefined}
      />,
    );

    expect(screen.getByRole('region', { name: 'Idiomas' })).toBeInTheDocument();
    expect(screen.getByLabelText('Idioma')).toHaveValue('Inglês');
    expect(screen.getByLabelText('Nível (opcional)')).toHaveValue('Fluente');
  });

  it('should emit language edits through onChange', () => {
    const onChangeLanguage = vi.fn();
    render(
      <LanguagesSection
        languages={[{ name: 'Inglês', level: null }]}
        onChangeLanguage={onChangeLanguage}
        onCommitLanguage={() => undefined}
        onAddLanguage={() => undefined}
        onRemoveLanguage={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nível (opcional)'), {
      target: { value: 'Avançado' },
    });

    expect(onChangeLanguage).toHaveBeenCalledWith(0, { name: 'Inglês', level: 'Avançado' });
  });

  it('should remove a language', () => {
    const onRemoveLanguage = vi.fn();
    render(
      <LanguagesSection
        languages={[{ name: 'Inglês', level: null }]}
        onChangeLanguage={() => undefined}
        onCommitLanguage={() => undefined}
        onAddLanguage={() => undefined}
        onRemoveLanguage={onRemoveLanguage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remover idioma 1' }));

    expect(onRemoveLanguage).toHaveBeenCalledWith(0);
  });
});
