import { normalize } from '../utils/text';

// `value: ''` significa "a chave existe, com qualquer valor" — usado para
// categorias genéricas do OSM que não têm um único valor de tag (ex.:
// `shop` cobre desde "clothes" até "hairdresser"). Ver `overpassClient.ts`
// para como isso vira um filtro Overpass sem `=valor`.
export interface OsmTag {
  key: string;
  value: string;
}

export interface PlaceCategoryDefinition {
  keywords: string[];
  osmTag: OsmTag;
  categoryLabel: string;
}

// Palavras-chave já normalizadas (sem acento, minúsculas) — comparadas com
// `normalize(query)` em `matchPlaceCategory`. Cobre os tipos de
// estabelecimento mais comuns em buscas de navegação no Brasil; não é uma
// lista exaustiva de todas as tags do OSM.
export const PLACE_CATEGORIES: PlaceCategoryDefinition[] = [
  { keywords: ['farmacia'], osmTag: { key: 'amenity', value: 'pharmacy' }, categoryLabel: 'Farmácia' },
  { keywords: ['hospital'], osmTag: { key: 'amenity', value: 'hospital' }, categoryLabel: 'Hospital' },
  { keywords: ['clinica'], osmTag: { key: 'amenity', value: 'clinic' }, categoryLabel: 'Clínica' },
  { keywords: ['restaurante'], osmTag: { key: 'amenity', value: 'restaurant' }, categoryLabel: 'Restaurante' },
  { keywords: ['lanchonete'], osmTag: { key: 'amenity', value: 'fast_food' }, categoryLabel: 'Lanchonete' },
  { keywords: ['padaria'], osmTag: { key: 'shop', value: 'bakery' }, categoryLabel: 'Padaria' },
  { keywords: ['banco'], osmTag: { key: 'amenity', value: 'bank' }, categoryLabel: 'Banco' },
  { keywords: ['caixa eletronico'], osmTag: { key: 'amenity', value: 'atm' }, categoryLabel: 'Caixa eletrônico' },
  {
    keywords: ['posto de gasolina', 'posto de combustivel'],
    osmTag: { key: 'amenity', value: 'fuel' },
    categoryLabel: 'Posto de combustível',
  },
  {
    keywords: ['supermercado', 'mercado'],
    osmTag: { key: 'shop', value: 'supermarket' },
    categoryLabel: 'Supermercado',
  },
  { keywords: ['shopping'], osmTag: { key: 'shop', value: 'mall' }, categoryLabel: 'Shopping' },
  { keywords: ['escola'], osmTag: { key: 'amenity', value: 'school' }, categoryLabel: 'Escola' },
  { keywords: ['academia'], osmTag: { key: 'leisure', value: 'fitness_centre' }, categoryLabel: 'Academia' },
  { keywords: ['hotel'], osmTag: { key: 'tourism', value: 'hotel' }, categoryLabel: 'Hotel' },
  { keywords: ['pousada'], osmTag: { key: 'tourism', value: 'guest_house' }, categoryLabel: 'Pousada' },
  { keywords: ['delegacia'], osmTag: { key: 'amenity', value: 'police' }, categoryLabel: 'Delegacia' },
  { keywords: ['correios'], osmTag: { key: 'amenity', value: 'post_office' }, categoryLabel: 'Correios' },
  { keywords: ['cinema'], osmTag: { key: 'amenity', value: 'cinema' }, categoryLabel: 'Cinema' },
  { keywords: ['parque'], osmTag: { key: 'leisure', value: 'park' }, categoryLabel: 'Parque' },
  { keywords: ['loja', 'comercio'], osmTag: { key: 'shop', value: '' }, categoryLabel: 'Loja' },
];

export function matchPlaceCategory(query: string): PlaceCategoryDefinition | null {
  const normalizedQuery = normalize(query);
  return (
    PLACE_CATEGORIES.find((category) =>
      category.keywords.some((keyword) => normalizedQuery.includes(keyword)),
    ) ?? null
  );
}
