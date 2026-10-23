import type { ContactDetailsDraft, ResumeLinkDraft } from 'schema/contracts/resume-import';
import { LabeledInput } from '../../../../components/labeled-input';
import { Button } from '../../../../components/button';

interface ContactSectionProps {
  readonly contact: ContactDetailsDraft;
  readonly onChange: (contact: ContactDetailsDraft) => void;
  readonly onCommit: (contact: ContactDetailsDraft) => void;
}

const CONTACT_NOTE =
  'Esses dados ficam guardados à parte, separados de tudo o mais, e nunca são enviados ao ' +
  'provedor de IA: nem o nome, nem a cidade, nem o telefone, nem o e-mail, nem os links. Eles só servem para ' +
  'montar o cabeçalho dos seus currículos. É uma garantia sua — confira se estão certos.';

type ScalarField = 'fullName' | 'city' | 'email' | 'phone';

function scalarValue(contact: ContactDetailsDraft, field: ScalarField): string {
  if (field === 'fullName') return contact.fullName ?? '';
  if (field === 'city') return contact.city ?? '';
  if (field === 'email') return contact.email ?? '';
  return contact.phone ?? '';
}

function withScalar(
  contact: ContactDetailsDraft,
  field: ScalarField,
  value: string,
): ContactDetailsDraft {
  if (field === 'fullName') return { ...contact, fullName: value };
  if (field === 'city') return { ...contact, city: value };
  if (field === 'email') return { ...contact, email: value };
  return { ...contact, phone: value };
}

function normalizeLink(link: ResumeLinkDraft): ResumeLinkDraft {
  return {
    title: link.title === '' ? null : link.title,
    url: link.url,
  };
}

function normalizeContact(contact: ContactDetailsDraft): ContactDetailsDraft {
  return {
    fullName: contact.fullName === '' ? null : contact.fullName,
    city: contact.city === '' ? null : contact.city,
    email: contact.email === '' ? null : contact.email,
    phone: contact.phone === '' ? null : contact.phone,
    links: contact.links === null ? null : contact.links.map(normalizeLink),
  };
}

function withLinkUrl(
  links: readonly ResumeLinkDraft[],
  index: number,
  value: string,
): ResumeLinkDraft[] {
  return links.map((link, linkIndex) =>
    linkIndex === index ? { ...link, url: value } : link,
  );
}

function withLinkTitle(
  links: readonly ResumeLinkDraft[],
  index: number,
  value: string,
): ResumeLinkDraft[] {
  return links.map((link, linkIndex) =>
    linkIndex === index ? { ...link, title: value } : link,
  );
}

export function ContactSection({ contact, onChange, onCommit }: ContactSectionProps): React.JSX.Element {
  const links = contact.links ?? [];

  return (
    <section aria-label="Dados de contato" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow">
      <h2 className="text-base font-semibold text-text">Dados de contato</h2>
      <p className="text-text-2">{CONTACT_NOTE}</p>
      <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <LabeledInput
          id="contact-full-name"
          label="Nome completo"
          value={scalarValue(contact, 'fullName')}
          placeholder="Como deve aparecer no currículo"
          onChange={(value) => onChange(withScalar(contact, 'fullName', value))}
          onBlur={() => onCommit(normalizeContact(contact))}
        />
        <LabeledInput
          id="contact-city"
          label="Cidade"
          value={scalarValue(contact, 'city')}
          placeholder="Cidade, UF"
          onChange={(value) => onChange(withScalar(contact, 'city', value))}
          onBlur={() => onCommit(normalizeContact(contact))}
        />
        <LabeledInput
          id="contact-email"
          label="E-mail"
          value={scalarValue(contact, 'email')}
          placeholder="voce@exemplo.com"
          onChange={(value) => onChange(withScalar(contact, 'email', value))}
          onBlur={() => onCommit(normalizeContact(contact))}
        />
        <LabeledInput
          id="contact-phone"
          label="Telefone"
          value={scalarValue(contact, 'phone')}
          placeholder="(11) 90000-0000"
          onChange={(value) => onChange(withScalar(contact, 'phone', value))}
          onBlur={() => onCommit(normalizeContact(contact))}
        />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text">Links</h3>
        <p className="text-[13px] text-text-2">
          Cada link tem um título opcional e a URL. Sem título, o currículo mostra a própria URL.
        </p>
        {links.map((link, index) => (
          <div key={`contact-link-${String(index)}`} className="flex items-end gap-2">
            <div className="w-[130px] shrink-0">
              <LabeledInput
                id={`contact-link-${String(index)}-title`}
                label={`Título do link ${String(index + 1)} (opcional)`}
                value={link.title ?? ''}
                placeholder="Ex.: Portfólio"
                onChange={(value) => onChange({ ...contact, links: withLinkTitle(links, index, value) })}
                onBlur={() => onCommit(normalizeContact(contact))}
              />
            </div>
            <div className="min-w-0 flex-1">
              <LabeledInput
                id={`contact-link-${String(index)}-url`}
                label={`URL do link ${String(index + 1)}`}
                value={link.url}
                placeholder="https://linkedin.com/in/voce"
                onChange={(value) => onChange({ ...contact, links: withLinkUrl(links, index, value) })}
                onBlur={() => onCommit(normalizeContact(contact))}
              />
            </div>
            <Button
              variant="danger-ghost"
              size="xs"
              onClick={() =>
                onCommit(
                  normalizeContact({
                    ...contact,
                    links: links.filter((_, linkIndex) => linkIndex !== index),
                  }),
                )
              }
            >
              Remover link
            </Button>
          </div>
        ))}
        <div>
          <Button variant="secondary" onClick={() => onChange({ ...contact, links: [...links, { title: null, url: '' }] })}>
            + Adicionar link
          </Button>
        </div>
      </div>
    </section>
  );
}
