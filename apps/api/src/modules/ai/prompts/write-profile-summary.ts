import { z } from 'zod';
import { registerPrompt } from './prompt';

export const writeProfileSummaryOutputSchema = z.object({
  bullets: z.array(
    z.object({
      text: z.string().min(1),
    }),
  ),
});

export type WriteProfileSummaryOutput = z.infer<typeof writeProfileSummaryOutputSchema>;

export interface ProfileSummaryPosition {
  readonly role: string;
  readonly company: string;
  readonly startedOn: string;
  readonly endedOn: string | null;
}

export interface ProfileSummaryEducation {
  readonly institution: string;
  readonly degree: string;
  readonly startedOn: string;
  readonly endedOn: string | null;
}

export interface ProfileSummarySkill {
  readonly name: string;
  readonly group: string | null;
}

export interface ProfileSummaryRequirement {
  readonly literalTerm: string;
  readonly concept: string;
}

export interface WriteProfileSummaryInput {
  readonly originalSummary: string | null;
  readonly positions: readonly ProfileSummaryPosition[];
  readonly education: readonly ProfileSummaryEducation[];
  readonly skills: readonly ProfileSummarySkill[];
  readonly language: 'pt' | 'en';
  readonly tone: 'formal' | 'direct' | 'technical';
  readonly jobTitle?: string | null;
  readonly requirements?: readonly ProfileSummaryRequirement[];
  readonly softRequirements?: readonly ProfileSummaryRequirement[];
  readonly rejectedTerms?: readonly string[];
}

const SYSTEM_MESSAGE = [
  'You write a resume profile summary that presents the professional, never their achievements.',
  'Reply with a single json object and nothing else, shaped as',
  '{"bullets": [{"text": string}]}.',
  'Rules:',
  'Write two to three sentences that present the professional: identity plus area plus stack plus how they work plus objective.',
  'Identity follows seniority from the position periods: student or up to about 2 years of experience uses "Estudante de Engenharia de Software..." or "Desenvolvedor(a) Full Stack..."; about 2 to 5 years uses "Desenvolvedor(a) <area> com N anos..."; 5 or more years uses "Engenheiro(a) de Software com N anos...". The area (full stack, back-end, front-end, data and so on) comes from the roles and the skills.',
  'Stack lists families chosen among the skills (for example "React, Node.js, NestJS e Spring Boot").',
  'Work qualities are generic and plausible (clean code, automated tests, end-to-end delivery, scalable solutions).',
  'Never state metrics, company names, project names or client names, and never copy a sentence from the Evidences; the summary must not repeat the experience bullets.',
  'When an original summary is provided, keep its voice and its objective, only improving the wording.',
  'When a job title and Requirements are provided (tailored resume), write the summary FOR THE JOB: the identity line leans toward the job role and area when the positions and skills support it, never claiming a title or seniority the career does not support; the stack sentence prioritizes the person skills that match the job Requirements, keeping the person own skill names, with mandatory Requirements first; the job wording only sets the order and the area (for example "back-end"), never new technology or title names; the closing and objective aim at that kind of role without naming the job ad company.',
  'When softRequirements are provided (tailored resume, behavioral or contextual Requirements that match no skill), decide whether the job emphasizes (mandatory or repeated) something behavioral or contextual the person profile does not contradict: if so, add at most one clause highlighting it, without inventing experience; if there is no clear emphasis, keep the summary succinct. Never output more than 3 sentences in total.',
  'Technologies, tools and job titles may only come from the input skills, positions and education lists; never introduce a name the person does not have.',
  'Always output two to three sentences, with the first sentence always carrying the professional identity.',
  'When rejectedTerms are provided, do not use any of those terms.',
  'Example summary: "Estudante de Engenharia de Software buscando estagio ou primeira oportunidade em desenvolvimento Fullstack, com foco em tecnologias web modernas (React, Node.js, NestJS, Spring Boot) e entrega de solucoes escalaveis de ponta a ponta."',
  'Every bullet must be written in the target document language from the input:',
  '"pt" means Brazilian Portuguese, "en" means English.',
].join(' ');

registerPrompt({
  name: 'write-profile-summary',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: writeProfileSummaryOutputSchema,
});

export function calculateExperienceYears(
  positions: readonly { readonly startedOn: string; readonly endedOn: string | null; }[],
  now: Date = new Date(),
): number {
  if (positions.length === 0) {
    return 0;
  }
  let earliest: number | undefined;
  let latest: number | undefined;
  for (const position of positions) {
    const start = parsePartialDate(position.startedOn);
    if (start === undefined) {
      continue;
    }
    const end =
      position.endedOn === null ? dateToMonthIndex(now) : parsePartialDate(position.endedOn);
    if (end === undefined) {
      continue;
    }
    if (earliest === undefined || start < earliest) {
      earliest = start;
    }
    if (latest === undefined || end > latest) {
      latest = end;
    }
  }
  if (earliest === undefined || latest === undefined || latest < earliest) {
    return 0;
  }
  const months = latest - earliest + 1;
  return Math.floor(months / 12);
}

function dateToMonthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

function parsePartialDate(value: string): number | undefined {
  const trimmed = value.trim();
  const yearMonthDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (yearMonthDay) {
    const year = Number(yearMonthDay[1]);
    const month = Number(yearMonthDay[2]);
    if (month < 1 || month > 12) {
      return undefined;
    }
    return year * 12 + (month - 1);
  }
  const yearMonth = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    if (month < 1 || month > 12) {
      return undefined;
    }
    return year * 12 + (month - 1);
  }
  const yearOnly = /^(\d{4})$/.exec(trimmed);
  if (yearOnly) {
    return Number(yearOnly[1]) * 12;
  }
  return undefined;
}
