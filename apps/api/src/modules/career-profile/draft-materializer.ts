import type { ResumeImportDraft } from 'schema/contracts/resume-import';
import { normalizePartialDate } from './partial-date';

export class InvalidDraftDateError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`Invalid draft date at ${field}.`);
    this.name = 'InvalidDraftDateError';
    this.field = field;
  }
}

export interface MaterializedDraft {
  readonly contactDetails: {
    readonly fullName: string | null;
    readonly email: string | null;
    readonly phone: string | null;
    readonly city: string | null;
    readonly links: ReadonlyArray<{ readonly title: string | null; readonly url: string }> | null;
  };
  readonly experiences: ReadonlyArray<{
    readonly company: string;
    readonly role: string;
    readonly startedOn: string;
    readonly endedOn: string | null;
  }>;
  readonly educationEntries: ReadonlyArray<{
    readonly institution: string;
    readonly degree: string;
    readonly startedOn: string;
    readonly endedOn: string | null;
  }>;
  readonly evidences: ReadonlyArray<{
    readonly statement: string;
    readonly experienceIndex: number | null;
  }>;
  readonly skills: ReadonlyArray<{
    readonly name: string;
    readonly group: string | null;
    readonly ordinal: number;
  }>;
  readonly languages: ReadonlyArray<{
    readonly name: string;
    readonly level: string | null;
  }>;
  readonly certifications: ReadonlyArray<{
    readonly name: string;
    readonly issuer: string | null;
    readonly year: string | null;
  }>;
}

function requirePartialDate(value: string, field: string): string {
  const normalized = normalizePartialDate(value);
  if (normalized === null) {
    throw new InvalidDraftDateError(field);
  }
  return normalized;
}

function optionalPartialDate(value: string | null, field: string): string | null {
  if (value === null) {
    return null;
  }
  return requirePartialDate(value, field);
}

export function materializeDraft(draft: ResumeImportDraft): MaterializedDraft {
  return {
    contactDetails: {
      fullName: draft.contactDetails.fullName,
      email: draft.contactDetails.email,
      phone: draft.contactDetails.phone,
      city: draft.contactDetails.city ?? null,
      links: draft.contactDetails.links,
    },
    experiences: draft.experiences.map((exp, index) => ({
      company: exp.company,
      role: exp.role,
      startedOn: requirePartialDate(exp.startedOn, `experiences[${index}].startedOn`),
      endedOn: optionalPartialDate(exp.endedOn, `experiences[${index}].endedOn`),
    })),
    educationEntries: draft.education.map((edu, index) => ({
      institution: edu.institution,
      degree: edu.degree,
      startedOn: requirePartialDate(edu.startedOn, `educationEntries[${index}].startedOn`),
      endedOn: optionalPartialDate(edu.endedOn, `educationEntries[${index}].endedOn`),
    })),
    evidences: draft.evidences.map((ev) => ({
      statement: ev.statement,
      experienceIndex: ev.experienceIndex ?? null,
    })),
    skills: (draft.skills ?? []).map((skill, index) => ({
      name: skill.name.trim(),
      group: skill.group,
      ordinal: index,
    })),
    languages: (draft.languages ?? []).map((language) => ({
      name: language.name.trim(),
      level: language.level,
    })),
    certifications: (draft.certifications ?? []).map((certification) => ({
      name: certification.name.trim(),
      issuer: certification.issuer,
      year: certification.year,
    })),
  };
}
