export const DOCUMENT_EXTRACTOR = 'DOCUMENT_EXTRACTOR';

export interface SourceDocumentInput {
  readonly filename: string;
  readonly content: Buffer;
}

export interface ExtractedDocument {
  readonly hasTextLayer: boolean;
  readonly readingOrderText: string;
  readonly pageCount: number;
}

export interface DocumentExtractor {
  extract(document: SourceDocumentInput): Promise<ExtractedDocument>;
}

export abstract class DocumentExtractionError extends Error {
  protected constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class EmptySourceDocumentError extends DocumentExtractionError {
  constructor(filename: string) {
    super(`Source document is empty: ${filename}`);
  }
}

export class CorruptedSourceDocumentError extends DocumentExtractionError {
  constructor(filename: string, cause: unknown) {
    super(`Source document could not be parsed: ${filename}`, { cause });
  }
}

export class UnsupportedSourceDocumentError extends DocumentExtractionError {
  constructor(filename: string) {
    super(`Unsupported source document type: ${filename}`);
  }
}

export type SourceDocumentType = 'pdf' | 'latex' | 'html';

const EXTENSIONS_BY_TYPE: Readonly<Record<SourceDocumentType, readonly string[]>> = {
  pdf: ['.pdf'],
  latex: ['.tex', '.latex'],
  html: ['.html', '.htm'],
};

export function detectSourceDocumentType(filename: string): SourceDocumentType {
  const lowerCased = filename.toLowerCase();
  const match = (Object.keys(EXTENSIONS_BY_TYPE) as readonly SourceDocumentType[]).find(
    (type) => EXTENSIONS_BY_TYPE[type].some((extension) => lowerCased.endsWith(extension)),
  );
  if (match === undefined) {
    throw new UnsupportedSourceDocumentError(filename);
  }
  return match;
}

export class DocumentExtractorDispatcher implements DocumentExtractor {
  private readonly extractors: Readonly<Record<SourceDocumentType, DocumentExtractor>>;

  constructor(extractors: Readonly<Record<SourceDocumentType, DocumentExtractor>>) {
    this.extractors = extractors;
  }

  async extract(document: SourceDocumentInput): Promise<ExtractedDocument> {
    return this.extractors[detectSourceDocumentType(document.filename)].extract(document);
  }
}
