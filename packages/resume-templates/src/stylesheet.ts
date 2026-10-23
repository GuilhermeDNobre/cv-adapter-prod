import {
  LATIN_MODERN_BOLD_BASE64,
  LATIN_MODERN_BOLD_ITALIC_BASE64,
  LATIN_MODERN_ITALIC_BASE64,
  LATIN_MODERN_REGULAR_BASE64,
} from './fonts/latin-modern';
import type { ResumeRenderMode, ResumeTemplateName } from './renderable-resume';

interface TemplateDensity {
  bodyFontSize: string;
  lineHeight: string;
  nameFontSize: string;
  titleFontSize: string;
  contactLineSize: string;
  sectionGap: string;
  titleGap: string;
  entryGap: string;
}

const DENSITY: Record<ResumeTemplateName, TemplateDensity> = {
  comfortable: {
    bodyFontSize: '10pt',
    lineHeight: '1.2',
    nameFontSize: '17.28pt',
    titleFontSize: '14.4pt',
    contactLineSize: '10pt',
    sectionGap: '0.5em',
    titleGap: '4px',
    entryGap: '3px',
  },
  dense: {
    bodyFontSize: '9.5pt',
    lineHeight: '1.15',
    nameFontSize: '16pt',
    titleFontSize: '13pt',
    contactLineSize: '9pt',
    sectionGap: '4px',
    titleGap: '2px',
    entryGap: '2px',
  },
};

const LINK_COLOR = '#0000b3';

function fontFaceRules(): string {
  return `@font-face {
  font-family: 'Latin Modern Roman';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(data:font/woff2;base64,${LATIN_MODERN_REGULAR_BASE64}) format('woff2');
}
@font-face {
  font-family: 'Latin Modern Roman';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(data:font/woff2;base64,${LATIN_MODERN_BOLD_BASE64}) format('woff2');
}
@font-face {
  font-family: 'Latin Modern Roman';
  font-style: italic;
  font-weight: 400;
  font-display: swap;
  src: url(data:font/woff2;base64,${LATIN_MODERN_ITALIC_BASE64}) format('woff2');
}
@font-face {
  font-family: 'Latin Modern Roman';
  font-style: italic;
  font-weight: 700;
  font-display: swap;
  src: url(data:font/woff2;base64,${LATIN_MODERN_BOLD_ITALIC_BASE64}) format('woff2');
}`;
}

function baseRules(density: TemplateDensity): string {
  return `@page {
  size: A4;
  margin: 12mm 15mm 12mm 15mm;
}
* {
  box-sizing: border-box;
}
body {
  font-family: 'Latin Modern Roman', 'Times New Roman', serif;
  font-size: ${density.bodyFontSize};
  line-height: ${density.lineHeight};
  color: #1a1a1a;
  max-width: 190mm;
  margin: 0 auto;
  padding: 0;
}
a {
  color: ${LINK_COLOR};
  text-decoration: none;
}`;
}

function contactRules(density: TemplateDensity): string {
  return `.contact {
  text-align: center;
  margin: 0 0 ${density.entryGap} 0;
}
.contact-name {
  font-size: ${density.nameFontSize};
  font-weight: bold;
  line-height: 1.2;
  margin: 0;
}
.contact-line {
  font-size: ${density.contactLineSize};
  margin: 4px 0 0 0;
}`;
}

function sectionRules(density: TemplateDensity): string {
  return `.resume-section {
  margin: ${density.sectionGap} 0 0 0;
}
.section-title {
  font-size: ${density.titleFontSize};
  font-weight: bold;
  line-height: 1.25;
  border-bottom: 1px solid #1a1a1a;
  padding-bottom: 2px;
  margin: 0 0 ${density.titleGap} 0;
  break-after: avoid;
}
.section-trigger {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
}
.section-trigger:focus-visible {
  outline: 2px solid #1d4ed8;
  outline-offset: 2px;
}`;
}

function entryRules(density: TemplateDensity): string {
  return `.entry {
  margin: ${density.entryGap} 0 0 0;
  break-inside: avoid;
}
.entry-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}
.entry-primary {
  font-weight: bold;
}
.entry-period {
  white-space: nowrap;
}
.entry-role {
  font-style: italic;
}`;
}

function bulletRules(): string {
  return `.bullets {
  list-style: none;
  margin: 0.2em 0 0 0;
  padding-left: 0;
}
.bullets li {
  padding-left: 0.75em;
  text-indent: -0.75em;
  margin-top: 0.1em;
  break-inside: avoid;
  text-align: justify;
  hyphens: auto;
}
.bullets li::before {
  content: '\\2022';
  display: inline-block;
  width: 0.75em;
  text-indent: 0;
}
.summary-text {
  margin: 4px 0 0 0;
  text-align: justify;
  hyphens: auto;
}
.skills-group {
  font-weight: bold;
}
.languages-line {
  overflow-wrap: break-word;
}
.language-item {
  margin-right: 2em;
}
.language-item:last-child {
  margin-right: 0;
}`;
}

function highlightRules(): string {
  return `.change-trigger {
  display: inline-block;
  vertical-align: top;
  font: inherit;
  color: inherit;
  background-color: rgba(15, 118, 110, 0.11);
  box-shadow: inset 0 -1.5px 0 #0f766e;
  border: none;
  border-radius: 2px;
  padding: 0;
  text-align: left;
  cursor: pointer;
  transition: background-color 150ms ease-out;
}
.change-trigger:focus-visible {
  outline: 2px solid #1d4ed8;
  outline-offset: 2px;
}`;
}

export function buildStylesheet(template: ResumeTemplateName, mode: ResumeRenderMode): string {
  const density = DENSITY[template];
  const parts = [
    fontFaceRules(),
    baseRules(density),
    contactRules(density),
    sectionRules(density),
    entryRules(density),
    bulletRules(),
  ];
  if (mode === 'interactive') {
    parts.push(highlightRules());
  }
  return parts.join('\n');
}
