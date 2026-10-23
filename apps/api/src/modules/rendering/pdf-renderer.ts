export const PDF_RENDERER = Symbol('PDF_RENDERER');

export interface PdfRenderResult {
  readonly pdf: Buffer;
  readonly pageCount: number;
}

export interface PdfRenderer {
  render(html: string): Promise<PdfRenderResult>;
}
