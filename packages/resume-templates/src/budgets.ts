import type { LengthTarget, ResumeTemplateName } from './renderable-resume';

export const COMFORTABLE_CHARS_PER_PAGE = 2900;

export const DENSE_CHARS_PER_PAGE = 3400;

export const MAX_LENGTH_TARGET_PAGES = 2;

export const CHARS_PER_PAGE: Record<ResumeTemplateName, number> = {
  comfortable: COMFORTABLE_CHARS_PER_PAGE,
  dense: DENSE_CHARS_PER_PAGE,
};

export function resolveCharBudget(template: ResumeTemplateName, lengthTarget: LengthTarget): number {
  return CHARS_PER_PAGE[template] * lengthTarget;
}
