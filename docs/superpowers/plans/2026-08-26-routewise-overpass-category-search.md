# Plano de Implementação — Busca híbrida Mapbox + Overpass (categorias de estabelecimento)

> **Para quem for executar:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Fazer a busca de destino do RouteWise rotear automaticamente entre dois provedores gratuitos: a Search Box API do Mapbox (já existente, para endereços/cidades/estados) e a Overpass API do OpenStreetMap (nova, para categorias de estabelecimento como farmácia, hospital, restaurante, banco etc.), sem exigir chave de API nem faturamento adicional — a Google Places API foi descartada por bloqueio persistente (`OR_BACR2_44`) na ativação do faturamento do Google Cloud.

**Arquitetura:** A decisão de qual provedor usar acontece no hook `useGeocodingSearch`: a cada busca, a query é testada contra um dicionário local de categorias (`src/data/placeCategories.ts`); se houver correspondência, a busca vai para um novo serviço `src/services/overpassClient.ts` (Overpass API, sem chave); caso contrário, mantém-se o fluxo Mapbox existente (`src/services/mapboxClient.ts`), inalterado. Os dois provedores devolvem o mesmo tipo `PlaceSuggestion` já usado hoje, então `SearchBar.tsx` e o resto da UI não precisam mudar.

**Tech Stack:** TypeScript (`strict`), React 18, Vitest + Testing Library (mesma stack já usada no projeto). Nenhuma dependência nova — Overpass é uma API REST pública sem SDK.

**Spec:** [docs/superpowers/specs/2026-08-22-routewise-gps-design.md](../specs/2026-08-22-routewise-gps-design.md) — esta funcionalidade específica (roteamento de busca por categoria via Overpass) não está descrita nesse spec; ela nasceu de uma decisão tomada em conversa direta com o usuário depois que a integração com a Google Places API se mostrou inviável (bloqueio de faturamento no Google Cloud). O restante do comportamento de busca (idioma pt, país=br, viés de proximidade, gazetteer local de RAs do DF) continua regido pelo spec original e não muda neste plano.

## Restrições Globais

- Todo texto voltado ao usuário e todo comentário de código devem estar em português, seguindo o padrão já usado em `mapboxClient.ts` e `dfAdministrativeRegions.ts`.
- TypeScript em modo `strict`; nenhum `any` implícito.
- A Overpass API é pública e não exige chave — nenhuma variável de ambiente nova, nenhuma alteração em `.env.example`.
- Quando a query do usuário corresponder a uma categoria conhecida (`matchPlaceCategory`), a busca deve ir para a Overpass API; caso contrário, o fluxo Mapbox existente permanece exatamente como está hoje (nenhuma regressão nos testes já existentes de `mapboxClient.test.ts` e `useGeocodingSearch.test.ts`).
- Todo o trabalho deste plano acontece dentro do worktree `.worktrees/routewise-mvp` (branch `feature/routewise-mvp`) — é onde o código-fonte do app vive; todos os caminhos de arquivo abaixo são relativos à raiz desse worktree.
- Cada tarefa deve terminar com o pipeline local passando: `npm run lint`, `npx tsc -b` e `npm run test`.

---

## Tarefa 1: Extrair `normalize()` para um util compartilhado

**Contexto:** `mapboxClient.ts` já tem uma função privada `normalize()` (remove acentos, minúsculas, trim) usada para casar buscas com o gazetteer local de Regiões Administrativas do DF. O dicionário de categorias (Tarefa 2) precisa da mesma normalização para casar "farmácia"/"Farmácia"/"FARMÁCIA" com a chave `farmacia`. Em vez de duplicar a função, ela é extraída para um util compartilhado.

**Arquivos:**
- Criar: `src/utils/text.ts`
- Criar: `src/utils/text.test.ts`
- Modificar: `src/services/mapboxClient.ts` (remove a função local `normalize` e o padrão de diacríticos que ela usa; importa `normalize` do novo util)

**Interfaces:**
- Produz: `normalize(text: string): string` — remove acentos (NFD + remoção de diacríticos combinantes), converte para minúsculas, remove espaços nas extremidades.

- [ ] **Passo 1: Criar `src/utils/text.ts`**

```ts
const COMBINING_DIACRITICS_PATTERN = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
);

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_PATTERN, '')
    .toLowerCase()
    .trim();
}
```

- [ ] **Passo 2: Criar `src/utils/text.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { normalize } from './text';

describe('normalize', () => {
  it('remove acentos e converte para minúsculas', () => {
    expect(normalize('Farmácia')).toBe('farmacia');
    expect(normalize('São Paulo')).toBe('sao paulo');
  });

  it('remove espaços nas extremidades', () => {
    expect(normalize('  Brasília  ')).toBe('brasilia');
  });
});
```

- [ ] **Passo 3: Rodar os testes novos**

Run: `npm run test -- src/utils/text.test.ts`
Expected: 2 testes passando.

- [ ] **Passo 4: Atualizar `src/services/mapboxClient.ts` para importar `normalize` do util**

No topo do arquivo, adicione o import:

```ts
import { normalize } from '../utils/text';
```

Remova do arquivo a declaração local de `COMBINING_DIACRITICS_PATTERN` e a função `normalize` (o bloco que hoje começa em `const COMBINING_DIACRITICS_PATTERN = new RegExp(...)` e termina no `}` de fechamento de `function normalize(text: string): string { ... }`). O restante do arquivo (que já chama `normalize(...)`) não muda.

- [ ] **Passo 5: Rodar a suíte completa para confirmar que nada quebrou**

Run: `npm run test -- src/services/mapboxClient.test.ts`
Expected: todos os testes (já existentes) continuam passando, sem nenhuma alteração de comportamento.

- [ ] **Passo 6: Lint e typecheck**

Run: `npm run lint && npx tsc -b`
Expected: sem erros.

- [ ] **Passo 7: Commit**

```bash
git add src/utils/text.ts src/utils/text.test.ts src/services/mapboxClient.ts
git commit -m "refactor: extrair normalize() de mapboxClient para util compartilhado"
```

---

## Tarefa 2: Dicionário de categorias de estabelecimento

**Contexto:** Precisamos de uma forma de decidir, a partir do texto digitado pelo usuário, se a busca é por um endereço/localidade (Mapbox) ou por um tipo de estabelecimento (Overpass). Este arquivo define esse mapeamento: palavra-chave em português → tag do OpenStreetMap.

**Arquivos:**
- Criar: `src/data/placeCategories.ts`
- Criar: `src/data/placeCategories.test.ts`

**Interfaces:**
- Consome: `normalize` de `src/utils/text.ts` (Tarefa 1).
- Produz: `interface OsmTag { key: string; value: string }` (valor `''` significa "a chave existe, qualquer valor" — ex.: qualquer node com a tag `shop`, usado para "loja"/"comércio" genérico).
- Produz: `interface PlaceCategoryDefinition { keywords: string[]; osmTag: OsmTag; categoryLabel: string }`.
- Produz: `matchPlaceCategory(query: string): PlaceCategoryDefinition | null` — usado pela Tarefa 4.

- [ ] **Passo 1: Criar `src/data/placeCategories.ts`**

```ts
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
```

- [ ] **Passo 2: Criar `src/data/placeCategories.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { matchPlaceCategory } from './placeCategories';

describe('matchPlaceCategory', () => {
  it('reconhece "farmácia" (com acento) como categoria Farmácia', () => {
    const category = matchPlaceCategory('farmácia');
    expect(category?.categoryLabel).toBe('Farmácia');
    expect(category?.osmTag).toEqual({ key: 'amenity', value: 'pharmacy' });
  });

  it('reconhece a categoria mesmo com texto adicional na busca', () => {
    expect(matchPlaceCategory('farmácia 24 horas')?.categoryLabel).toBe('Farmácia');
    expect(matchPlaceCategory('hospital perto de mim')?.categoryLabel).toBe('Hospital');
  });

  it('reconhece palavras-chave com mais de uma palavra', () => {
    expect(matchPlaceCategory('posto de gasolina')?.categoryLabel).toBe('Posto de combustível');
  });

  it('retorna null para uma busca de endereço comum', () => {
    expect(matchPlaceCategory('Rua das Flores, 123')).toBeNull();
    expect(matchPlaceCategory('Águas Claras')).toBeNull();
  });

  it('usa o filtro de existência de chave (sem valor) para "loja"', () => {
    expect(matchPlaceCategory('loja')?.osmTag).toEqual({ key: 'shop', value: '' });
  });
});
```

- [ ] **Passo 3: Rodar os testes**

Run: `npm run test -- src/data/placeCategories.test.ts`
Expected: 5 testes passando.

- [ ] **Passo 4: Lint e typecheck**

Run: `npm run lint && npx tsc -b`
Expected: sem erros.

- [ ] **Passo 5: Commit**

```bash
git add src/data/placeCategories.ts src/data/placeCategories.test.ts
git commit -m "feat: adicionar dicionario de categorias de estabelecimento (OSM)"
```

---

## Tarefa 3: Cliente da Overpass API

**Contexto:** Serviço que busca estabelecimentos por categoria na Overpass API (OpenStreetMap), pública e sem chave. Segue o mesmo padrão de `mapboxClient.ts`: funções puras, `fetch` direto, um erro tipado próprio, conversão para `PlaceSuggestion`.

**Arquivos:**
- Criar: `src/services/overpassClient.ts`
- Criar: `src/services/overpassClient.test.ts`

**Interfaces:**
- Consome: `PlaceCategoryDefinition`, `OsmTag` de `src/data/placeCategories.ts` (Tarefa 2).
- Consome: `haversineDistanceMeters` de `src/utils/distance.ts` (já existe).
- Consome: `Coordinates`, `PlaceSuggestion` de `src/types/index.ts` (já existem).
- Produz: `class OverpassRequestError extends Error`.
- Produz: `searchPlacesByCategory(category: PlaceCategoryDefinition, proximity: Coordinates | null): Promise<PlaceSuggestion[]>` — usado pela Tarefa 4.

- [ ] **Passo 1: Criar `src/services/overpassClient.ts`**

```ts
import type { Coordinates, PlaceSuggestion } from '../types';
import type { OsmTag, PlaceCategoryDefinition } from '../data/placeCategories';
import { haversineDistanceMeters } from '../utils/distance';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const SEARCH_RADIUS_METERS = 8000;
const OVERPASS_ELEMENT_LIMIT = 20;
const MAX_SUGGESTIONS = 8;

// Fallback usado só quando a busca por categoria acontece sem localização
// atual conhecida — evita uma query Overpass sem `around` (que devolveria
// estabelecimentos do mundo inteiro). Mesmo ponto usado como centro do DF em
// `data/dfAdministrativeRegions.ts` (Plano Piloto).
const DEFAULT_SEARCH_CENTER: Coordinates = { lat: -15.7939, lng: -47.8828 };

export class OverpassRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverpassRequestError';
  }
}

function buildTagFilter(tag: OsmTag): string {
  return tag.value ? `["${tag.key}"="${tag.value}"]` : `["${tag.key}"]`;
}

function buildOverpassQuery(tag: OsmTag, center: Coordinates, radiusMeters: number): string {
  const filter = buildTagFilter(tag);
  const around = `(around:${radiusMeters},${center.lat},${center.lng})`;
  return `[out:json][timeout:10];(node${filter}${around};way${filter}${around};);out center ${OVERPASS_ELEMENT_LIMIT};`;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function elementCoordinates(element: OverpassElement): Coordinates | null {
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return { lat: element.lat, lng: element.lon };
  }
  if (element.center) {
    return { lat: element.center.lat, lng: element.center.lon };
  }
  return null;
}

// Anexa rua/número/bairro ao nome quando o OSM tiver esses dados — sem eles,
// o rótulo cai para só o nome do estabelecimento (ainda assim útil, já que
// o usuário reconhece o nome do lugar que buscou).
function buildOverpassPlaceLabel(tags: Record<string, string>): string {
  const streetAndNumber =
    tags['addr:street'] && tags['addr:housenumber']
      ? `${tags['addr:street']}, ${tags['addr:housenumber']}`
      : tags['addr:street'];
  const addressParts = [streetAndNumber, tags['addr:suburb']].filter(
    (part): part is string => Boolean(part),
  );
  return addressParts.length > 0 ? `${tags.name}, ${addressParts.join(', ')}` : tags.name;
}

interface RankedSuggestion {
  suggestion: PlaceSuggestion;
  distanceMeters: number;
}

export async function searchPlacesByCategory(
  category: PlaceCategoryDefinition,
  proximity: Coordinates | null,
): Promise<PlaceSuggestion[]> {
  const center = proximity ?? DEFAULT_SEARCH_CENTER;
  const query = buildOverpassQuery(category.osmTag, center, SEARCH_RADIUS_METERS);
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new OverpassRequestError(
      `Falha na busca de ${category.categoryLabel.toLowerCase()}: ${response.status}`,
    );
  }

  const data = (await response.json()) as OverpassResponse;

  const ranked: RankedSuggestion[] = data.elements
    .map((element): RankedSuggestion | null => {
      const coordinates = elementCoordinates(element);
      const name = element.tags?.name;
      if (!coordinates || !name) {
        return null;
      }
      return {
        suggestion: {
          id: `osm-${element.type}-${element.id}`,
          placeName: buildOverpassPlaceLabel({ ...element.tags, name }),
          coordinates,
        },
        distanceMeters: haversineDistanceMeters(center, coordinates),
      };
    })
    .filter((entry): entry is RankedSuggestion => entry !== null);

  ranked.sort((a, b) => a.distanceMeters - b.distanceMeters);

  return ranked.slice(0, MAX_SUGGESTIONS).map((entry) => entry.suggestion);
}
```

- [ ] **Passo 2: Criar `src/services/overpassClient.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchPlacesByCategory, OverpassRequestError } from './overpassClient';
import type { PlaceCategoryDefinition } from '../data/placeCategories';

const FARMACIA: PlaceCategoryDefinition = {
  keywords: ['farmacia'],
  osmTag: { key: 'amenity', value: 'pharmacy' },
  categoryLabel: 'Farmácia',
};

const LOJA: PlaceCategoryDefinition = {
  keywords: ['loja'],
  osmTag: { key: 'shop', value: '' },
  categoryLabel: 'Loja',
};

describe('searchPlacesByCategory', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte nodes do Overpass em PlaceSuggestion, ordenados por distância do centro', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          { type: 'node', id: 1, lat: -15.85, lon: -47.95, tags: { name: 'Farmácia Longe' } },
          { type: 'node', id: 2, lat: -15.8, lon: -47.9, tags: { name: 'Farmácia Perto' } },
        ],
      }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results.map((r) => r.placeName)).toEqual(['Farmácia Perto', 'Farmácia Longe']);
  });

  it('usa o centro (`center`) para elementos do tipo way', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [{ type: 'way', id: 10, center: { lat: -15.8, lon: -47.9 }, tags: { name: 'Farmácia Way' } }],
      }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results).toEqual([
      { id: 'osm-way-10', placeName: 'Farmácia Way', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);
  });

  it('descarta elementos sem nome', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [{ type: 'node', id: 1, lat: -15.8, lon: -47.9, tags: {} }] }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results).toEqual([]);
  });

  it('descarta elementos sem coordenadas resolvíveis (sem lat/lon nem center)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [{ type: 'relation', id: 1, tags: { name: 'Algo' } }] }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results).toEqual([]);
  });

  it('inclui o endereço no rótulo quando addr:street e addr:housenumber estão presentes', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          {
            type: 'node',
            id: 1,
            lat: -15.8,
            lon: -47.9,
            tags: { name: 'Farmácia X', 'addr:street': 'Rua das Flores', 'addr:housenumber': '123' },
          },
        ],
      }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results[0].placeName).toBe('Farmácia X, Rua das Flores, 123');
  });

  it('usa o filtro de existência de chave (sem valor) para categorias como "loja"', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });

    await searchPlacesByCategory(LOJA, { lat: -15.8, lng: -47.9 });

    const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body as string;
    expect(decodeURIComponent(body)).toContain('["shop"]');
    expect(decodeURIComponent(body)).not.toContain('["shop"=""]');
  });

  it('usa a localização informada como centro da busca (`around`)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });

    await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body as string;
    expect(decodeURIComponent(body)).toContain('around:8000,-15.8,-47.9');
  });

  it('usa um centro padrão (DF) quando nenhuma localização é informada', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });

    await searchPlacesByCategory(FARMACIA, null);

    const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body as string;
    expect(decodeURIComponent(body)).toContain('around:8000,-15.7939,-47.8828');
  });

  it('lança OverpassRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    await expect(searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 })).rejects.toThrow(
      OverpassRequestError,
    );
  });

  it('limita o resultado a 8 sugestões', async () => {
    const elements = Array.from({ length: 20 }, (_, i) => ({
      type: 'node' as const,
      id: i,
      lat: -15.8 + i * 0.001,
      lon: -47.9,
      tags: { name: `Farmácia ${i}` },
    }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ elements }) });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results).toHaveLength(8);
  });
});
```

- [ ] **Passo 3: Rodar os testes**

Run: `npm run test -- src/services/overpassClient.test.ts`
Expected: 9 testes passando.

- [ ] **Passo 4: Lint e typecheck**

Run: `npm run lint && npx tsc -b`
Expected: sem erros.

- [ ] **Passo 5: Commit**

```bash
git add src/services/overpassClient.ts src/services/overpassClient.test.ts
git commit -m "feat: adicionar cliente da Overpass API para busca por categoria"
```

---

## Tarefa 4: Rotear a busca entre Mapbox e Overpass no hook

**Contexto:** `useGeocodingSearch` é o único ponto que decide qual API chamar — `SearchBar.tsx` não precisa mudar, porque já consome só `suggestions`/`resolveSuggestion` sem saber de onde vieram. `resolveSuggestion` também não precisa mudar: sugestões da Overpass já chegam com `coordinates` preenchidas (como as do gazetteer local), então o `if (suggestion.coordinates)` que já existe no hook já cobre esse caso.

**Arquivos:**
- Modificar: `src/features/search/useGeocodingSearch.ts`
- Modificar: `src/features/search/useGeocodingSearch.test.ts`

**Interfaces:**
- Consome: `matchPlaceCategory` de `src/data/placeCategories.ts` (Tarefa 2).
- Consome: `searchPlacesByCategory` de `src/services/overpassClient.ts` (Tarefa 3).

- [ ] **Passo 1: Modificar `src/features/search/useGeocodingSearch.ts`**

Adicione os imports novos no topo do arquivo:

```ts
import { matchPlaceCategory } from '../../data/placeCategories';
import { searchPlacesByCategory } from '../../services/overpassClient';
```

Dentro do `useEffect`, substitua o bloco atual:

```ts
    const timeoutId = setTimeout(() => {
      searchPlaces(query, sessionTokenRef.current, proximity)
        .then((results) => {
```

por:

```ts
    const timeoutId = setTimeout(() => {
      const category = matchPlaceCategory(query);
      const search = category
        ? searchPlacesByCategory(category, proximity ?? null)
        : searchPlaces(query, sessionTokenRef.current, proximity);

      search
        .then((results) => {
```

O restante do `.then(...).catch(...).finally(...)` já existente não muda.

- [ ] **Passo 2: Adicionar testes em `src/features/search/useGeocodingSearch.test.ts`**

Adicione o import no topo do arquivo, junto aos já existentes:

```ts
import * as overpassClient from '../../services/overpassClient';
```

Adicione estes três testes dentro do `describe('useGeocodingSearch', ...)`, após o teste `'rebusca quando a proximidade muda...'`:

```ts
  it('usa a Overpass API quando a query corresponde a uma categoria de estabelecimento', async () => {
    const overpassSpy = vi.spyOn(overpassClient, 'searchPlacesByCategory').mockResolvedValue([
      { id: 'osm-node-1', placeName: 'Farmácia Popular', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);
    const mapboxSpy = vi.spyOn(mapboxClient, 'searchPlaces');

    const { result } = renderHook(() => useGeocodingSearch('farmácia'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(overpassSpy).toHaveBeenCalled();
    expect(mapboxSpy).not.toHaveBeenCalled();
    expect(result.current.suggestions).toHaveLength(1);
  });

  it('repassa a localização atual para searchPlacesByCategory como centro de busca', async () => {
    const overpassSpy = vi.spyOn(overpassClient, 'searchPlacesByCategory').mockResolvedValue([]);

    renderHook(() => useGeocodingSearch('farmácia', { lat: -15.8, lng: -47.9 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(overpassSpy).toHaveBeenCalledWith(
      expect.objectContaining({ categoryLabel: 'Farmácia' }),
      { lat: -15.8, lng: -47.9 },
    );
  });

  it('usa o Mapbox (não a Overpass) para queries que não correspondem a nenhuma categoria', async () => {
    const overpassSpy = vi.spyOn(overpassClient, 'searchPlacesByCategory');
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([]);

    renderHook(() => useGeocodingSearch('Avenida Paulista'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(overpassSpy).not.toHaveBeenCalled();
  });
```

- [ ] **Passo 3: Rodar os testes**

Run: `npm run test -- src/features/search/useGeocodingSearch.test.ts`
Expected: todos os testes (os 6 já existentes + os 3 novos) passando.

- [ ] **Passo 4: Rodar a suíte inteira**

Run: `npm run test`
Expected: todos os testes do projeto passando, nenhuma regressão.

- [ ] **Passo 5: Lint e typecheck**

Run: `npm run lint && npx tsc -b`
Expected: sem erros.

- [ ] **Passo 6: Commit**

```bash
git add src/features/search/useGeocodingSearch.ts src/features/search/useGeocodingSearch.test.ts
git commit -m "feat: rotear busca por categoria de estabelecimento para a Overpass API"
```

---

## Tarefa 5: Verificação manual no navegador

**Contexto:** Testes automatizados cobrem a lógica; falta confirmar que a experiência real funciona — a Overpass API pública tem variações de latência e cobertura de dados que só aparecem testando de verdade.

**Arquivos:** nenhum (tarefa de verificação, sem código novo).

- [ ] **Passo 1: Subir o app localmente**

Run: `npm run dev`

- [ ] **Passo 2: Testar busca por endereço (deve continuar usando Mapbox)**

No campo de busca, digite "Águas Claras" — confirme que os resultados aparecem normalmente (comportamento inalterado).

- [ ] **Passo 3: Testar busca por categoria (deve usar Overpass)**

Digite "farmácia" — confirme que aparecem estabelecimentos reais nomeados (não endereços genéricos) perto da localização atual. Repita com "hospital", "restaurante" e "posto de gasolina".

- [ ] **Passo 4: Testar seleção de um resultado de categoria**

Clique em um resultado de "farmácia" — confirme que o mapa centraliza no local certo e a rota é calculada normalmente (mesmo fluxo de sempre, já que `resolveSuggestion` trata `coordinates` já conhecidas sem chamada extra).

- [ ] **Passo 5: Testar uma categoria com baixa cobertura de dados no DF**

Digite "academia" ou "pousada" — se os resultados vierem vazios ou escassos, isso é esperado (cobertura do OpenStreetMap varia por região) e não indica bug de código; documente o que observou para decidir se vale a pena ajustar o raio de busca (`SEARCH_RADIUS_METERS` em `overpassClient.ts`) no futuro.

---

## Auto-revisão do plano

- **Cobertura:** as duas mudanças de comportamento pedidas pelo usuário — (1) endereço/cidade continua no Mapbox, (2) categoria de estabelecimento passa a usar outra API — estão cobertas pelas Tarefas 2–4. A Tarefa 1 é um refactor de suporte (evita duplicar `normalize`). A Tarefa 5 valida manualmente que a integração funciona de ponta a ponta com dados reais do OSM.
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo passo de código tem o código completo.
- **Consistência de tipos:** `OsmTag`, `PlaceCategoryDefinition` (Tarefa 2) são os mesmos tipos importados e usados em `overpassClient.ts` (Tarefa 3); `searchPlacesByCategory(category, proximity)` (Tarefa 3) é chamado com essa mesma assinatura em `useGeocodingSearch.ts` (Tarefa 4); `PlaceSuggestion` retornado por `searchPlacesByCategory` é o mesmo tipo já usado por `searchPlaces`, então nada muda em `SearchBar.tsx`.
