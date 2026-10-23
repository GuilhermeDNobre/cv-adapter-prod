import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inferLinkTitle, isProfileLink } from './contact-patterns';
import { DefaultContactStripper } from './contact-stripper';

const RESUME_WITH_CONTACT = `Maria Silva
maria.silva@email.com
(11) 91234-5678
linkedin.com/in/mariasilva
Rua Augusta, 1234
São Paulo - SP

Professional Summary
Experienced software engineer with 8 years of expertise in building scalable web applications.

Experience
Senior Software Engineer | TechCorp Inc.
Jan 2020 - Present
- Led team of 12 engineers to deliver microservices architecture, reducing deployment time by 40%
- Architected real-time data pipeline processing 5M+ events daily
- Mentored junior developers and conducted 50+ code reviews

Software Engineer | StartupXYZ
Mar 2016 - Dec 2019
- Built REST API serving 10M requests/month with 99.9% uptime
- Implemented CI/CD pipeline reducing release cycle from 2 weeks to 2 days
- Reduced infrastructure costs by R$ 2.4 million annually through cloud optimization

Education
MBA in Software Engineering | University of São Paulo
2018 - 2020

Bachelor in Computer Science | Federal University of Rio de Janeiro
2012 - 2016

Skills
Java, Python, TypeScript, AWS, Docker, Kubernetes, PostgreSQL, Redis`;

const RESUME_WITHOUT_CONTACT = `Professional Summary
Experienced data analyst with expertise in business intelligence.

Experience
Data Analyst | Analytics Corp
Jan 2021 - Present
- Analyzed datasets of 100K+ records to identify business trends
- Created dashboards reducing reporting time by 60%
- Presented findings to C-level executives quarterly

Education
Bachelor in Statistics | University of Campinas
2017 - 2020

Skills
Python, SQL, Tableau, Power BI`;

const RESUME_MULTIPLE_PHONES = `Ana Paula Souza
ana@example.com
+55 11 98765-4321
(21) 3456-7890
github.com/anapaula
Av. Paulista, 1000 - Bela Vista, São Paulo - SP

Experience
Product Manager | InnovateTech
2019 - Present
- Managed product roadmap with 15 features per quarter
- Increased user retention by 25% through A/B testing`;

const RESUME_INTERNATIONAL = `John Smith
john.smith@gmail.com
+1 555 123 4567
linkedin.com/in/johnsmith
https://johnsmith.dev

Summary
Full-stack developer with 5 years of experience.

Experience
Senior Developer | GlobalTech Corp
2020 - Present
- Built distributed systems handling 100K requests/second`;

describe('DefaultContactStripper', () => {
  let stripper: DefaultContactStripper;

  beforeEach(() => {
    stripper = new DefaultContactStripper();
  });

  describe('email extraction', () => {
    it('should remove email from text and capture it in contact details', () => {
      const result = stripper.strip('Contact me at maria.silva@email.com for details');

      expect(result.textWithoutContact).toBe('Contact me at [EMAIL REMOVED] for details');
      expect(result.contactDetails.email).toBe('maria.silva@email.com');
    });

    it('should handle email with subdomain', () => {
      const result = stripper.strip('user@mail.company.com.br');

      expect(result.textWithoutContact).toBe('[EMAIL REMOVED]');
      expect(result.contactDetails.email).toBe('user@mail.company.com.br');
    });

    it('should capture multiple emails', () => {
      const result = stripper.strip('primary@test.com or secondary@test.com');

      expect(result.textWithoutContact).toContain('[EMAIL REMOVED]');
      expect(result.contactDetails.email).toBe('primary@test.com; secondary@test.com');
    });
  });

  describe('phone extraction', () => {
    it('should remove Brazilian phone with parentheses and 9th digit', () => {
      const result = stripper.strip('Phone: (11) 91234-5678');

      expect(result.textWithoutContact).toBe('Phone: [PHONE REMOVED]');
      expect(result.contactDetails.phone).toBe('(11) 91234-5678');
    });

    it('should remove phone with DDI, DDD and 9th digit', () => {
      const result = stripper.strip('+55 11 91234-5678');

      expect(result.textWithoutContact).toBe('[PHONE REMOVED]');
      expect(result.contactDetails.phone).toBe('+55 11 91234-5678');
    });

    it('should remove 11-digit phone without separators', () => {
      const result = stripper.strip('11912345678');

      expect(result.textWithoutContact).toBe('[PHONE REMOVED]');
      expect(result.contactDetails.phone).toBe('11912345678');
    });

    it('should remove landline phone without 9th digit', () => {
      const result = stripper.strip('11 1234-5678');

      expect(result.textWithoutContact).toBe('[PHONE REMOVED]');
      expect(result.contactDetails.phone).toBe('11 1234-5678');
    });

    it('should remove phone with DDI and no separators', () => {
      const result = stripper.strip('+5511912345678');

      expect(result.textWithoutContact).toBe('[PHONE REMOVED]');
      expect(result.contactDetails.phone).toBe('+5511912345678');
    });

    it('should remove phone with dots as separators', () => {
      const result = stripper.strip('(11) 9.1234-5678');

      expect(result.textWithoutContact).toBe('[PHONE REMOVED]');
      expect(result.contactDetails.phone).toBe('(11) 9.1234-5678');
    });

    it('should capture multiple phones', () => {
      const result = stripper.strip('(11) 91234-5678 and (21) 3456-7890');

      expect(result.textWithoutContact).toBe('[PHONE REMOVED] and [PHONE REMOVED]');
      expect(result.contactDetails.phone).toBe('(11) 91234-5678; (21) 3456-7890');
    });
  });

  describe('URL and social profile extraction', () => {
    it('should remove LinkedIn profile', () => {
      const result = stripper.strip('linkedin.com/in/mariasilva');

      expect(result.textWithoutContact).toBe('[URL REMOVED]');
      expect(result.contactDetails.links).toEqual([
        { title: 'LinkedIn', url: 'linkedin.com/in/mariasilva' },
      ]);
    });

    it('should remove GitHub profile', () => {
      const result = stripper.strip('github.com/username');

      expect(result.textWithoutContact).toBe('[URL REMOVED]');
      expect(result.contactDetails.links).toEqual([{ title: 'GitHub', url: 'github.com/username' }]);
    });

    it('should remove full URLs', () => {
      const result = stripper.strip('https://example.com/portfolio');

      expect(result.textWithoutContact).toBe('[URL REMOVED]');
      expect(result.contactDetails.links).toBeUndefined();
    });

    it('should remove URLs with http protocol', () => {
      const result = stripper.strip('http://example.com');

      expect(result.textWithoutContact).toBe('[URL REMOVED]');
      expect(result.contactDetails.links).toBeUndefined();
    });

    it('should capture multiple URLs', () => {
      const result = stripper.strip('github.com/user and linkedin.com/in/user');

      expect(result.textWithoutContact).toBe('[URL REMOVED] and [URL REMOVED]');
      expect(result.contactDetails.links).toHaveLength(2);
    });

    it('should remove profile URLs with paths', () => {
      const result = stripper.strip('instagram.com/username/');

      expect(result.textWithoutContact).toBe('[URL REMOVED]');
      expect(result.contactDetails.links).toEqual([
        { title: 'Instagram', url: 'instagram.com/username/' },
      ]);
    });

    it('should keep only profile links while redacting every URL', () => {
      const result = stripper.strip(
        'https://linkedin.com/in/x https://github.com/x https://github.com/x/repo https://projeto.com',
      );

      expect(result.contactDetails.links).toEqual([
        { title: 'LinkedIn', url: 'https://linkedin.com/in/x' },
        { title: 'GitHub', url: 'https://github.com/x' },
      ]);
      expect(result.textWithoutContact).toBe(
        '[URL REMOVED] [URL REMOVED] [URL REMOVED] [URL REMOVED]',
      );
    });

    it('should treat a trailing slash as a profile and deduplicate the same profile', () => {
      const result = stripper.strip(
        'https://github.com/x/ https://github.com/x/ https://www.linkedin.com/in/x',
      );

      expect(result.contactDetails.links).toEqual([
        { title: 'GitHub', url: 'https://github.com/x/' },
        { title: 'LinkedIn', url: 'https://www.linkedin.com/in/x' },
      ]);
      expect(result.textWithoutContact).toBe('[URL REMOVED] [URL REMOVED] [URL REMOVED]');
    });
  });

  describe('isProfileLink', () => {
    it('should accept any linkedin url as a profile', () => {
      expect(isProfileLink('https://linkedin.com/in/x')).toBe(true);
      expect(isProfileLink('https://www.linkedin.com/in/x')).toBe(true);
      expect(isProfileLink('linkedin.com/in/x')).toBe(true);
      expect(isProfileLink('https://linkedin.com/in/x/with/extra')).toBe(true);
    });

    it('should accept single-segment code hosting profiles but reject repositories', () => {
      expect(isProfileLink('https://github.com/x')).toBe(true);
      expect(isProfileLink('https://github.com/x/')).toBe(true);
      expect(isProfileLink('https://github.com/x/repo')).toBe(false);
      expect(isProfileLink('https://gitlab.com/x')).toBe(true);
      expect(isProfileLink('https://gitlab.com/x/repo')).toBe(false);
      expect(isProfileLink('https://bitbucket.org/x')).toBe(true);
      expect(isProfileLink('https://bitbucket.org/x/repo')).toBe(false);
    });

    it('should accept single-segment social profiles but reject deep links', () => {
      expect(isProfileLink('https://behance.net/x')).toBe(true);
      expect(isProfileLink('https://behance.net/x/project')).toBe(false);
      expect(isProfileLink('https://medium.com/@x')).toBe(true);
      expect(isProfileLink('https://twitter.com/x')).toBe(true);
      expect(isProfileLink('https://x.com/x')).toBe(true);
      expect(isProfileLink('https://instagram.com/x')).toBe(true);
      expect(isProfileLink('https://instagram.com/x/post')).toBe(false);
    });

    it('should reject project sites, repositories and custom domains', () => {
      expect(isProfileLink('https://example-app.com')).toBe(false);
      expect(isProfileLink('https://projeto.com')).toBe(false);
      expect(isProfileLink('https://github.com/x/repo')).toBe(false);
      expect(isProfileLink('https://gp-2023.1-loja-time3.example.com')).toBe(false);
      expect(isProfileLink('https://johnsmith.dev')).toBe(false);
    });
  });

  describe('address extraction', () => {
    it('should remove street address with number', () => {
      const result = stripper.strip('Rua Augusta, 1234');

      expect(result.textWithoutContact).toBe('[ADDRESS REMOVED]');
    });

    it('should remove avenue address', () => {
      const result = stripper.strip('Av. Paulista, 1000');

      expect(result.textWithoutContact).toBe('[ADDRESS REMOVED]');
    });

    it('should remove full address with neighborhood', () => {
      const result = stripper.strip('Rua Example, 123 - Centro');

      expect(result.textWithoutContact).toBe('[ADDRESS REMOVED] - Centro');
    });
  });

  describe('name extraction from header', () => {
    it('should remove name from the first line of the header', () => {
      const text = `Maria Silva
maria@email.com
(11) 91234-5678

Experience
Software engineer with 5 years of experience.`;

      const result = stripper.strip(text);

      expect(result.textWithoutContact).toContain('[NAME REMOVED]');
      expect(result.textWithoutContact).not.toContain('Maria Silva');
      expect(result.contactDetails.fullName).toBe('Maria Silva');
    });

    it('should remove name even without other contact info', () => {
      const text = `John Doe

Experience
Software engineer with 5 years of experience.`;

      const result = stripper.strip(text);

      expect(result.textWithoutContact).toContain('[NAME REMOVED]');
      expect(result.textWithoutContact).not.toContain('John Doe');
      expect(result.contactDetails.fullName).toBe('John Doe');
    });

    it('should only remove lines before the first section header', () => {
      const text = `Maria Silva

Experience
Maria led a team of 12 engineers.`;

      const result = stripper.strip(text);

      expect(result.textWithoutContact).toContain('[NAME REMOVED]');
      expect(result.textWithoutContact).toContain('Maria led a team');
      expect(result.contactDetails.fullName).toBe('Maria Silva');
    });
  });

  describe('text without contact passes intact', () => {
    it('should return text unchanged when no contact data is present', () => {
      const result = stripper.strip(RESUME_WITHOUT_CONTACT);

      expect(result.textWithoutContact).toBe(RESUME_WITHOUT_CONTACT);
      expect(result.contactDetails.fullName).toBeUndefined();
      expect(result.contactDetails.email).toBeUndefined();
      expect(result.contactDetails.phone).toBeUndefined();
      expect(result.contactDetails.links).toBeUndefined();
    });

    it('should not modify professional achievements', () => {
      const text = `Professional Summary
Experienced software engineer with 8 years of expertise.

Experience
Senior Software Engineer | TechCorp Inc.
Jan 2020 - Present
- Led team of 12 engineers to deliver microservices architecture, reducing deployment time by 40%
- Architected real-time data pipeline processing 5M+ events daily
- Mentored junior developers and conducted 50+ code reviews`;

      const result = stripper.strip(text);

      expect(result.textWithoutContact).toContain('12 engineers');
      expect(result.textWithoutContact).toContain('40%');
      expect(result.textWithoutContact).toContain('5M+ events');
      expect(result.textWithoutContact).toContain('50+ code reviews');
    });
  });

  describe('no false positives on achievement metrics', () => {
    it('should not confuse percentage with phone', () => {
      const result = stripper.strip('Reduced costs by 30% in Q4 2024.');

      expect(result.textWithoutContact).toBe('Reduced costs by 30% in Q4 2024.');
      expect(result.contactDetails.phone).toBeUndefined();
    });

    it('should not confuse monetary value with phone', () => {
      const result = stripper.strip('Saved R$ 2.4 million for the company.');

      expect(result.textWithoutContact).toBe('Saved R$ 2.4 million for the company.');
      expect(result.contactDetails.phone).toBeUndefined();
    });

    it('should not confuse team size with phone', () => {
      const result = stripper.strip('Managed a team of 12 people.');

      expect(result.textWithoutContact).toBe('Managed a team of 12 people.');
      expect(result.contactDetails.phone).toBeUndefined();
    });

    it('should not confuse year with phone', () => {
      const result = stripper.strip('Graduated in 2016 from university.');

      expect(result.textWithoutContact).toBe('Graduated in 2016 from university.');
      expect(result.contactDetails.phone).toBeUndefined();
    });

    it('should not confuse date range with phone', () => {
      const result = stripper.strip('Period: 2018 - 2020.');

      expect(result.textWithoutContact).toBe('Period: 2018 - 2020.');
      expect(result.contactDetails.phone).toBeUndefined();
    });

    it('should not confuse CEP with phone', () => {
      const result = stripper.strip('Located at CEP 01310-100 in São Paulo.');

      expect(result.textWithoutContact).toBe('Located at CEP 01310-100 in São Paulo.');
      expect(result.contactDetails.phone).toBeUndefined();
    });

    it('should not confuse large numbers with phone', () => {
      const result = stripper.strip('Processed 5,000,000 records successfully.');

      expect(result.textWithoutContact).toBe('Processed 5,000,000 records successfully.');
      expect(result.contactDetails.phone).toBeUndefined();
    });

    it('should not confuse decimal numbers with phone', () => {
      const result = stripper.strip('Achieved 99.9% uptime SLA.');

      expect(result.textWithoutContact).toBe('Achieved 99.9% uptime SLA.');
      expect(result.contactDetails.phone).toBeUndefined();
    });
  });

  describe('stable markers', () => {
    it('should use consistent markers that do not create sentence fusion', () => {
      const text = `Contact maria@email.com for details. Call (11) 91234-5678.`;

      const result = stripper.strip(text);

      expect(result.textWithoutContact).toBe(
        'Contact [EMAIL REMOVED] for details. Call [PHONE REMOVED].',
      );
    });

    it('should preserve line breaks in the output', () => {
      const text = `Maria Silva
maria@email.com
Experience
Software engineer.`;

      const result = stripper.strip(text);

      const lines = result.textWithoutContact.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('full resume fixtures', () => {
    it('should strip all contact data from resume and capture all fields', () => {
      const result = stripper.strip(RESUME_WITH_CONTACT);

      expect(result.textWithoutContact).not.toContain('maria.silva@email.com');
      expect(result.textWithoutContact).not.toContain('(11) 91234-5678');
      expect(result.textWithoutContact).not.toContain('linkedin.com/in/mariasilva');
      expect(result.textWithoutContact).not.toContain('Rua Augusta, 1234');
      expect(result.textWithoutContact).not.toContain('Maria Silva');

      expect(result.contactDetails.fullName).toBe('Maria Silva');
      expect(result.contactDetails.email).toBe('maria.silva@email.com');
      expect(result.contactDetails.phone).toBe('(11) 91234-5678');
      expect(result.contactDetails.links).toEqual([
        { title: 'LinkedIn', url: 'linkedin.com/in/mariasilva' },
      ]);

      expect(result.textWithoutContact).toContain('[NAME REMOVED]');
      expect(result.textWithoutContact).toContain('[EMAIL REMOVED]');
      expect(result.textWithoutContact).toContain('[PHONE REMOVED]');
      expect(result.textWithoutContact).toContain('[URL REMOVED]');
      expect(result.textWithoutContact).toContain('[ADDRESS REMOVED]');

      expect(result.textWithoutContact).toContain('12 engineers');
      expect(result.textWithoutContact).toContain('40%');
      expect(result.textWithoutContact).toContain('5M+ events');
      expect(result.textWithoutContact).toContain('50+ code reviews');
      expect(result.textWithoutContact).toContain('R$ 2.4 million');
      expect(result.textWithoutContact).toContain('10M requests/month');
      expect(result.textWithoutContact).toContain('99.9% uptime');
      expect(result.textWithoutContact).toContain('MBA in Software Engineering');
      expect(result.textWithoutContact).toContain('Bachelor in Computer Science');
      expect(result.textWithoutContact).toContain('Java, Python, TypeScript');
    });

    it('should pass resume without contact intact', () => {
      const result = stripper.strip(RESUME_WITHOUT_CONTACT);

      expect(result.textWithoutContact).toBe(RESUME_WITHOUT_CONTACT);
      expect(result.contactDetails.fullName).toBeUndefined();
      expect(result.contactDetails.email).toBeUndefined();
      expect(result.contactDetails.phone).toBeUndefined();
      expect(result.contactDetails.links).toBeUndefined();
    });

    it('should strip multiple phones and URLs from resume', () => {
      const result = stripper.strip(RESUME_MULTIPLE_PHONES);

      expect(result.textWithoutContact).not.toContain('ana@example.com');
      expect(result.textWithoutContact).not.toContain('+55 11 98765-4321');
      expect(result.textWithoutContact).not.toContain('(21) 3456-7890');
      expect(result.textWithoutContact).not.toContain('github.com/anapaula');
      expect(result.textWithoutContact).not.toContain('Ana Paula Souza');

      expect(result.contactDetails.fullName).toBe('Ana Paula Souza');
      expect(result.contactDetails.email).toBe('ana@example.com');
      expect(result.contactDetails.phone).toBe('+55 11 98765-4321; (21) 3456-7890');
      expect(result.contactDetails.links).toEqual([{ title: 'GitHub', url: 'github.com/anapaula' }]);

      expect(result.textWithoutContact).toContain('15 features per quarter');
      expect(result.textWithoutContact).toContain('25%');
      expect(result.textWithoutContact).toContain('Product Manager');
    });

    it('should strip international format resume', () => {
      const result = stripper.strip(RESUME_INTERNATIONAL);

      expect(result.textWithoutContact).not.toContain('john.smith@gmail.com');
      expect(result.textWithoutContact).not.toContain('+1 555 123 4567');
      expect(result.textWithoutContact).not.toContain('linkedin.com/in/johnsmith');
      expect(result.textWithoutContact).not.toContain('https://johnsmith.dev');
      expect(result.textWithoutContact).not.toContain('John Smith');

      expect(result.contactDetails.fullName).toBe('John Smith');
      expect(result.contactDetails.email).toBe('john.smith@gmail.com');
      expect(result.contactDetails.phone).toBe('+1 555 123 4567');
      expect(result.contactDetails.links).toEqual([
        { title: 'LinkedIn', url: 'linkedin.com/in/johnsmith' },
      ]);

      expect(result.textWithoutContact).toContain('Full-stack developer');
      expect(result.textWithoutContact).toContain('100K requests/second');
    });
  });

  describe('logging safety', () => {
    it('should not log the input text or contact details', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

      try {
        stripper.strip(RESUME_WITH_CONTACT);

        const allCalls = [
          ...logSpy.mock.calls,
          ...errorSpy.mock.calls,
          ...warnSpy.mock.calls,
          ...debugSpy.mock.calls,
        ];
        const allLogged = JSON.stringify(allCalls);

        expect(allLogged).not.toContain('maria.silva@email.com');
        expect(allLogged).not.toContain('(11) 91234-5678');
        expect(allLogged).not.toContain('Maria Silva');
        expect(allLogged).not.toContain('linkedin.com/in/mariasilva');
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
        warnSpy.mockRestore();
        debugSpy.mockRestore();
      }
    });
  });

  describe('markdown emitted by the extractor', () => {
    // Not a synthetic shape: apps/api/test/fixtures/resumes/two-column.pdf.expected.txt is the
    // recorded output of the real extractor over a real PDF, and it starts with
    // "# MARIANA QUARTZ". These assertions use that shape verbatim.
    const EXTRACTED_RESUME = [
      '# MARIANA QUARTZ',
      '',
      '### Backend Developer',
      '',
      '## SUMMARY',
      '',
      'Backend developer focused on Python services for eight years.',
    ].join('\n');

    it('should keep the name without the heading marker the extractor emitted', () => {
      const result = stripper.strip(EXTRACTED_RESUME);

      expect(result.contactDetails.fullName).toBe('MARIANA QUARTZ');
    });

    it('should redact the whole header line, marker included, before the text reaches the AI', () => {
      const result = stripper.strip(EXTRACTED_RESUME);

      expect(result.textWithoutContact).not.toContain('MARIANA QUARTZ');
      expect(result.textWithoutContact).toContain('[NAME REMOVED]');
    });

    it('should recognise a section header the extractor wrote as markdown', () => {
      const startsWithSection = ['## SUMMARY', '', 'Backend developer for eight years.'].join('\n');

      const result = stripper.strip(startsWithSection);

      expect(result.contactDetails.fullName).toBeUndefined();
      expect(result.textWithoutContact).toContain('## SUMMARY');
    });

    it('should still read a plain header, so the fix does not depend on markdown', () => {
      const plain = ['Mariana Quartz', 'Backend Developer', '', 'EXPERIENCE'].join('\n');

      const result = stripper.strip(plain);

      expect(result.contactDetails.fullName).toBe('Mariana Quartz');
    });
  });

  describe('city extraction from the header', () => {
    it('should extract "Quixadá, CE" from its own header line', () => {
      // Arrange
      const text = ['Maria Silva', 'Quixadá, CE', '', 'Experience', 'Worked.'].join('\n');

      // Act
      const result = stripper.strip(text);

      // Assert
      expect(result.contactDetails.city).toBe('Quixadá, CE');
      expect(result.textWithoutContact).toContain('[CITY REMOVED]');
      expect(result.textWithoutContact).not.toContain('Quixadá');
    });

    it('should extract "Lisboa, Portugal" from a header line with separators', () => {
      // Arrange
      const text = ['Ana Souza', 'Lisboa, Portugal • +55 11 91234-5678', '', 'Experience', 'Worked.'].join(
        '\n',
      );

      // Act
      const result = stripper.strip(text);

      // Assert
      expect(result.contactDetails.city).toBe('Lisboa, Portugal');
      expect(result.textWithoutContact).toContain('[CITY REMOVED]');
      expect(result.textWithoutContact).not.toContain('Lisboa');
    });

    it('should keep "Rua X, 123" as an address instead of a city', () => {
      // Arrange
      const text = ['Maria Silva', 'Rua X, 123', '', 'Experience', 'Worked.'].join('\n');

      // Act
      const result = stripper.strip(text);

      // Assert
      expect(result.contactDetails.city).toBeUndefined();
      expect(result.textWithoutContact).toContain('[ADDRESS REMOVED]');
      expect(result.textWithoutContact).not.toContain('[CITY REMOVED]');
    });

    it('should not extract a city mentioned only after the first section', () => {
      // Arrange
      const text = ['Maria Silva', '', 'Experience', 'Worked in Quixadá, CE for two years.'].join('\n');

      // Act
      const result = stripper.strip(text);

      // Assert
      expect(result.contactDetails.city).toBeUndefined();
      expect(result.textWithoutContact).toContain('Quixadá, CE');
      expect(result.textWithoutContact).not.toContain('[CITY REMOVED]');
    });

    it('should not turn a line with email and phone into a city', () => {
      // Arrange
      const text = ['Maria Silva', 'maria@email.com (11) 91234-5678', '', 'Experience', 'Worked.'].join(
        '\n',
      );

      // Act
      const result = stripper.strip(text);

      // Assert
      expect(result.contactDetails.city).toBeUndefined();
      expect(result.textWithoutContact).not.toContain('[CITY REMOVED]');
      expect(result.textWithoutContact).toContain('[EMAIL REMOVED]');
      expect(result.textWithoutContact).toContain('[PHONE REMOVED]');
    });

    it('should extract "São Paulo - SP" with a dash separator', () => {
      // Arrange
      const text = ['Maria Silva', 'São Paulo - SP', '', 'Experience', 'Worked.'].join('\n');

      // Act
      const result = stripper.strip(text);

      // Assert
      expect(result.contactDetails.city).toBe('São Paulo - SP');
      expect(result.textWithoutContact).toContain('[CITY REMOVED]');
      expect(result.textWithoutContact).not.toContain('São Paulo');
    });

    it('should extract "Morada Nova, CE" from "Morada Nova ▪ CE, Brazil"', () => {
      // Arrange
      const text = ['Pedro Alves Rocha', '## Morada Nova ▪ CE, Brazil', '', 'EXPERIENCE', 'Worked.'].join(
        '\n',
      );

      // Act
      const result = stripper.strip(text);

      // Assert
      expect(result.contactDetails.city).toBe('Morada Nova, CE');
      expect(result.textWithoutContact).toContain('[CITY REMOVED]');
      expect(result.textWithoutContact).not.toContain('Morada Nova');
    });

    it('should extract "Quixadá, CE" from the anonymized Portuguese header with bullets', () => {
      // Arrange
      const text = [
        '# Lucas Martins Prado',
        '',
        'Quixadá, CE•(00) 00000-0000•pessoa@example.com•LinkedIn•GitHub',
        '',
        '## Objetivo',
        'Student.',
      ].join('\n');

      // Act
      const result = stripper.strip(text);

      // Assert
      expect(result.contactDetails.city).toBe('Quixadá, CE');
      expect(result.textWithoutContact).toContain('[CITY REMOVED]');
      expect(result.textWithoutContact).not.toContain('Quixadá');
    });
  });

  describe('link titles by domain', () => {
    it('should infer LinkedIn and GitHub titles while keeping the BUG-59 profile rule', () => {
      expect(inferLinkTitle('https://linkedin.com/in/x')).toBe('LinkedIn');
      expect(inferLinkTitle('linkedin.com/in/x')).toBe('LinkedIn');
      expect(inferLinkTitle('https://github.com/x')).toBe('GitHub');
      expect(inferLinkTitle('https://gitlab.com/x')).toBe('GitLab');
      expect(inferLinkTitle('https://behance.net/x')).toBe('Behance');
      expect(inferLinkTitle('https://medium.com/@x')).toBe('Medium');
      expect(inferLinkTitle('https://instagram.com/x')).toBe('Instagram');
      expect(inferLinkTitle('https://twitter.com/x')).toBe('Twitter');
      expect(inferLinkTitle('https://x.com/x')).toBe('X');
    });

    it('should return null for project sites, repositories and custom domains', () => {
      expect(inferLinkTitle('https://example-app.com')).toBeNull();
      expect(inferLinkTitle('https://github.com/x/repo')).toBe('GitHub');
      expect(inferLinkTitle('https://projeto.com')).toBeNull();
      expect(inferLinkTitle('not a url at all !!!')).toBeNull();
    });

    it('should store titled profile links and drop project links', () => {
      // Arrange
      const text = [
        'Maria Silva',
        'https://linkedin.com/in/x https://github.com/x https://github.com/x/repo https://example-app.com',
        '',
        'Experience',
        'Worked.',
      ].join('\n');

      // Act
      const result = stripper.strip(text);

      // Assert
      expect(result.contactDetails.links).toEqual([
        { title: 'LinkedIn', url: 'https://linkedin.com/in/x' },
        { title: 'GitHub', url: 'https://github.com/x' },
      ]);
    });
  });

  describe('anonymized fixtures of the two test resumes', () => {
    function readFixture(name: string): string {
      return readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf8');
    }

    it('should extract "Morada Nova, CE" from the English fixture header', () => {
      // Arrange
      const text = readFixture('resume-en-quixada.txt');

      // Act
      const result = stripper.strip(text);

      // Assert
      expect(result.contactDetails.city).toBe('Morada Nova, CE');
      expect(result.textWithoutContact).toContain('[CITY REMOVED]');
    });

    it('should extract "Quixadá, CE" from the Portuguese fixture header', () => {
      // Arrange
      const text = readFixture('resume-pt-quixada.txt');

      // Act
      const result = stripper.strip(text);

      // Assert
      expect(result.contactDetails.city).toBe('Quixadá, CE');
      expect(result.textWithoutContact).toContain('[CITY REMOVED]');
    });

    it('should keep only titled profile links from the Portuguese fixture', () => {
      // Arrange
      const text = readFixture('resume-pt-quixada.txt');

      // Act
      const result = stripper.strip(text);

      // Assert
      const links = result.contactDetails.links ?? [];
      const urls = links.map((link) => link.url);
      expect(urls).toContain('https://linkedin.com/in/lucas-prado');
      expect(urls).toContain('https://github.com/lucas-prado');
      expect(urls.some((url) => url.includes('example-app.com'))).toBe(false);
      expect(urls.some((url) => url.includes('ativo-track'))).toBe(false);
      for (const link of links) {
        expect(link.title === null || typeof link.title === 'string').toBe(true);
      }
      const linkedIn = links.find((link) => link.url.includes('linkedin.com'));
      expect(linkedIn?.title).toBe('LinkedIn');
      const gitHub = links.find(
        (link) => link.url === 'https://github.com/lucas-prado',
      );
      expect(gitHub?.title).toBe('GitHub');
    });
  });
});
