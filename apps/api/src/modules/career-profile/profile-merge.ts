export interface MergeableExperience {
  readonly company: string;
  readonly role: string;
  readonly startedOn: string;
}

export interface MergeableEducation {
  readonly institution: string;
  readonly degree: string;
  readonly startedOn: string;
}

export interface MergeableEvidence {
  readonly experienceId: string | null;
  readonly statement: string;
}

export interface MergeableSkill {
  readonly name: string;
}

export interface MergeableLanguage {
  readonly name: string;
}

export interface MergeableCertification {
  readonly name: string;
}

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isSameExperience(a: MergeableExperience, b: MergeableExperience): boolean {
  return (
    normalizeText(a.company) === normalizeText(b.company) &&
    normalizeText(a.role) === normalizeText(b.role) &&
    a.startedOn === b.startedOn
  );
}

export function isSameEducation(a: MergeableEducation, b: MergeableEducation): boolean {
  return (
    normalizeText(a.institution) === normalizeText(b.institution) &&
    normalizeText(a.degree) === normalizeText(b.degree) &&
    a.startedOn === b.startedOn
  );
}

export function isSameEvidence(a: MergeableEvidence, b: MergeableEvidence): boolean {
  return a.experienceId === b.experienceId && normalizeText(a.statement) === normalizeText(b.statement);
}

export function isSameSkill(a: MergeableSkill, b: MergeableSkill): boolean {
  return normalizeText(a.name) === normalizeText(b.name);
}

export function isSameLanguage(a: MergeableLanguage, b: MergeableLanguage): boolean {
  return normalizeText(a.name) === normalizeText(b.name);
}

export function isSameCertification(a: MergeableCertification, b: MergeableCertification): boolean {
  return normalizeText(a.name) === normalizeText(b.name);
}
