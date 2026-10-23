export function buildExportFilename(resumeName: string): string {
  const ascii = resumeName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const slug = ascii
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (slug === '') {
    return 'curriculo.pdf';
  }
  return `curriculo-${slug}.pdf`;
}
