import type { ResumeDocumentResponse } from 'schema/contracts/resume';
import type { RenderableResume } from 'resume-templates';

export function toPreviewDocument(
  document: ResumeDocumentResponse,
  highlightedBulletIds: readonly string[] = [],
): RenderableResume {
  const highlighted = new Set(highlightedBulletIds);
  const sections = [...document.sections]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((section) => ({
      id: section.id,
      kind: section.kind,
      title: section.title ?? undefined,
      entries: [...section.entries]
        .sort((left, right) => left.ordinal - right.ordinal)
        .map((entry) => ({
          company: entry.company ?? undefined,
          role: entry.role ?? entry.degree ?? undefined,
          period: entry.period ?? undefined,
          institution: entry.institution ?? undefined,
          heading: entry.heading ?? undefined,
          bullets: [...entry.bullets]
            .sort((left, right) => left.ordinal - right.ordinal)
            .map((bullet) => ({
              id: bullet.id,
              text: bullet.text,
              status: bullet.status,
              ...(highlighted.has(bullet.id) ? { change: 'added' as const } : {}),
            })),
        })),
    }));
  return {
    contact: {
      name: document.contact.name,
      email: document.contact.email ?? undefined,
      phone: document.contact.phone ?? undefined,
      city: document.contact.city ?? undefined,
      links: document.contact.links ?? undefined,
    },
    sections,
  };
}
