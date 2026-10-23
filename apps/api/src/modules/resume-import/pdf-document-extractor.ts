import {
  classifyPdfAsync,
  extractPagesMarkdownAsync,
  extractTextWithPositions,
  PdfType,
  TextItem,
} from '@firecrawl/pdf-inspector';
import {
  CorruptedSourceDocumentError,
  DocumentExtractor,
  EmptySourceDocumentError,
  ExtractedDocument,
  SourceDocumentInput,
} from './document-extractor';
import { normalizeExtractedText } from './text-normalization';

const PAGE_SEPARATOR = '\n\n';

const TEXT_LAYER_TYPES: readonly PdfType[] = [PdfType.TextBased, PdfType.Mixed];

export function collectLinkTargets(
  items: readonly Pick<TextItem, 'linkUrl'>[],
  text: string,
): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const item of items) {
    const candidate = item.linkUrl?.trim();
    if (!candidate) continue;
    if (!/^https?:\/\//i.test(candidate)) continue;
    if (seen.has(candidate)) continue;
    if (text.includes(candidate)) continue;
    seen.add(candidate);
    targets.push(candidate);
  }
  return targets;
}

export class PdfDocumentExtractor implements DocumentExtractor {
  async extract(document: SourceDocumentInput): Promise<ExtractedDocument> {
    if (document.content.byteLength === 0) {
      throw new EmptySourceDocumentError(document.filename);
    }
    const classification = await this.runPdf(
      () => classifyPdfAsync(document.content),
      document.filename,
    );
    const hasTextLayer = TEXT_LAYER_TYPES.includes(classification.pdfType);
    if (!hasTextLayer) {
      console.log('document_extraction.no_text_layer', {
        format: 'pdf',
        pageCount: classification.pageCount,
        sizeInBytes: document.content.byteLength,
      });
      return { hasTextLayer: false, readingOrderText: '', pageCount: classification.pageCount };
    }
    const extraction = await this.runPdf(
      () => extractPagesMarkdownAsync(document.content),
      document.filename,
    );
    const baseText = normalizeExtractedText(
      extraction.pages.map((page) => page.markdown).join(PAGE_SEPARATOR),
    );
    if (baseText === '') {
      throw new CorruptedSourceDocumentError(document.filename, new Error('empty extraction'));
    }
    const positioned = await this.runPdf(
      () => extractTextWithPositions(document.content),
      document.filename,
    );
    const linkTargets = collectLinkTargets(positioned, baseText);
    const readingOrderText =
      linkTargets.length > 0 ? `${baseText}${PAGE_SEPARATOR}${linkTargets.join('\n')}` : baseText;
    console.log('document_extraction.completed', {
      format: 'pdf',
      pageCount: classification.pageCount,
      textLength: readingOrderText.length,
      linkCount: linkTargets.length,
    });
    return { hasTextLayer: true, readingOrderText, pageCount: classification.pageCount };
  }

  private async runPdf<T>(operation: () => T | Promise<T>, filename: string): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : 'unknown error';
      console.error('document_extraction.failed', { format: 'pdf', reason });
      throw new CorruptedSourceDocumentError(filename, cause);
    }
  }
}
