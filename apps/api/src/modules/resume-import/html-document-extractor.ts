import {
  DocumentExtractor,
  EmptySourceDocumentError,
  ExtractedDocument,
  SourceDocumentInput,
} from './document-extractor';
import { normalizeExtractedText } from './text-normalization';

const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const DROPPED_ELEMENT_PATTERN = /<(head|script|style|noscript)\b[\s\S]*?<\/\1>/gi;
const LINE_BREAKING_END_TAG_PATTERN =
  /<\/(?:p|div|h[1-6]|li|ul|ol|dl|dt|dd|section|article|header|footer|main|aside|nav|blockquote|pre|table|thead|tbody|tfoot|tr|td|th|figure|figcaption|form|fieldset|address)>/gi;
const LINE_BREAKING_EMPTY_TAG_PATTERN = /<(?:br|hr)\b[^>]*>/gi;
const ANCHOR_PATTERN = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi;
const ANY_TAG_PATTERN = /<[^>]*>/g;
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  laquo: '\u00AB',
  raquo: '\u00BB',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201C',
  rdquo: '\u201D',
};
const ENTITY_PATTERN = /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

export class HtmlDocumentExtractor implements DocumentExtractor {
  async extract(document: SourceDocumentInput): Promise<ExtractedDocument> {
    if (document.content.byteLength === 0) {
      throw new EmptySourceDocumentError(document.filename);
    }
    const readingOrderText = normalizeExtractedText(
      toPlainText(document.content.toString('utf8')),
    );
    if (readingOrderText === '') {
      throw new EmptySourceDocumentError(document.filename);
    }
    return { hasTextLayer: true, readingOrderText, pageCount: 1 };
  }
}

function toPlainText(source: string): string {
  const withoutMarkup = source
    .replace(COMMENT_PATTERN, '')
    .replace(DROPPED_ELEMENT_PATTERN, '')
    .replace(LINE_BREAKING_END_TAG_PATTERN, '\n')
    .replace(LINE_BREAKING_EMPTY_TAG_PATTERN, '\n')
    .replace(
      ANCHOR_PATTERN,
      (_, doubleQuoted: string | undefined, singleQuoted: string | undefined, label: string) =>
        withLinkTarget(label, decodeEntities((doubleQuoted ?? singleQuoted ?? '').trim())),
    )
    .replace(ANY_TAG_PATTERN, '');
  return decodeEntities(withoutMarkup);
}

function withLinkTarget(label: string, destination: string): string {
  if (!/^https?:\/\//i.test(destination)) return label;
  if (label.trim() === '') return destination;
  return `${label} (${destination})`;
}

function decodeEntities(text: string): string {
  return text.replace(ENTITY_PATTERN, (match, entity: string) => decodeEntity(entity) ?? match);
}

const MAX_UNICODE_CODE_POINT = 0x10_ff_ff;

function decodeEntity(entity: string): string | undefined {
  if (entity.startsWith('#')) {
    const isHex = entity[1] === 'x' || entity[1] === 'X';
    const codePoint = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
    const inRange = !Number.isNaN(codePoint) && codePoint >= 0 && codePoint <= MAX_UNICODE_CODE_POINT;
    return inRange ? String.fromCodePoint(codePoint) : undefined;
  }
  return NAMED_ENTITIES[entity.toLowerCase()];
}
