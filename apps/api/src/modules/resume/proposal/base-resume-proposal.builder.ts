import {
  certifications,
  educationEntries,
  evidences,
  experiences,
  languages,
  skills,
} from 'schema';
import {
  writingStyleSchema,
  type BaseResumeProposal,
  type WritingStyle,
} from 'schema/contracts/resume-import';
import { detectTextLanguage } from '../writing/language-detector';
import { formatLanguage } from '../language-format';
import { orderSkills } from '../skill-order';

export type ExperienceRow = typeof experiences.$inferSelect;
export type EducationRow = typeof educationEntries.$inferSelect;
export type EvidenceRow = typeof evidences.$inferSelect;
export type SkillRow = typeof skills.$inferSelect;
export type LanguageRow = typeof languages.$inferSelect;
export type CertificationRow = typeof certifications.$inferSelect;

export interface CareerBundle {
  readonly profileId: string;
  readonly experienceRows: readonly ExperienceRow[];
  readonly educationRows: readonly EducationRow[];
  readonly evidenceRows: readonly EvidenceRow[];
  readonly skillRows: readonly SkillRow[];
  readonly languageRows: readonly LanguageRow[];
  readonly certificationRows: readonly CertificationRow[];
}

export interface RewriteTarget {
  readonly experienceId: string | null;
  readonly evidences: readonly EvidenceRow[];
  readonly company: string | null;
  readonly role: string | null;
}

export const FALLBACK_STYLE: WritingStyle = {
  writingMethod: 'free',
  tone: 'direct',
  averageBulletWords: 15,
};

export const DEFAULT_SECTION_ORDER = [
  'summary',
  'experience',
  'education',
  'skills',
  'languages',
  'certifications',
  'custom',
] as const;

export function parseWritingStyle(value: unknown): WritingStyle {
  const parsed = writingStyleSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  return FALLBACK_STYLE;
}

export function parseSectionOrder(draft: unknown): string[] | undefined {
  if (draft === null || typeof draft !== 'object' || !('sectionOrder' in draft)) {
    return undefined;
  }
  const order = (draft as { sectionOrder?: unknown }).sectionOrder;
  if (!Array.isArray(order)) {
    return undefined;
  }
  return order.filter((kind): kind is string => typeof kind === 'string');
}

export function parseSummaryText(draft: unknown, storedSummary: unknown): string | null {
  const fromDraft =
    draft !== null && typeof draft === 'object' && 'summary' in draft
      ? (draft as { summary?: unknown }).summary
      : undefined;
  const candidate = typeof fromDraft === 'string' ? fromDraft : storedSummary;
  if (typeof candidate !== 'string') {
    return null;
  }
  const trimmed = candidate.trim();
  return trimmed === '' ? null : trimmed;
}

export function resolveProposalLanguage(evidenceRows: readonly EvidenceRow[]): 'pt' | 'en' {
  const combined = evidenceRows.map((row) => row.statement).join('\n');
  const detected = detectTextLanguage(combined);
  if (detected === 'en' || detected === 'pt') {
    return detected;
  }
  return 'pt';
}

export function resolveProposalName(
  experienceRows: readonly ExperienceRow[],
  language: 'pt' | 'en' = 'pt',
): string {
  const [first] = experienceRows;
  if (first === undefined) {
    return language === 'en' ? 'Base resume' : 'Currículo base';
  }
  const role = first.role.trim();
  const company = first.company.trim();
  if (role !== '' && company !== '') {
    return `${role} · ${company}`.slice(0, 200);
  }
  if (role !== '') {
    return role.slice(0, 200);
  }
  return language === 'en' ? 'Base resume' : 'Currículo base';
}

export function orderSectionKinds(sectionOrder: string[] | undefined): string[] {
  const wanted = sectionOrder ?? [...DEFAULT_SECTION_ORDER];
  const ordered: string[] = [];
  for (const kind of wanted) {
    if (!ordered.includes(kind)) {
      ordered.push(kind);
    }
  }
  for (const kind of DEFAULT_SECTION_ORDER) {
    if (!ordered.includes(kind)) {
      ordered.push(kind);
    }
  }
  return ordered;
}

export function collectRewriteTargets(career: CareerBundle): RewriteTarget[] {
  const byExperience = new Map<string, EvidenceRow[]>();
  for (const evidence of career.evidenceRows) {
    if (evidence.experienceId === null) {
      continue;
    }
    const experience = career.experienceRows.find((row) => row.id === evidence.experienceId);
    if (experience === undefined) {
      continue;
    }
    const existing = byExperience.get(experience.id) ?? [];
    existing.push(evidence);
    byExperience.set(experience.id, existing);
  }
  const targets: RewriteTarget[] = career.experienceRows.map((experience) => ({
    experienceId: experience.id,
    evidences: byExperience.get(experience.id) ?? [],
    company: experience.company,
    role: experience.role,
  }));
  return targets.filter((target) => target.evidences.length > 0 || target.experienceId !== null);
}

export function collectUnlinkedEvidences(career: CareerBundle): EvidenceRow[] {
  return career.evidenceRows.filter((evidence) => {
    if (evidence.experienceId === null) {
      return true;
    }
    return career.experienceRows.every((row) => row.id !== evidence.experienceId);
  });
}

export function unlinkedCustomTitle(language: 'pt' | 'en'): string {
  return language === 'pt' ? 'Projetos e outras atividades' : 'Projects and other activities';
}

export function buildSummarySection(
  summaryText: string,
): BaseResumeProposal['sections'][number] {
  return {
    kind: 'summary',
    title: null,
    entries: [
      {
        bullets: [{ evidenceId: null, original: summaryText, text: summaryText }],
      },
    ],
  };
}

export function buildUnlinkedCustomSection(
  unlinked: readonly EvidenceRow[],
  language: 'pt' | 'en',
  rewrittenById?: ReadonlyMap<string, string>,
): BaseResumeProposal['sections'][number] | undefined {
  if (unlinked.length === 0) {
    return undefined;
  }
  return {
    kind: 'custom',
    title: unlinkedCustomTitle(language),
    entries: [
      {
        bullets: unlinked.map((evidence) => ({
          evidenceId: evidence.id,
          original: evidence.statement,
          text: rewrittenById?.get(evidence.id) ?? evidence.statement,
        })),
      },
    ],
  };
}

export function buildEducationSection(
  career: CareerBundle,
): BaseResumeProposal['sections'][number] | undefined {
  if (career.educationRows.length === 0) {
    return undefined;
  }
  return {
    kind: 'education',
    title: null,
    entries: career.educationRows.map((row) => ({
      educationEntryId: row.id,
      bullets: [],
    })),
  };
}

export function buildSkillsSection(
  career: CareerBundle,
): BaseResumeProposal['sections'][number] | undefined {
  if (career.skillRows.length === 0) {
    return undefined;
  }
  return {
    kind: 'skills',
    title: null,
    entries: [],
    skillIds: orderSkills(career.skillRows).map((row) => row.id),
  };
}

export function buildLanguagesSection(
  career: CareerBundle,
): BaseResumeProposal['sections'][number] | undefined {
  if (career.languageRows.length === 0) {
    return undefined;
  }
  return {
    kind: 'languages',
    title: null,
    entries: [
      {
        bullets: career.languageRows.map((row) => {
          const text = formatLanguageText(row);
          return { evidenceId: null, original: text, text };
        }),
      },
    ],
  };
}

export function buildCertificationsSection(
  career: CareerBundle,
): BaseResumeProposal['sections'][number] | undefined {
  if (career.certificationRows.length === 0) {
    return undefined;
  }
  return {
    kind: 'certifications',
    title: null,
    entries: [
      {
        bullets: career.certificationRows.map((row) => {
          const text = formatCertificationText(row);
          return { evidenceId: null, original: text, text };
        }),
      },
    ],
  };
}

function formatLanguageText(language: LanguageRow): string {
  return formatLanguage(language.name, language.level);
}

function formatCertificationText(certification: CertificationRow): string {
  const issuer = certification.issuer === null ? '' : certification.issuer.trim();
  const year = certification.year === null ? '' : certification.year.trim();
  if (issuer !== '' && year !== '') {
    return `${certification.name} — ${issuer}, ${year}`;
  }
  if (issuer !== '') {
    return `${certification.name} — ${issuer}`;
  }
  if (year !== '') {
    return `${certification.name} — ${year}`;
  }
  return certification.name;
}
