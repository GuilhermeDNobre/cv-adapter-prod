import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ContactDetailsDraft } from 'schema/contracts/resume-import';
import { ContactSection } from './contact-section';

function contactFixture(): ContactDetailsDraft {
  return {
    fullName: 'Ana Souza',
    email: 'ana@exemplo.com',
    phone: '(11) 91234-5678',
    city: 'Quixadá, CE',
    links: null,
  };
}

describe('ContactSection', () => {
  it('should render the city field with an associated label between name and email', () => {
    render(<ContactSection contact={contactFixture()} onChange={() => undefined} onCommit={() => undefined} />);

    const city = screen.getByLabelText('Cidade');
    expect(city).toHaveAttribute('id', 'contact-city');
    expect(city).toHaveValue('Quixadá, CE');
    const name = screen.getByLabelText('Nome completo');
    const email = screen.getByLabelText('E-mail');
    const inputs = Array.from(document.querySelectorAll('input')).map((field) => field.getAttribute('id'));
    expect(inputs.indexOf('contact-city')).toBeGreaterThan(inputs.indexOf('contact-full-name'));
    expect(inputs.indexOf('contact-city')).toBeLessThan(inputs.indexOf('contact-email'));
    expect(name).toBeInTheDocument();
    expect(email).toBeInTheDocument();
  });

  it('should emit the edited city through onChange', () => {
    const onChange = vi.fn();
    render(<ContactSection contact={contactFixture()} onChange={onChange} onCommit={() => undefined} />);

    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Lisboa, Portugal' } });

    expect(onChange).toHaveBeenCalledWith({ ...contactFixture(), city: 'Lisboa, Portugal' });
  });

  it('should commit the normalized contact with the city on blur', () => {
    const onCommit = vi.fn();
    render(<ContactSection contact={contactFixture()} onChange={() => undefined} onCommit={onCommit} />);

    fireEvent.blur(screen.getByLabelText('Cidade'));

    expect(onCommit).toHaveBeenCalledWith(contactFixture());
  });

  it('should commit null when the city is cleared', () => {
    const onCommit = vi.fn();
    const empty = { ...contactFixture(), city: '' };
    render(<ContactSection contact={empty} onChange={() => undefined} onCommit={onCommit} />);

    fireEvent.blur(screen.getByLabelText('Cidade'));

    expect(onCommit).toHaveBeenCalledWith({ ...empty, city: null });
  });

  it('should render each link with a title field and a URL field', () => {
    render(
      <ContactSection
        contact={{
          ...contactFixture(),
          links: [{ title: 'LinkedIn', url: 'https://linkedin.com/in/anasouza' }],
        }}
        onChange={() => undefined}
        onCommit={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Título do link 1 (opcional)')).toHaveValue('LinkedIn');
    expect(screen.getByLabelText('URL do link 1')).toHaveValue(
      'https://linkedin.com/in/anasouza',
    );
    expect(
      screen.getByText('Cada link tem um título opcional e a URL. Sem título, o currículo mostra a própria URL.'),
    ).toBeInTheDocument();
  });

  it('should emit the edited link title through onChange', () => {
    const onChange = vi.fn();
    render(
      <ContactSection
        contact={{
          ...contactFixture(),
          links: [{ title: null, url: 'https://linkedin.com/in/anasouza' }],
        }}
        onChange={onChange}
        onCommit={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('Título do link 1 (opcional)'), {
      target: { value: 'LinkedIn' },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...contactFixture(),
      links: [{ title: 'LinkedIn', url: 'https://linkedin.com/in/anasouza' }],
    });
  });

  it('should normalize an empty link title to null on blur', () => {
    const onCommit = vi.fn();
    render(
      <ContactSection
        contact={{
          ...contactFixture(),
          links: [{ title: '', url: 'https://linkedin.com/in/anasouza' }],
        }}
        onChange={() => undefined}
        onCommit={onCommit}
      />,
    );

    fireEvent.blur(screen.getByLabelText('URL do link 1'));

    expect(onCommit).toHaveBeenCalledWith({
      ...contactFixture(),
      links: [{ title: null, url: 'https://linkedin.com/in/anasouza' }],
    });
  });
});
