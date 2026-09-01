import type { Coordinates, PlaceSuggestion } from '../types';
import { normalize } from '../utils/text';
import { haversineDistanceMeters } from '../utils/distance';
import { DF_HEALTH_UNITS } from './dfHealthUnits.generated';

export type DfHealthUnitKind =
  'UBS' | 'Posto' | 'Hospital' | 'UPA' | 'CAPS' | 'Pronto-Socorro' | 'Unidade Mista';

// Uma unidade pública de saúde do DF, destilada do CNES/DATASUS pelo
// script `scripts/generate-unidades-saude.mjs`. Ver
// `src/data/dfHealthUnits.generated.ts` (dados) e a função
// `searchDfHealthUnits` (busca local em cima desses dados).
export interface DfHealthUnit {
  /** `cnes-${CO_CNES}` — ou `manual-*` para entradas de override. */
  id: string;
  /** Rótulo pronto para a lista de sugestões ("Nome, Rua, Bairro, Brasília - DF"). */
  displayName: string;
  kind: DfHealthUnitKind;
  /** Região Administrativa, ex.: "Guará". */
  ra: string;
  /** Sempre presente — unidades sem coordenada utilizável são excluídas na geração. */
  coordinates: Coordinates;
  /** String normalizada com nome + apelidos; casada por substring de token. */
  searchText: string;
}

// Espelha scripts/lib/unidadesSaude.mjs — mudou lá, mude aqui.
const ROMAN_BY_DIGIT: Record<string, string> = {
  '1': 'i',
  '2': 'ii',
  '3': 'iii',
  '4': 'iv',
  '5': 'v',
  '6': 'vi',
  '7': 'vii',
  '8': 'viii',
  '9': 'ix',
  '10': 'x',
  '11': 'xi',
  '12': 'xii',
  '13': 'xiii',
  '14': 'xiv',
  '15': 'xv',
};
const WRITTEN_BY_DIGIT: Record<string, string> = {
  '1': 'um',
  '2': 'dois',
  '3': 'tres',
  '4': 'quatro',
  '5': 'cinco',
  '6': 'seis',
  '7': 'sete',
  '8': 'oito',
  '9': 'nove',
  '10': 'dez',
  '11': 'onze',
  '12': 'doze',
  '13': 'treze',
  '14': 'quatorze',
  '15': 'quinze',
};
const DIGIT_BY_ROMAN = Object.fromEntries(Object.entries(ROMAN_BY_DIGIT).map(([d, r]) => [r, d]));
const DIGIT_BY_WRITTEN = Object.fromEntries(
  Object.entries(WRITTEN_BY_DIGIT).map(([d, w]) => [w, d]),
);

// Todas as grafias equivalentes de um token, se ele for um número
// (dígito / com zero à esquerda / romano / por extenso). Senão, `[token]`.
export function numberVariants(token: string): string[] {
  const t = normalize(token);
  let digit: string | null = null;
  if (/^\d{1,2}$/.test(t)) digit = String(parseInt(t, 10));
  else if (DIGIT_BY_ROMAN[t]) digit = DIGIT_BY_ROMAN[t];
  else if (DIGIT_BY_WRITTEN[t]) digit = DIGIT_BY_WRITTEN[t];
  if (!digit) return [t];
  const out = new Set<string>([t, digit, digit.padStart(2, '0')]);
  if (ROMAN_BY_DIGIT[digit]) out.add(ROMAN_BY_DIGIT[digit]);
  if (WRITTEN_BY_DIGIT[digit]) out.add(WRITTEN_BY_DIGIT[digit]);
  return [...out];
}

// Palavras de tipo/genéricas: sozinhas não distinguem uma unidade.
const GENERIC_TOKENS = new Set([
  'ubs',
  'upa',
  'caps',
  'ps',
  'posto',
  'hospital',
  'unidade',
  'basica',
  'de',
  'da',
  'do',
  'dos',
  'das',
  'centro',
  'saude',
  'regional',
  'pronto',
  'socorro',
  'atendimento',
  'mista',
  'policlinica',
  'samu',
  'e',
]);
// Pelo menos uma destas precisa aparecer para a busca local entrar em
// ação (sinal de que a pessoa procura uma unidade de saúde).
const TYPE_ANCHORS = new Set([
  'ubs',
  'upa',
  'caps',
  'hospital',
  'posto',
  'policlinica',
  'pronto',
  'socorro',
  'saude',
  'samu',
]);

// Casa o cadastro local de unidades de saúde do DF contra o texto
// digitado. Pura e síncrona — não faz rede, não lança. Retorna [] quando
// a query é vazia, genérica demais, ou não parece uma busca por unidade
// de saúde.
export function searchDfHealthUnits(
  query: string,
  proximity: Coordinates | null,
  limit = 6,
): PlaceSuggestion[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const hasAnchor = tokens.some((t) => TYPE_ANCHORS.has(t));
  const hasDistinctive = tokens.some((t) => !GENERIC_TOKENS.has(t) || /^\d/.test(t));
  if (!hasAnchor || !hasDistinctive) return [];

  const tokenGroups = tokens.map((t) => numberVariants(t));
  const matches = DF_HEALTH_UNITS.filter((unit) =>
    tokenGroups.every((group) => group.some((v) => unit.searchText.includes(v))),
  );

  const ranked = matches.slice().sort((a, b) => {
    if (proximity) {
      return (
        haversineDistanceMeters(proximity, a.coordinates) -
        haversineDistanceMeters(proximity, b.coordinates)
      );
    }
    if (a.searchText.length !== b.searchText.length) {
      return a.searchText.length - b.searchText.length;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return ranked.slice(0, limit).map((unit) => ({
    id: unit.id,
    placeName: unit.displayName,
    coordinates: unit.coordinates,
  }));
}
