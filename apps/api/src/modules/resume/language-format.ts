const WHITESPACE_PATTERN = /\s+/g;

export function formatLanguage(name: string, level: string | null): string {
  const flatLevel = (level ?? '').replace(WHITESPACE_PATTERN, ' ').trim();
  if (flatLevel === '') {
    return name;
  }
  return `${name}: ${flatLevel}`;
}
