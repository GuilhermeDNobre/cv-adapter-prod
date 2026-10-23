const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Brazilian phone formats: (11) 91234-5678, 11912345678, +55 11 91234-5678, 11 1234-5678.
// Also handles dots as separators: (11) 9.1234-5678.
// International formats: +1 555 123 4567, +44 20 7946 0958.
// Requires either DDI (+XX) or area code in parentheses to avoid matching
// arbitrary digit sequences like percentages, monetary values, and years.
const PHONE_PATTERN =
  /\+\d{1,3}[\s.-]?\(?\d{2,3}\)?[\s.-]?\d{3,5}[\s.-]?\d{3,4}|\(?\d{2}\)?[\s.-]?\d[\d.]{3,5}[\s.-]?\d{4}/g;

const SOCIAL_DOMAINS =
  'linkedin\\.com|github\\.com|twitter\\.com|x\\.com|instagram\\.com|facebook\\.com|behance\\.net|medium\\.com|gitlab\\.com|bitbucket\\.org';

const URL_AND_SOCIAL_PATTERN = new RegExp(
  `(?:https?://)?(?:www\\.)?(?:${SOCIAL_DOMAINS})/[^\\s,;)]+|https?://[^\\s,;)]+`,
  'gi',
);

const COMMON_STREET_TYPES =
  'rua|av(?:enida)?\\.?|alameda|travessa|rodovia|estrada|praça|largo|viela|beco';

const ADDRESS_PATTERN = new RegExp(
  `(?:${COMMON_STREET_TYPES})\\s+[^,\\n]+,\\s*\\d+`,
  'gi',
);

const SECTION_HEADER_PATTERN =
  /^(?:experience|education|skills|summary|professional\s+summary|work\s+experience|employment|qualifications|certifications|projects|languages|interests|references|objetivo|experiência|formação|educação|habilidades|competências|resumo|projetos|idiomas|referências)\s*$/i;

const CITY_SEPARATOR_PATTERN = /[•·|—▪]/;

const CITY_STATE_PATTERN = /^(.+),\s*([A-Z]{2})$/;

const CITY_STATE_DASH_PATTERN = /^(.+?)\s+-\s+([A-Z]{2})$/;

const CITY_COUNTRY_PATTERN = /^(.+),\s*([A-ZÀ-Þ][A-Za-zÀ-ÿ]{2,29})$/;

const SINGLE_SEGMENT_PROFILE_DOMAINS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'behance.net',
  'medium.com',
  'twitter.com',
  'x.com',
  'instagram.com',
]);

function isProfileLink(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '') return false;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    return true;
  }
  if (!SINGLE_SEGMENT_PROFILE_DOMAINS.has(host)) {
    return false;
  }
  const segments = parsed.pathname.split('/').filter((part) => part !== '');
  return segments.length <= 1;
}

function inferLinkTitle(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed === '') return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'LinkedIn';
  if (host === 'github.com') return 'GitHub';
  if (host === 'gitlab.com') return 'GitLab';
  if (host === 'behance.net') return 'Behance';
  if (host === 'medium.com') return 'Medium';
  if (host === 'instagram.com') return 'Instagram';
  if (host === 'twitter.com') return 'Twitter';
  if (host === 'x.com') return 'X';
  return null;
}

export {
  ADDRESS_PATTERN,
  CITY_COUNTRY_PATTERN,
  CITY_SEPARATOR_PATTERN,
  CITY_STATE_DASH_PATTERN,
  CITY_STATE_PATTERN,
  EMAIL_PATTERN,
  PHONE_PATTERN,
  SECTION_HEADER_PATTERN,
  URL_AND_SOCIAL_PATTERN,
  inferLinkTitle,
  isProfileLink,
};
