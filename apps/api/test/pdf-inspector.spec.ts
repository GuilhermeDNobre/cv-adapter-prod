import { describe, expect, it } from 'vitest';
import { extractText, processPdf, PdfType } from '@firecrawl/pdf-inspector';

// Self-contained minimal real PDF (valid standard PDF with text layer)
const REAL_PDF_BASE64 =
  'JVBERi0xLjMKJb/3ov4KMSAwIG9iago8PCAvUGFnZXMgMiAwIFIgL1R5cGUgL0NhdGFsb2cgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL0NvdW50IDEgL0tpZHMgWyAzIDAgUiBdIC9UeXBlIC9QYWdlcyA+PgplbmRvYmoKMyAwIG9iago8PCAvQ29udGVudHMgNCAwIFIgL0Nyb3BCb3ggWyA1MCA2MCAzNTAgNDYwIF0gL01lZGlhQm94IFsgMCAwIDQwMCA1MDAgXSAvUGFyZW50IDIgMCBSIC9SZXNvdXJjZXMgPDwgL0ZvbnQgPDwgL0YxIDUgMCBSID4+ID4+IC9UeXBlIC9QYWdlID4+CmVuZG9iago0IDAgb2JqCjw8IC9MZW5ndGggMTQ5ID4+CnN0cmVhbQpCVCAvRjEgMTIgVGYgMTIwIDMwMCBUZCAoVmlzaWJsZSBnbHlwaCkgVGogRVQKQlQgL0YxIDEyIFRmIDEyMCAyODAgVGQgKFNlY29uZCBsaW5lIG9mIHRleHQpIFRqIEVUCkJUIC9GMSAxMiBUZiAxMjAgMjYwIFRkIChUaGlyZCBsaW5lIG9mIHRleHQpIFRqIEVUCgplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL0Jhc2VGb250IC9IZWx2ZXRpY2EgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250ID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2NCAwMDAwMCBuIAowMDAwMDAwMTIzIDAwMDAwIG4gCjAwMDAwMDAyNzggMDAwMDAgbiAKMDAwMDAwMDQ3OCAwMDAwMCBuIAp0cmFpbGVyIDw8IC9Sb290IDEgMCBSIC9TaXplIDYgL0lEIFs8MzE0MTU5MjY1MzU4OTc5MzIzODQ2MjY0MzM4MzI3OTU+PDMxNDE1OTI2NTM1ODk3OTMyMzg0NjI2NDMzODMyNzk1Pl0gPj4Kc3RhcnR4cmVmCjU0OAolJUVPRgo=';

describe('pdf-inspector native binary integration', () => {
  it('should load native binary and extract text from a real PDF', () => {
    // Arrange
    const pdfBuffer = Buffer.from(REAL_PDF_BASE64, 'base64');

    // Act
    const extractedText = extractText(pdfBuffer);
    const pdfResult = processPdf(pdfBuffer);

    // Assert
    expect(extractedText).toContain('Visible glyph');
    expect(extractedText).toContain('Second line of text');
    expect(extractedText).toContain('Third line of text');
    expect(pdfResult.pdfType).toBe(PdfType.TextBased);
    expect(pdfResult.pageCount).toBe(1);
  });
});
