export const FIXED_USER = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  email: 'e2e@example.com',
} as const;

export const JOB_DESCRIPTION_TEXT = `
Senior Full Stack Developer

We are looking for a Senior Full Stack Developer to join our team.

Requirements:
- 5+ years of experience with TypeScript
- Strong knowledge of React and Next.js
- Experience with Node.js and NestJS
- PostgreSQL database experience
- Git version control

Nice to have:
- Experience with Redis and message queues
- Knowledge of Docker and CI/CD
- AWS or Cloudflare experience
`;

export const SCANNED_PDF_PATH = 'apps/api/test/fixtures/resumes/scanned-no-text-layer.pdf';
export const SINGLE_COLUMN_PDF_PATH = 'apps/api/test/fixtures/resumes/single-column.pdf';

export const EXPECTED_DRAFT = {
  contactDetails: {
    fullName: 'E2E User',
    email: 'e2e@example.com',
    phone: null,
    links: [],
  },
  experiences: [
    {
      company: 'Tech Corp',
      role: 'Senior Developer',
      startedOn: '2020-01',
      endedOn: null,
    },
  ],
  education: [
    {
      institution: 'University',
      degree: 'Computer Science',
      startedOn: '2016-01',
      endedOn: '2020-01',
    },
  ],
  evidences: [
    { statement: 'Built scalable TypeScript applications for 5 years', experienceIndex: 0 },
    { statement: 'Led React migration for enterprise dashboard', experienceIndex: 0 },
  ],
} as const;
