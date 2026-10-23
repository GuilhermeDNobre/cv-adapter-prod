import { escapeHtml } from './escape';
import { resolveLinkLabel, toEmailHref, toLinkHref, toPhoneHref } from './link-labels';
import { resolveSectionLabel } from './section-labels';
import { buildStylesheet } from './stylesheet';
import type {
  RenderableResume,
  RenderOptions,
  ResumeBullet,
  ResumeContact,
  ResumeContactLinkInput,
  ResumeEntry,
  ResumeRenderMode,
  ResumeSection,
  SectionKind,
} from './renderable-resume';

export { resolveLinkLabel } from './link-labels';

export function renderResumeHtml(document: RenderableResume, options: RenderOptions): string {
  return `<!DOCTYPE html>\n<html lang="${options.language}">\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(document.contact.name)}</title>\n<style>\n${buildStylesheet(options.template, options.mode)}\n</style>\n</head>\n${renderBody(document, options)}\n</html>\n`;
}

function renderBody(document: RenderableResume, options: RenderOptions): string {
  const sections = document.sections
    .map((section) => renderSection(section, options))
    .filter((html): html is string => html !== null);
  return `<body>\n${renderContact(document.contact)}\n<main>\n${sections.join('\n')}\n</main>\n</body>`;
}

function escapeHref(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderContactLink(href: string, label: string): string {
  return `<a href="${escapeHref(href)}">${escapeHtml(label)}</a>`;
}

function renderContactLinkInput(link: ResumeContactLinkInput): string | null {
  if (typeof link === 'string') {
    if (link.trim() === '') {
      return null;
    }
    return renderContactLink(toLinkHref(link), resolveLinkLabel(link));
  }
  if (link.url.trim() === '') {
    return null;
  }
  const title = link.title?.trim() ?? '';
  return renderContactLink(toLinkHref(link.url), title === '' ? resolveLinkLabel(link.url) : title);
}

function renderContact(contact: ResumeContact): string {
  const details: string[] = [];
  if (contact.city !== undefined && contact.city.trim() !== '') {
    details.push(escapeHtml(contact.city.trim()));
  }
  if (contact.phone !== undefined && contact.phone.trim() !== '') {
    details.push(renderContactLink(toPhoneHref(contact.phone), contact.phone.trim()));
  }
  if (contact.email !== undefined && contact.email.trim() !== '') {
    details.push(renderContactLink(toEmailHref(contact.email), contact.email.trim()));
  }
  for (const link of contact.links ?? []) {
    const rendered = renderContactLinkInput(link);
    if (rendered !== null) {
      details.push(rendered);
    }
  }
  const line = details.length === 0 ? '' : `\n<p class="contact-line">${details.join(' • ')}</p>`;
  return `<header class="contact">\n<h1 class="contact-name">${escapeHtml(contact.name)}</h1>${line}\n</header>`;
}

function renderSectionEntries(section: ResumeSection, mode: ResumeRenderMode): string[] {
  if (section.kind === 'skills') {
    const skillsList = renderSkillsList(section.entries, mode);
    return skillsList === null ? [] : [skillsList];
  }
  return section.entries
    .map((entry) => renderEntry(entry, section.kind, mode))
    .filter((html): html is string => html !== null);
}

function renderSection(section: ResumeSection, options: RenderOptions): string | null {
  const entries = renderSectionEntries(section, options.mode);
  if (entries.length === 0) {
    return null;
  }
  const label = resolveSectionLabel(section.kind, section.title, options.language);
  if (options.mode !== 'interactive') {
    return `<section class="resume-section">\n<h2 class="section-title">${escapeHtml(label)}</h2>\n${entries.join('\n')}\n</section>`;
  }
  const sectionId = escapeHtml(section.id);
  return `<section class="resume-section" data-section-id="${sectionId}">\n<h2 class="section-title"><button type="button" class="section-trigger" data-section-id="${sectionId}">${escapeHtml(label)}</button></h2>\n${entries.join('\n')}\n</section>`;
}

function renderEntry(entry: ResumeEntry, kind: SectionKind, mode: ResumeRenderMode): string | null {
  const bullets = selectPrintableBullets(entry);
  if (kind === 'languages') {
    return renderLanguagesItem(bullets);
  }
  if (kind === 'certifications') {
    return renderCertificationsItem(bullets);
  }
  if (kind === 'custom' && bullets.length === 0) {
    return renderCustomItem(entry);
  }
  const headHtml = renderEntryHead(entry);
  if (headHtml === '' && bullets.length === 0) {
    return null;
  }
  const bulletsHtml = renderBullets(bullets, kind, mode);
  return `<div class="entry">${headHtml}${bulletsHtml}\n</div>`;
}

function renderEntryHead(entry: ResumeEntry): string {
  const primary = entry.company ?? entry.institution ?? entry.heading;
  const hasPrimary = primary !== undefined && primary.trim() !== '';
  const hasPeriod = entry.period !== undefined && entry.period.trim() !== '';
  const hasRole = entry.role !== undefined && entry.role.trim() !== '';
  if (!hasPrimary && !hasPeriod && !hasRole) {
    return '';
  }
  const primaryHtml = hasPrimary ? `<span class="entry-primary">${escapeHtml(primary!)}</span>` : '';
  const periodHtml = hasPeriod ? `<span class="entry-period">${escapeHtml(entry.period!)}</span>` : '';
  const firstLine =
    hasPrimary || hasPeriod
      ? `\n<div class="entry-line entry-line-1">${primaryHtml}${periodHtml}</div>`
      : '';
  const secondLine = hasRole
    ? `\n<div class="entry-line entry-line-2"><span class="entry-role">${escapeHtml(entry.role!)}</span></div>`
    : '';
  return `${firstLine}${secondLine}`;
}

function renderBulletItem(bullet: ResumeBullet, mode: ResumeRenderMode): string {
  const text = escapeHtml(bullet.text);
  if (
    mode === 'interactive' &&
    bullet.change === 'added' &&
    bullet.id !== undefined &&
    bullet.id !== ''
  ) {
    return `<li><button type="button" class="change-trigger" data-bullet-id="${escapeHtml(bullet.id)}" data-change="added">${text}</button></li>`;
  }
  return `<li>${text}</li>`;
}

function renderBullets(
  bullets: readonly ResumeBullet[],
  kind: SectionKind,
  mode: ResumeRenderMode,
): string {
  if (bullets.length === 0) {
    return '';
  }
  if (kind === 'summary') {
    return `\n${bullets.map((bullet) => `<p class="summary-text">${escapeHtml(bullet.text)}</p>`).join('\n')}`;
  }
  const items = bullets.map((bullet) => renderBulletItem(bullet, mode)).join('\n');
  return `\n<ul class="bullets">\n${items}\n</ul>`;
}

function renderCustomItem(entry: ResumeEntry): string | null {
  if (entry.heading === undefined || entry.heading.trim() === '') {
    return null;
  }
  return `<div class="entry">\n<ul class="bullets">\n<li>${escapeHtml(entry.heading)}</li>\n</ul>\n</div>`;
}

function selectPrintableBullets(entry: ResumeEntry): ResumeBullet[] {
  return entry.bullets.filter((bullet) => bullet.status === 'assumed' && bullet.text.trim() !== '');
}

function isLanguageGroupHeading(group: string): boolean {
  const normalized = group.trim().toLowerCase();
  return normalized === 'idiomas' || normalized === 'languages';
}

function renderLanguageSpans(names: readonly string[]): string {
  return names.map((name) => `<span class="language-item">${escapeHtml(name)}</span>`).join(' ');
}

function renderLanguageSkillItem(entry: ResumeEntry, group: string): string | null {
  const names = selectPrintableBullets(entry).map((bullet) => bullet.text.trim());
  if (names.length === 0) {
    return null;
  }
  return `<li><strong class="skills-group">${escapeHtml(group)}:</strong> ${renderLanguageSpans(names)}</li>`;
}
function renderPrintSkillItem(entry: ResumeEntry, group: string): string | null {
  const names = selectPrintableBullets(entry).map((bullet) => bullet.text.trim());
  if (names.length === 0) {
    return null;
  }
  const label = group === '' ? '' : `<strong class="skills-group">${escapeHtml(group)}:</strong> `;
  return `<li>${label}${names.map((name) => escapeHtml(name)).join(', ')}</li>`;
}
function isVisibleSkillBullet(bullet: ResumeBullet): boolean {
  if (bullet.text.trim() === '') {
    return false;
  }
  if (bullet.status === 'assumed') {
    return true;
  }
  return bullet.status === 'suggestion' && bullet.id !== undefined && bullet.id !== '';
}
function selectVisibleSkillBullets(entry: ResumeEntry): ResumeBullet[] {
  return entry.bullets.filter(isVisibleSkillBullet);
}
function renderInteractiveSkillPart(bullet: ResumeBullet): string {
  const text = escapeHtml(bullet.text.trim());
  if (bullet.status !== 'suggestion') {
    return text;
  }
  return `<button type="button" class="change-trigger" data-skill-proposal-id="${escapeHtml(bullet.id ?? '')}" data-change="added">${text}</button>`;
}
function renderInteractiveSkillItem(entry: ResumeEntry, group: string): string | null {
  const visible = selectVisibleSkillBullets(entry);
  if (visible.length === 0) {
    return null;
  }
  const label = group === '' ? '' : `<strong class="skills-group">${escapeHtml(group)}:</strong> `;
  const parts = visible.map(renderInteractiveSkillPart);
  return `<li>${label}${parts.join(', ')}</li>`;
}
function renderSkillsGroupItem(entry: ResumeEntry, mode: ResumeRenderMode): string | null {
  const group = entry.heading?.trim() ?? '';
  if (isLanguageGroupHeading(group)) {
    return renderLanguageSkillItem(entry, group);
  }
  if (mode === 'print') {
    return renderPrintSkillItem(entry, group);
  }
  return renderInteractiveSkillItem(entry, group);
}

function renderSkillsList(entries: readonly ResumeEntry[], mode: ResumeRenderMode): string | null {
  const items = entries
    .map((entry) => renderSkillsGroupItem(entry, mode))
    .filter((html): html is string => html !== null);
  if (items.length === 0) {
    return null;
  }
  return `<div class="entry">\n<ul class="bullets skills-list">\n${items.join('\n')}\n</ul>\n</div>`;
}

function renderLanguagesItem(bullets: readonly ResumeBullet[]): string | null {
  const names = bullets.map((bullet) => bullet.text.trim()).filter((text) => text !== '');
  if (names.length === 0) {
    return null;
  }
  return `<div class="entry">\n<p class="languages-line">${renderLanguageSpans(names)}</p>\n</div>`;
}

function renderCertificationsItem(bullets: readonly ResumeBullet[]): string | null {
  const names = bullets.map((bullet) => bullet.text.trim()).filter((text) => text !== '');
  if (names.length === 0) {
    return null;
  }
  const lines = names.map((name) => `<p class="certification-line">${escapeHtml(name)}</p>`).join('\n');
  return `<div class="entry">\n${lines}\n</div>`;
}
