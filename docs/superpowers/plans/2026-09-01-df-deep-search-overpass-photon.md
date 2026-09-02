# Busca de reforço (Overpass + Photon) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Quando o passe rápido de busca traz menos de 3 resultados, disparar em segundo plano uma busca no OSM cru (Overpass) e no Photon, cobrindo o DF inteiro, e completar a lista de sugestões um instante depois.

**Architecture:** Duas funções de serviço novas (`searchDeepOsm`, `searchPhoton`) que devolvem o mesmo `PlaceSuggestion[]` das fontes atuais, mais uma alteração aditiva em `useGeocodingSearch.ts`: depois do passe rápido de hoje (inalterado), o hook conta os resultados e — sob condições de gatilho — roda um "segundo passe" com as duas fontes novas em paralelo, anexando os achados ao fim da lista sem duplicar. Freios de uso: debounce + `AbortController`, uma consulta por vez, descanso de 3 s, piso de 4 caracteres.

**Tech Stack:** TypeScript `strict`, React 18 (`useEffect`/`useRef`), Vitest + Testing Library. Nenhuma dependência nova — Overpass e Photon são APIs REST públicas sem SDK e sem chave.

**Spec:** [docs/superpowers/specs/2026-09-01-df-deep-search-overpass-photon-design.md](../specs/2026-09-01-df-deep-search-overpass-photon-design.md) — leia junto com este plano.

## Global Constraints

- **Idioma:** todo texto de usuário e todo comentário de código em **pt-BR**, seguindo o padrão dos arquivos vizinhos (`geoapifyClient.ts`, `dfHealthUnits.ts`).
- **TypeScript `strict`**, sem `any` implícito.
- **`PlaceSuggestion` (`src/types/index.ts`) não muda.** `SearchBar.tsx` não muda. `geoapifyClient.ts`, `mapboxGeocodingClient.ts`, `placeCategories.ts`, `dfHealthUnits.ts` não mudam de comportamento.
- **Passe rápido inalterado:** mesmas fontes, mesmo teto de 4 s (`PROVIDER_TIMEOUT_MS`), mesma regra "só é erro se todas as remotas falharem E a busca local não achar nada", mesmo `interleave`/`dedupeByProximity`, mesmo `MAX_SUGGESTIONS` (12), mesmo `MIN_QUERY_LENGTH` (3), mesmo `DEBOUNCE_MS` (300).
- **Falha do segundo passe é silenciosa** — nunca vira `error` na tela.
- **Sem servidor espelho de reserva do Overpass.** Um endpoint só (`overpass-api.de`).
- **Nenhuma variável de ambiente nova.** Overpass e Photon não usam chave.
- **Escopo geográfico:** o DF inteiro via retângulo `DF_BOUNDING_BOX` (mesmos números de `scripts/lib/unidadesSaude.mjs`: `minLat -16.1`, `maxLat -15.4`, `minLng -48.35`, `maxLng -47.3`).
- Ao fim de **cada tarefa**: `npm run lint && npx tsc -b && npm run test` verde.
- Commits pequenos e frequentes, um por tarefa no mínimo.

---

## Mapa de arquivos

| Arquivo | Papel | Tarefa |
|---|---|---|
| `src/data/dfBounds.ts` (novo) | Retângulo do DF + ponto central + `isWithinDf` | 1 |
| `src/data/dfBounds.test.ts` (novo) | Testes do acima | 1 |
| `src/utils/timeoutSignal.ts` (novo) | Combina teto de tempo + `AbortSignal` externo | 2 |
| `src/utils/timeoutSignal.test.ts` (novo) | Testes do acima | 2 |
| `src/services/overpassQuery.ts` (novo) | Funções puras: `toAccentInsensitivePattern`, `buildOverpassQuery` | 3 |
| `src/services/overpassQuery.test.ts` (novo) | Testes do acima | 3 |
| `src/services/overpassClient.ts` (novo) | `searchDeepOsm`, `OverpassRequestError` (fetch + conversão + ranking) | 4 |
| `src/services/overpassClient.test.ts` (novo) | Testes do acima | 4 |
| `src/services/photonClient.ts` (novo) | `searchPhoton`, `PhotonRequestError` | 5 |
| `src/services/photonClient.test.ts` (novo) | Testes do acima | 5 |
| `src/features/search/useGeocodingSearch.ts` (modificar) | + segundo passe | 6 |
| `src/features/search/useGeocodingSearch.test.ts` (modificar) | + testes do segundo passe, sem alterar os existentes | 6 |
| `vercel.json` (modificar) | `connect-src` do CSP | 7 |
| `README.md` (modificar) | lista de APIs + item do CSP + frase sobre o segundo passe | 7 |

---

## Tarefa 1: `dfBounds.ts` — retângulo do DF e ponto central

**Files:**
- Create: `src/data/dfBounds.ts`
- Test: `src/data/dfBounds.test.ts`

**Interfaces:**
- Consumes: `Coordinates` de `src/types`.
- Produces:
  - `DF_BOUNDING_BOX: { readonly south: number; readonly west: number; readonly north: number; readonly east: number }`
  - `DF_CENTER: Coordinates`
  - `isWithinDf(c: Coordinates): boolean`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/data/dfBounds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DF_BOUNDING_BOX, DF_CENTER, isWithinDf } from './dfBounds';

describe('DF_BOUNDING_BOX', () => {
  it('tem sul < norte e oeste < leste', () => {
    expect(DF_BOUNDING_BOX.south).toBeLessThan(DF_BOUNDING_BOX.north);
    expect(DF_BOUNDING_BOX.west).toBeLessThan(DF_BOUNDING_BOX.east);
  });

  it('usa os mesmos limites de scripts/lib/unidadesSaude.mjs', () => {
    expect(DF_BOUNDING_BOX).toEqual({
      south: -16.1,
      west: -48.35,
      north: -15.4,
      east: -47.3,
    });
  });
});

describe('isWithinDf', () => {
  it('aceita pontos conhecidos do DF', () => {
    expect(isWithinDf(DF_CENTER)).toBe(true);
    expect(isWithinDf({ lat: -15.8333, lng: -47.9733 })).toBe(true); // Guará II
    expect(isWithinDf({ lat: -15.8155, lng: -48.109 })).toBe(true); // Ceilândia
  });

  it('rejeita um ponto fora do DF', () => {
    expect(isWithinDf({ lat: -16.6869, lng: -49.2648 })).toBe(false); // Goiânia
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/data/dfBounds.test.ts`
Expected: FAIL — `Cannot find module './dfBounds'`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/data/dfBounds.ts`:

```ts
import type { Coordinates } from '../types';

// Retângulo que cobre todo o Distrito Federal (com folga). Os mesmos
// limites de scripts/lib/unidadesSaude.mjs (DF_BOX, limpeza de coordenada
// do CNES) — mantidos idênticos de propósito; mudou lá, confira aqui.
export const DF_BOUNDING_BOX = {
  south: -16.1,
  west: -48.35,
  north: -15.4,
  east: -47.3,
} as const;

// Centro aproximado do DF (Esplanada / Plano Piloto). Âncora de
// proximidade quando a busca acontece sem GPS. Mesmo valor de
// geoapifyClient.DEFAULT_SEARCH_CENTER (não unificado agora para não
// mexer em arquivo fora do escopo desta mudança).
export const DF_CENTER: Coordinates = { lat: -15.7939, lng: -47.8828 };

export function isWithinDf(c: Coordinates): boolean {
  return (
    c.lat >= DF_BOUNDING_BOX.south &&
    c.lat <= DF_BOUNDING_BOX.north &&
    c.lng >= DF_BOUNDING_BOX.west &&
    c.lng <= DF_BOUNDING_BOX.east
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/data/dfBounds.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint && npx tsc -b`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/data/dfBounds.ts src/data/dfBounds.test.ts
git commit -m "feat(busca): retângulo do DF e ponto central para a busca de reforço"
```

---

## Tarefa 2: `timeoutSignal.ts` — teto de tempo + abort externo

**Files:**
- Create: `src/utils/timeoutSignal.ts`
- Test: `src/utils/timeoutSignal.test.ts`

**Interfaces:**
- Produces: `timeoutSignal(ms: number, external?: AbortSignal): { signal: AbortSignal; cleanup: () => void }` — `signal` aborta quando `ms` passa **ou** quando `external` aborta; `cleanup()` solta o timer e o listener (chamar no `finally`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/utils/timeoutSignal.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timeoutSignal } from './timeoutSignal';

describe('timeoutSignal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aborta sozinho depois do tempo dado', () => {
    const { signal } = timeoutSignal(1000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(signal.aborted).toBe(true);
  });

  it('aborta quando o signal externo aborta', () => {
    const external = new AbortController();
    const { signal } = timeoutSignal(1000, external.signal);
    external.abort();
    expect(signal.aborted).toBe(true);
  });

  it('já nasce abortado se o signal externo já estava abortado', () => {
    const external = new AbortController();
    external.abort();
    const { signal } = timeoutSignal(1000, external.signal);
    expect(signal.aborted).toBe(true);
  });

  it('cleanup impede o abort tardio por tempo', () => {
    const { signal, cleanup } = timeoutSignal(1000);
    cleanup();
    vi.advanceTimersByTime(5000);
    expect(signal.aborted).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/utils/timeoutSignal.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/utils/timeoutSignal.ts`:

```ts
// Junta um teto de tempo (ms) com um AbortSignal externo opcional. Devolve
// o signal combinado e uma função `cleanup` que solta o timer e o listener
// — chame-a no `finally` de quem consome.
export function timeoutSignal(
  ms: number,
  external?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onExternalAbort = () => controller.abort();

  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener('abort', onExternalAbort);
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/utils/timeoutSignal.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint && npx tsc -b`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/utils/timeoutSignal.ts src/utils/timeoutSignal.test.ts
git commit -m "feat(busca): util timeoutSignal (teto de tempo + abort externo)"
```

---

## Tarefa 3: `overpassQuery.ts` — padrão tolerante a acento e montagem da query

**Files:**
- Create: `src/services/overpassQuery.ts`
- Test: `src/services/overpassQuery.test.ts`

**Interfaces:**
- Consumes: `DF_BOUNDING_BOX` de `src/data/dfBounds` (Tarefa 1). `normalize` de `src/utils/text` **não** é chamado aqui — `toAccentInsensitivePattern` assume que o termo já veio normalizado (minúsculas, sem acento, `trim`); quem normaliza é `searchDeepOsm` (Tarefa 4).
- Produces:
  - `toAccentInsensitivePattern(term: string): string` — termo normalizado → regex que casa as formas acentuadas de cada vogal; palavras ligadas por `\s+`; metacaracteres de regex escapados.
  - `buildOverpassQuery(pattern: string): string` — a string Overpass QL completa (bbox do DF + regex nos campos de nome + `out center 30`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/overpassQuery.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toAccentInsensitivePattern, buildOverpassQuery } from './overpassQuery';

describe('toAccentInsensitivePattern', () => {
  it('troca cada vogal por uma classe que aceita as formas acentuadas', () => {
    expect(toAccentInsensitivePattern('guara')).toBe('g[uúùû][aáàâãä]r[aáàâãä]');
  });

  it('liga as palavras com \\s+ (mesma ordem, espaço flexível)', () => {
    expect(toAccentInsensitivePattern('padaria bonanza')).toBe(
      'p[aáàâãä]d[aáàâãä]r[iíìî][aáàâãä]\\s+b[oóòôõ]n[aáàâãä]nz[aáàâãä]',
    );
  });

  it('escapa metacaractere de regex presente no texto', () => {
    expect(toAccentInsensitivePattern('a.b')).toBe('[aáàâãä]\\.b');
    expect(toAccentInsensitivePattern('x(y)')).toBe('x\\(y\\)');
  });

  it('colapsa espaços repetidos e ignora as pontas', () => {
    expect(toAccentInsensitivePattern('  x   y  ')).toBe('x\\s+y');
  });

  it('trata "c" e "n" como classes com cedilha / til', () => {
    expect(toAccentInsensitivePattern('canoa')).toBe('[cç][aáàâãä][nñ][oóòôõ][aáàâãä]');
  });
});

describe('buildOverpassQuery', () => {
  it('monta a query com o retângulo do DF e os 8 campos de nome', () => {
    const ql = buildOverpassQuery('guara');
    expect(ql).toContain('[out:json][timeout:25];');
    expect(ql).toContain(
      'nwr[~"^(name|name:pt|alt_name|old_name|short_name|official_name|loc_name|brand)$"~"guara",i](-16.1,-48.35,-15.4,-47.3);',
    );
    expect(ql.trimEnd().endsWith('out center 30;')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/services/overpassQuery.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/services/overpassQuery.ts`:

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/services/overpassQuery.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint && npx tsc -b`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/services/overpassQuery.ts src/services/overpassQuery.test.ts
git commit -m "feat(busca): montagem da query Overpass com padrão tolerante a acento"
```

---

## Tarefa 4: `overpassClient.ts` — `searchDeepOsm`

**Files:**
- Create: `src/services/overpassClient.ts`
- Test: `src/services/overpassClient.test.ts`

**Interfaces:**
- Consumes: `toAccentInsensitivePattern`, `buildOverpassQuery` de `./overpassQuery` (Tarefa 3); `timeoutSignal` de `../utils/timeoutSignal` (Tarefa 2); `DF_CENTER` de `../data/dfBounds` (Tarefa 1); `normalize` de `../utils/text`; `haversineDistanceMeters` de `../utils/distance`; `Coordinates`, `PlaceSuggestion` de `../types`.
- Produces:
  - `class OverpassRequestError extends Error`
  - `searchDeepOsm(query: string, proximity: Coordinates | null, signal?: AbortSignal): Promise<PlaceSuggestion[]>` — usado pela Tarefa 6. Devolve no máximo 6 sugestões ordenadas por distância do `proximity` (ou de `DF_CENTER`). `[]` se `normalize(query).length < 4`, se `signal` já estava abortado, ou se o `signal` externo abortar durante a chamada. Lança `OverpassRequestError` em resposta não-ok ou timeout.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/overpassClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchDeepOsm, OverpassRequestError } from './overpassClient';

function mockFetchOnceJson(body: unknown) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

function lastFetchBody(): string {
  const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  return decodeURIComponent(String(call[1]?.body ?? ''));
}

describe('searchDeepOsm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não chama a rede para termo com menos de 4 caracteres', async () => {
    const results = await searchDeepOsm('ub', { lat: -15.8, lng: -47.9 });
    expect(results).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('monta a query com o retângulo do DF e o regex dos campos de nome', async () => {
    mockFetchOnceJson({ elements: [] });
    await searchDeepOsm('guará', { lat: -15.8, lng: -47.9 });
    const body = lastFetchBody();
    expect(body).toContain('[out:json][timeout:25];');
    expect(body).toContain('"^(name|name:pt|alt_name|old_name|short_name|official_name|loc_name|brand)$"');
    expect(body).toContain('(-16.1,-48.35,-15.4,-47.3);');
    // "guará" normalizado ("guara") e expandido em classes por vogal
    expect(body).toContain('g[uúùû][aáàâãä]r[aáàâãä]');
  });

  it('converte elementos em PlaceSuggestion, ordenados por distância do centro informado', async () => {
    mockFetchOnceJson({
      elements: [
        { type: 'node', id: 1, lat: -15.86, lon: -47.96, tags: { name: 'Longe' } },
        { type: 'node', id: 2, lat: -15.81, lon: -47.91, tags: { name: 'Perto' } },
      ],
    });
    const results = await searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 });
    expect(results.map((r) => r.placeName)).toEqual(['Perto', 'Longe']);
    expect(results[1]).toEqual({
      id: 'osm:node:1',
      placeName: 'Longe',
      coordinates: { lat: -15.86, lng: -47.96 },
    });
  });

  it('usa o center para elementos way/relation e descarta os sem coordenada', async () => {
    mockFetchOnceJson({
      elements: [
        { type: 'way', id: 10, center: { lat: -15.8, lon: -47.9 }, tags: { name: 'Via' } },
        { type: 'relation', id: 11, tags: { name: 'Sem ponto' } },
      ],
    });
    const results = await searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 });
    expect(results).toEqual([
      { id: 'osm:way:10', placeName: 'Via', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);
  });

  it('descarta elementos sem nenhum campo de nome e usa official_name/brand quando não há name', async () => {
    mockFetchOnceJson({
      elements: [
        { type: 'node', id: 1, lat: -15.8, lon: -47.9, tags: { amenity: 'cafe' } },
        { type: 'node', id: 2, lat: -15.8, lon: -47.9, tags: { brand: 'Marca X' } },
      ],
    });
    const results = await searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 });
    expect(results).toEqual([
      { id: 'osm:node:2', placeName: 'Marca X', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);
  });

  it('inclui rua, número e bairro no rótulo quando os addr:* existem', async () => {
    mockFetchOnceJson({
      elements: [
        {
          type: 'node',
          id: 1,
          lat: -15.8,
          lon: -47.9,
          tags: {
            name: 'Padaria X',
            'addr:street': 'QE 23',
            'addr:housenumber': '10',
            'addr:suburb': 'Guará II',
          },
        },
      ],
    });
    const results = await searchDeepOsm('padaria x', { lat: -15.8, lng: -47.9 });
    expect(results[0].placeName).toBe('Padaria X, QE 23, 10 - Guará II, Brasília - DF');
  });

  it('cai para só o nome quando não há addr:*', async () => {
    mockFetchOnceJson({
      elements: [{ type: 'node', id: 1, lat: -15.8, lon: -47.9, tags: { name: 'Só o Nome' } }],
    });
    const results = await searchDeepOsm('so o nome', { lat: -15.8, lng: -47.9 });
    expect(results[0].placeName).toBe('Só o Nome');
  });

  it('limita a 6 resultados', async () => {
    mockFetchOnceJson({
      elements: Array.from({ length: 12 }, (_, i) => ({
        type: 'node' as const,
        id: i,
        lat: -15.8 - i * 0.001,
        lon: -47.9,
        tags: { name: `N${i}` },
      })),
    });
    const results = await searchDeepOsm('n', { lat: -15.8, lng: -47.9 });
    expect(results).toHaveLength(6);
  });

  it('usa DF_CENTER como âncora de distância quando proximity é null', async () => {
    mockFetchOnceJson({ elements: [] });
    await searchDeepOsm('lugar', null);
    expect(fetch).toHaveBeenCalledTimes(1); // sem erro; só confirma que rodou
  });

  it('lança OverpassRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 429 });
    await expect(searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 })).rejects.toBeInstanceOf(
      OverpassRequestError,
    );
  });

  it('devolve [] sem chamar a rede se o signal já estava abortado', async () => {
    const controller = new AbortController();
    controller.abort();
    const results = await searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 }, controller.signal);
    expect(results).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('devolve [] (não lança) quando o signal externo aborta durante a chamada', async () => {
    const controller = new AbortController();
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const promise = searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 }, controller.signal);
    controller.abort();
    await expect(promise).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/services/overpassClient.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/services/overpassClient.ts`:

```ts
import type { Coordinates, PlaceSuggestion } from '../types';
import { normalize } from '../utils/text';
import { haversineDistanceMeters } from '../utils/distance';
import { timeoutSignal } from '../utils/timeoutSignal';
import { DF_CENTER } from '../data/dfBounds';
import { buildOverpassQuery, toAccentInsensitivePattern } from './overpassQuery';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MIN_TERM_LENGTH = 4;
const MAX_SUGGESTIONS = 6;
const TIMEOUT_MS = 6000;

// Ordem de preferência para o rótulo quando um elemento casou por um
// campo de nome que não é o `name` principal.
const NAME_TAGS_IN_ORDER = [
  'name',
  'official_name',
  'brand',
  'name:pt',
  'alt_name',
  'short_name',
] as const;

export class OverpassRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverpassRequestError';
  }
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

function pickName(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null;
  for (const key of NAME_TAGS_IN_ORDER) {
    const value = tags[key]?.trim();
    if (value) return value;
  }
  return null;
}

// "Nome, Rua, Nº - Bairro, Brasília - DF", pulando as partes que o OSM não
// tiver. Sem nenhuma parte de endereço, o rótulo é só o nome.
function buildLabel(name: string, tags: Record<string, string>): string {
  const streetAndNumber =
    tags['addr:street'] && tags['addr:housenumber']
      ? `${tags['addr:street']}, ${tags['addr:housenumber']}`
      : tags['addr:street'];
  const parts = [streetAndNumber, tags['addr:suburb'] ?? tags['addr:district']].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? `${name}, ${parts.join(' - ')}, Brasília - DF` : name;
}

// Busca de reforço no OSM cru (Overpass API): dentro do retângulo do DF,
// casa o texto digitado contra vários campos de nome do lugar (nome
// oficial, nome antigo, apelido, marca...). Pública e sem chave. Lenta
// (1–3 s) e com uso justo — o hook a chama só como segundo passe. Pura,
// não guarda estado.
export async function searchDeepOsm(
  query: string,
  proximity: Coordinates | null,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const term = normalize(query);
  if (term.length < MIN_TERM_LENGTH) return [];
  if (signal?.aborted) return [];

  const ql = buildOverpassQuery(toAccentInsensitivePattern(term));
  const { signal: fetchSignal, cleanup } = timeoutSignal(TIMEOUT_MS, signal);

  let data: OverpassResponse;
  try {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(ql)}`,
      signal: fetchSignal,
    });
    if (!response.ok) {
      throw new OverpassRequestError(`Overpass respondeu ${response.status}`);
    }
    data = (await response.json()) as OverpassResponse;
  } catch (error) {
    if (signal?.aborted) return [];
    if (error instanceof OverpassRequestError) throw error;
    throw new OverpassRequestError(
      error instanceof Error ? error.message : 'Falha na consulta ao Overpass',
    );
  } finally {
    cleanup();
  }

  const center = proximity ?? DF_CENTER;
  return (data.elements ?? [])
    .map((element) => {
      const coordinates = elementCoordinates(element);
      const name = pickName(element.tags);
      if (!coordinates || !name) return null;
      return {
        suggestion: {
          id: `osm:${element.type}:${element.id}`,
          placeName: buildLabel(name, element.tags ?? {}),
          coordinates,
        } satisfies PlaceSuggestion,
        distance: haversineDistanceMeters(center, coordinates),
      };
    })
    .filter((entry): entry is { suggestion: PlaceSuggestion; distance: number } => entry !== null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.suggestion);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/services/overpassClient.test.ts`
Expected: PASS (13 testes).

- [ ] **Step 5: Lint + typecheck + suíte inteira**

Run: `npm run lint && npx tsc -b && npm run test`
Expected: tudo verde, nenhuma regressão.

- [ ] **Step 6: Commit**

```bash
git add src/services/overpassClient.ts src/services/overpassClient.test.ts
git commit -m "feat(busca): cliente searchDeepOsm (Overpass API, busca de reforço)"
```

---

## Tarefa 5: `photonClient.ts` — `searchPhoton`

**Files:**
- Create: `src/services/photonClient.ts`
- Test: `src/services/photonClient.test.ts`

**Interfaces:**
- Consumes: `timeoutSignal` de `../utils/timeoutSignal` (Tarefa 2); `DF_BOUNDING_BOX`, `DF_CENTER` de `../data/dfBounds` (Tarefa 1); `Coordinates`, `PlaceSuggestion` de `../types`.
- Produces:
  - `class PhotonRequestError extends Error`
  - `searchPhoton(query: string, proximity: Coordinates | null, signal?: AbortSignal): Promise<PlaceSuggestion[]>` — usado pela Tarefa 6. No máximo 6 sugestões, **na ordem devolvida pelo Photon** (sem reordenar). `[]` se `query.trim().length < 4`, se `signal` já estava abortado, ou se o `signal` externo abortar durante a chamada. Lança `PhotonRequestError` em resposta não-ok ou timeout.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/photonClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchPhoton, PhotonRequestError } from './photonClient';

function mockFetchOnceJson(body: unknown) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => body });
}

function lastFetchUrl(): string {
  return String((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
}

function feature(
  coordinates: [number, number] | undefined,
  properties: Record<string, unknown>,
) {
  return { geometry: coordinates ? { coordinates } : undefined, properties };
}

describe('searchPhoton', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não chama a rede para termo com menos de 4 caracteres', async () => {
    expect(await searchPhoton('rua', { lat: -15.8, lng: -47.9 })).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('monta a URL com q, bbox do DF e viés lat/lon', async () => {
    mockFetchOnceJson({ features: [] });
    await searchPhoton('padaria bonanza', { lat: -15.8, lng: -47.9 });
    const url = lastFetchUrl();
    expect(url).toContain('q=padaria+bonanza');
    expect(url).toContain('bbox=-48.35%2C-16.1%2C-47.3%2C-15.4');
    expect(url).toContain('lat=-15.8');
    expect(url).toContain('lon=-47.9');
  });

  it('converte a FeatureCollection preservando a ordem do Photon', async () => {
    mockFetchOnceJson({
      features: [
        feature([-47.95, -15.86], { name: 'Primeiro', countrycode: 'BR', osm_type: 'N', osm_id: 1 }),
        feature([-47.91, -15.81], { name: 'Segundo', countrycode: 'BR', osm_type: 'N', osm_id: 2 }),
      ],
    });
    const results = await searchPhoton('lugar', { lat: -15.8, lng: -47.9 });
    expect(results.map((r) => r.placeName)).toEqual(['Primeiro', 'Segundo']);
    expect(results[0]).toEqual({
      id: 'photon:N:1',
      placeName: 'Primeiro',
      coordinates: { lat: -15.86, lng: -47.95 },
    });
  });

  it('descarta feature com countrycode diferente de BR', async () => {
    mockFetchOnceJson({
      features: [
        feature([-47.9, -15.8], { name: 'Fora', countrycode: 'AR' }),
        feature([-47.9, -15.8], { name: 'Dentro', countrycode: 'BR' }),
      ],
    });
    const results = await searchPhoton('lugar', { lat: -15.8, lng: -47.9 });
    expect(results.map((r) => r.placeName)).toEqual(['Dentro']);
  });

  it('descarta feature sem coordenada utilizável', async () => {
    mockFetchOnceJson({
      features: [
        feature(undefined, { name: 'Sem geometria' }),
        feature([-47.9, -15.8], { name: 'Ok' }),
      ],
    });
    const results = await searchPhoton('lugar', { lat: -15.8, lng: -47.9 });
    expect(results.map((r) => r.placeName)).toEqual(['Ok']);
  });

  it('monta o rótulo a partir de name/street/housenumber/district', async () => {
    mockFetchOnceJson({
      features: [
        feature([-47.9, -15.8], {
          name: 'Mercadinho',
          street: 'QNM 34',
          housenumber: '5',
          district: 'Ceilândia',
          countrycode: 'BR',
        }),
      ],
    });
    const results = await searchPhoton('mercadinho', { lat: -15.8, lng: -47.9 });
    expect(results[0].placeName).toBe('Mercadinho, QNM 34, 5 - Ceilândia, Brasília - DF');
  });

  it('quando não há name, usa street como nome e não o repete no rótulo', async () => {
    mockFetchOnceJson({
      features: [
        feature([-47.9, -15.8], { street: 'Rua 4B', district: 'Vicente Pires', countrycode: 'BR' }),
      ],
    });
    const results = await searchPhoton('rua 4b', { lat: -15.8, lng: -47.9 });
    expect(results[0].placeName).toBe('Rua 4B, Vicente Pires, Brasília - DF');
  });

  it('limita a 6 resultados', async () => {
    mockFetchOnceJson({
      features: Array.from({ length: 10 }, (_, i) =>
        feature([-47.9, -15.8 - i * 0.001], { name: `N${i}`, countrycode: 'BR' }),
      ),
    });
    const results = await searchPhoton('n', { lat: -15.8, lng: -47.9 });
    expect(results).toHaveLength(6);
  });

  it('usa DF_CENTER como viés e mantém o bbox do DF quando proximity é null', async () => {
    mockFetchOnceJson({ features: [] });
    await searchPhoton('lugar', null);
    const url = lastFetchUrl();
    expect(url).toContain('lat=-15.7939');
    expect(url).toContain('lon=-47.8828');
    expect(url).toContain('bbox=-48.35%2C-16.1%2C-47.3%2C-15.4');
  });

  it('lança PhotonRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 503 });
    await expect(searchPhoton('lugar', { lat: -15.8, lng: -47.9 })).rejects.toBeInstanceOf(
      PhotonRequestError,
    );
  });

  it('devolve [] sem chamar a rede se o signal já estava abortado', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await searchPhoton('lugar', { lat: -15.8, lng: -47.9 }, controller.signal)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/services/photonClient.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/services/photonClient.ts`:

```ts
import type { Coordinates, PlaceSuggestion } from '../types';
import { timeoutSignal } from '../utils/timeoutSignal';
import { DF_BOUNDING_BOX, DF_CENTER } from '../data/dfBounds';

const PHOTON_URL = 'https://photon.komoot.io/api';
const MIN_TERM_LENGTH = 4;
const REQUEST_LIMIT = 10;
const MAX_SUGGESTIONS = 6;
const TIMEOUT_MS = 4000;

export class PhotonRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotonRequestError';
  }
}

interface PhotonProperties {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  city?: string;
  countrycode?: string;
  osm_id?: number | string;
  osm_type?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: PhotonProperties;
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

// "Nome, Rua, Nº - Bairro, Brasília - DF", pulando as partes ausentes.
// Se não veio `name`, o próprio `street` é o nome — e aí não se repete a
// rua no complemento.
function buildLabel(name: string, props: PhotonProperties): string {
  const hasName = Boolean(props.name?.trim());
  const streetAndNumber =
    props.street && props.housenumber ? `${props.street}, ${props.housenumber}` : props.street;
  const parts = [hasName ? streetAndNumber : undefined, props.district ?? props.city].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? `${name}, ${parts.join(' - ')}, Brasília - DF` : name;
}

// Busca de reforço no Photon (komoot): geocoder gratuito e sem chave, bom
// com erro de digitação. Filtrado ao retângulo do DF (bbox) e enviesado
// pela posição atual (lat/lon). O hook o chama só como segundo passe.
// Preserva a ordem do Photon (relevância + proximidade já embutidas).
export async function searchPhoton(
  query: string,
  proximity: Coordinates | null,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const term = query.trim();
  if (term.length < MIN_TERM_LENGTH) return [];
  if (signal?.aborted) return [];

  const center = proximity ?? DF_CENTER;
  const params = new URLSearchParams({
    q: term,
    lang: 'pt',
    limit: String(REQUEST_LIMIT),
    lat: String(center.lat),
    lon: String(center.lng),
    bbox: `${DF_BOUNDING_BOX.west},${DF_BOUNDING_BOX.south},${DF_BOUNDING_BOX.east},${DF_BOUNDING_BOX.north}`,
  });
  const { signal: fetchSignal, cleanup } = timeoutSignal(TIMEOUT_MS, signal);

  let data: PhotonResponse;
  try {
    const response = await fetch(`${PHOTON_URL}?${params.toString()}`, { signal: fetchSignal });
    if (!response.ok) {
      throw new PhotonRequestError(`Photon respondeu ${response.status}`);
    }
    data = (await response.json()) as PhotonResponse;
  } catch (error) {
    if (signal?.aborted) return [];
    if (error instanceof PhotonRequestError) throw error;
    throw new PhotonRequestError(
      error instanceof Error ? error.message : 'Falha na consulta ao Photon',
    );
  } finally {
    cleanup();
  }

  const suggestions: PlaceSuggestion[] = [];
  (data.features ?? []).forEach((feature, index) => {
    const coords = feature.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) return;
    const props = feature.properties ?? {};
    if (props.countrycode && props.countrycode !== 'BR') return;
    const name = props.name?.trim() || props.street?.trim();
    if (!name) return;
    suggestions.push({
      id: `photon:${props.osm_type ?? 'x'}:${props.osm_id ?? index}`,
      placeName: buildLabel(name, props),
      coordinates: { lat: coords[1], lng: coords[0] },
    });
  });
  return suggestions.slice(0, MAX_SUGGESTIONS);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/services/photonClient.test.ts`
Expected: PASS (11 testes).

- [ ] **Step 5: Lint + typecheck + suíte inteira**

Run: `npm run lint && npx tsc -b && npm run test`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/services/photonClient.ts src/services/photonClient.test.ts
git commit -m "feat(busca): cliente searchPhoton (Photon/komoot, busca de reforço)"
```

---

## Tarefa 6: Segundo passe em `useGeocodingSearch.ts`

**Files:**
- Modify: `src/features/search/useGeocodingSearch.ts`
- Modify: `src/features/search/useGeocodingSearch.test.ts` (só **acrescentar**; nenhum teste existente muda de asserção)

**Interfaces:**
- Consumes: `searchDeepOsm` de `../../services/overpassClient` (Tarefa 4); `searchPhoton` de `../../services/photonClient` (Tarefa 5).
- Produces: nenhuma API pública nova — `useGeocodingSearch` continua devolvendo `{ suggestions, isLoading, error, resolveSuggestion }` com os mesmos tipos. Muda só o comportamento interno: a lista pode ser atualizada **duas vezes** (rápida, depois completada).

### Contexto para quem implementa

O arquivo hoje: um `useEffect` com debounce de 300 ms chama uma função de módulo `search(query, proximity)` que dispara 3–4 fontes remotas em paralelo (`Promise.allSettled`), mescla com `interleave`/`dedupeByProximity`, junta o cadastro local de unidades de saúde no topo, e devolve até 12 sugestões — a UI as mostra de uma vez. As funções auxiliares `withTimeout`, `proximityKey`, `dedupeByProximity`, `interleave` **não mudam**.

A mudança: `search()` ganha dois parâmetros — um `AbortSignal` e uma ref `{ current: number }` para o "descanso" — e um callback `onFastResults`. Ela chama `onFastResults(fastList)` assim que o passe rápido termina (a UI mostra já), decide se dispara o segundo passe, e só então resolve com a lista final (rápida + reforço, deduplicada). O `useEffect` passa a criar um `AbortController` por execução e a aceitar as duas atualizações de estado.

O "descanso de 3 s" mora num `useRef` (não em estado de módulo): ele vive enquanto a busca está montada — que é a sessão de uso — e cada teste com `renderHook` nasce com a ref zerada, sem vazar entre testes.

- [ ] **Step 1: Acrescentar os testes que falham**

Em `src/features/search/useGeocodingSearch.test.ts`:

**(a)** adicionar aos imports do topo:

```ts
import * as overpassClient from '../../services/overpassClient';
import * as photonClient from '../../services/photonClient';
```

Se ainda não houver, adicionar também:

```ts
import type { PlaceSuggestion } from '../../types';
```

**(b)** no `beforeEach`, ao lado dos stubs que já existem de `searchPlacesFullText` e `searchPlacesMapbox`, acrescentar os dois stubs padrão (desligados) das fontes novas — do mesmo jeito e pelo mesmo motivo (senão os casos existentes com poucos resultados disparariam rede real):

```ts
    vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([]);
    vi.spyOn(photonClient, 'searchPhoton').mockResolvedValue([]);
```

**(c)** acrescentar este bloco de testes dentro do `describe('useGeocodingSearch', ...)`, depois do último teste existente:

```ts
  describe('segundo passe (busca de reforço)', () => {
    it('dispara Overpass e Photon quando o passe rápido traz menos de 3 e a query tem 4+ caracteres', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
        { id: 'geo-1', placeName: 'Único rápido', coordinates: { lat: -15.8, lng: -47.9 } },
      ]);
      const osmSpy = vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([
        { id: 'osm:node:1', placeName: 'Achado profundo', coordinates: { lat: -15.83, lng: -47.97 } },
      ]);
      const photonSpy = vi.spyOn(photonClient, 'searchPhoton').mockResolvedValue([]);

      const { result } = renderHook(() => useGeocodingSearch('condominio jardim'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(osmSpy).toHaveBeenCalled();
      expect(photonSpy).toHaveBeenCalled();
      expect(result.current.suggestions.map((s) => s.id)).toEqual(['geo-1', 'osm:node:1']);
      expect(result.current.error).toBeNull();
    });

    it('não dispara o segundo passe quando o passe rápido já traz 3 ou mais', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
        { id: 'a', placeName: 'A', coordinates: { lat: -15.81, lng: -47.91 } },
        { id: 'b', placeName: 'B', coordinates: { lat: -15.82, lng: -47.92 } },
        { id: 'c', placeName: 'C', coordinates: { lat: -15.83, lng: -47.93 } },
      ]);
      const osmSpy = vi.spyOn(overpassClient, 'searchDeepOsm');
      const photonSpy = vi.spyOn(photonClient, 'searchPhoton');

      renderHook(() => useGeocodingSearch('alguma avenida'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(osmSpy).not.toHaveBeenCalled();
      expect(photonSpy).not.toHaveBeenCalled();
    });

    it('não dispara o segundo passe para query com menos de 4 caracteres', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);
      const osmSpy = vi.spyOn(overpassClient, 'searchDeepOsm');

      renderHook(() => useGeocodingSearch('rua'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(osmSpy).not.toHaveBeenCalled();
    });

    it('não duplica no reforço um lugar que o passe rápido já trouxe (o rápido vence)', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
        { id: 'geo-1', placeName: 'Condomínio Jardim (Geoapify)', coordinates: { lat: -15.9, lng: -48.0 } },
      ]);
      vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([
        { id: 'osm:node:9', placeName: 'Condomínio Jardim (OSM)', coordinates: { lat: -15.9, lng: -48.0 } },
      ]);

      const { result } = renderHook(() => useGeocodingSearch('condominio jardim'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].id).toBe('geo-1');
    });

    it('mantém error nulo e a lista do passe rápido quando o segundo passe falha inteiro', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
        { id: 'geo-1', placeName: 'Um resultado', coordinates: { lat: -15.8, lng: -47.9 } },
      ]);
      vi.spyOn(overpassClient, 'searchDeepOsm').mockRejectedValue(new Error('overpass fora'));
      vi.spyOn(photonClient, 'searchPhoton').mockRejectedValue(new Error('photon fora'));

      const { result } = renderHook(() => useGeocodingSearch('lugar improvavel'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.suggestions.map((s) => s.id)).toEqual(['geo-1']);
    });

    it('respeita o descanso de 3 s entre dois segundos passes', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);
      const osmSpy = vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([]);

      const { rerender } = renderHook(({ q }) => useGeocodingSearch(q), {
        initialProps: { q: 'lugar um' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(osmSpy).toHaveBeenCalledTimes(1);

      rerender({ q: 'lugar dois' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(osmSpy).toHaveBeenCalledTimes(1); // menos de 3 s depois → não repetiu
    });

    it('repassa a proximidade (e um AbortSignal) para o segundo passe', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);
      const osmSpy = vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([]);
      const photonSpy = vi.spyOn(photonClient, 'searchPhoton').mockResolvedValue([]);

      renderHook(() => useGeocodingSearch('lugar distante', { lat: -15.9, lng: -48.0 }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(osmSpy).toHaveBeenCalledWith(
        'lugar distante',
        { lat: -15.9, lng: -48.0 },
        expect.any(AbortSignal),
      );
      expect(photonSpy).toHaveBeenCalledWith(
        'lugar distante',
        { lat: -15.9, lng: -48.0 },
        expect.any(AbortSignal),
      );
    });

    it('aborta o segundo passe em andamento quando a query muda e ignora o resultado tardio', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);
      let resolveDeep: ((v: PlaceSuggestion[]) => void) | null = null;
      vi.spyOn(overpassClient, 'searchDeepOsm').mockImplementation(
        () =>
          new Promise<PlaceSuggestion[]>((resolve) => {
            resolveDeep = resolve;
          }),
      );
      vi.spyOn(photonClient, 'searchPhoton').mockResolvedValue([]);

      const { result, rerender } = renderHook(({ q }) => useGeocodingSearch(q), {
        initialProps: { q: 'lugar antigo' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(overpassClient.searchDeepOsm).toHaveBeenCalledTimes(1);
      const staleResolve = resolveDeep;

      // Query abaixo do mínimo → o efeito anterior é limpo (abort) e nenhuma
      // busca nova começa.
      rerender({ q: 'ab' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(abortSpy).toHaveBeenCalled();

      await act(async () => {
        staleResolve?.([
          { id: 'osm:node:tarde', placeName: 'Tarde demais', coordinates: { lat: -15.8, lng: -47.9 } },
        ]);
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(result.current.suggestions.some((s) => s.id === 'osm:node:tarde')).toBe(false);
    });
  });
```

> Nota para quem implementa: nos testes de segundo passe, use queries que **não** batem com `matchPlaceCategory` (evite "padaria", "hospital", "banco"...) nem com o cadastro local de unidades de saúde (evite "ubs", "posto", "upa"...), a menos que o teste stube essas fontes — assim a asserção isola o segundo passe. "condominio jardim", "lugar um/dois", "alguma avenida" são seguros.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/features/search/useGeocodingSearch.test.ts`
Expected: FAIL — os testes novos falham (a lista não ganha o achado profundo; `searchDeepOsm` não é chamado). Os testes **existentes continuam passando**.

- [ ] **Step 3: Implementar**

Em `src/features/search/useGeocodingSearch.ts`:

**(a)** trocar o import do React (adicionar `useRef`):

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
```

**(b)** adicionar os imports das fontes novas junto aos demais imports de serviço:

```ts
import { searchDeepOsm } from '../../services/overpassClient';
import { searchPhoton } from '../../services/photonClient';
```

**(c)** adicionar as constantes novas logo abaixo de `PROVIDER_TIMEOUT_MS`:

```ts
// Segundo passe ("busca de reforço"): quando o passe rápido traz pouco,
// consulta o OSM cru (Overpass) e o Photon em segundo plano e completa a
// lista. Só dispara com o passe rápido abaixo do piso, texto longo o
// bastante, e respeitado um descanso entre consultas (uso justo).
const DEEP_SEARCH_MIN_QUERY_LENGTH = 4;
const DEEP_SEARCH_RESULT_FLOOR = 3;
const DEEP_SEARCH_COOLDOWN_MS = 3000;
```

**(d)** substituir a função `search(...)` inteira (da linha `async function search(` até o `}` que a fecha) por esta versão. O passe rápido (do `const localUnits` até o cálculo de `fastList`) é **igual ao de hoje** — só passou a ser guardado numa variável e seguido do segundo passe:

```ts
// Busca em duas etapas:
//  1) Passe rápido — cadastro local de unidades de saúde no topo +
//     Geoapify (/autocomplete e /search) + Mapbox + Geoapify Places por
//     categoria. Igual ao de sempre; entregue via `onFastResults` assim
//     que fica pronto.
//  2) Segundo passe (só quando o passe rápido traz < DEEP_SEARCH_RESULT_FLOOR
//     e a query tem tamanho suficiente e passou o descanso) — Overpass +
//     Photon em paralelo; os achados são anexados ao fim, sem duplicar.
// O segundo passe é `allSettled` e nunca relança: só o passe rápido
// produz o erro de "todas as fontes falharam".
async function search(
  query: string,
  proximity: Coordinates | null,
  signal: AbortSignal,
  lastDeepSearchAtRef: { current: number },
  onFastResults: (results: PlaceSuggestion[]) => void,
): Promise<PlaceSuggestion[]> {
  const localUnits = searchDfHealthUnits(query, proximity);
  const category = matchPlaceCategory(query);

  const tasks: Promise<PlaceSuggestion[]>[] = [
    withTimeout(searchPlaces(query, proximity), PROVIDER_TIMEOUT_MS),
    withTimeout(searchPlacesFullText(query, proximity), PROVIDER_TIMEOUT_MS),
    withTimeout(searchPlacesMapbox(query, proximity), PROVIDER_TIMEOUT_MS),
  ];
  if (category) {
    tasks.push(withTimeout(searchPlacesByCategory(category, proximity), PROVIDER_TIMEOUT_MS));
  }

  const outcomes = await Promise.allSettled(tasks);
  if (outcomes.every((outcome) => outcome.status === 'rejected') && localUnits.length === 0) {
    throw (outcomes[0] as PromiseRejectedResult).reason;
  }

  const resultOf = (index: number): PlaceSuggestion[] =>
    outcomes[index]?.status === 'fulfilled'
      ? (outcomes[index] as PromiseFulfilledResult<PlaceSuggestion[]>).value
      : [];

  const byText = dedupeByProximity(interleave([resultOf(0), resultOf(2), resultOf(1)]));
  const seen = new Set(byText.map(proximityKey));
  const byCategory = dedupeByProximity(category ? resultOf(3) : []).filter(
    (suggestion) => !seen.has(proximityKey(suggestion)),
  );

  const fastList = dedupeByProximity([...localUnits, ...byText, ...byCategory]).slice(
    0,
    MAX_SUGGESTIONS,
  );
  onFastResults(fastList);

  const shouldDeepen =
    fastList.length < DEEP_SEARCH_RESULT_FLOOR &&
    query.trim().length >= DEEP_SEARCH_MIN_QUERY_LENGTH &&
    Date.now() - lastDeepSearchAtRef.current >= DEEP_SEARCH_COOLDOWN_MS &&
    !signal.aborted;

  if (!shouldDeepen) {
    return fastList;
  }

  lastDeepSearchAtRef.current = Date.now();
  const deepOutcomes = await Promise.allSettled([
    searchDeepOsm(query, proximity, signal),
    searchPhoton(query, proximity, signal),
  ]);
  if (signal.aborted) {
    return fastList;
  }

  const deepOf = (index: number): PlaceSuggestion[] =>
    deepOutcomes[index]?.status === 'fulfilled'
      ? (deepOutcomes[index] as PromiseFulfilledResult<PlaceSuggestion[]>).value
      : [];

  // `fastList` na frente: se o mesmo lugar vier dos dois, a versão do
  // passe rápido (rótulo melhor) vence na deduplicação.
  return dedupeByProximity([...fastList, ...deepOf(0), ...deepOf(1)]).slice(0, MAX_SUGGESTIONS);
}
```

**(e)** substituir o corpo do hook `useGeocodingSearch` (o `useEffect` e o `useState`/`useRef` acima dele) por:

```ts
export function useGeocodingSearch(query: string, proximity?: Coordinates | null) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Marca de quando o último segundo passe começou. Num `useRef` (não em
  // estado de módulo): vive enquanto a busca está montada — a sessão de
  // uso — e não vaza entre montagens/testes.
  const lastDeepSearchAtRef = useRef(0);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setError(null);
      return;
    }

    let isCancelled = false;
    const deepController = new AbortController();
    setIsLoading(true);

    const timeoutId = setTimeout(() => {
      search(query, proximity ?? null, deepController.signal, lastDeepSearchAtRef, (fast) => {
        if (!isCancelled) {
          setSuggestions(fast);
          setError(null);
          setIsLoading(false);
        }
      })
        .then((results) => {
          if (!isCancelled) {
            setSuggestions(results);
            setError(null);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setError('Não foi possível buscar endereços agora. Tente novamente.');
            setSuggestions([]);
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoading(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
      deepController.abort();
    };
  }, [query, proximity]);

  // Toda sugestão já chega com coordenadas — Geoapify, Mapbox, cadastro
  // local e o segundo passe (Overpass/Photon) devolvem tudo numa chamada.
  const resolveSuggestion = useCallback(
    async (suggestion: PlaceSuggestion): Promise<GeocodingSuggestion> => {
      return {
        id: suggestion.id,
        placeName: suggestion.placeName,
        coordinates: suggestion.coordinates as Coordinates,
      };
    },
    [],
  );

  return { suggestions, isLoading, error, resolveSuggestion };
}
```

Conferir também o comentário de bloco acima de `search()` (o que hoje enumera as fontes) — se ele listar só as fontes de hoje, atualizar para mencionar o segundo passe, ou deixar que o novo comentário na função já cobre.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/features/search/useGeocodingSearch.test.ts`
Expected: PASS — os testes novos e **todos os que já existiam**.

- [ ] **Step 5: Suíte inteira + lint + typecheck**

Run: `npm run lint && npx tsc -b && npm run test`
Expected: tudo verde, nenhuma regressão em nenhum arquivo.

- [ ] **Step 6: Commit**

```bash
git add src/features/search/useGeocodingSearch.ts src/features/search/useGeocodingSearch.test.ts
git commit -m "feat(busca): segundo passe (Overpass + Photon) quando o passe rápido traz pouco"
```

---

## Tarefa 7: CSP e README

**Files:**
- Modify: `vercel.json` (linha do `Content-Security-Policy`)
- Modify: `README.md` (lista de APIs; item do `connect-src`; frase sobre o segundo passe)

**Interfaces:** nenhuma — configuração e documentação. Não há teste automatizado; a verificação é `npx tsc -b` + build + leitura.

- [ ] **Step 1: Atualizar o `connect-src` no `vercel.json`**

No valor do header `Content-Security-Policy`, no trecho `connect-src`, acrescentar `https://overpass-api.de` e `https://photon.komoot.io` logo depois de `https://api.geoapify.com`. O `connect-src` fica:

```
connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://api.geoapify.com https://overpass-api.de https://photon.komoot.io;
```

O restante do header (default-src, img-src, style-src, script-src, worker-src, child-src, font-src) **não muda**.

- [ ] **Step 2: Conferir que o JSON continua válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('ok')"`
Expected: imprime `ok`.

- [ ] **Step 3: Atualizar o README — lista de APIs**

Na seção que lista as APIs (logo após a linha de _Geoapify Places API_), acrescentar:

```markdown
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) — busca de reforço no OpenStreetMap cru (segundo passe), para lugar pequeno/periférico e nome desatualizado; gratuita, sem chave
- [Photon](https://photon.komoot.io/) — geocoder gratuito e sem chave, tolerante a erro de digitação, também no segundo passe da busca
```

- [ ] **Step 4: Atualizar o README — item do CSP**

No item `connect-src` da seção _Content-Security-Policy_, trocar:

```markdown
- `connect-src`: `api.mapbox.com`, `events.mapbox.com`, `api.geoapify.com`
```

por:

```markdown
- `connect-src`: `api.mapbox.com`, `events.mapbox.com`, `api.geoapify.com`, `overpass-api.de`, `photon.komoot.io`
```

- [ ] **Step 5: Atualizar o README — frase sobre o segundo passe**

Onde o comportamento da busca é descrito (perto da menção a `placeCategories.ts` / às fontes de busca), acrescentar uma frase:

```markdown
Quando esse passe rápido traz poucos resultados, uma **busca de reforço** consulta em segundo plano o OpenStreetMap cru (Overpass) e o Photon, cobrindo o DF inteiro, e a lista de sugestões se completa um instante depois.
```

- [ ] **Step 6: Build de produção para conferir que nada quebrou**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 7: Commit**

```bash
git add vercel.json README.md
git commit -m "chore(busca): liberar Overpass e Photon no CSP e documentar a busca de reforço"
```

---

## Tarefa 8: Verificação manual no navegador

**Files:** nenhum (verificação, sem código).

**Contexto:** os testes cobrem a lógica; falta confirmar a experiência real — Overpass e Photon públicos têm latência e cobertura que só aparecem de verdade rodando.

- [ ] **Step 1: Subir o app**

Run: `npm run dev`

- [ ] **Step 2: Busca que hoje já funciona (não deve mudar nada)**

Digitar "Águas Claras" e um endereço de rua conhecido. Os resultados aparecem como antes, na hora. (O segundo passe não dispara — o passe rápido traz ≥ 3.)

- [ ] **Step 3: Lugar pequeno pelo nome**

Com o passe rápido vindo fraco, digitar o nome de uma padaria/mercadinho de bairro de uma região administrativa. Confirmar que, ~1–3 s depois do resultado rápido, a lista **cresce** com o achado do reforço.

- [ ] **Step 4: Rua específica de cidade satélite**

Digitar uma rua/quadra específica de uma satélite (ex.: "QNP 14", "Rua 4B Vicente Pires"). Mesmo comportamento: a lista se completa um instante depois.

- [ ] **Step 5: Nome antigo**

Digitar um lugar conhecido por um nome que mudou (ex.: um estádio, um shopping ou uma via que foi renomeada). Confirmar que o reforço acha pelo nome antigo.

- [ ] **Step 6: Digitação rápida não trava nem repete**

Digitar e apagar rápido várias vezes seguidas. Confirmar que a UI não congela, não pisca resultados velhos, e (no painel Network do navegador) que não sai uma rajada de chamadas ao `overpass-api.de` — no máximo uma a cada ~3 s.

- [ ] **Step 7: Selecionar um resultado do reforço**

Clicar num resultado vindo do Overpass/Photon. Confirmar que o mapa centraliza no ponto certo e a rota é calculada normalmente (o `resolveSuggestion` trata `coordinates` já conhecidas, sem chamada extra).

- [ ] **Step 8: (após deploy de preview) conferir o CSP**

No preview da Vercel, abrir o console do navegador durante uma busca de reforço e confirmar que **não há** erro de _Content Security Policy_ bloqueando `overpass-api.de` ou `photon.komoot.io`. Anotar no PR o que foi observado nos passos 3–5 (cobertura real).

---

## Auto-revisão do plano

**1. Cobertura do spec:**

| Requisito do spec | Tarefa |
|---|---|
| Segundo passe: passe rápido inalterado, conta resultados, dispara com < 3 e texto ≥ 4, anexa ao fim sem duplicar | 6 |
| Photon junto do Overpass no segundo passe (não no passe rápido) | 6 |
| Escopo geográfico: DF inteiro via `DF_BOUNDING_BOX` | 1, 3 (Overpass bbox), 5 (Photon bbox) |
| Freios: debounce + `AbortController`; uma consulta por vez; descanso 3 s; piso 4 chars | 6 (orquestração) + 2 (abort combinado) + 4/5 (guarda de 4 chars por cliente) |
| Sem espelho de reserva do Overpass | 4 (um endpoint só) |
| Falha do segundo passe é silenciosa | 6 (`allSettled`, nunca relança) |
| `searchDeepOsm`: 8 campos de nome, tolerância a acento, `nwr` + `out center 30`, rótulo, ranking por distância, corte em 6, timeout 6 s | 3, 4 |
| `searchPhoton`: `q` + `bbox` + viés `lat`/`lon`, filtro BR, ordem preservada, corte em 6, timeout 4 s | 5 |
| CSP: `connect-src` + `overpass-api.de` + `photon.komoot.io` | 7 |
| `vite.config.ts` sem mudança (sem `runtimeCaching`) | — (confirmado no spec; nada a fazer) |
| README: APIs, item do CSP, frase do segundo passe | 7 |
| `PlaceSuggestion`, `SearchBar.tsx`, clientes atuais inalterados | respeitado em todas |
| Testes existentes de `useGeocodingSearch` sem alteração de asserção (só stubs no `beforeEach`) | 6, Step 1(b) |
| Verificação manual | 8 |
| Fora de escopo: fuzzy, espelho, fora do DF, cache do 2º passe, mudança no passe rápido, Foursquare/HERE, unificar `DF_CENTER` | não implementados, por desenho |

Sem lacunas.

**2. Varredura de placeholders:** nenhum "TBD"/"TODO"/"depois". Todo passo de código tem o código completo; todo passo de teste tem o teste completo.

**3. Consistência de tipos e nomes:**
- `DF_BOUNDING_BOX` com `{ south, west, north, east }` — criado na Tarefa 1, consumido com esses nomes nas Tarefas 3 (`buildOverpassQuery` desestrutura `south/west/north/east`) e 5 (`bbox` do Photon usa `west/south/east/north`). Consistente.
- `timeoutSignal(ms, external?) → { signal, cleanup }` — Tarefa 2; consumido igual nas Tarefas 4 e 5 (`const { signal: fetchSignal, cleanup } = timeoutSignal(...)`, `cleanup()` no `finally`).
- `toAccentInsensitivePattern(term)` / `buildOverpassQuery(pattern)` — Tarefa 3; `searchDeepOsm` (Tarefa 4) chama `buildOverpassQuery(toAccentInsensitivePattern(term))`.
- `searchDeepOsm(query, proximity, signal?)` e `searchPhoton(query, proximity, signal?)` — Tarefas 4 e 5; chamadas na Tarefa 6 com exatamente `(query, proximity, signal)`, e os testes da Tarefa 6 verificam `expect.any(AbortSignal)` na 3ª posição.
- `search(query, proximity, signal, lastDeepSearchAtRef, onFastResults)` — assinatura nova na Tarefa 6, com a ref tipada como `{ current: number }`, compatível com `useRef(0)` (`MutableRefObject<number>`).
- `OverpassRequestError` / `PhotonRequestError` — cada uma no seu cliente; os testes usam `rejects.toBeInstanceOf(...)`. O hook nunca as inspeciona (só `allSettled`).
- IDs: `osm:${type}:${id}` e `photon:${osm_type}:${osm_id}` — prefixos distintos de `mapbox:` e do `place_id` da Geoapify; `dedupeByProximity` usa `proximityKey` (coordenada), então os prefixos só importam para não colidir como string de id no React.

Nenhuma inconsistência encontrada.
