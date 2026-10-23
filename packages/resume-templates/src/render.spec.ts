import { describe, expect, it } from 'vitest';
import { renderResumeHtml, resolveLinkLabel } from './render';
import type {
  RenderableResume,
  RenderOptions,
  ResumeContact,
  ResumeSection,
  ResumeTemplateName,
} from './renderable-resume';

const TEMPLATES: readonly ResumeTemplateName[] = ['comfortable', 'dense'];

function buildOptions(overrides?: Partial<RenderOptions>): RenderOptions {
  return { template: 'comfortable', language: 'pt', mode: 'print', ...overrides };
}

function buildContact(): ResumeContact {
  return {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+55 11 90000-0000',
    links: ['github.com/ada', 'linkedin.com/in/ada'],
  };
}

function buildSections(): ResumeSection[] {
  return [
    {
      id: 'summary',
      kind: 'summary',
      entries: [
        { bullets: [{ text: 'Engineer with ten years of experience.', status: 'assumed' }] },
      ],
    },
    {
      id: 'experience',
      kind: 'experience',
      entries: [
        {
          company: 'Example Corp',
          role: 'Engineer',
          period: '2020-2024',
          bullets: [
            { text: 'Shipped feature X.', status: 'assumed' },
            { text: 'Draft answer for an uncovered requirement.', status: 'suggestion' },
          ],
        },
      ],
    },
    {
      id: 'education',
      kind: 'education',
      entries: [{ institution: 'University', role: 'BSc', period: '2016', bullets: [] }],
    },
    {
      id: 'skills',
      kind: 'skills',
      entries: [{ bullets: [{ text: 'TypeScript', status: 'assumed' }] }],
    },
    {
      id: 'languages',
      kind: 'custom',
      title: 'Languages',
      entries: [
        {
          heading: 'Spoken languages',
          bullets: [{ text: 'Portuguese', status: 'assumed' }],
        },
      ],
    },
  ];
}

function buildResume(overrides?: {
  contact?: ResumeContact;
  sections?: readonly ResumeSection[];
}): RenderableResume {
  return {
    contact: overrides?.contact ?? buildContact(),
    sections: overrides?.sections ?? buildSections(),
  };
}

function readStyle(html: string): string {
  return html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
}

function removeStyle(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/, '<style></style>');
}

for (const template of TEMPLATES) {
  describe(`template ${template}`, () => {
    it('should return a complete document with the contact on top of the body', () => {
      // Arrange
      const resume = buildResume();

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(html).toContain('<html lang="pt">');
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain('<h1 class="contact-name">Ada Lovelace</h1>');
      expect(html.indexOf('<header')).toBeLessThan(html.indexOf('<section'));
    });

    it('should escape person text instead of interpreting it as markup', () => {
      // Arrange
      const resume = buildResume({
        contact: { ...buildContact(), name: '<script>alert(1)</script>' },
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).not.toContain('<script');
    });

    it('should render the header with clickable contact links separated by bullets', () => {
      // Arrange
      const resume = buildResume();

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).toContain(' • ');
      expect(html).toContain('href="tel:+5511900000000"');
      expect(html).toContain('+55 11 90000-0000');
      expect(html).toContain('href="mailto:ada@example.com"');
      expect(html).toContain('ada@example.com');
      expect(html).toContain('<a href="https://github.com/ada">GitHub</a>');
      expect(html).toContain('<a href="https://linkedin.com/in/ada">LinkedIn</a>');
    });

    it('should render the city first as plain text before the phone', () => {
      // Arrange
      const resume = buildResume({
        contact: { ...buildContact(), city: 'Quixadá, CE' },
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).toContain('Quixadá, CE • ');
      const cityIndex = html.indexOf('Quixadá, CE');
      const phoneIndex = html.indexOf('+55 11 90000-0000');
      expect(cityIndex).toBeGreaterThan(-1);
      expect(phoneIndex).toBeGreaterThan(cityIndex);
      expect(html).not.toContain('<a href="Quixadá');
      expect(html).not.toContain('>Quixadá, CE</a>');
    });

    it('should keep the header unchanged when there is no city', () => {
      // Arrange
      const resume = buildResume({
        contact: { ...buildContact(), city: undefined },
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).not.toContain('Quixadá');
      expect(html).toContain('+55 11 90000-0000');
      expect(html).toContain('ada@example.com');
    });

    it('should show the repository URL instead of the GitHub label for repositories', () => {
      // Arrange
      const resume = buildResume({
        contact: { ...buildContact(), links: ['https://github.com/ada/repo'] },
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).toContain('<a href="https://github.com/ada/repo">github.com/ada/repo</a>');
      expect(html).not.toContain('>GitHub</a>');
    });

    it('should show the URL without scheme for other domains', () => {
      // Arrange
      const resume = buildResume({
        contact: { ...buildContact(), links: ['https://example.com/portfolio'] },
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).toContain('<a href="https://example.com/portfolio">example.com/portfolio</a>');
    });

    it('should load no external resources besides person links', () => {
      // Arrange
      const resume = buildResume();

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).not.toContain('@import');
      expect(html).not.toContain('http://');
      expect(html).toContain('data:font/woff2;base64,');
    });

    it('should keep an ATS-safe single-column layout', () => {
      // Arrange
      const resume = buildResume();

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).not.toContain('<table');
      const style = readStyle(html);
      expect(style).not.toContain('position:');
      expect(html).not.toContain('float:');
      expect(html).not.toContain('@top-');
      expect(html).not.toContain('@bottom-');
      expect(html).toMatch(/@page\s*{[^}]*size:\s*A4/);
      expect(html).toContain('break-inside: avoid');
    });

    it('should lay out entries with flex and keep the reading order', () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'experience',
            kind: 'experience',
            entries: [
              {
                company: 'Example Corp',
                role: 'Engineer',
                period: '2020-2024',
                bullets: [{ text: 'Shipped feature X.', status: 'assumed' }],
              },
            ],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).not.toContain('<table');
      expect(html).toContain('display: flex');
      const companyIndex = html.indexOf('Example Corp');
      const periodIndex = html.indexOf('2020-2024');
      const roleIndex = html.indexOf('Engineer', periodIndex);
      const bulletIndex = html.indexOf('Shipped feature X.');
      expect(companyIndex).toBeGreaterThan(-1);
      expect(periodIndex).toBeGreaterThan(companyIndex);
      expect(roleIndex).toBeGreaterThan(periodIndex);
      expect(bulletIndex).toBeGreaterThan(roleIndex);
    });

    it('should embed Latin Modern instead of Inter', () => {
      // Arrange
      const resume = buildResume();

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).toContain('@font-face');
      expect(html).toContain('Latin Modern');
      expect(html).toContain('data:font/woff2;base64,');
      expect(html).not.toContain('Inter');
    });

    it('should omit suggestions while keeping assumed bullets', () => {
      // Arrange
      const resume = buildResume();

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).toContain('Shipped feature X.');
      expect(html).not.toContain('Draft answer for an uncovered requirement.');
    });

    it('should omit sections left with no printable entry', () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'drafts',
            kind: 'custom',
            title: 'Drafts',
            entries: [{ bullets: [{ text: 'Only a suggestion.', status: 'suggestion' }] }],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Assert
      expect(html).not.toContain('Only a suggestion.');
      expect(html).not.toContain('<section');
    });

    it('should escape section identifiers used as attribute values', () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'exp" onmouseover="alert(1)',
            kind: 'skills',
            entries: [{ bullets: [{ text: 'TypeScript', status: 'assumed' }] }],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template, mode: 'interactive' }));

      // Assert
      expect(html).toContain('data-section-id="exp&quot; onmouseover=&quot;alert(1)"');
      expect(html).not.toContain('onmouseover="alert(1)"');
    });

    it('should expose no section hooks in print mode', () => {
      // Arrange
      const resume = buildResume();

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template, mode: 'print' }));

      // Assert
      expect(html).not.toContain('data-section-id');
      expect(html).not.toContain('tabindex');
      expect(html).not.toContain('role="button"');
    });

    it('should expose clickable section hooks in interactive mode', () => {
      // Arrange
      const resume = buildResume();

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template, mode: 'interactive' }));

      // Assert
      expect(html).toContain('data-section-id="experience"');
      expect(html).toContain('<button type="button" class="section-trigger"');
      expect(html).not.toContain('tabindex="0"');
      expect(html).not.toContain('role="button"');
    });

    it('should keep lists semantic with native buttons in interactive mode', () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'experience',
            kind: 'experience',
            entries: [
              {
                company: 'Example Corp',
                role: 'Engineer',
                period: '2020-2024',
                bullets: [{ text: 'Shipped feature X.', status: 'assumed', id: 'b1', change: 'added' }],
              },
            ],
          },
        ],
      });

      // Act
      const interactive = removeStyle(
        renderResumeHtml(resume, buildOptions({ template, mode: 'interactive' })),
      );
      const print = removeStyle(renderResumeHtml(resume, buildOptions({ template, mode: 'print' })));

      // Assert
      expect(interactive).not.toContain('role="button"');
      expect(interactive).toContain('<h2 class="section-title"><button type="button" class="section-trigger"');
      expect(interactive).toContain('<li><button type="button" class="change-trigger"');
      expect(print).not.toContain('section-trigger');
      expect(print).not.toContain('change-trigger');
      expect(print).not.toContain('<button');
    });

    it('should expose no bullet hooks in print mode', () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'experience',
            kind: 'experience',
            entries: [
              {
                company: 'Example Corp',
                role: 'Engineer',
                period: '2020-2024',
                bullets: [{ text: 'Shipped feature X.', status: 'assumed', id: 'b1', change: 'added' }],
              },
            ],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template, mode: 'print' }));

      // Assert
      expect(html).not.toContain('data-bullet-id');
      expect(html).not.toContain('data-change');
    });

    it('should expose bullet hooks in interactive mode', () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'experience',
            kind: 'experience',
            entries: [
              {
                company: 'Example Corp',
                role: 'Engineer',
                period: '2020-2024',
                bullets: [{ text: 'Shipped feature X.', status: 'assumed', id: 'b1', change: 'added' }],
              },
            ],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));

      // Act (interactive)
      const interactive = renderResumeHtml(resume, buildOptions({ template, mode: 'interactive' }));

      // Assert
      expect(html).not.toContain('data-bullet-id');
      expect(interactive).toContain('data-bullet-id="b1"');
      expect(interactive).toContain('data-change="added"');
      expect(interactive).toContain('<button type="button" class="change-trigger"');
      expect(interactive).not.toContain('role="button"');
    });

    it('should draw bullet markers explicitly without native list-style', () => {
      // Arrange
      const resume = buildResume();

      // Act
      const printStyle = readStyle(renderResumeHtml(resume, buildOptions({ template })));
      const interactiveStyle = readStyle(
        renderResumeHtml(resume, buildOptions({ template, mode: 'interactive' })),
      );

      // Assert
      for (const style of [printStyle, interactiveStyle]) {
        expect(style).toMatch(/\.bullets\s*{[^}]*list-style:\s*none/);
        expect(style).toMatch(/\.bullets\s*{[^}]*padding-left:\s*0[^.]/);
        expect(style).toMatch(/\.bullets li\s*{[^}]*padding-left:\s*0\.75em/);
        expect(style).toMatch(/\.bullets li\s*{[^}]*text-indent:\s*-0\.75em/);
        expect(style).toMatch(/\.bullets li::before\s*{[^}]*display:\s*inline-block/);
        expect(style).toMatch(/\.bullets li::before\s*{[^}]*width:\s*0\.75em/);
        expect(style).toMatch(/\.bullets li::before\s*{[^}]*text-indent:\s*0;/);
        expect(style).toMatch(/\.bullets li::before\s*{[^}]*\\2022/);
        expect(style).not.toContain('position:');
        expect(style).not.toContain('float:');
      }
    });

    it('should keep summary paragraphs without bullet markers', () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'summary',
            kind: 'summary',
            entries: [{ bullets: [{ text: 'Engineer with ten years.', status: 'assumed' }] }],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ template }));
      const style = readStyle(html);

      // Assert
      expect(html).toContain('<p class="summary-text">Engineer with ten years.</p>');
      expect(style).not.toMatch(/\.summary-text::before/);
    });

    it('should render links without underline keeping the dark blue color', () => {
      // Arrange
      const resume = buildResume();

      // Act
      const style = readStyle(renderResumeHtml(resume, buildOptions({ template })));

      // Assert
      expect(style).toMatch(/a\s*{[^}]*color:\s*#0000b3/);
      expect(style).toMatch(/a\s*{[^}]*text-decoration:\s*none/);
    });
  });
}

describe('section labels', () => {
  it('should use the Portuguese canonical labels', () => {
    // Arrange
    const resume = buildResume();

    // Act
    const html = renderResumeHtml(resume, buildOptions({ language: 'pt' }));

    // Assert
    expect(html).toContain('Resumo');
    expect(html).toContain('Experiência Profissional');
    expect(html).toContain('Formação');
    expect(html).toContain('Habilidades');
    expect(html).not.toContain('Professional Experience');
  });

  it('should use the English canonical labels', () => {
    // Arrange
    const resume = buildResume();

    // Act
    const html = renderResumeHtml(resume, buildOptions({ language: 'en' }));

    // Assert
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Summary');
    expect(html).toContain('Professional Experience');
    expect(html).toContain('Education');
    expect(html).toContain('Skills');
    expect(html).not.toContain('Experiência Profissional');
  });

  it('should keep the person title of custom sections', () => {
    // Arrange
    const resume = buildResume();

    // Act
    const html = renderResumeHtml(resume, buildOptions({}));

    // Assert
    expect(html).toContain('Languages');
  });

  it('should fall back to the canonical label for untitled custom sections', () => {
    // Arrange
    const resume = buildResume({
      sections: [
        {
          id: 'extra',
          kind: 'custom',
          entries: [{ bullets: [{ text: 'Volunteer work.', status: 'assumed' }] }],
        },
      ],
    });

    // Act
    const portuguese = renderResumeHtml(resume, buildOptions({ language: 'pt' }));
    const english = renderResumeHtml(resume, buildOptions({ language: 'en' }));

    // Assert
    expect(portuguese).toContain('Informações Adicionais');
    expect(english).toContain('Additional Information');
  });
});

describe('template density', () => {
  it('should share the element structure and differ only in CSS', () => {
    // Arrange
    const resume = buildResume();
    const options = { language: 'pt' as const, mode: 'print' as const };

    // Act
    const comfortable = renderResumeHtml(resume, { ...options, template: 'comfortable' });
    const dense = renderResumeHtml(resume, { ...options, template: 'dense' });

    // Assert
    expect(removeStyle(comfortable)).toBe(removeStyle(dense));
    expect(readStyle(comfortable)).not.toBe(readStyle(dense));
  });

  it('should render dense at 9.5pt and comfortable at 10pt', () => {
    // Arrange
    const resume = buildResume();

    // Act
    const dense = readStyle(renderResumeHtml(resume, buildOptions({ template: 'dense' })));
    const comfortable = readStyle(
      renderResumeHtml(resume, buildOptions({ template: 'comfortable' })),
    );

    // Assert
    expect(dense).toMatch(/body\s*{[^}]*font-size:\s*9\.5pt/);
    expect(comfortable).toMatch(/body\s*{[^}]*font-size:\s*10pt/);
    expect(dense).toMatch(/\.contact-name\s*{[^}]*font-size:\s*16pt/);
    expect(comfortable).toMatch(/\.contact-name\s*{[^}]*font-size:\s*17\.28pt/);
    expect(dense).not.toBe(comfortable);
  });

  it('should use compact body line-heights matching the tex', () => {
    // Arrange
    const resume = buildResume();

    // Act
    const dense = readStyle(renderResumeHtml(resume, buildOptions({ template: 'dense' })));
    const comfortable = readStyle(
      renderResumeHtml(resume, buildOptions({ template: 'comfortable' })),
    );

    // Assert
    expect(dense).toMatch(/body\s*{[^}]*line-height:\s*1\.15/);
    expect(comfortable).toMatch(/body\s*{[^}]*line-height:\s*1\.2[^0-9]/);
    expect(dense).not.toContain('1.35');
    expect(dense).not.toContain('1.45');
    expect(comfortable).not.toContain('1.35');
    expect(comfortable).not.toContain('1.45');
  });

  it('should match the tex metrics in comfortable and stay compact in dense', () => {
    // Arrange
    const resume = buildResume();
    // Act
    const dense = readStyle(renderResumeHtml(resume, buildOptions({ template: 'dense' })));
    const comfortable = readStyle(
      renderResumeHtml(resume, buildOptions({ template: 'comfortable' })),
    );
    // Assert
    expect(comfortable).toMatch(/\.section-title\s*{[^}]*font-size:\s*14\.4pt/);
    expect(dense).toMatch(/\.section-title\s*{[^}]*font-size:\s*13pt/);
    expect(comfortable).toMatch(/\.contact-line\s*{[^}]*font-size:\s*10pt/);
    expect(dense).toMatch(/\.contact-line\s*{[^}]*font-size:\s*9pt/);
    expect(comfortable).toMatch(/\.resume-section\s*{[^}]*margin:\s*0\.5em/);
    expect(dense).toMatch(/\.resume-section\s*{[^}]*margin:\s*4px/);
    expect(comfortable).toMatch(/\.section-title\s*{[^}]*margin:\s*0 0 4px/);
    expect(dense).toMatch(/\.section-title\s*{[^}]*margin:\s*0 0 2px/);
  });

  it('should justify summary and bullets with automatic hyphens', () => {
    // Arrange
    const resume = buildResume();
    // Act
    const dense = readStyle(renderResumeHtml(resume, buildOptions({ template: 'dense' })));
    const comfortable = readStyle(
      renderResumeHtml(resume, buildOptions({ template: 'comfortable' })),
    );
    // Assert
    for (const style of [dense, comfortable]) {
      expect(style).toMatch(/\.summary-text\s*{[^}]*text-align:\s*justify/);
      expect(style).toMatch(/\.summary-text\s*{[^}]*hyphens:\s*auto/);
      expect(style).toMatch(/\.bullets li\s*{[^}]*text-align:\s*justify/);
      expect(style).toMatch(/\.bullets li\s*{[^}]*hyphens:\s*auto/);
      expect(style).not.toMatch(/\.entry-line\s*{[^}]*text-align:\s*justify/);
    }
  });

  it('should keep the contact name at its own line-height', () => {
    // Arrange
    const resume = buildResume();

    // Act
    const dense = readStyle(renderResumeHtml(resume, buildOptions({ template: 'dense' })));
    const comfortable = readStyle(
      renderResumeHtml(resume, buildOptions({ template: 'comfortable' })),
    );

    // Assert
    expect(dense).toMatch(/\.contact-name\s*{[^}]*line-height:\s*1\.2/);
    expect(comfortable).toMatch(/\.contact-name\s*{[^}]*line-height:\s*1\.2/);
  });
});

describe('link labels', () => {
  it('should label LinkedIn profiles as LinkedIn', () => {
    expect(resolveLinkLabel('linkedin.com/in/ada')).toBe('LinkedIn');
    expect(resolveLinkLabel('https://www.linkedin.com/in/ada')).toBe('LinkedIn');
  });

  it('should label GitHub profiles as GitHub and repositories as URLs', () => {
    expect(resolveLinkLabel('github.com/ada')).toBe('GitHub');
    expect(resolveLinkLabel('https://github.com/ada')).toBe('GitHub');
    expect(resolveLinkLabel('https://github.com/ada/repo')).toBe('github.com/ada/repo');
  });

  it('should show other domains as URLs without scheme', () => {
    expect(resolveLinkLabel('https://example.com/portfolio')).toBe('example.com/portfolio');
    expect(resolveLinkLabel('example.com/portfolio')).toBe('example.com/portfolio');
  });
});

describe('change highlights', () => {
  it('should highlight added bullets without relying on color alone', () => {
    // Arrange
    const resume = buildResume({
      sections: [
        {
          id: 'experience',
          kind: 'experience',
          entries: [
            {
              company: 'Example Corp',
              role: 'Engineer',
              period: '2020-2024',
              bullets: [{ text: 'Shipped feature X.', status: 'assumed', id: 'b1', change: 'added' }],
            },
          ],
        },
      ],
    });

    // Act
    const interactiveStyle = readStyle(
      renderResumeHtml(resume, buildOptions({ mode: 'interactive' })),
    );
    const printStyle = readStyle(renderResumeHtml(resume, buildOptions({ mode: 'print' })));

    // Assert
    expect(interactiveStyle).toContain('.change-trigger');
    expect(interactiveStyle).toMatch(/\.change-trigger\s*{[^}]*background-color:\s*rgba\(15,\s*118,\s*110,\s*0\.11\)/);
    expect(interactiveStyle).toMatch(/\.change-trigger\s*{[^}]*box-shadow:\s*inset 0 -1\.5px 0 #0f766e/);
    expect(interactiveStyle).toMatch(/\.change-trigger\s*{[^}]*border-radius:\s*2px/);
    expect(interactiveStyle).toMatch(/\.change-trigger\s*{[^}]*transition:\s*background-color 150ms/);
    expect(printStyle).not.toContain('.change-trigger');
    expect(printStyle).not.toContain('data-change');
  });

  it('should align change triggers to the top of the bullet', () => {
    // Arrange
    const resume = buildResume({
      sections: [
        {
          id: 'experience',
          kind: 'experience',
          entries: [
            {
              company: 'Example Corp',
              role: 'Engineer',
              period: '2020-2024',
              bullets: [{ text: 'Shipped feature X.', status: 'assumed', id: 'b1', change: 'added' }],
            },
          ],
        },
      ],
    });

    // Act
    const interactiveStyle = readStyle(
      renderResumeHtml(resume, buildOptions({ mode: 'interactive' })),
    );

    // Assert
    expect(interactiveStyle).toMatch(/\.change-trigger\s*{[^}]*display:\s*inline-block/);
    expect(interactiveStyle).toMatch(/\.change-trigger\s*{[^}]*vertical-align:\s*top/);
    expect(interactiveStyle).not.toContain('box-decoration-break');
    expect(interactiveStyle).toMatch(/\.change-trigger:focus-visible\s*{[^}]*outline:/);
  });
});

describe('skills section', () => {
  const MODES = ['print', 'interactive'] as const;

  for (const mode of MODES) {
    it(`should render every skill group as one item of a single bulleted list with a bold label in ${mode} mode`, () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'skills',
            kind: 'skills',
            entries: [
              {
                heading: 'Linguagens',
                bullets: [
                  { text: 'JavaScript', status: 'assumed' },
                  { text: 'TypeScript', status: 'assumed' },
                ],
              },
              {
                heading: 'Back-end',
                bullets: [{ text: 'NestJS', status: 'assumed' }],
              },
              {
                heading: 'Idiomas',
                bullets: [
                  { text: 'Português: Nativo', status: 'assumed' },
                  { text: 'Inglês: Avançado (C1)', status: 'assumed' },
                ],
              },
            ],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ mode }));
      const body = html.slice(html.indexOf('<body>'));

      // Assert
      expect(body).toContain(
        '<ul class="bullets skills-list">\n' +
          '<li><strong class="skills-group">Linguagens:</strong> JavaScript, TypeScript</li>\n' +
          '<li><strong class="skills-group">Back-end:</strong> NestJS</li>\n' +
          '<li><strong class="skills-group">Idiomas:</strong> <span class="language-item">Português: Nativo</span> <span class="language-item">Inglês: Avançado (C1)</span></li>\n' +
          '</ul>',
      );
      expect(body.match(/<ul /g)).toHaveLength(1);
      expect(body.match(/<div class="entry">/g)).toHaveLength(1);
      expect(body).not.toContain('skills-line');
      expect(readStyle(html)).toMatch(/\.skills-group\s*{[^}]*font-weight:\s*bold/);
    });

    it(`should render a skill group without a label as a plain item in ${mode} mode`, () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'skills',
            kind: 'skills',
            entries: [{ bullets: [{ text: 'Docker', status: 'assumed' }] }],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ mode }));

      // Assert
      expect(html).toContain('<ul class="bullets skills-list">\n<li>Docker</li>\n</ul>');
      expect(html.slice(html.indexOf('<body>'))).not.toContain('<strong');
    });

    it(`should escape the group label and the skill names in ${mode} mode`, () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'skills',
            kind: 'skills',
            entries: [{ heading: 'R&D <x>', bullets: [{ text: 'C<b>', status: 'assumed' }] }],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ mode }));

      // Assert
      expect(html).toContain('<li><strong class="skills-group">R&amp;D &lt;x&gt;:</strong> C&lt;b&gt;</li>');
    });

    it(`should drop a skill group left with no printable skill in ${mode} mode`, () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'skills',
            kind: 'skills',
            entries: [
              { heading: 'Drafts', bullets: [{ text: 'Draft skill', status: 'suggestion' }] },
              { heading: 'Linguagens', bullets: [{ text: 'Java', status: 'assumed' }] },
            ],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ mode }));

      // Assert
      expect(html).not.toContain('Drafts');
      expect(html).toContain('<ul class="bullets skills-list">\n<li><strong class="skills-group">Linguagens:</strong> Java</li>\n</ul>');
    });

    it(`should omit suggestion skills in ${mode} mode`, () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'skills',
            kind: 'skills',
            entries: [
              {
                bullets: [
                  { text: 'TypeScript', status: 'assumed' },
                  { text: 'Draft skill', status: 'suggestion' },
                ],
              },
            ],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ mode }));

      // Assert
      expect(html).toContain('<li>TypeScript</li>');
      expect(html).not.toContain('Draft skill');
    });

    it(`should omit a skills section left with no printable skill in ${mode} mode`, () => {
      // Arrange
      const resume = buildResume({
        sections: [
          {
            id: 'skills',
            kind: 'skills',
            entries: [{ bullets: [{ text: 'Draft skill', status: 'suggestion' }] }],
          },
        ],
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ mode }));

      // Assert
      expect(html).not.toContain('Draft skill');
      expect(html).not.toContain('<section');
    });
  }
});

describe('titled contact links', () => {
  const MODES = ['print', 'interactive'] as const;

  for (const mode of MODES) {
    it(`should show the title of a titled link in ${mode} mode`, () => {
      // Arrange
      const resume = buildResume({
        contact: {
          ...buildContact(),
          links: [{ title: 'My Portfolio', url: 'https://example.com/portfolio' }],
        },
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ mode }));

      // Assert
      expect(html).toContain('<a href="https://example.com/portfolio">My Portfolio</a>');
    });

    it(`should show the URL of an untitled link in ${mode} mode`, () => {
      // Arrange
      const resume = buildResume({
        contact: {
          ...buildContact(),
          links: [{ title: null, url: 'https://example.com/portfolio' }],
        },
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ mode }));

      // Assert
      expect(html).toContain('<a href="https://example.com/portfolio">example.com/portfolio</a>');
    });

    it(`should escape the title and href of a titled link in ${mode} mode`, () => {
      // Arrange
      const resume = buildResume({
        contact: {
          ...buildContact(),
          links: [{ title: '<b>Hi</b>', url: 'https://example.com/?a="b"' }],
        },
      });

      // Act
      const html = renderResumeHtml(resume, buildOptions({ mode }));

      // Assert
      expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;');
      expect(html).not.toContain('<b>Hi</b>');
      expect(html).toContain('href="https://example.com/?a=&quot;b&quot;"');
    });
  }
});

describe('custom section items', () => {
  it('should render a heading-only item as a list entry without bold title', () => {
    // Arrange
    const resume = buildResume({
      sections: [
        {
          id: 'talks',
          kind: 'custom',
          title: 'Talks',
          entries: [{ heading: 'First talk', bullets: [] }],
        },
      ],
    });

    // Act
    const html = renderResumeHtml(resume, buildOptions({}));

    // Assert
    expect(html).toContain('<li>First talk</li>');
    expect(html).not.toContain('<div class="entry-head">');
  });
});

describe('languages section', () => {
  it('should render a languages section as a single line with the canonical label', () => {
    // Arrange
    const resume = buildResume({
      sections: [
        {
          id: 'languages',
          kind: 'languages',
          entries: [
            {
              bullets: [
                { text: 'Português: Nativo', status: 'assumed' },
                { text: 'Inglês: Avançado (C1)', status: 'assumed' },
              ],
            },
          ],
        },
      ],
    });

    // Act
    const portuguese = renderResumeHtml(resume, buildOptions({ language: 'pt' }));
    const english = renderResumeHtml(resume, buildOptions({ language: 'en' }));

    // Assert
    expect(portuguese).toContain('Idiomas');
    expect(portuguese).toContain(
      '<span class="language-item">Português: Nativo</span> <span class="language-item">Inglês: Avançado (C1)</span>',
    );
    expect(english).toContain('Languages');
  });

  it('should separate language items with a real text space and no comma', () => {
    // Arrange
    const resume = buildResume({
      sections: [
        {
          id: 'languages',
          kind: 'languages',
          entries: [
            {
              bullets: [
                { text: 'Português: Nativo', status: 'assumed' },
                { text: 'Inglês: Avançado (C1)', status: 'assumed' },
              ],
            },
          ],
        },
      ],
    });

    // Act
    const html = renderResumeHtml(resume, buildOptions({ language: 'pt' }));
    const body = html.slice(html.indexOf('<body>'));

    // Assert
    expect(body).toContain('</span> <span class="language-item">');
    expect(body).not.toContain('Nativo,');
    const withoutTags = body.replace(/<[^>]*>/g, '');
    expect(withoutTags).toContain('Nativo Inglês');
    expect(readStyle(html)).toMatch(/\.language-item\s*{[^}]*margin-right:\s*2em/);
  });

  it('should render an Idiomas line inside Habilidades when skills carry a language group', () => {
    // Arrange
    const resume = buildResume({
      sections: [
        {
          id: 'skills',
          kind: 'skills',
          entries: [
            {
              heading: 'Técnicas',
              bullets: [{ text: 'TypeScript', status: 'assumed' }],
            },
            {
              heading: 'Idiomas',
              bullets: [
                { text: 'Português: Nativo', status: 'assumed' },
                { text: 'Inglês: Avançado (C1)', status: 'assumed' },
              ],
            },
          ],
        },
      ],
    });

    // Act
    const html = renderResumeHtml(resume, buildOptions({ language: 'pt' }));
    const body = html.slice(html.indexOf('<body>'));

    // Assert
    expect(html).toContain('Habilidades');
    expect(html).toContain(
      '<strong class="skills-group">Idiomas:</strong> <span class="language-item">Português: Nativo</span> <span class="language-item">Inglês: Avançado (C1)</span>',
    );
    expect(body).not.toContain('Nativo,');
    const withoutTags = body.replace(/<[^>]*>/g, '');
    expect(withoutTags).toContain('Nativo Inglês');
  });
});

describe('certifications section', () => {
  it('should render one line per certification with the canonical label', () => {
    // Arrange
    const resume = buildResume({
      sections: [
        {
          id: 'certifications',
          kind: 'certifications',
          entries: [
            {
              bullets: [{ text: 'AWS SAA — Amazon, 2023', status: 'assumed' }],
            },
          ],
        },
      ],
    });

    // Act
    const portuguese = renderResumeHtml(resume, buildOptions({ language: 'pt' }));
    const english = renderResumeHtml(resume, buildOptions({ language: 'en' }));

    // Assert
    expect(portuguese).toContain('Certificações');
    expect(portuguese).toContain('AWS SAA — Amazon, 2023');
    expect(english).toContain('Certifications');
  });
});

describe('skill proposals', () => {
  const PROPOSAL_ID = 'a0000000-0000-4000-8000-000000000000';

  function skillsResumeWithProposal() {
    return buildResume({
      sections: [
        {
          id: 'skills',
          kind: 'skills',
          entries: [
            {
              heading: 'Back-end',
              bullets: [
                { text: 'NestJS', status: 'assumed' },
                { text: 'Fastify', status: 'suggestion', id: PROPOSAL_ID },
              ],
            },
          ],
        },
      ],
    });
  }

  it('should omit pending skill proposals in print mode', () => {
    // Arrange
    const resume = skillsResumeWithProposal();

    // Act
    const html = renderResumeHtml(resume, buildOptions({ mode: 'print' }));
    const body = html.slice(html.indexOf('<body>'));

    // Assert
    expect(body).toContain('NestJS');
    expect(body).not.toContain('Fastify');
    expect(body).not.toContain('data-skill-proposal-id');
    expect(body).not.toContain('change-trigger');
  });

  it('should render pending skill proposals as change triggers in interactive mode', () => {
    // Arrange
    const resume = skillsResumeWithProposal();

    // Act
    const html = renderResumeHtml(resume, buildOptions({ mode: 'interactive' }));
    const body = html.slice(html.indexOf('<body>'));

    // Assert
    expect(body).toContain('NestJS');
    expect(body).toContain('Fastify');
    expect(body).toContain('data-skill-proposal-id="a0000000-0000-4000-8000-000000000000"');
    expect(body).toContain('class="change-trigger"');
    expect(body).toContain('data-change="added"');
  });

  it('should escape the proposal id and text in interactive mode', () => {
    // Arrange
    const resume = buildResume({
      sections: [
        {
          id: 'skills',
          kind: 'skills',
          entries: [
            {
              heading: 'Back-end',
              bullets: [{ text: 'Fastify<b>', status: 'suggestion', id: 'p" onmouseover="alert(1)' }],
            },
          ],
        },
      ],
    });

    // Act
    const html = renderResumeHtml(resume, buildOptions({ mode: 'interactive' }));

    // Assert
    expect(html).toContain('data-skill-proposal-id="p&quot; onmouseover=&quot;alert(1)"');
    expect(html).toContain('Fastify&lt;b&gt;');
    expect(html).not.toContain('onmouseover="alert(1)"');
  });
});
