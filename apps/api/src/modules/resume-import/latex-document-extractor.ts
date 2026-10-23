import {
  DocumentExtractor,
  EmptySourceDocumentError,
  ExtractedDocument,
  SourceDocumentInput,
} from './document-extractor';
import { normalizeExtractedText } from './text-normalization';

const DOCUMENT_BODY_PATTERN = /\\begin\{document\}([\s\S]*?)\\end\{document\}/;
const COMMENT_PATTERN = /(?<!\\)%[^\n]*/g;
const ITEM_PATTERN = /\\item(?:\[[^\]]*\])?/g;
const MANUAL_LINE_BREAK_PATTERN = /\\\\(?:\*)?(?:\[[^\]]*\])?/g;
const ENVIRONMENT_PATTERN = /\\(?:begin|end)\{[^{}]*\}/g;
const HREF_PATTERN = /\\href\{([^{}]*)\}\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const URL_COMMAND_PATTERN = /\\url\{([^{}]*)\}/g;
const COMMAND_PATTERN = /\\[a-zA-Z@]+\*?/g;
const UNESCAPED_BRACE_PATTERN = /(?<!\\)[{}]/g;
const EM_DASH_PATTERN = /---/g;
const EN_DASH_PATTERN = /--/g;
const NO_BREAK_SPACE_PATTERN = /~/g;
const ESCAPED_SYMBOL_PATTERN = /\\([%_$&#{}~,\\])/g;

export class LatexDocumentExtractor implements DocumentExtractor {
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
  const body = DOCUMENT_BODY_PATTERN.exec(source)?.[1] ?? source;
  return body
    .replace(COMMENT_PATTERN, '')
    .replace(MANUAL_LINE_BREAK_PATTERN, '\n')
    .replace(ITEM_PATTERN, '\n')
    .replace(ENVIRONMENT_PATTERN, '\n\n')
    .replace(HREF_PATTERN, (_, destination: string, label: string) =>
      isHttpTarget(destination) ? withTarget(label, destination) : label,
    )
    .replace(URL_COMMAND_PATTERN, (_, destination: string) => destination.trim())
    .replace(COMMAND_PATTERN, '')
    .replace(UNESCAPED_BRACE_PATTERN, '')
    .replace(EM_DASH_PATTERN, '\u2014')
    .replace(EN_DASH_PATTERN, '\u2013')
    .replace(NO_BREAK_SPACE_PATTERN, ' ')
    .replace(ESCAPED_SYMBOL_PATTERN, '$1');
}

function isHttpTarget(destination: string): boolean {
  return /^https?:\/\//i.test(destination.trim());
}

function withTarget(label: string, destination: string): string {
  const cleanLabel = label.trim();
  const target = destination.trim();
  if (cleanLabel === '') return target;
  return `${cleanLabel} (${target})`;
}
