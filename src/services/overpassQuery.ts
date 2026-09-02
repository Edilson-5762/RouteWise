import { DF_BOUNDING_BOX } from '../data/dfBounds';

// Campos de nome do OSM consultados na busca de reforço. `name` primeiro;
// os demais pegam nome oficial/antigo/curto/apelido/marca — é onde mora o
// lugar pequeno ou com nome desatualizado que a Geoapify não devolve.
const NAME_KEYS_REGEX =
  '^(name|name:pt|alt_name|old_name|short_name|official_name|loc_name|brand)$';

// Caracteres com significado especial em regex POSIX (o dialeto do
// Overpass). Escapados com `\` antes de virarem parte do padrão.
const REGEX_META = new Set(['.', '*', '+', '?', '(', ')', '[', ']', '{', '}', '^', '$', '|', '\\']);

// Cada letra que tem formas acentuadas vira uma classe que casa todas
// elas. O termo já chega normalizado (sem acento), então isto serve para
// o padrão casar o valor ACENTUADO que está no OSM ("guara" casar
// "Guará"). O flag `,i` na query cuida de maiúsculas/minúsculas.
const ACCENT_CLASS: Record<string, string> = {
  a: 'aáàâãä',
  e: 'eéèêë',
  i: 'iíìî',
  o: 'oóòôõ',
  u: 'uúùû',
  c: 'cç',
  n: 'nñ',
};

export function toAccentInsensitivePattern(term: string): string {
  return term
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      [...word]
        .map((ch) => {
          if (REGEX_META.has(ch)) return `\\${ch}`;
          if (ACCENT_CLASS[ch]) return `[${ACCENT_CLASS[ch]}]`;
          return ch;
        })
        .join(''),
    )
    .join('\\s+');
}

export function buildOverpassQuery(pattern: string): string {
  const { south, west, north, east } = DF_BOUNDING_BOX;
  return (
    '[out:json][timeout:25];' +
    `nwr[~"${NAME_KEYS_REGEX}"~"${pattern}",i](${south},${west},${north},${east});` +
    'out center 30;'
  );
}
