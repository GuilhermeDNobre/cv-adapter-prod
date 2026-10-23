import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CorruptedSourceDocumentError,
  EmptySourceDocumentError,
  SourceDocumentInput,
} from './document-extractor';
import { collectLinkTargets, PdfDocumentExtractor } from './pdf-document-extractor';

const FIXTURES_DIR = join(process.cwd(), 'test', 'fixtures', 'resumes');
const LEFT_COLUMN_MARKERS = [
  'MARIANA QUARTZ',
  'Backend developer focused on Python services',
  'Northwind Software',
  'Vendor Alpha',
  'Baltic Systems',
] as const;
const RIGHT_COLUMN_MARKERS = [
  'Python, Django, Flask, Celery',
  'Delta Institute',
  'Portuguese (native)',
  'Professional Cloud Developer',
] as const;

function readFixture(name: string): SourceDocumentInput {
  return { filename: name, content: readFileSync(join(FIXTURES_DIR, name)) };
}

function readExpected(name: string): string {
  return readFileSync(join(FIXTURES_DIR, `${name}.expected.txt`), 'utf8')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function columnMarkersIn(line: string, markers: readonly string[]): number {
  return markers.filter((marker) => line.includes(marker)).length;
}

describe('PdfDocumentExtractor', () => {
  const extractor = new PdfDocumentExtractor();

  it('should reconstruct the two-column layout with each column as a whole block', async () => {
    const extracted = await extractor.extract(readFixture('two-column.pdf'));

    expect(extracted.readingOrderText).toBe(readExpected('two-column.pdf'));
  });

  it('should keep every extracted line inside a single column of the two-column layout', async () => {
    const extracted = await extractor.extract(readFixture('two-column.pdf'));

    for (const line of extracted.readingOrderText.split('\n')) {
      const leftHits = columnMarkersIn(line, LEFT_COLUMN_MARKERS);
      const rightHits = columnMarkersIn(line, RIGHT_COLUMN_MARKERS);
      expect(leftHits === 0 || rightHits === 0).toBe(true);
    }
  });

  it('should finish the left column of the two-column layout before the right one starts', async () => {
    const extracted = await extractor.extract(readFixture('two-column.pdf'));
    const text = extracted.readingOrderText;
    const positionsOf = (markers: readonly string[]): number[] =>
      markers.map((marker) => text.indexOf(marker));

    const leftPositions = positionsOf(LEFT_COLUMN_MARKERS);
    const rightPositions = positionsOf(RIGHT_COLUMN_MARKERS);
    expect(Math.min(...leftPositions)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...rightPositions)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...leftPositions)).toBeLessThan(Math.min(...rightPositions));
  });

  it('should extract the single-column layout without regressing the common path', async () => {
    const extracted = await extractor.extract(readFixture('single-column.pdf'));

    expect(extracted.readingOrderText).toBe(readExpected('single-column.pdf'));
    expect(extracted.pageCount).toBe(1);
    expect(extracted.hasTextLayer).toBe(true);
  });

  it('should keep the full-width header ahead of both columns and the columns apart', async () => {
    const extracted = await extractor.extract(readFixture('header-two-column.pdf'));
    const text = extracted.readingOrderText;
    const leftMarkers = ['Cobalt Studio', 'Quartz Agency', 'GraphQL gateway'] as const;
    const rightMarkers = ['Frontend Developer Certified', 'Harbor Teens', 'Trail running'] as const;

    expect(text).toBe(readExpected('header-two-column.pdf'));
    expect(text.indexOf('PATRICK RUBY')).toBeLessThan(
      Math.min(...leftMarkers.map((marker) => text.indexOf(marker))),
    );
    expect(Math.max(...leftMarkers.map((marker) => text.indexOf(marker)))).toBeLessThan(
      Math.min(...rightMarkers.map((marker) => text.indexOf(marker))),
    );
    for (const line of text.split('\n')) {
      const headerHits = columnMarkersIn(line, ['PATRICK RUBY']);
      const otherHits = columnMarkersIn(line, [...leftMarkers, ...rightMarkers]);
      expect(headerHits === 0 || otherHits === 0).toBe(true);
    }
  });

  it('should keep the reading order across the three pages and report the page count', async () => {
    const extracted = await extractor.extract(readFixture('three-page.pdf'));
    const text = extracted.readingOrderText;

    expect(extracted.pageCount).toBe(3);
    expect(text).toBe(readExpected('three-page.pdf'));
    expect(text.indexOf('PageOneMarker')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('PageOneMarker')).toBeLessThan(text.indexOf('PageTwoMarker'));
    expect(text.indexOf('PageTwoMarker')).toBeLessThan(text.indexOf('PageThreeMarker'));
  });

  it('should report a scanned pdf as having no text layer without raising an error', async () => {
    const extracted = await extractor.extract(readFixture('scanned-no-text-layer.pdf'));

    expect(extracted.hasTextLayer).toBe(false);
    expect(extracted.readingOrderText).toBe('');
    expect(extracted.pageCount).toBe(1);
  });

  it('should append http link targets after the body and skip the mailto target', async () => {
    const extracted = await extractor.extract(readFixture('linked-header.pdf'));

    expect(extracted.readingOrderText).toBe(readExpected('linked-header.pdf'));
    expect(extracted.readingOrderText.split('\n').slice(-2)).toEqual([
      'https://linkedin.com/in/mariana-quartz',
      'https://github.com/mariana-quartz',
    ]);
    expect(extracted.readingOrderText).not.toContain('mailto:');
    expect(extracted.pageCount).toBe(1);
    expect(extracted.hasTextLayer).toBe(true);
  });

  it('should report the link count without logging the urls', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await extractor.extract(readFixture('linked-header.pdf'));

      const completed = logSpy.mock.calls.find(
        (args) => args[0] === 'document_extraction.completed',
      );
      expect(completed).toBeDefined();
      expect(completed?.[1]).toMatchObject({ format: 'pdf', pageCount: 1, linkCount: 2 });
      expect(JSON.stringify(completed)).not.toContain('https://');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('should raise a typed error for an empty file instead of returning an empty string', async () => {
    await expect(
      extractor.extract({ filename: 'empty.pdf', content: Buffer.alloc(0) }),
    ).rejects.toBeInstanceOf(EmptySourceDocumentError);
  });

  it('should raise a typed error for a file that is not a pdf', async () => {
    const notPdf = Buffer.from('this is just text, nobody is going to extract it as a pdf');

    await expect(
      extractor.extract({ filename: 'fake.pdf', content: notPdf }),
    ).rejects.toBeInstanceOf(CorruptedSourceDocumentError);
  });

  it('should raise a typed error for a truncated pdf', async () => {
    const truncated = readFixture('two-column.pdf').content.subarray(0, 150);

    await expect(
      extractor.extract({ filename: 'truncated.pdf', content: truncated }),
    ).rejects.toBeInstanceOf(CorruptedSourceDocumentError);
  });
});

describe('collectLinkTargets', () => {
  it('should drop duplicated http targets keeping the first occurrence order', () => {
    const items = [
      { linkUrl: 'https://github.com/mariana-quartz' },
      { linkUrl: 'https://github.com/mariana-quartz' },
      { linkUrl: 'https://linkedin.com/in/mariana-quartz' },
    ];

    expect(collectLinkTargets(items, 'body')).toEqual([
      'https://github.com/mariana-quartz',
      'https://linkedin.com/in/mariana-quartz',
    ]);
  });

  it('should discard mailto and tel targets', () => {
    const items = [
      { linkUrl: 'mailto:mariana.quartz@example.com' },
      { linkUrl: 'tel:+5511999990000' },
      { linkUrl: 'https://github.com/mariana-quartz' },
    ];

    expect(collectLinkTargets(items, 'body')).toEqual(['https://github.com/mariana-quartz']);
  });

  it('should omit a url already present in the text', () => {
    const items = [
      { linkUrl: 'https://github.com/mariana-quartz' },
      { linkUrl: 'https://linkedin.com/in/mariana-quartz' },
    ];

    expect(
      collectLinkTargets(items, 'see https://github.com/mariana-quartz here'),
    ).toEqual(['https://linkedin.com/in/mariana-quartz']);
  });
});
