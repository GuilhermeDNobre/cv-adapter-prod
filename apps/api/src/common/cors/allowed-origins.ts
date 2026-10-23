const DEFAULT_WEB_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const ORIGIN_SEPARATOR = ',';
const TRAILING_SLASH = /\/$/;

// Both spellings of the local front: browsers send Origin exactly as typed, so opening the UI
// by IP must be allowed alongside localhost, otherwise the guard would refuse the person's own use.
export function readAllowedOrigins(rawOrigins: string | undefined): string[] {
  if (rawOrigins === undefined) {
    return [...DEFAULT_WEB_ORIGINS];
  }
  const origins = rawOrigins
    .split(ORIGIN_SEPARATOR)
    .map((origin) => origin.trim().replace(TRAILING_SLASH, ''))
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : [...DEFAULT_WEB_ORIGINS];
}
