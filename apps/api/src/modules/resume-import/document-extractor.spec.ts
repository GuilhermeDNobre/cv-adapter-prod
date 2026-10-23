import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectSourceDocumentType,
  DocumentExtractor,
  DocumentExtractorDispatcher,
  ExtractedDocument,
  SourceDocumentInput,
  UnsupportedSourceDocumentError,
} from './document-extractor';
import { HtmlDocumentExtractor } from './html-document-extractor';
import { LatexDocumentExtractor } from './latex-document-extractor';
import { PdfDocumentExtractor } from './pdf-document-extractor';

const FIXTURES_DIR = join(process.cwd(), 'test', 'fixtures', 'resumes');

class StubExtractor implements DocumentExtractor {
  private readonly marker: string;

  constructor(marker: string) {
    this.marker = marker;
  }

  async extract(): Promise<ExtractedDocument> {
    return { hasTextLayer: true, readingOrderText: this.marker, pageCount: 1 };
  }
}

function buildDispatcher(): DocumentExtractorDispatcher {
  return new DocumentExtractorDispatcher({
    pdf: new StubExtractor('pdf'),
    latex: new StubExtractor('latex'),
    html: new StubExtractor('html'),
  });
}

function buildRealDispatcher(): DocumentExtractorDispatcher {
  return new DocumentExtractorDispatcher({
    pdf: new PdfDocumentExtractor(),
    latex: new LatexDocumentExtractor(),
    html: new HtmlDocumentExtractor(),
  });
}

function readFixture(name: string): SourceDocumentInput {
  return { filename: name, content: readFileSync(join(FIXTURES_DIR, name)) };
}

describe('detectSourceDocumentType', () => {
  it('should map each supported extension to its source document type', () => {
    expect(detectSourceDocumentType('resume.pdf')).toBe('pdf');
    expect(detectSourceDocumentType('resume.tex')).toBe('latex');
    expect(detectSourceDocumentType('resume.latex')).toBe('latex');
    expect(detectSourceDocumentType('resume.html')).toBe('html');
    expect(detectSourceDocumentType('resume.htm')).toBe('html');
  });

  it('should match extensions regardless of case', () => {
    expect(detectSourceDocumentType('RESUME.PDF')).toBe('pdf');
    expect(detectSourceDocumentType('Resume.Html')).toBe('html');
  });

  it('should throw a typed error for an unsupported extension', () => {
    expect(() => detectSourceDocumentType('resume.docx')).toThrow(UnsupportedSourceDocumentError);
    expect(() => detectSourceDocumentType('no-extension')).toThrow(UnsupportedSourceDocumentError);
  });
});

describe('DocumentExtractorDispatcher', () => {
  it('should dispatch each extension to the matching implementation', async () => {
    const dispatcher = buildDispatcher();
    const inputs: ReadonlyArray<{ filename: string; marker: string }> = [
      { filename: 'cv.pdf', marker: 'pdf' },
      { filename: 'cv.tex', marker: 'latex' },
      { filename: 'cv.html', marker: 'html' },
    ];

    for (const input of inputs) {
      const extracted = await dispatcher.extract({
        filename: input.filename,
        content: Buffer.from('ignored by stubs'),
      });
      expect(extracted.readingOrderText).toBe(input.marker);
    }
  });

  it('should reject an unsupported file type without touching an implementation', async () => {
    const dispatcher = buildDispatcher();

    await expect(
      dispatcher.extract({ filename: 'cv.docx', content: Buffer.from('ignored by stubs') }),
    ).rejects.toThrow(UnsupportedSourceDocumentError);
  });

  it('should run the full path over the real pdf fixture on disk', async () => {
    const extracted = await buildRealDispatcher().extract(readFixture('single-column.pdf'));

    expect(extracted.hasTextLayer).toBe(true);
    expect(extracted.readingOrderText.startsWith('# JANET DOE')).toBe(true);
    expect(extracted.pageCount).toBe(1);
  });

  it('should run the full path over the real latex fixture on disk', async () => {
    const extracted = await buildRealDispatcher().extract(readFixture('resume.tex'));

    expect(extracted.readingOrderText.startsWith('Renata Emerald')).toBe(true);
  });

  it('should run the full path over the real html fixture on disk', async () => {
    const extracted = await buildRealDispatcher().extract(readFixture('resume.html'));

    expect(extracted.readingOrderText.startsWith('VICTOR ONYX')).toBe(true);
  });
});
