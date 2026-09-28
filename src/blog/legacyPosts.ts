export const GARYS_GUIDE_SLUG = 'garys-economics-guide';

/** Preserve links to the original fourteen articles at their consolidated chapters. */
export const legacyGarysChapters: Readonly<Record<string, string>> = Object.freeze({
  'garys-understand-economy-1-what-is-wealth': 'wealth',
  'garys-understand-economy-2-wealth-inequality': 'wealth-inequality',
  'garys-understand-economy-3-why-inequality-ignored': 'why-inequality-ignored',
  'garys-understand-economy-4-inequality-driving-everything': 'inequality-driving-everything',
  'garys-compound-interest': 'compound-interest',
  'garys-how-to-get-rich': 'how-to-get-rich',
  'garys-future-of-house-prices': 'future-of-house-prices',
  'garys-money-obsession': 'money-obsession',
  'garys-squeeze-out': 'squeeze-out',
  'garys-labour-and-trump-will-fail': 'labour-and-trump-will-fail',
  'garys-trump-tariff-week': 'trump-tariff-week',
  'garys-iran-economic-shock': 'iran-economic-shock',
  'garys-elon-musk': 'elon-musk',
  'garys-stop-economy-collapsing': 'stop-economy-collapsing',
});

export function legacyGarysChapter(slug: string): string | undefined {
  return Object.hasOwn(legacyGarysChapters, slug) ? legacyGarysChapters[slug] : undefined;
}
