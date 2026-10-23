import { describe, expect, it } from 'vitest';
import {
  CHARS_PER_PAGE,
  COMFORTABLE_CHARS_PER_PAGE,
  DENSE_CHARS_PER_PAGE,
  MAX_LENGTH_TARGET_PAGES,
  resolveCharBudget,
} from './budgets';
import type { RenderableResume } from './renderable-resume';

function countResumeChars(resume: RenderableResume): number {
  let total = resume.contact.name.length;
  total += resume.contact.email?.length ?? 0;
  total += resume.contact.phone?.length ?? 0;
  for (const link of resume.contact.links ?? []) {
    total += typeof link === 'string' ? link.length : link.url.length + (link.title?.length ?? 0);
  }
  for (const section of resume.sections) {
    total += section.title?.length ?? 0;
    for (const entry of section.entries) {
      total += entry.company?.length ?? 0;
      total += entry.institution?.length ?? 0;
      total += entry.heading?.length ?? 0;
      total += entry.role?.length ?? 0;
      total += entry.period?.length ?? 0;
      for (const bullet of entry.bullets) {
        total += bullet.text.length;
      }
    }
  }
  return total;
}

function countBullets(resume: RenderableResume): number {
  return resume.sections.flatMap((section) => section.entries).flatMap((entry) => entry.bullets)
    .length;
}

function buildTexVolumeFixture(): RenderableResume {
  const skillBullets = [
    'Languages: JavaScript and TypeScript, Java and Python for backend APIs and frontend apps in production.',
    'Backend: Fastify, NestJS, Spring Boot and Node.js with REST, OpenAPI docs and automated test suites.',
    'Frontend: React, Next.js, HTML5, CSS3 and Tailwind CSS with responsive layouts and design systems.',
    'Data and messaging: PostgreSQL, MongoDB, Redis and RabbitMQ running in Docker with backups.',
    'DevOps and tools: Git and GitHub, Docker, CI and CD with GitHub Actions, Scrum teams and reviews.',
  ];
  const experienceBullets = [
    'Designed and shipped a SaaS platform alone from zero to production with billing, auth and transactional email.',
    'Built a REST API in Fastify and TypeScript with MongoDB and object storage, documented in OpenAPI Swagger.',
    'Integrated PIX and card payments with HMAC webhook validation, retries and reconciliation jobs daily.',
    'Built a multi-step React wizard with validated forms, interactive maps and motion for user onboarding.',
    'Covered the product with unit and integration tests across backend and web, over sixty suites in CI.',
    'Ran CI and CD on every push with automated builds, tests and deploys plus AI-assisted code reviews.',
  ];
  return {
    contact: {
      name: 'Henrique Carvalho Pereira',
      email: 'henrique.carvalho7@example.com',
      phone: '(11) 91234-5678',
      links: ['linkedin.com/in/henrique-pereira', 'github.com/HenriquePereira'],
    },
    sections: [
      {
        id: 'objective',
        kind: 'summary',
        entries: [
          {
            bullets: [
              {
                text: 'Software engineering student seeking a fullstack internship with React, Node.js and NestJS delivery.',
                status: 'assumed',
              },
            ],
          },
        ],
      },
      {
        id: 'skills',
        kind: 'skills',
        entries: [{ bullets: skillBullets.map((text) => ({ text, status: 'assumed' as const })) }],
      },
      {
        id: 'experience',
        kind: 'experience',
        entries: [
          {
            company: 'PetAgendas, self-employed',
            role: 'Independent Full Stack Developer',
            period: 'Mar 2026 - Jun 2026',
            bullets: experienceBullets.map((text) => ({ text, status: 'assumed' as const })),
          },
          {
            company: 'Pontes Learning Foundation',
            role: 'Programming Tutor',
            period: 'Jul 2025 - Dec 2025',
            bullets: [
              {
                text: 'Tutored students learning to code with games and AI, reviewing exercises with 1:1 support weekly.',
                status: 'assumed',
              },
            ],
          },
          {
            company: 'Quadra Informatica',
            role: 'Web Development Intern',
            period: 'Jun 2019 - Dec 2019',
            bullets: [
              {
                text: 'Built a product catalog SPA in vanilla JavaScript and Bootstrap, improving the store web presence.',
                status: 'assumed',
              },
            ],
          },
        ],
      },
      {
        id: 'projects',
        kind: 'custom',
        title: 'Projects',
        entries: [
          {
            heading: 'Ativo Track, asset control system',
            bullets: [
              {
                text: 'Built a NestJS and PostgreSQL REST API for IT asset tracking with modular object-oriented design.',
                status: 'assumed',
              },
            ],
          },
          {
            heading: 'Pix project, instant payments',
            bullets: [
              {
                text: 'Built Spring Boot REST APIs for Pix keys and bank transfer simulation with Postgres and Docker.',
                status: 'assumed',
              },
            ],
          },
        ],
      },
      {
        id: 'education',
        kind: 'education',
        entries: [
          {
            institution: 'Universidade Federal da Serra (UFS)',
            role: 'BSc in Software Engineering',
            period: '2021 - Present',
            bullets: [],
          },
          {
            institution: 'Escola Tecnica Horizonte Azul',
            role: 'Technical course in Informatics',
            period: '2017 - 2019',
            bullets: [],
          },
        ],
      },
      {
        id: 'languages',
        kind: 'custom',
        title: 'Languages',
        entries: [
          {
            heading: 'Spoken languages',
            bullets: [{ text: 'Portuguese: native speaker, English: advanced level (C1) for work.', status: 'assumed' }],
          },
        ],
      },
    ],
  };
}

describe('character budgets', () => {
  it('should expose the per-page budgets as named constants', () => {
    // Arrange
    const templates = ['comfortable', 'dense'] as const;

    // Act
    const fromMap = templates.map((template) => CHARS_PER_PAGE[template]);

    // Assert
    expect(fromMap).toEqual([COMFORTABLE_CHARS_PER_PAGE, DENSE_CHARS_PER_PAGE]);
  });

  it('should give the dense template a larger budget than the comfortable one', () => {
    // Arrange
    const lengthTargets = [1, 2] as const;

    // Act
    const comparisons = lengthTargets.map(
      (lengthTarget) =>
        resolveCharBudget('dense', lengthTarget) > resolveCharBudget('comfortable', lengthTarget),
    );

    // Assert
    expect(DENSE_CHARS_PER_PAGE).toBeGreaterThan(COMFORTABLE_CHARS_PER_PAGE);
    expect(comparisons).toEqual([true, true]);
  });

  it('should scale the budget with the length target', () => {
    // Arrange
    const templates = ['comfortable', 'dense'] as const;

    // Act
    const doubled = templates.map(
      (template) => resolveCharBudget(template, 2) === 2 * resolveCharBudget(template, 1),
    );

    // Assert
    expect(doubled).toEqual([true, true]);
  });

  it('should cap the length target at two pages', () => {
    // Arrange
    const cap = MAX_LENGTH_TARGET_PAGES;

    // Act
    const isValidTarget = (pages: number): boolean => pages >= 1 && pages <= cap;

    // Assert
    expect(cap).toBe(2);
    expect(isValidTarget(2)).toBe(true);
    expect(isValidTarget(3)).toBe(false);
  });

  it('should fit the curriculo.tex volume in one dense page', () => {
    // Arrange
    const fixture = buildTexVolumeFixture();

    // Act
    const totalChars = countResumeChars(fixture);
    const bulletCount = countBullets(fixture);

    // Assert
    expect(bulletCount).toBe(17);
    expect(totalChars).toBeGreaterThan(2000);
    expect(totalChars).toBeLessThanOrEqual(CHARS_PER_PAGE.dense);
  });

  it('should match the measured single-page capacities', () => {
    // Arrange
    const measuredDense = 3400;
    const measuredComfortable = 2900;

    // Act
    const dense = DENSE_CHARS_PER_PAGE;
    const comfortable = COMFORTABLE_CHARS_PER_PAGE;

    // Assert
    expect(dense).toBe(measuredDense);
    expect(comfortable).toBe(measuredComfortable);
  });
});
