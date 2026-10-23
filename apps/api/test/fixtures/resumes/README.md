# Resume corpus for `DocumentExtractor`

Synthetic fixtures. Real resumes are personal data and cannot be versioned here
(LGPD), so every file below was generated to reproduce the layout it tests.
The PDFs were built by hand-writing the PDF object graph (Helvetica text runs
positioned with `Td`), then verified against `@firecrawl/pdf-inspector`.

The `.expected.txt` sidecars hold the exact `readingOrderText` the extractors
must produce. The assertion is always on reconstructed text, never on library
coordinates (ADR 0011).

| File | Layout proven |
|---|---|
| `two-column.pdf` | Two independent flowing columns; no extracted line may mix columns |
| `single-column.pdf` | The common path: one column, no regression |
| `header-two-column.pdf` | Full-width header above two columns; header must not be absorbed by a column |
| `three-page.pdf` | Reading order across pages; `pageCount` is 3 |
| `scanned-no-text-layer.pdf` | Image-only page, no text layer; `hasTextLayer` is `false`, no error |
| `linked-header.pdf` | Header with LinkedIn/GitHub link annotations; link targets appended as trailing URLs |
| `resume.tex` | LaTeX commands, environments, comments and escapes removed; text and order survive |
| `resume.html` | Markup, `head`, `script` and `style` removed; entities decoded; order survives |

The `PageOneMarker` / `PageTwoMarker` / `PageThreeMarker` tokens in
`three-page.pdf` exist only so tests can pin the page-to-page order.
