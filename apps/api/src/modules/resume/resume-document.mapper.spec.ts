import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapAdaptationReview, mapResumeContact, mapResumeDocument, mapResumeEntry } from './resume-document.mapper';
import type { ResumeDisplayDetails, ResumeDocument } from './resume.repository';

const RESUME_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const SECTION_ID = '22222222-2222-4222-8222-222222222222';
const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
const EXPERIENCE_ID = '44444444-4444-4444-8444-444444444444';
const EDUCATION_ID = '55555555-5555-4555-8555-555555555555';

function baseResumeRow() {
  return {
    id: RESUME_ID,
    userId: USER_ID,
    kind: 'base',
    name: 'Backend focus',
    language: 'en',
    template: 'comfortable',
    lengthTarget: 2,
    writingMethod: 'xyz',
    tone: 'direct',
    baseResumeId: null,
    jobDescriptionId: null,
    generationStatus: 'ready',
    generationStep: null,
    failureReason: null,
    adaptationPlan: null,
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
    updatedAt: new Date('2026-09-05T10:00:00.000Z'),
  };
}

function baseDocument(): ResumeDocument {
  return {
    resume: baseResumeRow(),
    sections: [
      {
        id: SECTION_ID,
        resumeId: RESUME_ID,
        kind: 'experience',
        title: null,
        ordinal: 0,
        undoSnapshot: null,
        createdAt: new Date('2026-09-05T10:00:00.000Z'),
      },
    ],
    entries: [
      {
        id: ENTRY_ID,
        sectionId: SECTION_ID,
        ordinal: 0,
        experienceId: EXPERIENCE_ID,
        educationEntryId: null,
        heading: null,
        createdAt: new Date('2026-09-05T10:00:00.000Z'),
      },
    ],
    bullets: [],
    comments: [],
    sectionSkills: [],
    skills: [],
    exports: [],
  } as unknown as ResumeDocument;
}

function baseDetails(): ResumeDisplayDetails {
  return {
    contact: {
      careerProfileId: PROFILE_ID,
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      city: null,
      links: null,
    },
    experiences: [
      {
        id: EXPERIENCE_ID,
        careerProfileId: PROFILE_ID,
        company: 'Acme',
        role: 'Engineer',
        startedOn: '2020-01-01',
        endedOn: '2023-01-01',
        createdAt: new Date('2026-09-05T10:00:00.000Z'),
      },
    ],
    educationEntries: [],
    skills: [],
  } as unknown as ResumeDisplayDetails;
}

describe('mapResumeDocument', () => {
  it('should map a null generationStep for a ready resume', () => {
    const result = mapResumeDocument({ document: baseDocument(), details: baseDetails() });

    expect(result.generationStatus).toBe('ready');
    expect(result.generationStep).toBeNull();
  });

  it('should map a writing generationStep while the tailored resume is generating', () => {
    const document = baseDocument();
    const generating = {
      ...document,
      resume: { ...document.resume, generationStatus: 'generating', generationStep: 'writing' },
    } as unknown as typeof document;

    const result = mapResumeDocument({ document: generating, details: baseDetails() });

    expect(result.generationStep).toBe('writing');
  });

  it('should resolve contact from the career profile instead of the resume name', () => {
    const document = baseDocument();
    const details = baseDetails();

    const result = mapResumeDocument({ document, details });

    expect(result.contact.name).toBe('Ada Lovelace');
    expect(result.contact.name).not.toBe(document.resume.name);
    expect(result.contact.email).toBe('ada@example.com');
  });

  it('should resolve company, role and period of an experience entry', () => {
    const result = mapResumeDocument({ document: baseDocument(), details: baseDetails() });
    const entry = result.sections[0]?.entries[0];

    expect(entry?.company).toBe('Acme');
    expect(entry?.role).toBe('Engineer');
    expect(entry?.period).toBe('2020-01-01 – 2023-01-01');
    expect(entry?.institution).toBeNull();
    expect(entry?.degree).toBeNull();
  });

  it('should resolve institution, degree and period of an education entry', () => {
    const document: ResumeDocument = {
      ...baseDocument(),
      entries: [
        {
          id: ENTRY_ID,
          sectionId: SECTION_ID,
          ordinal: 0,
          experienceId: null,
          educationEntryId: EDUCATION_ID,
          heading: null,
          createdAt: new Date('2026-09-05T10:00:00.000Z'),
        },
      ],
    } as unknown as ResumeDocument;
    const details: ResumeDisplayDetails = {
      ...baseDetails(),
      experiences: [],
      educationEntries: [
        {
          id: EDUCATION_ID,
          careerProfileId: PROFILE_ID,
          institution: 'USP',
          degree: 'Computer Science',
          startedOn: '2016-01-01',
          endedOn: '2019-12-31',
          createdAt: new Date('2026-09-05T10:00:00.000Z'),
        },
      ],
    } as unknown as ResumeDisplayDetails;

    const result = mapResumeDocument({ document, details });
    const entry = result.sections[0]?.entries[0];

    expect(entry?.institution).toBe('USP');
    expect(entry?.degree).toBe('Computer Science');
    expect(entry?.period).toBe('2016-01-01 – 2019-12-31');
    expect(entry?.company).toBeNull();
  });

  it('should leave resolved fields null for a custom entry with only a heading', () => {
    const document: ResumeDocument = {
      ...baseDocument(),
      entries: [
        {
          id: ENTRY_ID,
          sectionId: SECTION_ID,
          ordinal: 0,
          experienceId: null,
          educationEntryId: null,
          heading: 'Spoken languages',
          createdAt: new Date('2026-09-05T10:00:00.000Z'),
        },
      ],
    } as unknown as ResumeDocument;
    const details: ResumeDisplayDetails = {
      ...baseDetails(),
      experiences: [],
    } as unknown as ResumeDisplayDetails;

    const result = mapResumeDocument({ document, details });
    const entry = result.sections[0]?.entries[0];

    expect(entry?.heading).toBe('Spoken languages');
    expect(entry?.company).toBeNull();
    expect(entry?.period).toBeNull();
  });
});

describe('mapResumeContact', () => {
  it('should return null for missing phone and links', () => {
    const details = baseDetails();

    const contact = mapResumeContact({ resumeName: 'Backend focus', contact: details.contact });

    expect(contact.phone).toBeNull();
    expect(contact.city).toBeNull();
    expect(contact.links).toBeNull();
  });

  it('should never fall back to the resume name when the profile has a name', () => {
    const details = baseDetails();

    const contact = mapResumeContact({ resumeName: 'Backend focus', contact: details.contact });

    expect(details.contact?.fullName).toBe('Ada Lovelace');
    expect(contact.name).toBe('Ada Lovelace');
  });

  it('should map the city from the career profile', () => {
    const details = baseDetails();
    const withCity = {
      ...details,
      contact: { ...details.contact, city: 'Quixadá, CE' },
    } as unknown as ResumeDisplayDetails;

    const contact = mapResumeContact({ resumeName: 'Backend focus', contact: withCity.contact });

    expect(contact.city).toBe('Quixadá, CE');
  });

  it('should keep link titles from the career profile', () => {
    const details = baseDetails();
    const withLinks = {
      ...details,
      contact: {
        ...details.contact,
        links: [
          { title: 'LinkedIn', url: 'https://linkedin.com/in/ada' },
          { title: null, url: 'https://example.com/portfolio' },
        ],
      },
    } as unknown as ResumeDisplayDetails;

    const contact = mapResumeContact({ resumeName: 'Backend focus', contact: withLinks.contact });

    expect(contact.links).toEqual([
      { title: 'LinkedIn', url: 'https://linkedin.com/in/ada' },
      { title: null, url: 'https://example.com/portfolio' },
    ]);
  });

  it('should convert legacy string links to untitled links and drop empty ones', () => {
    const details = baseDetails();
    const withLinks = {
      ...details,
      contact: { ...details.contact, links: ['https://github.com/ada', '   ', ''] },
    } as unknown as ResumeDisplayDetails;

    const contact = mapResumeContact({ resumeName: 'Backend focus', contact: withLinks.contact });

    expect(contact.links).toEqual([{ title: null, url: 'https://github.com/ada' }]);
  });
});

describe('mapResumeDocument skills', () => {
  const SKILLS_SECTION_ID = '66666666-6666-4666-8666-666666666666';
  const SKILL_A_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const SKILL_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const SKILL_C_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  function skillsDocument() {
    const document = baseDocument();
    return {
      ...document,
      sections: [
        {
          id: SKILLS_SECTION_ID,
          resumeId: RESUME_ID,
          kind: 'skills',
          title: null,
          ordinal: 0,
          undoSnapshot: null,
          createdAt: new Date('2026-09-05T10:00:00.000Z'),
        },
      ],
      entries: [],
      bullets: [],
      sectionSkills: [
        { sectionId: SKILLS_SECTION_ID, skillId: SKILL_A_ID, ordinal: 1 },
        { sectionId: SKILLS_SECTION_ID, skillId: SKILL_B_ID, ordinal: 0 },
        { sectionId: SKILLS_SECTION_ID, skillId: SKILL_C_ID, ordinal: 2 },
      ],
      skills: [
        { id: SKILL_A_ID, careerProfileId: PROFILE_ID, name: 'React', group: 'Frontend', createdAt: new Date() },
        { id: SKILL_B_ID, careerProfileId: PROFILE_ID, name: 'TypeScript', group: 'Frontend', createdAt: new Date() },
        { id: SKILL_C_ID, careerProfileId: PROFILE_ID, name: 'Docker', group: null, createdAt: new Date() },
      ],
    } as unknown as ResumeDocument;
  }

  it('should order skills by ordinal and group them by group', () => {
    const result = mapResumeDocument({ document: skillsDocument(), details: baseDetails() });
    const section = result.sections[0]!;

    expect(section.kind).toBe('skills');
    expect(section.entries).toHaveLength(2);
    expect(section.entries[0]?.heading).toBe('Frontend');
    expect(section.entries[0]?.bullets.map((bullet) => bullet.text)).toEqual(['TypeScript', 'React']);
    expect(section.entries[1]?.heading).toBe('Skills');
    expect(section.entries[1]?.bullets.map((bullet) => bullet.text)).toEqual(['Docker']);
  });

  it('should fall back to bullets when the section has no linked skills', () => {
    const document = baseDocument();
    const result = mapResumeDocument({ document, details: baseDetails() });

    expect(result.sections[0]?.kind).toBe('experience');
  });

  it('should use the profile skills instead of old bullets when the skills section has no links', () => {
    const legacyEntryId = '77777777-7777-4777-8777-777777777777';
    const document = {
      ...skillsDocument(),
      entries: [
        {
          id: legacyEntryId,
          sectionId: SKILLS_SECTION_ID,
          ordinal: 0,
          experienceId: null,
          educationEntryId: null,
          heading: null,
          createdAt: new Date('2026-09-05T10:00:00.000Z'),
        },
      ],
      bullets: [
        {
          id: 'bbbbbbbb-0000-4000-8000-000000000000',
          entryId: legacyEntryId,
          ordinal: 0,
          text: 'Fastify/TypeScript com MongoDB e Cloudflare R2 (API REST)',
          evidenceId: null,
          status: 'assumed',
          suggestionQuestion: null,
          requirementId: null,
          gapKind: null,
          needsReview: false,
          editedByPerson: false,
          createdAt: new Date('2026-09-05T10:00:00.000Z'),
        },
      ],
      sectionSkills: [],
      skills: [],
    } as unknown as ResumeDocument;
    const details = {
      ...baseDetails(),
      skills: [
        { id: SKILL_B_ID, careerProfileId: PROFILE_ID, name: 'NestJS', group: 'Back-end', createdAt: new Date('2026-02-01T00:00:00.000Z') },
        { id: SKILL_A_ID, careerProfileId: PROFILE_ID, name: 'JavaScript', group: 'Linguagens', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ],
    } as unknown as ResumeDisplayDetails;

    const result = mapResumeDocument({ document, details });
    const section = result.sections[0]!;
    const texts = section.entries.flatMap((entry) => entry.bullets.map((bullet) => bullet.text));

    expect(section.kind).toBe('skills');
    expect(texts).toEqual(['NestJS', 'JavaScript']);
    expect(texts).not.toContain('Fastify/TypeScript com MongoDB e Cloudflare R2 (API REST)');
  });
});

describe('mapResumeDocument skills in the curriculo.tex structure', () => {
  const SKILLS_SECTION_ID = '66666666-6666-4666-8666-666666666666';
  const IMPORTED_AT = new Date('2026-09-25T18:34:16.000Z');
  const PROFILE_SKILLS: ReadonlyArray<readonly [string, string, string | null]> = [
    ['10000000-0000-4000-8000-000000000000', 'JavaScript', 'Linguagens'],
    ['10000000-0000-4000-8000-000000000001', 'TypeScript', 'Linguagens'],
    ['10000000-0000-4000-8000-000000000002', 'Java', 'Linguagens'],
    ['10000000-0000-4000-8000-000000000003', 'Fastify', 'Back-end'],
    ['10000000-0000-4000-8000-000000000004', 'NestJS', 'Back-end'],
    ['10000000-0000-4000-8000-000000000005', 'PostgreSQL', 'Banco de Dados / Mensageria'],
    ['10000000-0000-4000-8000-000000000006', 'Docker', 'DevOps/Ferramentas'],
  ];

  function skillRow(id: string, name: string, group: string | null, ordinal: number) {
    return { id, careerProfileId: PROFILE_ID, name, group, ordinal, createdAt: IMPORTED_AT };
  }

  function profileSkillRows() {
    return PROFILE_SKILLS.map(([id, name, group], ordinal) => skillRow(id, name, group, ordinal));
  }

  function documentWith(input: {
    readonly language: 'pt' | 'en';
    readonly linkedNames: readonly string[];
    readonly skills?: ReturnType<typeof skillRow>[];
    readonly withLanguagesSection?: boolean;
  }): ResumeDocument {
    const base = baseDocument();
    const skills = input.skills ?? profileSkillRows();
    const linkedIds = input.linkedNames.map((name) => skills.find((skill) => skill.name === name)!.id);
    const languagesSection = {
      id: '88888888-8888-4888-8888-888888888888',
      resumeId: RESUME_ID,
      kind: 'languages',
      title: null,
      ordinal: 1,
      undoSnapshot: null,
      createdAt: IMPORTED_AT,
    };
    return {
      ...base,
      resume: { ...base.resume, language: input.language },
      sections: [
        { id: SKILLS_SECTION_ID, resumeId: RESUME_ID, kind: 'skills', title: null, ordinal: 0, undoSnapshot: null, createdAt: IMPORTED_AT },
        ...(input.withLanguagesSection === true ? [languagesSection] : []),
      ],
      entries: [],
      bullets: [],
      sectionSkills: linkedIds.map((skillId, ordinal) => ({ sectionId: SKILLS_SECTION_ID, skillId, ordinal })),
      skills: skills.filter((skill) => linkedIds.includes(skill.id)),
    } as unknown as ResumeDocument;
  }

  function detailsWith(input: {
    readonly skills?: ReturnType<typeof skillRow>[];
    readonly languages?: ReadonlyArray<{ name: string; level: string | null }>;
  }): ResumeDisplayDetails {
    return {
      ...baseDetails(),
      skills: input.skills ?? profileSkillRows(),
      languages: (input.languages ?? []).map((language, index) => ({
        id: `20000000-0000-4000-8000-00000000000${String(index)}`,
        careerProfileId: PROFILE_ID,
        name: language.name,
        level: language.level,
        createdAt: IMPORTED_AT,
      })),
      certifications: [],
    } as unknown as ResumeDisplayDetails;
  }

  function linesOf(result: ReturnType<typeof mapResumeDocument>): string[] {
    return result.sections[0]!.entries.map(
      (entry) => `${entry.heading ?? ''}: ${entry.bullets.map((bullet) => bullet.text).join(', ')}`,
    );
  }

  it('should keep the original group order when a tailored resume lists the matched skills first', () => {
    const document = documentWith({
      language: 'pt',
      linkedNames: ['NestJS', 'PostgreSQL', 'TypeScript', 'JavaScript', 'Java', 'Fastify', 'Docker'],
    });

    const result = mapResumeDocument({ document, details: detailsWith({}) });

    expect(linesOf(result)).toEqual([
      'Linguagens: TypeScript, JavaScript, Java',
      'Back-end: NestJS, Fastify',
      'Banco de Dados / Mensageria: PostgreSQL',
      'DevOps/Ferramentas: Docker',
    ]);
  });

  it('should show only the selected skills and drop the groups left empty', () => {
    const document = documentWith({ language: 'pt', linkedNames: ['Docker', 'TypeScript'] });

    const result = mapResumeDocument({ document, details: detailsWith({}) });

    expect(linesOf(result)).toEqual(['Linguagens: TypeScript', 'DevOps/Ferramentas: Docker']);
  });

  it('should merge group labels that differ only in case, accents or spacing into one line', () => {
    const skills = [
      skillRow('30000000-0000-4000-8000-000000000000', 'Fastify', 'Back-end', 0),
      skillRow('30000000-0000-4000-8000-000000000001', 'Java', 'Linguagens', 1),
      skillRow('30000000-0000-4000-8000-000000000002', 'NestJS', ' back-end ', 2),
    ];
    const document = documentWith({ language: 'pt', linkedNames: ['Fastify', 'Java', 'NestJS'], skills });

    const result = mapResumeDocument({ document, details: detailsWith({ skills }) });

    expect(linesOf(result)).toEqual(['Back-end: Fastify, NestJS', 'Linguagens: Java']);
  });

  it('should label skills without any group as Habilidades, like the template line', () => {
    const skills = [
      skillRow('40000000-0000-4000-8000-000000000000', 'Java', null, 0),
      skillRow('40000000-0000-4000-8000-000000000001', 'Docker', null, 1),
    ];
    const portuguese = mapResumeDocument({
      document: documentWith({ language: 'pt', linkedNames: ['Java', 'Docker'], skills }),
      details: detailsWith({ skills }),
    });
    const english = mapResumeDocument({
      document: documentWith({ language: 'en', linkedNames: ['Java', 'Docker'], skills }),
      details: detailsWith({ skills }),
    });

    expect(linesOf(portuguese)).toEqual(['Habilidades: Java, Docker']);
    expect(linesOf(english)).toEqual(['Skills: Java, Docker']);
  });

  it('should put ungrouped skills last as Habilidades when other skills have groups', () => {
    const skills = [
      skillRow('50000000-0000-4000-8000-000000000000', 'Scrum', null, 0),
      skillRow('50000000-0000-4000-8000-000000000001', 'Java', 'Linguagens', 1),
    ];
    const document = documentWith({ language: 'pt', linkedNames: ['Scrum', 'Java'], skills });

    const result = mapResumeDocument({ document, details: detailsWith({ skills }) });

    expect(linesOf(result)).toEqual(['Linguagens: Java', 'Habilidades: Scrum']);
  });

  it('should keep each group on one line when every ordinal is 0 and the profile skills are the fallback', () => {
    const skills = [
      skillRow('60000000-0000-4000-8000-000000000000', 'Java', 'Linguagens', 0),
      skillRow('60000000-0000-4000-8000-000000000001', 'NestJS', 'Back-end', 0),
      skillRow('60000000-0000-4000-8000-000000000002', 'Python', 'Linguagens', 0),
    ];
    const document = documentWith({ language: 'pt', linkedNames: [], skills });

    const result = mapResumeDocument({ document, details: detailsWith({ skills }) });

    expect(linesOf(result)).toEqual(['Linguagens: Java, Python', 'Back-end: NestJS']);
  });

  it('should end with an Idiomas line in the template format when there is no languages section', () => {
    const document = documentWith({ language: 'pt', linkedNames: ['Java', 'NestJS'] });
    const details = detailsWith({
      languages: [
        { name: 'Português', level: 'Nativo' },
        { name: 'Inglês', level: 'Avançado (C1)' },
      ],
    });

    const result = mapResumeDocument({ document, details });

    expect(linesOf(result)).toEqual([
      'Linguagens: Java',
      'Back-end: NestJS',
      'Idiomas: Português: Nativo, Inglês: Avançado (C1)',
    ]);
  });

  it('should leave the languages out of Habilidades when they have their own section or do not exist', () => {
    const languages = [{ name: 'Português', level: 'Nativo' }];
    const withSection = mapResumeDocument({
      document: documentWith({ language: 'pt', linkedNames: ['Java'], withLanguagesSection: true }),
      details: detailsWith({ languages }),
    });
    const withoutLanguages = mapResumeDocument({
      document: documentWith({ language: 'pt', linkedNames: ['Java'] }),
      details: detailsWith({}),
    });

    expect(linesOf(withSection)).toEqual(['Linguagens: Java']);
    expect(linesOf(withoutLanguages)).toEqual(['Linguagens: Java']);
  });
});

describe('mapResumeEntry', () => {
  it('should format an ongoing period with the stored start date', () => {
    const document = baseDocument();
    const details = baseDetails();
    const experienceById = new Map(details.experiences.map((row) => [row.id, row]));
    const ongoing = {
      ...details.experiences[0]!,
      endedOn: null,
    };
    experienceById.set(EXPERIENCE_ID, ongoing);

    const entry = mapResumeEntry({
      entry: document.entries[0]!,
      bulletsByEntry: new Map(),
      experienceById,
      educationById: new Map(),
      language: 'en',
    });

    expect(entry.period).toBe('2020-01-01 – Present');
  });

  it('should format year-month dates with abbreviated months in Portuguese', () => {
    const document = baseDocument();
    const details = baseDetails();
    const experienceById = new Map([
      [
        EXPERIENCE_ID,
        { ...details.experiences[0]!, startedOn: '2026-03', endedOn: '2026-06' },
      ],
    ]);

    const entry = mapResumeEntry({
      entry: document.entries[0]!,
      bulletsByEntry: new Map(),
      experienceById,
      educationById: new Map(),
      language: 'pt',
    });

    expect(entry.period).toBe('Mar 2026 – Jun 2026');
  });

  it('should format year-month dates with the document language month names', () => {
    const document = baseDocument();
    const details = baseDetails();
    const ptMap = new Map([
      [
        EXPERIENCE_ID,
        { ...details.experiences[0]!, startedOn: '2025-08', endedOn: '2025-12' },
      ],
    ]);
    const enMap = new Map([
      [
        EXPERIENCE_ID,
        { ...details.experiences[0]!, startedOn: '2025-08', endedOn: '2025-12' },
      ],
    ]);

    const ptEntry = mapResumeEntry({
      entry: document.entries[0]!,
      bulletsByEntry: new Map(),
      experienceById: ptMap,
      educationById: new Map(),
      language: 'pt',
    });
    const enEntry = mapResumeEntry({
      entry: document.entries[0]!,
      bulletsByEntry: new Map(),
      experienceById: enMap,
      educationById: new Map(),
      language: 'en',
    });

    expect(ptEntry.period).toBe('Ago 2025 – Dez 2025');
    expect(enEntry.period).toBe('Aug 2025 – Dec 2025');
  });

  it('should format an ongoing year-only period with Presente or Present', () => {
    const document = baseDocument();
    const details = baseDetails();
    const ptMap = new Map([
      [EXPERIENCE_ID, { ...details.experiences[0]!, startedOn: '2021', endedOn: null }],
    ]);
    const enMap = new Map([
      [EXPERIENCE_ID, { ...details.experiences[0]!, startedOn: '2021', endedOn: null }],
    ]);

    const ptEntry = mapResumeEntry({
      entry: document.entries[0]!,
      bulletsByEntry: new Map(),
      experienceById: ptMap,
      educationById: new Map(),
      language: 'pt',
    });
    const enEntry = mapResumeEntry({
      entry: document.entries[0]!,
      bulletsByEntry: new Map(),
      experienceById: enMap,
      educationById: new Map(),
      language: 'en',
    });

    expect(ptEntry.period).toBe('2021 – Presente');
    expect(enEntry.period).toBe('2021 – Present');
  });

  it('should keep year-only ranges as they are', () => {
    const document = baseDocument();
    const details = baseDetails();
    const experienceById = new Map([
      [EXPERIENCE_ID, { ...details.experiences[0]!, startedOn: '2016', endedOn: '2018' }],
    ]);

    const entry = mapResumeEntry({
      entry: document.entries[0]!,
      bulletsByEntry: new Map(),
      experienceById,
      educationById: new Map(),
      language: 'pt',
    });

    expect(entry.period).toBe('2016 – 2018');
  });

  it('should pass through unexpected formats and invalid months untouched', () => {
    const document = baseDocument();
    const details = baseDetails();
    const invalidMonth = new Map([
      [
        EXPERIENCE_ID,
        { ...details.experiences[0]!, startedOn: '2026-13', endedOn: '2026-06' },
      ],
    ]);
    const unexpected = new Map([
      [
        EXPERIENCE_ID,
        { ...details.experiences[0]!, startedOn: 'Spring 2026', endedOn: '2026-06' },
      ],
    ]);

    const invalidEntry = mapResumeEntry({
      entry: document.entries[0]!,
      bulletsByEntry: new Map(),
      experienceById: invalidMonth,
      educationById: new Map(),
      language: 'pt',
    });
    const unexpectedEntry = mapResumeEntry({
      entry: document.entries[0]!,
      bulletsByEntry: new Map(),
      experienceById: unexpected,
      educationById: new Map(),
      language: 'pt',
    });

    expect(invalidEntry.period).toBe('2026-13 – Jun 2026');
    expect(unexpectedEntry.period).toBe('Spring 2026 – Jun 2026');
  });
});

describe('mapAdaptationReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return an empty map for a resume without a review', () => {
    const result = mapResumeDocument({ document: baseDocument(), details: baseDetails() });

    expect(result.adaptationReview).toEqual({});
  });

  it('should expose decisions without snapshots', () => {
    const evidenceId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const document = baseDocument();
    const withReview = {
      ...document,
      resume: {
        ...document.resume,
        adaptationReview: {
          [evidenceId]: {
            decision: 'rejected',
            decidedAt: '2026-09-22T00:00:00.000Z',
            snapshot: [{ entryId: ENTRY_ID, ordinal: 0, text: 'Led', bulletId: evidenceId }],
          },
        },
      },
    } as unknown as ResumeDocument;

    const result = mapResumeDocument({ document: withReview, details: baseDetails() });

    expect(result.adaptationReview).toEqual({ [evidenceId]: 'rejected' });
  });

  it('should return an empty map and log the resume id for invalid stored data', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(mapAdaptationReview({ nope: true }, RESUME_ID)).toEqual({});
    expect(errorSpy).toHaveBeenCalledWith('resume.adaptation_review.invalid_record', {
      resumeId: RESUME_ID,
    });
  });

  it('should return an empty map without logging for a null review', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(mapAdaptationReview(null, RESUME_ID)).toEqual({});
    expect(mapAdaptationReview(undefined, RESUME_ID)).toEqual({});
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('mapResumeDocument languages and certifications', () => {
  const LANG_SECTION_ID = '88888888-8888-4888-8888-888888888888';
  const CERT_SECTION_ID = '99999999-9999-4999-8999-999999999999';
  const SKILLS_SECTION_ID = '66666666-6666-4666-8666-666666666666';

  function languagesDocument() {
    const document = baseDocument();
    return {
      ...document,
      sections: [
        {
          id: LANG_SECTION_ID,
          resumeId: RESUME_ID,
          kind: 'languages',
          title: null,
          ordinal: 0,
          undoSnapshot: null,
          createdAt: new Date('2026-09-05T10:00:00.000Z'),
        },
      ],
      entries: [],
      bullets: [],
      sectionSkills: [],
      skills: [],
    } as unknown as ResumeDocument;
  }

  function certificationsDocument() {
    const document = baseDocument();
    return {
      ...document,
      sections: [
        {
          id: CERT_SECTION_ID,
          resumeId: RESUME_ID,
          kind: 'certifications',
          title: null,
          ordinal: 0,
          undoSnapshot: null,
          createdAt: new Date('2026-09-05T10:00:00.000Z'),
        },
      ],
      entries: [],
      bullets: [],
      sectionSkills: [],
      skills: [],
    } as unknown as ResumeDocument;
  }

  it('should render a languages section from the profile with a colon', () => {
    const details = {
      ...baseDetails(),
      languages: [
        { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', careerProfileId: PROFILE_ID, name: 'Português', level: 'Nativo', createdAt: new Date() },
        { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', careerProfileId: PROFILE_ID, name: 'Inglês', level: 'Avançado C1', createdAt: new Date() },
      ],
      certifications: [],
    } as unknown as ResumeDisplayDetails;

    const result = mapResumeDocument({ document: languagesDocument(), details });
    const section = result.sections[0]!;

    expect(section.kind).toBe('languages');
    const texts = section.entries.flatMap((entry) => entry.bullets.map((bullet) => bullet.text));
    expect(texts).toEqual(['Português: Nativo', 'Inglês: Avançado C1']);
  });

  it('should keep parentheses inside the level after the colon', () => {
    const details = {
      ...baseDetails(),
      languages: [
        { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', careerProfileId: PROFILE_ID, name: 'Inglês', level: 'Avançado (C1)', createdAt: new Date() },
      ],
      certifications: [],
    } as unknown as ResumeDisplayDetails;

    const result = mapResumeDocument({ document: languagesDocument(), details });
    const section = result.sections[0]!;
    const texts = section.entries.flatMap((entry) => entry.bullets.map((bullet) => bullet.text));

    expect(texts).toEqual(['Inglês: Avançado (C1)']);
  });

  it('should render one line per certification with em dash and comma', () => {
    const details = {
      ...baseDetails(),
      languages: [],
      certifications: [
        { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', careerProfileId: PROFILE_ID, name: 'AWS SAA', issuer: 'Amazon', year: '2023', createdAt: new Date() },
      ],
    } as unknown as ResumeDisplayDetails;

    const result = mapResumeDocument({ document: certificationsDocument(), details });
    const section = result.sections[0]!;

    expect(section.kind).toBe('certifications');
    const texts = section.entries.flatMap((entry) => entry.bullets.map((bullet) => bullet.text));
    expect(texts).toEqual(['AWS SAA — Amazon, 2023']);
  });

  it('should append an Idiomas line inside Habilidades when there is no separate languages section', () => {
    const base = baseDocument();
    const document = {
      ...base,
      resume: { ...base.resume, language: 'pt' },
      sections: [
        {
          id: SKILLS_SECTION_ID,
          resumeId: RESUME_ID,
          kind: 'skills',
          title: null,
          ordinal: 0,
          undoSnapshot: null,
          createdAt: new Date('2026-09-05T10:00:00.000Z'),
        },
      ],
      entries: [],
      bullets: [],
      sectionSkills: [],
      skills: [],
    } as unknown as ResumeDocument;
    const details = {
      ...baseDetails(),
      skills: [
        { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', careerProfileId: PROFILE_ID, name: 'TypeScript', group: 'Técnicas', createdAt: new Date() },
      ],
      languages: [
        { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', careerProfileId: PROFILE_ID, name: 'Português', level: 'Nativo', createdAt: new Date() },
      ],
      certifications: [],
    } as unknown as ResumeDisplayDetails;

    const result = mapResumeDocument({ document, details });
    const section = result.sections[0]!;
    const headings = section.entries.map((entry) => entry.heading);

    expect(section.kind).toBe('skills');
    expect(headings).toContain('Idiomas');
    const idiomas = section.entries.find((entry) => entry.heading === 'Idiomas')!;
    expect(idiomas.bullets.map((bullet) => bullet.text)).toEqual(['Português: Nativo']);
  });
});

describe('mapResumeDocument skill proposals', () => {
  const SKILLS_SECTION_ID = '77777777-7777-4777-8777-777777777777';
  const IMPORTED_AT = new Date('2026-09-25T18:34:16.000Z');
  const REQUIREMENT_ID = '99999999-9999-4999-8999-999999999999';

  function skillRow(id: string, name: string, group: string | null, ordinal: number) {
    return { id, careerProfileId: PROFILE_ID, name, group, ordinal, createdAt: IMPORTED_AT };
  }

  function proposalRow(input: {
    id: string;
    kind: 'addition' | 'swap';
    name: string;
    group?: string | null;
    replacesSkillId?: string | null;
    replacesSkillName?: string | null;
    status?: 'pending' | 'accepted' | 'rejected';
    ordinal?: number;
  }) {
    return {
      id: input.id,
      sectionId: SKILLS_SECTION_ID,
      kind: input.kind,
      name: input.name,
      group: input.group ?? null,
      replacesSkillId: input.replacesSkillId ?? null,
      replacesSkillName: input.replacesSkillName ?? null,
      requirementId: REQUIREMENT_ID,
      literalTerm: 'Fastify',
      status: input.status ?? 'pending',
      ordinal: input.ordinal ?? 0,
    };
  }

  function documentWithProposals(input: {
    linkedNames: readonly string[];
    proposals: ReturnType<typeof proposalRow>[];
    language?: 'pt' | 'en';
  }): ResumeDocument {
    const profile = [
      skillRow('10000000-0000-4000-8000-000000000000', 'JavaScript', 'Linguagens', 0),
      skillRow('10000000-0000-4000-8000-000000000001', 'TypeScript', 'Linguagens', 1),
      skillRow('10000000-0000-4000-8000-000000000002', 'NestJS', 'Back-end', 2),
    ];
    const linkedIds = input.linkedNames.map((name) => profile.find((skill) => skill.name === name)!.id);
    const base = baseDocument();
    return {
      ...base,
      resume: { ...base.resume, language: input.language ?? 'pt' },
      sections: [
        {
          id: SKILLS_SECTION_ID,
          resumeId: RESUME_ID,
          kind: 'skills',
          title: null,
          ordinal: 0,
          undoSnapshot: null,
          createdAt: IMPORTED_AT,
        },
      ],
      entries: [],
      bullets: [],
      sectionSkills: linkedIds.map((skillId, ordinal) => ({ sectionId: SKILLS_SECTION_ID, skillId, ordinal })),
      skills: profile.filter((skill) => linkedIds.includes(skill.id)),
      skillProposals: input.proposals,
    } as unknown as ResumeDocument;
  }

  function detailsForProposals(): ResumeDisplayDetails {
    return {
      ...baseDetails(),
      skills: [
        skillRow('10000000-0000-4000-8000-000000000000', 'JavaScript', 'Linguagens', 0),
        skillRow('10000000-0000-4000-8000-000000000001', 'TypeScript', 'Linguagens', 1),
        skillRow('10000000-0000-4000-8000-000000000002', 'NestJS', 'Back-end', 2),
      ],
      languages: [],
      certifications: [],
    } as unknown as ResumeDisplayDetails;
  }

  function linesOf(result: ReturnType<typeof mapResumeDocument>): Array<{ heading: string | null; bullets: Array<{ text: string; status: string; id: string }> }> {
    return result.sections[0]!.entries.map((entry) => ({
      heading: entry.heading,
      bullets: entry.bullets.map((bullet) => ({ text: bullet.text, status: bullet.status, id: bullet.id })),
    }));
  }

  it('should show a pending addition as a suggestion in the right group', () => {
    const document = documentWithProposals({
      linkedNames: ['JavaScript', 'TypeScript', 'NestJS'],
      proposals: [proposalRow({ id: 'a0000000-0000-4000-8000-000000000000', kind: 'addition', name: 'Fastify', group: 'Back-end' })],
    });

    const result = mapResumeDocument({ document, details: detailsForProposals() });
    const lines = linesOf(result);

    expect(lines).toHaveLength(2);
    expect(lines[0]!.heading).toBe('Linguagens');
    expect(lines[0]!.bullets.map((bullet) => bullet.text)).toEqual(['JavaScript', 'TypeScript']);
    expect(lines[1]!.heading).toBe('Back-end');
    expect(lines[1]!.bullets.map((bullet) => bullet.text)).toEqual(['NestJS', 'Fastify']);
    const added = lines[1]!.bullets[1]!;
    expect(added.status).toBe('suggestion');
    expect(added.id).toBe('a0000000-0000-4000-8000-000000000000');
    expect(result.skillProposals).toHaveLength(1);
    expect(result.skillProposals[0]).toMatchObject({
      id: 'a0000000-0000-4000-8000-000000000000',
      kind: 'addition',
      name: 'Fastify',
      replacesSkillName: null,
      literalTerm: 'Fastify',
      status: 'pending',
    });
  });

  it('should show a pending swap right after the original, keeping the original assumed', () => {
    const document = documentWithProposals({
      linkedNames: ['JavaScript', 'NestJS'],
      proposals: [
        proposalRow({
          id: 'b0000000-0000-4000-8000-000000000000',
          kind: 'swap',
          name: 'Fastify',
          group: 'Back-end',
          replacesSkillId: '10000000-0000-4000-8000-000000000002',
          replacesSkillName: 'NestJS',
        }),
      ],
    });

    const result = mapResumeDocument({ document, details: detailsForProposals() });
    const lines = linesOf(result);

    expect(lines[1]!.heading).toBe('Back-end');
    expect(lines[1]!.bullets.map((bullet) => bullet.text)).toEqual(['NestJS', 'Fastify']);
    expect(lines[1]!.bullets[0]!.status).toBe('assumed');
    expect(lines[1]!.bullets[1]!.status).toBe('suggestion');
    expect(lines[1]!.bullets[1]!.id).toBe('b0000000-0000-4000-8000-000000000000');
  });

  it('should show an accepted addition as assumed in the group', () => {
    const document = documentWithProposals({
      linkedNames: ['NestJS'],
      proposals: [
        proposalRow({ id: 'c0000000-0000-4000-8000-000000000000', kind: 'addition', name: 'Fastify', group: 'Back-end', status: 'accepted' }),
      ],
    });

    const result = mapResumeDocument({ document, details: detailsForProposals() });
    const lines = linesOf(result);

    expect(lines[0]!.heading).toBe('Back-end');
    expect(lines[0]!.bullets.map((bullet) => bullet.text)).toEqual(['NestJS', 'Fastify']);
    expect(lines[0]!.bullets.every((bullet) => bullet.status === 'assumed')).toBe(true);
  });

  it('should replace the original with the accepted swap in the same position', () => {
    const document = documentWithProposals({
      linkedNames: ['JavaScript', 'NestJS'],
      proposals: [
        proposalRow({
          id: 'd0000000-0000-4000-8000-000000000000',
          kind: 'swap',
          name: 'Fastify',
          group: 'Back-end',
          replacesSkillId: '10000000-0000-4000-8000-000000000002',
          replacesSkillName: 'NestJS',
          status: 'accepted',
        }),
      ],
    });

    const result = mapResumeDocument({ document, details: detailsForProposals() });
    const lines = linesOf(result);
    const backend = lines.find((line) => line.heading === 'Back-end')!;

    expect(backend.bullets.map((bullet) => bullet.text)).toEqual(['Fastify']);
    expect(backend.bullets[0]!.status).toBe('assumed');
    expect(backend.bullets[0]!.id).toBe('d0000000-0000-4000-8000-000000000000');
  });

  it('should hide rejected proposals', () => {
    const document = documentWithProposals({
      linkedNames: ['NestJS'],
      proposals: [
        proposalRow({ id: 'e0000000-0000-4000-8000-000000000000', kind: 'addition', name: 'Fastify', group: 'Back-end', status: 'rejected' }),
      ],
    });

    const result = mapResumeDocument({ document, details: detailsForProposals() });
    const lines = linesOf(result);

    expect(lines[0]!.bullets.map((bullet) => bullet.text)).toEqual(['NestJS']);
    expect(result.skillProposals[0]!.status).toBe('rejected');
  });

  it('should send an unknown group to the Habilidades line', () => {
    const document = documentWithProposals({
      linkedNames: ['JavaScript'],
      proposals: [
        proposalRow({ id: 'f0000000-0000-4000-8000-000000000000', kind: 'addition', name: 'Docker', group: 'Mobile' }),
        proposalRow({ id: 'f0000000-0000-4000-8000-000000000001', kind: 'addition', name: 'Redis', group: null }),
      ],
    });

    const result = mapResumeDocument({ document, details: detailsForProposals() });
    const lines = linesOf(result);

    expect(lines.map((line) => line.heading)).toEqual(['Linguagens', 'Habilidades']);
    expect(lines[1]!.bullets.map((bullet) => bullet.text)).toEqual(['Docker', 'Redis']);
    expect(lines[1]!.bullets.every((bullet) => bullet.status === 'suggestion')).toBe(true);
  });

  it('should keep the profile group order when proposals are present', () => {
    const document = documentWithProposals({
      linkedNames: ['NestJS', 'JavaScript'],
      proposals: [proposalRow({ id: 'a0000000-0000-4000-8000-000000000000', kind: 'addition', name: 'Fastify', group: 'Back-end' })],
    });

    const result = mapResumeDocument({ document, details: detailsForProposals() });
    const lines = linesOf(result);

    expect(lines.map((line) => line.heading)).toEqual(['Linguagens', 'Back-end']);
    expect(lines[1]!.bullets.map((bullet) => bullet.text)).toEqual(['NestJS', 'Fastify']);
  });
});
