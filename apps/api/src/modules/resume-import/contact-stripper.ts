import {
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
} from './contact-patterns';

const EMAIL_MARKER = '[EMAIL REMOVED]';
const PHONE_MARKER = '[PHONE REMOVED]';
const URL_MARKER = '[URL REMOVED]';
const ADDRESS_MARKER = '[ADDRESS REMOVED]';
const CITY_MARKER = '[CITY REMOVED]';
const NAME_MARKER = '[NAME REMOVED]';

interface ContactDetails {
  readonly fullName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly city?: string;
  readonly links?: ReadonlyArray<{ readonly title: string | null; readonly url: string }>;
}

interface StrippedDocument {
  readonly textWithoutContact: string;
  readonly contactDetails: ContactDetails;
}

interface ContactStripper {
  strip(text: string): StrippedDocument;
}

function extractEmails(text: string, details: MutableDetails): string {
  const emails = text.match(EMAIL_PATTERN);
  if (emails) {
    details.email = emails.join('; ');
  }
  return text.replace(EMAIL_PATTERN, EMAIL_MARKER);
}

function extractPhones(text: string, details: MutableDetails): string {
  const phones = text.match(PHONE_PATTERN);
  if (phones) {
    details.phone = phones.join('; ');
  }
  return text.replace(PHONE_PATTERN, PHONE_MARKER);
}

function extractUrls(text: string, details: MutableDetails): string {
  const urls = text.match(URL_AND_SOCIAL_PATTERN);
  if (urls) {
    const profiles: Array<{ readonly title: string | null; readonly url: string }> = [];
    const seen = new Set<string>();
    for (const url of urls) {
      if (isProfileLink(url) && !seen.has(url)) {
        seen.add(url);
        profiles.push({ title: inferLinkTitle(url), url });
      }
    }
    if (profiles.length > 0) {
      details.links = profiles;
    }
  }
  return text.replace(URL_AND_SOCIAL_PATTERN, URL_MARKER);
}

function extractAddress(text: string): string {
  return text.replace(ADDRESS_PATTERN, ADDRESS_MARKER);
}

function toCityCandidate(segment: string): string | undefined {
  const trimmed = segment.trim().replace(/\s+/g, ' ');
  if (trimmed === '') return undefined;
  if (/\d/.test(trimmed)) return undefined;
  if (trimmed.includes('@')) return undefined;
  if (/\[.*REMOVED\]/.test(trimmed)) return undefined;
  if (/https?:\/\//i.test(trimmed)) return undefined;
  if (/www\./i.test(trimmed)) return undefined;
  if (/\.(com|org|net|br|io|dev)\b/i.test(trimmed)) return undefined;
  if (/linkedin|github|twitter|instagram|facebook/i.test(trimmed)) return undefined;
  const stateMatch = CITY_STATE_PATTERN.exec(trimmed);
  if (stateMatch) {
    const cityPart = (stateMatch[1] ?? '').trim();
    if (!isPlausibleCityName(cityPart)) return undefined;
    return trimmed;
  }
  const dashMatch = CITY_STATE_DASH_PATTERN.exec(trimmed);
  if (dashMatch) {
    const cityPart = (dashMatch[1] ?? '').trim();
    if (!isPlausibleCityName(cityPart)) return undefined;
    return trimmed;
  }
  const countryMatch = CITY_COUNTRY_PATTERN.exec(trimmed);
  if (countryMatch) {
    const cityPart = (countryMatch[1] ?? '').trim();
    if (!isPlausibleCityName(cityPart)) return undefined;
    return trimmed;
  }
  return undefined;
}

function toCombinedCity(line: string): { readonly city: string; readonly original: string } | undefined {
  const match = /([^,\n•·|—▪]+?)\s*[•·|—▪]\s*([A-Z]{2})\s*,\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,29})/.exec(line);
  if (!match) return undefined;
  const rawCity = (match[1] ?? '').trim().replace(/\s+/g, ' ');
  const state = match[2] ?? '';
  if (/\d/.test(rawCity)) return undefined;
  if (/\[.*REMOVED\]/.test(rawCity)) return undefined;
  if (!isPlausibleCityName(rawCity)) return undefined;
  return { city: `${rawCity}, ${state}`, original: match[0] };
}

function isPlausibleCityName(cityPart: string): boolean {
  if (cityPart.length < 2) return false;
  if (!/^[A-ZÀ-Þ]/u.test(cityPart)) return false;
  if (!/^[A-Za-zÀ-ÿ\s'’.-]+$/u.test(cityPart)) return false;
  if (/^(rua|av|avenida|alameda|travessa|rodovia|estrada|praça|largo|viela|beco)\b/i.test(cityPart)) {
    return false;
  }
  return true;
}

function extractCity(text: string, details: MutableDetails): string {
  const lines = text.split('\n');
  const firstSectionIndex = lines.findIndex((line) =>
    SECTION_HEADER_PATTERN.test(withoutHeadingMarker(line.trim())),
  );
  const headerLines = firstSectionIndex === -1 ? lines.slice(0, 10) : lines.slice(0, firstSectionIndex);
  for (const line of headerLines) {
    const cleaned = withoutHeadingMarker(line.trim());
    if (cleaned === '') continue;
    const combined = toCombinedCity(cleaned);
    if (combined !== undefined) {
      details.city = details.city ?? combined.city;
      text = text.replace(combined.original, CITY_MARKER);
      return text;
    }
    const segments = cleaned.split(CITY_SEPARATOR_PATTERN);
    for (const segment of segments) {
      const candidate = toCityCandidate(segment);
      if (candidate !== undefined) {
        details.city = details.city ?? candidate;
        text = text.replace(candidate, CITY_MARKER);
        return text;
      }
    }
  }
  return text;
}

const MAX_NAME_LENGTH = 40;
const MARKDOWN_HEADING_PREFIX = /^#{1,6}\s+/;

// The extractor emits markdown, so a real resume header arrives as "# MARIANA QUARTZ" and a
// section as "## SUMMARY". Left in place the hash rides into fullName and onto the review
// screen as part of the person's name, and no section header ever matches.
function withoutHeadingMarker(line: string): string {
  return line.replace(MARKDOWN_HEADING_PREFIX, '');
}

function isLikelyName(line: string): boolean {
  if (line.length > MAX_NAME_LENGTH) return false;
  if (/[@{}[\]$]/.test(line)) return false;
  if (/https?:\/\//.test(line)) return false;
  if (/\(\d{2}\)/.test(line)) return false;
  if (/\d{4,}/.test(line)) return false;
  if (/\.(com|org|net|br|io|dev)\b/i.test(line)) return false;
  if (/linkedin|github|twitter|instagram|facebook/i.test(line)) return false;
  if (/^\+?\d[\d\s.-]+$/.test(line)) return false;
  if (/\[.*REMOVED\]/.test(line)) return false;
  if (/\s{2,}/.test(line)) return false;
  if (/\d+\.\d/.test(line)) return false;
  if (/\d+%/.test(line)) return false;
  if (/\d+,\d/.test(line)) return false;
  if (/\.$/.test(line)) return false;
  return true;
}

function extractName(text: string, details: MutableDetails): string {
  const lines = text.split('\n');
  const firstSectionIndex = lines.findIndex((line) =>
    SECTION_HEADER_PATTERN.test(withoutHeadingMarker(line.trim())),
  );
  const headerEnd = firstSectionIndex === -1 ? 2 : firstSectionIndex;
  const scanLimit = Math.min(headerEnd, 2);
  const headerLines: string[] = [];
  for (let i = 0; i < scanLimit; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();
    const candidate = withoutHeadingMarker(trimmed);
    if (candidate && isLikelyName(candidate)) {
      // The whole original line is redacted, marker included; only the name is kept.
      headerLines.push(trimmed);
      details.fullName = details.fullName ?? candidate;
    }
  }
  for (const headerLine of headerLines) {
    text = text.replace(headerLine, NAME_MARKER);
  }
  return text;
}

interface MutableDetails {
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  links?: Array<{ readonly title: string | null; readonly url: string }>;
}

class DefaultContactStripper implements ContactStripper {
  strip(text: string): StrippedDocument {
    const details: MutableDetails = {};
    let result = text;
    result = extractEmails(result, details);
    result = extractPhones(result, details);
    result = extractUrls(result, details);
    result = extractAddress(result);
    result = extractCity(result, details);
    result = extractName(result, details);
    return {
      textWithoutContact: result,
      contactDetails: {
        fullName: details.fullName,
        email: details.email,
        phone: details.phone,
        city: details.city,
        links: details.links,
      },
    };
  }
}

export type { ContactDetails, ContactStripper, StrippedDocument };
export { DefaultContactStripper };
