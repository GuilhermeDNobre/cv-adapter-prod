import { randomUUID } from 'node:crypto';
import {
  resumeDocumentResponseSchema,
  type AdaptationReviewResponse,
  type ResumeDocumentResponse,
} from 'schema/contracts/resume';
import type { ResumeDisplayDetails, ResumeDocument } from './resume.repository';
import { parseReviewRecord } from './adaptation-review.service';
import { formatLanguage } from './language-format';
import { normalizeGroupKey } from './skill-order';

type SectionRow = ResumeDocument['sections'][number];
type EntryRow = ResumeDocument['entries'][number];
type BulletRow = ResumeDocument['bullets'][number];
type CommentRow = ResumeDocument['comments'][number];
type SectionSkillRow = ResumeDocument['sectionSkills'][number];
type SkillRow = ResumeDocument['skills'][number];
type ExperienceRow = ResumeDisplayDetails['experiences'][number];
type EducationRow = ResumeDisplayDetails['educationEntries'][number];
type LanguageRow = ResumeDisplayDetails['languages'][number];
type CertificationRow = ResumeDisplayDetails['certifications'][number];

export function mapResumeDocument(input: {
  readonly document: ResumeDocument;
  readonly details: ResumeDisplayDetails;
}): ResumeDocumentResponse {
  const document = input.document;
  const details = input.details;
  const language = document.resume.language;
  const bulletsByEntry = groupBulletsByEntry(document.bullets);
  const entriesBySection = groupEntriesBySection(document.entries);
  const commentsBySection = groupCommentsBySection(document.comments);
  const sectionSkillsBySection = groupSectionSkillsBySection(document.sectionSkills);
  const skillById = indexById(document.skills);
  const experienceById = indexById(details.experiences);
  const educationById = indexById(details.educationEntries);
  const profileSkills = [...details.skills];
  const profileLanguages = [...(details.languages ?? [])];
  const profileCertifications = [...(details.certifications ?? [])];
  const hasLanguagesSection = document.sections.some((section) => section.kind === 'languages');
  const skillProposals = [...(document.skillProposals ?? [])];
  return resumeDocumentResponseSchema.parse({
    id: document.resume.id,
    kind: document.resume.kind,
    name: document.resume.name,
    language: document.resume.language,
    template: document.resume.template,
    lengthTarget: document.resume.lengthTarget,
    writingMethod: document.resume.writingMethod,
    tone: document.resume.tone,
    baseResumeId: document.resume.baseResumeId,
    jobDescriptionId: document.resume.jobDescriptionId,
    generationStatus: document.resume.generationStatus,
    generationStep: document.resume.generationStep ?? null,
    failureReason: document.resume.failureReason,
    adaptationPlan: document.resume.adaptationPlan,
    adaptationChanges: null,
    adaptationReview: mapAdaptationReview(document.resume.adaptationReview, document.resume.id),
    languageFallback: false,
    matchScore: null,
    contact: mapResumeContact({ resumeName: document.resume.name, contact: details.contact }),
    sections: document.sections.map((section) =>
      mapResumeSection({
        section,
        entriesBySection,
        bulletsByEntry,
        commentsBySection,
        sectionSkillsBySection,
        skillById,
        profileSkills,
        profileLanguages,
        profileCertifications,
        hasLanguagesSection,
        experienceById,
        educationById,
        language,
        skillProposals,
      }),
    ),
    requirementCoverages: [],
    skillProposals: skillProposals.map(mapSkillProposal),
    createdAt: document.resume.createdAt.toISOString(),
    updatedAt: document.resume.updatedAt.toISOString(),
  });
}

export function mapResumeContact(input: {
  readonly resumeName: string;
  readonly contact: ResumeDisplayDetails['contact'];
}): ResumeDocumentResponse['contact'] {
  const name = normalizeContactName(input.contact?.fullName) ?? input.resumeName;
  return {
    name,
    email: normalizeNullableText(input.contact?.email),
    phone: normalizeNullableText(input.contact?.phone),
    city: normalizeNullableText(input.contact?.city),
    links: normalizeContactLinks(input.contact?.links),
  };
}

type SkillProposalRow = NonNullable<ResumeDocument['skillProposals']>[number];

export function mapSkillProposal(
  proposal: SkillProposalRow,
): ResumeDocumentResponse['skillProposals'][number] {
  return {
    id: proposal.id,
    kind: proposal.kind,
    name: proposal.name,
    group: proposal.group,
    replacesSkillId: proposal.replacesSkillId,
    replacesSkillName: proposal.replacesSkillName,
    requirementId: proposal.requirementId,
    literalTerm: proposal.literalTerm,
    status: proposal.status,
    ordinal: proposal.ordinal,
  };
}

export function mapResumeSection(input: {
  readonly section: SectionRow;
  readonly entriesBySection: ReadonlyMap<string, readonly EntryRow[]>;
  readonly bulletsByEntry: ReadonlyMap<string, readonly BulletRow[]>;
  readonly commentsBySection: ReadonlyMap<string, readonly CommentRow[]>;
  readonly sectionSkillsBySection: ReadonlyMap<string, readonly SectionSkillRow[]>;
  readonly skillById: ReadonlyMap<string, SkillRow>;
  readonly profileSkills: readonly SkillRow[];
  readonly profileLanguages?: readonly LanguageRow[];
  readonly profileCertifications?: readonly CertificationRow[];
  readonly hasLanguagesSection?: boolean;
  readonly experienceById: ReadonlyMap<string, ExperienceRow>;
  readonly educationById: ReadonlyMap<string, EducationRow>;
  readonly language: 'pt' | 'en';
  readonly skillProposals?: readonly SkillProposalRow[];
}): ResumeDocumentResponse['sections'][number] {
  const comments = input.commentsBySection.get(input.section.id) ?? [];
  if (input.section.kind === 'skills') {
    return {
      id: input.section.id,
      kind: input.section.kind,
      title: input.section.title,
      ordinal: input.section.ordinal,
      entries: mapSkillEntries(input) ?? [],
      comments: comments.map(mapSectionComment),
    };
  }
  if (input.section.kind === 'languages') {
    return {
      id: input.section.id,
      kind: input.section.kind,
      title: input.section.title,
      ordinal: input.section.ordinal,
      entries: mapLanguageEntries(input),
      comments: comments.map(mapSectionComment),
    };
  }
  if (input.section.kind === 'certifications') {
    return {
      id: input.section.id,
      kind: input.section.kind,
      title: input.section.title,
      ordinal: input.section.ordinal,
      entries: mapCertificationEntries(input),
      comments: comments.map(mapSectionComment),
    };
  }
  const entries = (input.entriesBySection.get(input.section.id) ?? []).map((entry) =>
    mapResumeEntry({
      entry,
      bulletsByEntry: input.bulletsByEntry,
      experienceById: input.experienceById,
      educationById: input.educationById,
      language: input.language,
    }),
  );
  return {
    id: input.section.id,
    kind: input.section.kind,
    title: input.section.title,
    ordinal: input.section.ordinal,
    entries,
    comments: comments.map(mapSectionComment),
  };
}

function mapSkillEntries(input: {
  readonly section: SectionRow;
  readonly sectionSkillsBySection: ReadonlyMap<string, readonly SectionSkillRow[]>;
  readonly skillById: ReadonlyMap<string, SkillRow>;
  readonly profileSkills: readonly SkillRow[];
  readonly profileLanguages?: readonly LanguageRow[];
  readonly hasLanguagesSection?: boolean;
  readonly language?: 'pt' | 'en';
  readonly skillProposals?: readonly SkillProposalRow[];
}): ResumeDocumentResponse['sections'][number]['entries'] | undefined {
  if (input.section.kind !== 'skills') {
    return undefined;
  }
  const rows = [...(input.sectionSkillsBySection.get(input.section.id) ?? [])].sort(
    (left, right) => left.ordinal - right.ordinal,
  );
  const linked = rows
    .map((row) => input.skillById.get(row.skillId))
    .filter((skill): skill is SkillRow => skill !== undefined);
  const names = linked.length > 0 ? linked : [...input.profileSkills];
  const proposals = [...(input.skillProposals ?? [])]
    .filter((proposal) => proposal.sectionId === input.section.id)
    .sort((left, right) => left.ordinal - right.ordinal);
  const active = proposals.filter((proposal) => proposal.status !== 'rejected');
  if (names.length === 0 && active.length === 0) {
    return [];
  }
  const display = applySkillProposals({ base: names, proposals: active, profileSkills: input.profileSkills });
  if (display.length === 0) {
    return [];
  }
  const labels = SKILL_LINE_LABELS[input.language ?? 'pt'];
  const groups = groupDisplaySkillsByGroup(display, input.profileSkills);
  const ungroupedLabel = labels.skills;
  const entries = groups.map((group, ordinal) =>
    buildSkillLineEntry({
      ordinal,
      heading: group.label ?? ungroupedLabel,
      items: group.skills.map((skill) => ({
        id: skill.id,
        text: skill.name,
        status: skill.status,
        requirementId: skill.requirementId,
      })),
    }),
  );
  const languages = input.profileLanguages ?? [];
  if ((input.hasLanguagesSection ?? true) || languages.length === 0) {
    return entries;
  }
  entries.push(
    buildSkillLineEntry({
      ordinal: entries.length,
      heading: labels.languages,
      items: languages.map((language) => ({
        id: language.id,
        text: formatProfileLanguage(language),
        status: 'assumed' as const,
        requirementId: null,
      })),
    }),
  );
  return entries;
}

interface DisplaySkill {
  readonly originalId: string | null;
  readonly id: string;
  readonly name: string;
  readonly group: string | null;
  readonly status: 'assumed' | 'suggestion';
  readonly requirementId: string | null;
}

interface PartitionedProposals {
  readonly acceptedSwaps: Map<string, SkillProposalRow>;
  readonly pendingSwaps: readonly SkillProposalRow[];
  readonly additions: readonly SkillProposalRow[];
}
function isAcceptedSwap(proposal: SkillProposalRow): boolean {
  return proposal.kind === 'swap' && proposal.replacesSkillId !== null && proposal.status === 'accepted';
}
function isPendingSwap(proposal: SkillProposalRow): boolean {
  return proposal.kind === 'swap' && proposal.replacesSkillId !== null && proposal.status === 'pending';
}
function isActiveAddition(proposal: SkillProposalRow): boolean {
  return proposal.kind === 'addition' && (proposal.status === 'accepted' || proposal.status === 'pending');
}
function addFirstAcceptedSwap(acceptedSwaps: Map<string, SkillProposalRow>, proposal: SkillProposalRow): void {
  const replacesId = proposal.replacesSkillId;
  if (replacesId === null) {
    return;
  }
  if (acceptedSwaps.has(replacesId)) {
    return;
  }
  acceptedSwaps.set(replacesId, proposal);
}
function partitionProposals(proposals: readonly SkillProposalRow[]): PartitionedProposals {
  const acceptedSwaps = new Map<string, SkillProposalRow>();
  const pendingSwaps: SkillProposalRow[] = [];
  const additions: SkillProposalRow[] = [];
  for (const proposal of proposals) {
    if (isAcceptedSwap(proposal)) {
      addFirstAcceptedSwap(acceptedSwaps, proposal);
      continue;
    }
    if (isPendingSwap(proposal)) {
      pendingSwaps.push(proposal);
      continue;
    }
    if (isActiveAddition(proposal)) {
      additions.push(proposal);
    }
  }
  return { acceptedSwaps, pendingSwaps, additions };
}
function collectValidGroupKeys(base: readonly SkillRow[]): Set<string> {
  const validKeys = new Set<string>();
  for (const skill of base) {
    const key = normalizeGroupKey(skill.group);
    if (key === null) {
      continue;
    }
    validKeys.add(key);
  }
  return validKeys;
}
function resolveAdditionGroup(group: string | null, validKeys: ReadonlySet<string>): string | null {
  const key = normalizeGroupKey(group);
  if (key === null) {
    return null;
  }
  if (!validKeys.has(key)) {
    return null;
  }
  return group;
}
function toBaseDisplaySkill(skill: SkillRow, swap: SkillProposalRow | undefined): DisplaySkill {
  if (swap === undefined) {
    return { originalId: skill.id, id: skill.id, name: skill.name, group: skill.group, status: 'assumed', requirementId: null };
  }
  return { originalId: skill.id, id: swap.id, name: swap.name, group: skill.group, status: 'assumed', requirementId: swap.requirementId };
}
function toBaseDisplay(base: readonly SkillRow[], acceptedSwaps: ReadonlyMap<string, SkillProposalRow>): DisplaySkill[] {
  return base.map((skill) => toBaseDisplaySkill(skill, acceptedSwaps.get(skill.id)));
}
function buildIndexByOriginalId(display: readonly DisplaySkill[]): Map<string, number> {
  const index = new Map<string, number>();
  display.forEach((item, position) => {
    if (item.originalId === null) {
      return;
    }
    if (index.has(item.originalId)) {
      return;
    }
    index.set(item.originalId, position);
  });
  return index;
}
function toOrphanDisplay(swap: SkillProposalRow, resolve: (group: string | null) => string | null): DisplaySkill {
  return { originalId: null, id: swap.id, name: swap.name, group: resolve(swap.group), status: 'assumed', requirementId: swap.requirementId };
}
function collectOrphanAccepted(acceptedSwaps: ReadonlyMap<string, SkillProposalRow>, index: ReadonlyMap<string, number>, resolve: (group: string | null) => string | null): DisplaySkill[] {
  const orphans: DisplaySkill[] = [];
  for (const [replacesId, swap] of acceptedSwaps) {
    if (index.has(replacesId)) {
      continue;
    }
    orphans.push(toOrphanDisplay(swap, resolve));
  }
  return orphans;
}
function toAdditionDisplay(proposal: SkillProposalRow, resolve: (group: string | null) => string | null): DisplaySkill {
  const status = proposal.status === 'pending' ? ('suggestion' as const) : ('assumed' as const);
  return { originalId: null, id: proposal.id, name: proposal.name, group: resolve(proposal.group), status, requirementId: proposal.requirementId };
}
function appendAdditions(ordered: DisplaySkill[], additions: readonly SkillProposalRow[], resolve: (group: string | null) => string | null): void {
  for (const proposal of additions) {
    ordered.push(toAdditionDisplay(proposal, resolve));
  }
}
function toPendingFallbackDisplay(proposal: SkillProposalRow, resolve: (group: string | null) => string | null): DisplaySkill {
  return { originalId: null, id: proposal.id, name: proposal.name, group: resolve(proposal.group), status: 'suggestion', requirementId: proposal.requirementId };
}
function insertOnePendingSwap(ordered: DisplaySkill[], display: readonly DisplaySkill[], index: ReadonlyMap<string, number>, proposal: SkillProposalRow, resolve: (group: string | null) => string | null): void {
  const replacesId = proposal.replacesSkillId;
  if (replacesId === null) {
    ordered.push(toPendingFallbackDisplay(proposal, resolve));
    return;
  }
  const target = index.get(replacesId);
  if (target === undefined) {
    ordered.push(toPendingFallbackDisplay(proposal, resolve));
    return;
  }
  const original = display[target];
  if (original === undefined) {
    ordered.push({ originalId: null, id: proposal.id, name: proposal.name, group: null, status: 'suggestion', requirementId: proposal.requirementId });
    return;
  }
  const insertAt = ordered.indexOf(original) + 1;
  ordered.splice(insertAt, 0, { originalId: null, id: proposal.id, name: proposal.name, group: original.group, status: 'suggestion', requirementId: proposal.requirementId });
}
function insertPendingSwaps(ordered: DisplaySkill[], display: readonly DisplaySkill[], index: ReadonlyMap<string, number>, pendingSwaps: readonly SkillProposalRow[], resolve: (group: string | null) => string | null): void {
  for (const proposal of pendingSwaps) {
    insertOnePendingSwap(ordered, display, index, proposal, resolve);
  }
}
function applySkillProposals(input: {
  readonly base: readonly SkillRow[];
  readonly proposals: readonly SkillProposalRow[];
  readonly profileSkills: readonly SkillRow[];
}): DisplaySkill[] {
  const partitioned = partitionProposals(input.proposals);
  const validKeys = collectValidGroupKeys(input.base);
  const resolve = (group: string | null): string | null => resolveAdditionGroup(group, validKeys);
  const display = toBaseDisplay(input.base, partitioned.acceptedSwaps);
  const index = buildIndexByOriginalId(display);
  const ordered: DisplaySkill[] = [...display, ...collectOrphanAccepted(partitioned.acceptedSwaps, index, resolve)];
  appendAdditions(ordered, partitioned.additions, resolve);
  insertPendingSwaps(ordered, display, index, partitioned.pendingSwaps, resolve);
  return ordered;
}

interface DisplaySkillGroup {
  readonly label: string | null;
  readonly skills: DisplaySkill[];
}

function groupDisplaySkillsByGroup(
  skills: readonly DisplaySkill[],
  profileSkills: readonly SkillRow[],
): DisplaySkillGroup[] {
  const rank = rankSkillGroups([...profileSkills, ...skills.map((skill) => ({ group: skill.group }) as SkillRow)]);
  const byKey = new Map<string | null, DisplaySkillGroup>();
  for (const skill of skills) {
    const key = normalizeGroupKey(skill.group);
    const group = byKey.get(key) ?? { label: key === null ? null : (skill.group ?? '').trim(), skills: [] };
    (group.skills as DisplaySkill[]).push(skill);
    byKey.set(key, group);
  }
  const rankOf = (key: string | null): number => (key === null ? UNRANKED_GROUP : (rank.get(key) ?? UNRANKED_GROUP));
  return [...byKey.entries()]
    .sort(([left], [right]) => rankOf(left) - rankOf(right))
    .map(([, group]) => group);
}

const SKILL_LINE_LABELS = {
  pt: { skills: 'Habilidades', languages: 'Idiomas' },
  en: { skills: 'Skills', languages: 'Languages' },
} as const;

function buildSkillLineEntry(input: {
  readonly ordinal: number;
  readonly heading: string;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly text: string;
    readonly status: 'assumed' | 'suggestion';
    readonly requirementId?: string | null;
  }>;
}): ResumeDocumentResponse['sections'][number]['entries'][number] {
  return {
    id: randomUUID(),
    ordinal: input.ordinal,
    experienceId: null,
    educationEntryId: null,
    heading: input.heading,
    company: null,
    role: null,
    institution: null,
    degree: null,
    period: null,
    bullets: input.items.map((item, index) => ({
      id: item.id,
      ordinal: index,
      text: item.text,
      evidenceId: null,
      status: item.status,
      suggestionQuestion: null,
      requirementId: item.requirementId ?? null,
      gapKind: null,
      needsReview: false,
      editedByPerson: false,
    })),
  };
}

function mapLanguageEntries(input: {
  readonly section: SectionRow;
  readonly entriesBySection: ReadonlyMap<string, readonly EntryRow[]>;
  readonly bulletsByEntry: ReadonlyMap<string, readonly BulletRow[]>;
  readonly profileLanguages?: readonly LanguageRow[];
}): ResumeDocumentResponse['sections'][number]['entries'] {
  const profile = input.profileLanguages ?? [];
  if (profile.length > 0) {
    return [
      {
        id: randomUUID(),
        ordinal: 0,
        experienceId: null,
        educationEntryId: null,
        heading: null,
        company: null,
        role: null,
        institution: null,
        degree: null,
        period: null,
        bullets: profile.map((language, index) => ({
          id: language.id,
          ordinal: index,
          text: formatProfileLanguage(language),
          evidenceId: null,
          status: 'assumed' as const,
          suggestionQuestion: null,
          requirementId: null,
          gapKind: null,
          needsReview: false,
          editedByPerson: false,
        })),
      },
    ];
  }
  return [];
}

function mapCertificationEntries(input: {
  readonly section: SectionRow;
  readonly entriesBySection: ReadonlyMap<string, readonly EntryRow[]>;
  readonly bulletsByEntry: ReadonlyMap<string, readonly BulletRow[]>;
  readonly profileCertifications?: readonly CertificationRow[];
}): ResumeDocumentResponse['sections'][number]['entries'] {
  const profile = input.profileCertifications ?? [];
  if (profile.length > 0) {
    return [
      {
        id: randomUUID(),
        ordinal: 0,
        experienceId: null,
        educationEntryId: null,
        heading: null,
        company: null,
        role: null,
        institution: null,
        degree: null,
        period: null,
        bullets: profile.map((certification, index) => ({
          id: certification.id,
          ordinal: index,
          text: formatProfileCertification(certification),
          evidenceId: null,
          status: 'assumed' as const,
          suggestionQuestion: null,
          requirementId: null,
          gapKind: null,
          needsReview: false,
          editedByPerson: false,
        })),
      },
    ];
  }
  return [];
}

function formatProfileLanguage(language: LanguageRow): string {
  return formatLanguage(language.name, language.level);
}

function formatProfileCertification(certification: CertificationRow): string {
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

const UNRANKED_GROUP = Number.MAX_SAFE_INTEGER;

function rankSkillGroups(skills: readonly Pick<SkillRow, 'group'>[]): Map<string, number> {
  const rank = new Map<string, number>();
  for (const skill of skills) {
    const key = normalizeGroupKey(skill.group);
    if (key !== null && !rank.has(key)) {
      rank.set(key, rank.size);
    }
  }
  return rank;
}

export function mapResumeEntry(input: {
  readonly entry: EntryRow;
  readonly bulletsByEntry: ReadonlyMap<string, readonly BulletRow[]>;
  readonly experienceById: ReadonlyMap<string, ExperienceRow>;
  readonly educationById: ReadonlyMap<string, EducationRow>;
  readonly language: 'pt' | 'en';
}): ResumeDocumentResponse['sections'][number]['entries'][number] {
  const bullets = input.bulletsByEntry.get(input.entry.id) ?? [];
  const resolved = resolveEntryDetails(input);
  return {
    id: input.entry.id,
    ordinal: input.entry.ordinal,
    experienceId: input.entry.experienceId,
    educationEntryId: input.entry.educationEntryId,
    heading: input.entry.heading,
    company: resolved.company,
    role: resolved.role,
    institution: resolved.institution,
    degree: resolved.degree,
    period: resolved.period,
    bullets: bullets.map(mapResumeBullet),
  };
}

export function mapResumeBullet(bullet: BulletRow): ResumeDocumentResponse['sections'][number]['entries'][number]['bullets'][number] {
  return {
    id: bullet.id,
    ordinal: bullet.ordinal,
    text: bullet.text,
    evidenceId: bullet.evidenceId,
    status: bullet.status,
    suggestionQuestion: bullet.suggestionQuestion,
    requirementId: bullet.requirementId,
    gapKind: bullet.gapKind,
    needsReview: bullet.needsReview,
    editedByPerson: bullet.editedByPerson,
  };
}

export function mapSectionComment(comment: CommentRow): ResumeDocumentResponse['sections'][number]['comments'][number] {
  return {
    id: comment.id,
    text: comment.text,
    resolvedAt: comment.resolvedAt === null ? null : comment.resolvedAt.toISOString(),
    createdAt: comment.createdAt.toISOString(),
  };
}

function groupBulletsByEntry(bullets: ResumeDocument['bullets']): Map<string, BulletRow[]> {
  const grouped = new Map<string, BulletRow[]>();
  for (const bullet of bullets) {
    const existing = grouped.get(bullet.entryId) ?? [];
    existing.push(bullet);
    grouped.set(bullet.entryId, existing);
  }
  return grouped;
}

function groupEntriesBySection(entries: ResumeDocument['entries']): Map<string, EntryRow[]> {
  const grouped = new Map<string, EntryRow[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.sectionId) ?? [];
    existing.push(entry);
    grouped.set(entry.sectionId, existing);
  }
  return grouped;
}

function groupCommentsBySection(comments: ResumeDocument['comments']): Map<string, CommentRow[]> {
  const grouped = new Map<string, CommentRow[]>();
  for (const comment of comments) {
    const existing = grouped.get(comment.sectionId) ?? [];
    existing.push(comment);
    grouped.set(comment.sectionId, existing);
  }
  return grouped;
}

function groupSectionSkillsBySection(sectionSkills: ResumeDocument['sectionSkills']): Map<string, SectionSkillRow[]> {
  const grouped = new Map<string, SectionSkillRow[]>();
  for (const row of sectionSkills) {
    const existing = grouped.get(row.sectionId) ?? [];
    existing.push(row);
    grouped.set(row.sectionId, existing);
  }
  return grouped;
}

function indexById<T extends { readonly id: string }>(rows: readonly T[]): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const row of rows) {
    indexed.set(row.id, row);
  }
  return indexed;
}

function normalizeContactName(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = normalizeContactName(value ?? null);
  return normalized ?? null;
}

function normalizeContactLinks(value: unknown): ResumeDocumentResponse['contact']['links'] {
  const candidates = Array.isArray(value) ? value : asLinkCandidates(value);
  const links: NonNullable<ResumeDocumentResponse['contact']['links']> = [];
  for (const candidate of candidates) {
    const normalized = normalizeContactLink(candidate);
    if (normalized !== undefined) {
      links.push(normalized);
    }
  }
  return links.length === 0 ? null : links;
}

function normalizeContactLink(candidate: unknown): { title: string | null; url: string } | undefined {
  if (typeof candidate === 'string') {
    const url = candidate.trim();
    return url === '' ? undefined : { title: null, url };
  }
  if (candidate === null || typeof candidate !== 'object' || !('url' in candidate)) {
    return undefined;
  }
  const url = (candidate as { url: unknown }).url;
  if (!isNonEmptyString(url)) {
    return undefined;
  }
  const title = (candidate as { title?: unknown }).title;
  return { title: isNonEmptyString(title) ? title.trim() : null, url: url.trim() };
}

function asLinkCandidates(value: unknown): readonly unknown[] {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value);
  }
  return [];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function resolveEntryDetails(input: {
  readonly entry: EntryRow;
  readonly experienceById: ReadonlyMap<string, ExperienceRow>;
  readonly educationById: ReadonlyMap<string, EducationRow>;
  readonly language: 'pt' | 'en';
}): Pick<
  ResumeDocumentResponse['sections'][number]['entries'][number],
  'company' | 'role' | 'institution' | 'degree' | 'period'
> {
  const experience =
    input.entry.experienceId === null ? undefined : input.experienceById.get(input.entry.experienceId);
  if (experience !== undefined) {
    return {
      company: experience.company,
      role: experience.role,
      institution: null,
      degree: null,
      period: formatPeriod(experience, input.language),
    };
  }
  const education =
    input.entry.educationEntryId === null
      ? undefined
      : input.educationById.get(input.entry.educationEntryId);
  if (education !== undefined) {
    return {
      company: null,
      role: null,
      institution: education.institution,
      degree: education.degree,
      period: formatPeriod(education, input.language),
    };
  }
  return { company: null, role: null, institution: null, degree: null, period: null };
}

const MONTH_ABBREVIATIONS_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

const MONTH_ABBREVIATIONS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function formatMonthYear(value: string, language: 'pt' | 'en'): string {
  if (/^\d{4}$/.test(value)) {
    return value;
  }
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }
  const year = match[1] ?? '';
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return value;
  }
  const table = language === 'pt' ? MONTH_ABBREVIATIONS_PT : MONTH_ABBREVIATIONS_EN;
  return `${table[month - 1]} ${year}`;
}

function formatPeriod(
  input: { readonly startedOn: string; readonly endedOn: string | null },
  language: 'pt' | 'en',
): string {
  if (input.endedOn === null) {
    const start = formatMonthYear(input.startedOn, language);
    return `${start} – ${language === 'pt' ? 'Presente' : 'Present'}`;
  }
  if (input.startedOn === input.endedOn) {
    return formatMonthYear(input.startedOn, language);
  }
  const start = formatMonthYear(input.startedOn, language);
  const end = formatMonthYear(input.endedOn, language);
  return `${start} – ${end}`;
}

export function mapAdaptationReview(review: unknown, resumeId: string): AdaptationReviewResponse {
  const parsed = parseReviewRecord(review);
  if (!parsed.ok) {
    console.error('resume.adaptation_review.invalid_record', { resumeId });
    return {};
  }
  const mapped: Record<string, AdaptationReviewResponse[string]> = {};
  for (const [evidenceId, entry] of Object.entries(parsed.record)) {
    mapped[evidenceId] = entry.decision;
  }
  return mapped;
}
