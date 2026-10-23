import type { ResumeLanguage, SectionKind } from './renderable-resume';

export const SECTION_LABELS: Record<SectionKind, Record<ResumeLanguage, string>> = {
  summary: { pt: 'Resumo', en: 'Summary' },
  experience: { pt: 'Experiência Profissional', en: 'Professional Experience' },
  education: { pt: 'Formação', en: 'Education' },
  skills: { pt: 'Habilidades', en: 'Skills' },
  languages: { pt: 'Idiomas', en: 'Languages' },
  certifications: { pt: 'Certificações', en: 'Certifications' },
  custom: { pt: 'Informações Adicionais', en: 'Additional Information' },
};

export function resolveSectionLabel(
  kind: SectionKind,
  title: string | undefined,
  language: ResumeLanguage,
): string {
  if (kind === 'custom' && title !== undefined && title.trim() !== '') {
    return title;
  }
  return SECTION_LABELS[kind][language];
}
