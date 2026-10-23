const PORTUGUESE_MARKERS = new Set([
  'o', 'os', 'uma', 'do', 'da', 'dos', 'das', 'dum', 'duma',
  'no', 'na', 'nos', 'nas', 'num', 'numa', 'pelo', 'pela', 'pelos', 'pelas',
  'com', 'para', 'entre', 'sobre', 'sem', 'que', 'qual', 'quais', 'como',
  'mais', 'foi', 'foram', 'sou', 'somos', 'são', 'esta', 'este', 'isto', 'isso',
  'mas', 'não', 'também', 'onde', 'quando', 'meu', 'minha', 'seus', 'suas',
  'nosso', 'nossa', 'ele', 'ela', 'eles', 'elas', 'seu', 'sua', 'lhe', 'lhes',
  'porque', 'através', 'gerenciei', 'liderei', 'entreguei', 'responsável',
  'equipe', 'empresa', 'atuação', 'formação', 'experiência', 'habilidades',
]);

const ENGLISH_MARKERS = new Set([
  'the', 'and', 'with', 'from', 'that', 'this', 'these', 'those', 'have', 'has',
  'were', 'was', 'are', 'been', 'their', 'our', 'your', 'they', 'them', 'then',
  'than', 'which', 'while', 'through', 'within', 'team', 'led', 'shipped',
  'built', 'managed', 'delivered', 'across', 'including', 'using', 'worked',
  'experience', 'skills', 'summary', 'engineer', 'company',
]);

export type DetectedLanguage = 'pt' | 'en' | 'unknown';

export function detectTextLanguage(text: string): DetectedLanguage {
  const words = text
    .toLowerCase()
    .split(/[^a-zà-úâêôãõç]+/u)
    .filter((word) => word !== '');
  if (words.length === 0) {
    return 'unknown';
  }
  let portugueseHits = 0;
  let englishHits = 0;
  for (const word of words) {
    if (PORTUGUESE_MARKERS.has(word)) {
      portugueseHits += 1;
    }
    if (ENGLISH_MARKERS.has(word)) {
      englishHits += 1;
    }
  }
  if (portugueseHits === 0 && englishHits === 0) {
    return 'unknown';
  }
  if (portugueseHits > englishHits) {
    return 'pt';
  }
  if (englishHits > portugueseHits) {
    return 'en';
  }
  return 'unknown';
}

export function needsTranslation(text: string, target: 'pt' | 'en'): boolean {
  const detected = detectTextLanguage(text);
  return detected !== 'unknown' && detected !== target;
}
