export interface Claim {
  readonly value: string;
  readonly kind: 'number' | 'term';
}

const COMBINING_DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
const TOKEN_PATTERN = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:[.'’\-/][A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*(?:\+\+|#)?/g;
const HAS_DIGIT_PATTERN = /[0-9]/;
const HAS_LETTER_PATTERN = /[A-Za-zÀ-ÖØ-öø-ÿ]/;
const HAS_LOWER_PATTERN = /[a-zà-öø-ÿ]/;
const UPPERCASE_BEYOND_FIRST_PATTERN = /[A-ZÀ-ÖØ-Þ]/;
const CAPITALIZED_PATTERN = /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]/;
const PURE_NUMBER_TOKEN_PATTERN = /^\d+(?:[.,]\d+)*$/;
const THOUSANDS_WITH_COMMA_PATTERN = /^\d{1,3}(,\d{3})+$/;
const THOUSANDS_WITH_DOT_PATTERN = /^\d{1,3}(\.\d{3})+$/;
const MAGNITUDE_WORD_PATTERN =
  /^(mil|milh(?:ao|oes|ão|ões)|bilh(?:ao|oes|ão|ões)|thousands?|millions?|billions?)$/i;

const NUMBER_CANDIDATE_PATTERN =
  /(?<![A-Za-zÀ-ÖØ-öø-ÿ0-9_])(?:R\$\s?|US\$\s?|\$\s?|€\s?|£\s?)?(\d+(?:[.,]\d+)*)(\s?%|\s*[kKmMbB])?(?:\s+(mil|milh(?:ao|oes|ão|ões)|bilh(?:ao|oes|ão|ões)|thousands?|millions?|billions?))?/g;

const THOUSAND_MULTIPLIER = 1000;
const MILLION_MULTIPLIER = 1000000;
const BILLION_MULTIPLIER = 1000000000;

export function findUnsupportedClaims(
  text: string,
  sources: readonly string[],
): readonly Claim[] {
  const sourceNumbers = new Set<string>();
  for (const source of sources) {
    for (const key of extractNumberKeys(source)) {
      sourceNumbers.add(key);
    }
  }
  const sourceTerms = new Set<string>();
  for (const source of sources) {
    for (const term of extractSourceTerms(source)) {
      sourceTerms.add(term);
    }
  }
  const unsupported: Claim[] = [];
  const seen = new Set<string>();
  for (const candidate of extractNumberCandidates(text)) {
    if (sourceNumbers.has(candidate.key)) {
      continue;
    }
    const seenKey = `number:${candidate.key}`;
    if (seen.has(seenKey)) {
      continue;
    }
    seen.add(seenKey);
    unsupported.push({ value: candidate.raw, kind: 'number' });
  }
  for (const candidate of extractTermCandidates(text)) {
    const normalized = normalizeToken(candidate);
    if (matchesSourceTerm(normalized, sourceTerms)) {
      continue;
    }
    const seenKey = `term:${normalized}`;
    if (seen.has(seenKey)) {
      continue;
    }
    seen.add(seenKey);
    unsupported.push({ value: candidate, kind: 'term' });
  }
  return unsupported;
}

interface NumberCandidate {
  readonly raw: string;
  readonly key: string;
}

function extractNumberKeys(text: string): string[] {
  const digitKeys = extractNumberCandidates(text).map((candidate) => candidate.key);
  return [...digitKeys, ...extractWordNumberKeys(text)];
}

function extractNumberCandidates(text: string): NumberCandidate[] {
  const candidates: NumberCandidate[] = [];
  NUMBER_CANDIDATE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NUMBER_CANDIDATE_PATTERN.exec(text)) !== null) {
    const raw = match[0].trim();
    const numericPart = match[1] ?? '';
    const suffixPart = (match[2] ?? '').trim();
    const wordPart = (match[3] ?? '').trim();
    const value = toNumberValue(numericPart, suffixPart, wordPart);
    if (Number.isNaN(value)) {
      continue;
    }
    const isPercentage = suffixPart.includes('%');
    candidates.push({ raw, key: `${String(value)}::${isPercentage ? 'pct' : 'num'}` });
  }
  return candidates;
}

function toNumberValue(numericPart: string, suffixPart: string, wordPart: string): number {
  const base = parseLocalizedNumber(numericPart);
  if (Number.isNaN(base)) {
    return Number.NaN;
  }
  return base * magnitudeMultiplier(suffixPart, wordPart);
}

function parseLocalizedNumber(raw: string): number {
  const hasDot = raw.includes('.');
  const hasComma = raw.includes(',');
  if (hasDot && hasComma) {
    const lastDot = raw.lastIndexOf('.');
    const lastComma = raw.lastIndexOf(',');
    const decimalSeparator = lastDot > lastComma ? '.' : ',';
    const thousandSeparator = decimalSeparator === '.' ? ',' : '.';
    const withoutThousands = raw.split(thousandSeparator).join('');
    const withDotDecimal = withoutThousands.replace(decimalSeparator, '.');
    return Number.parseFloat(withDotDecimal);
  }
  if (hasComma) {
    if (THOUSANDS_WITH_COMMA_PATTERN.test(raw)) {
      return Number.parseFloat(raw.split(',').join(''));
    }
    return Number.parseFloat(raw.replace(',', '.'));
  }
  if (hasDot) {
    if (THOUSANDS_WITH_DOT_PATTERN.test(raw)) {
      return Number.parseFloat(raw.split('.').join(''));
    }
    return Number.parseFloat(raw);
  }
  return Number.parseFloat(raw);
}

function magnitudeMultiplier(suffixPart: string, wordPart: string): number {
  const suffix = suffixPart.replace('%', '').trim().toLowerCase();
  if (suffix === 'k') {
    return THOUSAND_MULTIPLIER;
  }
  if (suffix === 'm') {
    return MILLION_MULTIPLIER;
  }
  if (suffix === 'b') {
    return BILLION_MULTIPLIER;
  }
  const word = wordPart.toLowerCase();
  if (word === '') {
    return 1;
  }
  if (word === 'mil' || word === 'thousand' || word === 'thousands') {
    return THOUSAND_MULTIPLIER;
  }
  if (MAGNITUDE_WORD_PATTERN.test(word)) {
    if (word.startsWith('bilh') || word.startsWith('billi')) {
      return BILLION_MULTIPLIER;
    }
    return MILLION_MULTIPLIER;
  }
  return 1;
}

const WORD_UNIT_VALUES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, um: 1, uma: 1, dois: 2, duas: 2,
  tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
  trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90, duzentos: 200, trezentos: 300, quatrocentos: 400,
  quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800,
  novecentos: 900,
};

const HUNDRED_WORDS = new Set(['hundred', 'cem', 'cento']);

const WORD_MAGNITUDE_VALUES: Record<string, number> = {
  thousand: 1000, thousands: 1000, mil: 1000, million: 1000000,
  millions: 1000000, milhao: 1000000, milhoes: 1000000, billion: 1000000000,
  billions: 1000000000, bilhao: 1000000000, bilhoes: 1000000000,
};

function extractWordTokens(text: string): string[] {
  const words = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g) ?? [];
  return words.map((word) =>
    word.toLowerCase().normalize('NFD').replace(COMBINING_DIACRITICS_PATTERN, ''),
  );
}

function parseWordNumberAt(
  tokens: readonly string[],
  start: number,
): { value: number; next: number } | undefined {
  let total = 0;
  let current = 0;
  let index = start;
  let seen = false;
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (token === 'e' || token === 'and') {
      const next = tokens[index + 1];
      if (!seen || next === undefined || !isWordNumberToken(next)) {
        break;
      }
      index += 1;
      continue;
    }
    if (token in WORD_UNIT_VALUES) {
      current += WORD_UNIT_VALUES[token]!;
      seen = true;
      index += 1;
      continue;
    }
    if (HUNDRED_WORDS.has(token)) {
      current = current === 0 ? 100 : current * 100;
      seen = true;
      index += 1;
      continue;
    }
    if (token in WORD_MAGNITUDE_VALUES) {
      const base = current === 0 ? 1 : current;
      total += base * WORD_MAGNITUDE_VALUES[token]!;
      current = 0;
      seen = true;
      index += 1;
      continue;
    }
    break;
  }
  if (!seen) {
    return undefined;
  }
  return { value: total + current, next: index };
}

function isWordNumberToken(token: string): boolean {
  return token in WORD_UNIT_VALUES || HUNDRED_WORDS.has(token) || token in WORD_MAGNITUDE_VALUES;
}

function wordPercentSuffix(tokens: readonly string[], index: number): number {
  const first = tokens[index];
  if (first === 'percent' || first === 'percentage' || first === 'porcento') {
    return 1;
  }
  if (first === 'por' && tokens[index + 1] === 'cento') {
    return 2;
  }
  return 0;
}

function extractWordNumberKeys(text: string): string[] {
  const tokens = extractWordTokens(text);
  const keys: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const parsed = parseWordNumberAt(tokens, index);
    if (parsed === undefined) {
      index += 1;
      continue;
    }
    const suffix = wordPercentSuffix(tokens, parsed.next);
    keys.push(`${String(parsed.value)}::${suffix > 0 ? 'pct' : 'num'}`);
    index = parsed.next + suffix;
  }
  return keys;
}

function extractSourceTerms(text: string): string[] {
  const terms: string[] = [];
  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    const token = match[0];
    if (token.length <= 1) {
      continue;
    }
    if (PURE_NUMBER_TOKEN_PATTERN.test(token)) {
      continue;
    }
    const normalized = normalizeToken(token);
    terms.push(normalized);
    for (const part of token.split(/[.'’\-/]/)) {
      if (part.length > 1 && !PURE_NUMBER_TOKEN_PATTERN.test(part)) {
        terms.push(normalizeToken(part));
      }
    }
  }
  return terms;
}

function extractTermCandidates(text: string): string[] {
  const candidates: string[] = [];
  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    const token = match[0];
    const index = match.index;
    if (token.length <= 1) {
      continue;
    }
    if (PURE_NUMBER_TOKEN_PATTERN.test(token)) {
      continue;
    }
    if (isClaimToken(token, text, index)) {
      candidates.push(token);
    }
  }
  return candidates;
}

function isClaimToken(token: string, text: string, index: number): boolean {
  const hasDigit = HAS_DIGIT_PATTERN.test(token);
  const hasLetter = HAS_LETTER_PATTERN.test(token);
  if (hasDigit && hasLetter) {
    return true;
  }
  if (isAcronym(token)) {
    return !isCurrencyCode(token, text, index);
  }
  if (token.includes('.') && (UPPERCASE_BEYOND_FIRST_PATTERN.test(token) || hasDigit)) {
    return true;
  }
  if (
    HAS_LOWER_PATTERN.test(token) &&
    UPPERCASE_BEYOND_FIRST_PATTERN.test(token.slice(1))
  ) {
    return true;
  }
  if (CAPITALIZED_PATTERN.test(token) && !isSentenceStart(text, index)) {
    return true;
  }
  return false;
}

function isAcronym(token: string): boolean {
  const lettersOnly = token.replace(/[^A-Za-zÀ-ÖØ-Þ]/g, '');
  return lettersOnly.length >= 2 && !HAS_LOWER_PATTERN.test(lettersOnly);
}

function isCurrencyCode(token: string, text: string, index: number): boolean {
  const after = text.slice(index + token.length).trimStart();
  return after.startsWith('$');
}

function isSentenceStart(text: string, tokenIndex: number): boolean {
  const prefix = text.slice(0, tokenIndex);
  if (prefix.trim() === '') {
    return true;
  }
  const lastNewline = prefix.lastIndexOf('\n');
  const linePrefix = lastNewline === -1 ? prefix : prefix.slice(lastNewline + 1);
  if (/^[\s•\-*>\"'“”‘’()[\]]*$/.test(linePrefix)) {
    return true;
  }
  let cursor = tokenIndex - 1;
  while (cursor >= 0) {
    const char = text[cursor];
    if (char === ' ' || char === '\t' || char === '"' || char === "'" || char === '“' || char === '”' || char === '‘' || char === '’' || char === ')' || char === ']') {
      cursor -= 1;
      continue;
    }
    if (char === '\n') {
      return true;
    }
    return char === '.' || char === '!' || char === '?' || char === '…';
  }
  return true;
}

function matchesSourceTerm(normalized: string, sourceTerms: ReadonlySet<string>): boolean {
  if (sourceTerms.has(normalized)) {
    return true;
  }
  if (normalized.endsWith('s')) {
    const singular = normalized.slice(0, -1);
    if (singular.length > 1 && sourceTerms.has(singular)) {
      return true;
    }
    return false;
  }
  return sourceTerms.has(`${normalized}s`);
}

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_PATTERN, '');
}
