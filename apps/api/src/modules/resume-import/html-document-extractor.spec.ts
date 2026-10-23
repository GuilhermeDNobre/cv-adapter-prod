import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EmptySourceDocumentError, SourceDocumentInput } from './document-extractor';
import { HtmlDocumentExtractor } from './html-document-extractor';

const FIXTURES_DIR = join(process.cwd(), 'test', 'fixtures', 'resumes');

function readFixture(name: string): SourceDocumentInput {
  return { filename: name, content: readFileSync(join(FIXTURES_DIR, name)) };
}

function readExpected(name: string): string {
  return readFileSync(join(FIXTURES_DIR, `${name}.expected.txt`), 'utf8')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function fromHtml(markup: string): SourceDocumentInput {
  return { filename: 'fragment.html', content: Buffer.from(markup, 'utf8') };
}

describe('HtmlDocumentExtractor', () => {
  const extractor = new HtmlDocumentExtractor();

  it('should turn the resume fixture into clean text in source order', async () => {
    const extracted = await extractor.extract(readFixture('resume.html'));

    expect(extracted.readingOrderText).toBe(readExpected('resume.html'));
    expect(extracted.hasTextLayer).toBe(true);
    expect(extracted.pageCount).toBe(1);
  });

  it('should drop markup and keep the text in document order', async () => {
    const extracted = await extractor.extract(
      fromHtml('<section><h2>Roles</h2><p>Engineer <em>and</em> mentor</p></section>'),
    );

    expect(extracted.readingOrderText).toBe('Roles\nEngineer and mentor');
  });

  it('should drop script and style contents entirely', async () => {
    const extracted = await extractor.extract(
      fromHtml(
        '<div><style>p { color: red; }</style><p>Visible</p><script>alert("gone");</script></div>',
      ),
    );

    expect(extracted.readingOrderText).toBe('Visible');
    expect(extracted.readingOrderText).not.toContain('color');
    expect(extracted.readingOrderText).not.toContain('alert');
  });

  it('should preserve line breaks for block elements and explicit breaks', async () => {
    const extracted = await extractor.extract(
      fromHtml('<div>One<br/>Two</div><address>Third</address>'),
    );

    expect(extracted.readingOrderText).toBe('One\nTwo\nThird');
  });

  it('should decode named, decimal, and hexadecimal entities', async () => {
    const extracted = await extractor.extract(
      fromHtml('<p>Caf&#233; &amp; cr&#232;me &#8212; &#x391;pple</p>'),
    );

    expect(extracted.readingOrderText).toBe('Caf\u00E9 & cr\u00E8me \u2014 \u0391pple');
  });

  it('should collapse repeated spaces but keep block separation', async () => {
    const extracted = await extractor.extract(
      fromHtml('<p>lots   of       spaces</p>\n\n<p>then a new block</p>'),
    );

    expect(extracted.readingOrderText).toBe('lots of spaces\n\nthen a new block');
  });

  it('should keep the http target of a link next to its label', async () => {
    const extracted = await extractor.extract(
      fromHtml('<p><a href="https://github.com/u">GitHub</a></p>'),
    );

    expect(extracted.readingOrderText).toBe('GitHub (https://github.com/u)');
  });

  it('should keep the http target when the href uses single quotes', async () => {
    const extracted = await extractor.extract(
      fromHtml("<p><a href='https://github.com/u'>GitHub</a></p>"),
    );

    expect(extracted.readingOrderText).toBe('GitHub (https://github.com/u)');
  });

  it('should keep only the label of a mailto link', async () => {
    const extracted = await extractor.extract(fromHtml('<p><a href="mailto:a@b.co">a@b.co</a></p>'));

    expect(extracted.readingOrderText).toBe('a@b.co');
  });

  it('should decode entities inside the href', async () => {
    const extracted = await extractor.extract(
      fromHtml('<p><a href="https://x.dev/a?b=1&amp;c=2">X</a></p>'),
    );

    expect(extracted.readingOrderText).toBe('X (https://x.dev/a?b=1&c=2)');
  });

  it('should raise a typed error for an empty file', async () => {
    await expect(
      extractor.extract({ filename: 'empty.html', content: Buffer.alloc(0) }),
    ).rejects.toBeInstanceOf(EmptySourceDocumentError);
  });

  it('should raise a typed error when the document holds no text', async () => {
    await expect(extractor.extract(fromHtml('<div><p></p><br/></div>'))).rejects.toBeInstanceOf(
      EmptySourceDocumentError,
    );
  });
});
