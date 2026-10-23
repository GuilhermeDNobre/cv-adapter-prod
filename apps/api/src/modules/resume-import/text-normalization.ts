const LINE_BREAK_PATTERN = /\r\n?/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD]/g;
const HORIZONTAL_RUN_PATTERN = /[^\S\n]+/g;
const WHITESPACE_AROUND_LINE_BREAK_PATTERN = /[^\S\n]*(\n)[^\S\n]*/g;
const HYPHENATED_LINE_BREAK_PATTERN = /(?<=\S)-\n(?=[a-z\u00E0-\u00FF])/g;
const BLOCK_BREAK_PATTERN = /\n{3,}/g;

// The de-hyphenation only joins when the hyphen is glued to a word and the
// next line starts lowercase: justified PDF text splits "develop-\nment",
// while a real dash at the end of a line keeps its line break.
export function normalizeExtractedText(text: string): string {
  const unifiedLineEndings = text.replace(LINE_BREAK_PATTERN, '\n');
  const withoutControlChars = unifiedLineEndings.replace(CONTROL_CHAR_PATTERN, '');
  const collapsedRuns = withoutControlChars.replace(HORIZONTAL_RUN_PATTERN, ' ');
  const trimmedAroundLineBreaks = collapsedRuns.replace(WHITESPACE_AROUND_LINE_BREAK_PATTERN, '$1');
  const dehyphenated = trimmedAroundLineBreaks.replace(HYPHENATED_LINE_BREAK_PATTERN, '');
  return dehyphenated.replace(BLOCK_BREAK_PATTERN, '\n\n').trim();
}
