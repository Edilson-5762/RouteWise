import { normalize } from '../utils/text';

export interface PlaceCategoryDefinition {
  keywords: string[];
  geoapifyCategory: string;
  categoryLabel: string;
}

// Palavras-chave já normalizadas (sem acento, minúsculas) — comparadas com
// `normalize(query)` em `matchPlaceCategory`. Códigos de categoria conforme
// a árvore hierárquica da Geoapify Places API (ver
// https://apidocs.geoapify.com/docs/places/#categories). Cobre os tipos de
// estabelecimento mais comuns em buscas de navegação no Brasil; não é uma
// lista exaustiva de todas as categorias da Geoapify.
export const PLACE_CATEGORIES: PlaceCategoryDefinition[] = [
  { keywords: ['farmacia'], geoapifyCategory: 'commercial.health_and_beauty.pharmacy', categoryLabel: 'Farmácia' },
  { keywords: ['hospital'], geoapifyCategory: 'healthcare.hospital', categoryLabel: 'Hospital' },
  {
    keywords: ['clinica', 'posto de saude'],
    geoapifyCategory: 'healthcare.clinic_or_praxis',
    categoryLabel: 'Clínica',
  },
  { keywords: ['restaurante'], geoapifyCategory: 'catering.restaurant', categoryLabel: 'Restaurante' },
  { keywords: ['lanchonete'], geoapifyCategory: 'catering.fast_food', categoryLabel: 'Lanchonete' },
  { keywords: ['bar'], geoapifyCategory: 'catering.bar', categoryLabel: 'Bar' },
  {
    keywords: ['padaria', 'panificadora'],
    geoapifyCategory: 'commercial.food_and_drink.bakery',
    categoryLabel: 'Padaria',
  },
  { keywords: ['acougue'], geoapifyCategory: 'commercial.food_and_drink.butcher', categoryLabel: 'Açougue' },
  {
    // Além da palavra genérica "banco", inclui marcas de bancos conhecidas
    // no Brasil: sozinhas (ex.: "bradesco", sem a cidade junto), a busca por
    // texto às vezes não acha a agência de verdade — confirmado testando
    // "bradesco" diretamente na API, que retornou um bairro de mesmo nome no
    // Pará em vez da agência no DF. Com a marca reconhecida como categoria,
    // a busca por proximidade (que não depende do nome bater) garante uma
    // agência bancária real e próxima como resultado, mesmo quando a busca
    // por texto erra o alvo.
    keywords: ['banco', 'bradesco', 'itau', 'santander', 'caixa economica', 'banco do brasil'],
    geoapifyCategory: 'service.financial.bank',
    categoryLabel: 'Banco',
  },
  { keywords: ['caixa eletronico'], geoapifyCategory: 'service.financial.atm', categoryLabel: 'Caixa eletrônico' },
  {
    keywords: ['posto de gasolina', 'posto de combustivel'],
    geoapifyCategory: 'service.vehicle.fuel',
    categoryLabel: 'Posto de combustível',
  },
  {
    keywords: ['supermercado', 'mercado'],
    geoapifyCategory: 'commercial.supermarket',
    categoryLabel: 'Supermercado',
  },
  { keywords: ['shopping'], geoapifyCategory: 'commercial.shopping_mall', categoryLabel: 'Shopping' },
  { keywords: ['escola'], geoapifyCategory: 'education.school', categoryLabel: 'Escola' },
  { keywords: ['academia'], geoapifyCategory: 'sport.fitness.gym', categoryLabel: 'Academia' },
  { keywords: ['hotel'], geoapifyCategory: 'accommodation.hotel', categoryLabel: 'Hotel' },
  { keywords: ['pousada'], geoapifyCategory: 'accommodation.guest_house', categoryLabel: 'Pousada' },
  { keywords: ['delegacia'], geoapifyCategory: 'service.police', categoryLabel: 'Delegacia' },
  { keywords: ['correios'], geoapifyCategory: 'service.post.office', categoryLabel: 'Correios' },
  { keywords: ['cinema'], geoapifyCategory: 'entertainment.cinema', categoryLabel: 'Cinema' },
  { keywords: ['parque'], geoapifyCategory: 'leisure.park', categoryLabel: 'Parque' },
  { keywords: ['barbearia'], geoapifyCategory: 'service.beauty.hairdresser', categoryLabel: 'Barbearia' },
  {
    keywords: ['salao de estetica', 'salao de beleza'],
    geoapifyCategory: 'service.beauty.spa',
    categoryLabel: 'Salão de beleza',
  },
  { keywords: ['orgao publico'], geoapifyCategory: 'office.government', categoryLabel: 'Órgão público' },
  // Categoria genérica: cobre qualquer estabelecimento comercial não listado
  // acima (a Geoapify aceita a categoria de nível superior "commercial" como
  // guarda-chuva de todas as suas subcategorias).
  { keywords: ['loja', 'comercio'], geoapifyCategory: 'commercial', categoryLabel: 'Loja' },
];

// Usa a palavra-chave mais longa (mais específica) entre todas as
// correspondências, não a primeira encontrada na lista — sem isso, uma
// palavra-chave curta que também é substring de outra mais específica (ex.:
// "bar" dentro de "barbearia") vence indevidamente dependendo só da ordem em
// que as categorias foram declaradas.
export function matchPlaceCategory(query: string): PlaceCategoryDefinition | null {
  const normalizedQuery = normalize(query);
  let best: { category: PlaceCategoryDefinition; keywordLength: number } | null = null;

  for (const category of PLACE_CATEGORIES) {
    for (const keyword of category.keywords) {
      if (normalizedQuery.includes(keyword) && (!best || keyword.length > best.keywordLength)) {
        best = { category, keywordLength: keyword.length };
      }
    }
  }

  return best?.category ?? null;
}
