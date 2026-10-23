export type ResumeLanguage = 'pt' | 'en';

export type ResumeTemplateName = 'comfortable' | 'dense';

export type ResumeRenderMode = 'print' | 'interactive';

export type SectionKind = 'summary' | 'experience' | 'education' | 'skills' | 'languages' | 'certifications' | 'custom';

export type BulletStatus = 'assumed' | 'suggestion';

export type LengthTarget = 1 | 2;

export interface ResumeContactLink {
  readonly title?: string | null;
  readonly url: string;
}

export type ResumeContactLinkInput = string | ResumeContactLink;

export interface ResumeContact {
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly city?: string;
  readonly links?: readonly ResumeContactLinkInput[];
}

export interface ResumeBullet {
  readonly text: string;
  readonly status: BulletStatus;
  readonly id?: string;
  readonly change?: 'added';
}

export interface ResumeEntry {
  readonly company?: string;
  readonly role?: string;
  readonly period?: string;
  readonly institution?: string;
  readonly heading?: string;
  readonly bullets: readonly ResumeBullet[];
}

export interface ResumeSection {
  readonly id: string;
  readonly kind: SectionKind;
  readonly title?: string;
  readonly entries: readonly ResumeEntry[];
}

export interface RenderableResume {
  readonly contact: ResumeContact;
  readonly sections: readonly ResumeSection[];
}

export interface RenderOptions {
  readonly template: ResumeTemplateName;
  readonly language: ResumeLanguage;
  readonly mode: ResumeRenderMode;
}
