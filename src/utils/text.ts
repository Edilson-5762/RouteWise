const COMBINING_DIACRITICS_PATTERN = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
);

export function normalize(text: string): string {
  return text.normalize('NFD').replace(COMBINING_DIACRITICS_PATTERN, '').toLowerCase().trim();
}
