import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DefaultContactStripper } from './contact-stripper';
import { EmptySourceDocumentError, SourceDocumentInput } from './document-extractor';
import { LatexDocumentExtractor } from './latex-document-extractor';

const FIXTURES_DIR = join(process.cwd(), 'test', 'fixtures', 'resumes');

function readFixture(name: string): SourceDocumentInput {
  return { filename: name, content: readFileSync(join(FIXTURES_DIR, name)) };
}

function readExpected(name: string): string {
  return readFileSync(join(FIXTURES_DIR, `${name}.expected.txt`), 'utf8')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function fromTex(source: string): SourceDocumentInput {
  return { filename: 'fragment.tex', content: Buffer.from(source, 'utf8') };
}

describe('LatexDocumentExtractor', () => {
  const extractor = new LatexDocumentExtractor();

  it('should turn the resume fixture into clean text in source order', async () => {
    const extracted = await extractor.extract(readFixture('resume.tex'));

    expect(extracted.readingOrderText).toBe(readExpected('resume.tex'));
    expect(extracted.hasTextLayer).toBe(true);
    expect(extracted.pageCount).toBe(1);
  });

  it('should drop every command and brace while keeping the text they wrapped', async () => {
    const document: SourceDocumentInput = {
      filename: 'fragment.tex',
      content: Buffer.from(
        '\\section{Awards}\n\n\\textbf{First place} at the \\textit{row} race\\par\n',
        'utf8',
      ),
    };

    const extracted = await extractor.extract(document);

    expect(extracted.readingOrderText).toBe('Awards\n\nFirst place at the row race');
  });

  it('should drop the preamble, comments, and item markers but keep the items', async () => {
    const document: SourceDocumentInput = {
      filename: 'fragment.tex',
      content: Buffer.from(
        '\\documentclass{article}\n% hidden note\n\\begin{document}\n\\begin{itemize}\n\\item one\n\\item two\n\\end{itemize}\n\\end{document}\n',
        'utf8',
      ),
    };

    const extracted = await extractor.extract(document);

    expect(extracted.readingOrderText).toBe('one\n\ntwo');
  });

  it('should unescape symbols and resolve dashes and ties to text', async () => {
    const document: SourceDocumentInput = {
      filename: 'fragment.tex',
      content: Buffer.from('Growth of 20\\% --- roughly 10--15 people ~ a year\n', 'utf8'),
    };

    const extracted = await extractor.extract(document);

    expect(extracted.readingOrderText).toBe(
      'Growth of 20% \u2014 roughly 10\u201315 people a year',
    );
  });

  it('should keep the http target of href next to its label', async () => {
    const extracted = await extractor.extract(
      fromTex('\\href{https://github.com/u}{GitHub}'),
    );

    expect(extracted.readingOrderText).toBe('GitHub (https://github.com/u)');
  });

  it('should keep only the label of a mailto href', async () => {
    const extracted = await extractor.extract(fromTex('\\href{mailto:a@b.co}{a@b.co}'));

    expect(extracted.readingOrderText).toBe('a@b.co');
  });

  it('should keep only the label of a tel href', async () => {
    const extracted = await extractor.extract(
      fromTex('\\href{tel:+5511}{(11) 9999-0000}'),
    );

    expect(extracted.readingOrderText).toBe('(11) 9999-0000');
  });

  it('should keep a nested command inside the href label', async () => {
    const extracted = await extractor.extract(
      fromTex('\\href{https://x.dev}{\\mbox{My Project}}'),
    );

    expect(extracted.readingOrderText).toBe('My Project (https://x.dev)');
  });

  it('should keep the target of url', async () => {
    const extracted = await extractor.extract(fromTex('\\url{https://x.dev}'));

    expect(extracted.readingOrderText).toBe('https://x.dev');
  });

  it('should expose href and url targets to the contact stripper without gluing labels', async () => {
    const source = [
      '\\href{https://github.com/u}{GitHub}',
      '\\href{mailto:a@b.co}{a@b.co}',
      '\\href{tel:+5511}{(11) 9999-0000}',
      '\\href{https://x.dev}{\\mbox{My Project}}',
      '\\url{https://y.dev}',
    ].join('\n\n');
    const extracted = await extractor.extract(fromTex(source));
    const stripped = new DefaultContactStripper().strip(extracted.readingOrderText);

    expect(stripped.contactDetails.links).toEqual([{ title: 'GitHub', url: 'https://github.com/u' }]);
    expect(stripped.contactDetails.email).toBe('a@b.co');
    expect(stripped.textWithoutContact).not.toContain('https://x.dev');
    expect(stripped.textWithoutContact).not.toContain('https://y.dev');
    expect(stripped.textWithoutContact).toContain('[URL REMOVED]');
  });

  it('should raise a typed error for an empty file', async () => {
    await expect(
      extractor.extract({ filename: 'empty.tex', content: Buffer.alloc(0) }),
    ).rejects.toBeInstanceOf(EmptySourceDocumentError);
  });

  it('should raise a typed error when the file holds no extractable text', async () => {
    const onlyMarkup: SourceDocumentInput = {
      filename: 'hollow.tex',
      content: Buffer.from('% just a comment\n\n', 'utf8'),
    };

    await expect(extractor.extract(onlyMarkup)).rejects.toBeInstanceOf(EmptySourceDocumentError);
  });
});
