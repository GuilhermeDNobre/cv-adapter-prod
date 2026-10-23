import { z } from 'zod';
import { registerPrompt } from './prompt';

export const extractResumeDraftOutputSchema = z.object({
  evidences: z.array(
    z.object({
      statement: z.string().min(1),
      experienceIndex: z.number().int().nonnegative().optional(),
    }),
  ),
  experiences: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      startedOn: z.string(),
      endedOn: z.string().nullable(),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      startedOn: z.string(),
      endedOn: z.string().nullable(),
    }),
  ),
  summary: z.string().trim().min(1).nullable().optional(),
  skills: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        group: z.string().trim().min(1).nullable(),
      }),
    )
    .optional(),
  languages: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        level: z.string().trim().min(1).nullable(),
      }),
    )
    .optional(),
  certifications: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        issuer: z.string().trim().min(1).nullable(),
        year: z.string().trim().min(1).nullable(),
      }),
    )
    .optional(),
  sectionOrder: z
    .array(z.enum(['summary', 'experience', 'education', 'skills', 'languages', 'certifications', 'custom']))
    .optional(),
});

export type ExtractResumeDraftOutput = z.infer<typeof extractResumeDraftOutputSchema>;

const SYSTEM_MESSAGE = [
  'You parse a resume into structured career data.',
  'Reply with a single json object and nothing else.',
  'The object must contain three arrays: "evidences", "experiences" and "education".',
  'It may also contain "summary", "skills", "languages", "certifications" and "sectionOrder".',
  '"summary" is the text of the resume, objective or profile section when present (never invented);',
  'it never becomes an evidence.',
  'Each evidence has "statement" (a single verifiable fact about the person career) and optionally',
  '"experienceIndex" (zero-based index into the experiences array, when the evidence is tied to one).',
  'Each experience has "company", "role", "startedOn" (YYYY-MM or YYYY) and "endedOn" (YYYY-MM, YYYY,',
  'or null if current).',
  'Each education entry has "institution", "degree", "startedOn" and "endedOn", same formats.',
  'Each skill has "name" (one item of the resume skills list, copied exactly as it is written there,',
  'never a sentence) and "group" (the group label when the resume groups skills, such as Linguagens or',
  'Back-end, otherwise null).',
  'Copy composite items as written and keep each one a single skill: "JavaScript/TypeScript", "CI/CD" and',
  '"HTML/CSS" stay one skill each, never split into parts.',
  'Only the list separators of the resume itself (comma, semicolon, bullet, line break) separate one skill',
  'from the next.',
  'Each language has "name" and "level" (or null when the resume states no level).',
  'Each certification has "name", "issuer" (or null) and "year" (or null).',
  '"sectionOrder" lists the section kinds in the order they appear in the resume:',
  'summary, experience, education, skills, languages, certifications, custom.',
  'Education, languages, certifications, courses and skills never become evidences;',
  'evidences hold only verifiable work facts.',
  'Extract only what the text states. Do not invent facts, dates, companies, degrees, skills,',
  'languages or certifications.',
  'If the text contains no discernible experiences, return an empty experiences array.',
  'If the text contains no discernible summary, omit "summary" or set it to null.',
  'If the text contains no discernible education, return an empty education array.',
  'If the text contains no discernible evidence statements, return an empty evidences array.',
  'If the text contains no discernible skills, return an empty skills array.',
  'If the text contains no discernible languages, return an empty languages array.',
  'If the text contains no discernible certifications, return an empty certifications array.',
  'The text has already been stripped of contact details. Ignore any placeholder markers such as',
  '[EMAIL REMOVED] or [NAME REMOVED].',
].join(' ');

registerPrompt({
  name: 'extract-resume-draft',
  systemMessage: SYSTEM_MESSAGE,
  outputSchema: extractResumeDraftOutputSchema,
});
