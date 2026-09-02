# Busca de reforço (segundo passe): Overpass + Photon

**Data:** 2026-09-01
**Status:** Aprovado para planejamento

## Contexto e motivação

A busca de destino do RouteWise consulta hoje, em paralelo e num único
passe, quatro fontes de texto/proximidade (ver
`src/features/search/useGeocodingSearch.ts`):

- Geoapify `/autocomplete` (`searchPlaces`);
- Geoapify `/search` (`searchPlacesFullText`);
- geocoder clássico do Mapbox (`searchPlacesMapbox`);
- Geoapify Places por categoria (`searchPlacesByCategory`), só quando a
  query bate com um tipo conhecido (`matchPlaceCategory`).

Some-se a isso o cadastro local de unidades de saúde do DF
(`searchDfHealthUnits`), síncrono e sem rede, cujos acertos entram no
topo. A lista só aparece na tela **quando todas as fontes remotas
respondem** (teto de 4 s por fonte).

O teto de cobertura é a **base de dados**: Geoapify e o geocoder do
Mapbox usados aqui derivam quase tudo do OpenStreetMap, que no DF é bom
no Plano Piloto e rala nas regiões administrativas. Prédio pequeno,
comércio de bairro (padaria, mercadinho), rua específica de satélite e
lugar cujo nome no OSM está **desatualizado** (`old_name`) muitas vezes
existe no OSM cru, mas a Geoapify — um índice resumido do OSM — não
devolve.

Decisão tomada com o usuário: adicionar uma **busca de reforço** que
consulta o OSM cru (Overpass API) e um geocoder tolerante a erro de
digitação (Photon), **as duas gratuitas e sem chave**, disparada só
quando o passe rápido traz pouco. Foursquare/HERE (dados fora do OSM,
exigem conta) ficam para uma fase seguinte, se ainda faltar.

## Requisitos (decididos com o usuário)

- **Modelo de disparo — "segundo passe".** O passe rápido de hoje roda
  igual e a lista aparece igual. Logo depois, o hook conta os
  resultados; se vier **menos de 3** e o texto tiver **≥ 4
  caracteres**, dispara Overpass + Photon em segundo plano. Quando
  voltam (1–3 s depois), os achados novos são **anexados ao fim** da
  lista já visível, sem duplicar o que o passe rápido já trouxe. A
  lista cresce sozinha.
- **Photon fica no segundo passe, junto do Overpass** — não entra no
  passe rápido. O ganho dele é menor e não vale mexer no passe rápido,
  que funciona.
- **Escopo geográfico: o DF inteiro.** A consulta do Overpass usa o
  retângulo que cobre o DF (não um raio ao redor do usuário); o Photon
  usa esse mesmo retângulo como filtro `bbox`. Assim um lugar pequeno
  em qualquer canto do DF é alcançável, independentemente de onde o
  usuário está. A ordenação por proximidade acontece depois, no
  cliente.
- **Freios (uso justo do Overpass público):**
  - só dispara com o texto "parado" (mesmo debounce de 300 ms), e é
    **abortado** (`AbortController`) se o usuário digitar outra letra;
  - **uma consulta profunda por vez** — a anterior é cancelada;
  - **descanso de 3 s**: se um segundo passe começou agora, o próximo
    espera pelo menos 3 s;
  - **piso de 4 caracteres** para o segundo passe (o passe rápido
    segue com 3).
- **Sem servidor espelho de reserva do Overpass.** Se o
  `overpass-api.de` estiver fora do ar ou lento, aquela busca fica sem
  reforço e pronto — Geoapify + Mapbox + cadastro local continuam
  respondendo.
- **Falha do segundo passe é silenciosa.** Nunca vira mensagem de erro
  na tela. O aviso de erro da busca continua preso **só ao passe
  rápido**.

## Restrições — preservar o que já funciona

Nada abaixo pode mudar como efeito colateral deste trabalho:

- O tipo `PlaceSuggestion` (`src/types/index.ts`) **não muda**.
- `src/components/SearchBar.tsx` **não muda** — continua consumindo só
  `suggestions` / `resolveSuggestion` / `isLoading` / `error`.
- Os clientes atuais (`geoapifyClient.ts`, `mapboxGeocodingClient.ts`),
  `placeCategories.ts` e `dfHealthUnits.ts` **não mudam** de
  comportamento. O único arquivo de lógica de busca alterado é
  `useGeocodingSearch.ts`, e só para **somar** um segundo passe depois
  do primeiro.
- O passe rápido roda **exatamente como hoje**: mesmas fontes, mesmo
  teto de 4 s, mesma regra de "só é erro se todas as remotas falharem
  E a busca local não achar nada", mesmo `interleave`/`dedupeByProximity`,
  mesmo `MAX_SUGGESTIONS` (12).
- Comentários e texto de usuário em pt-BR; TypeScript `strict`, sem
  `any` implícito. Pipeline local (`npm run lint`, `npx tsc -b`,
  `npm run test`) verde ao fim de cada tarefa.
- Todos os testes já existentes continuam passando. O `beforeEach`
  compartilhado de `useGeocodingSearch.test.ts` ganha stubs padrão das
  duas fontes novas (do mesmo jeito que já stuba `searchPlacesFullText`
  e `searchPlacesMapbox`), para nenhum caso de teste existente disparar
  rede real; as asserções dos casos existentes não mudam.

## Arquitetura

Três peças novas + uma alteração cirúrgica:

```
src/data/dfBounds.ts                (novo)  retângulo do DF + ponto central
src/services/overpassClient.ts      (novo)  searchDeepOsm(query, proximity, signal?)
src/services/photonClient.ts        (novo)  searchPhoton(query, proximity, signal?)
src/features/search/useGeocodingSearch.ts   (alterado)  + segundo passe
```

As duas funções novas devolvem `PlaceSuggestion[]` — o mesmo tipo de
todas as fontes de hoje. `SearchBar.tsx` e o resto da UI não sabem de
onde a sugestão veio.

### Peça 1 — `src/data/dfBounds.ts`

Constantes compartilhadas pelos dois clientes novos. Os números do
retângulo são os mesmos já usados em
`scripts/lib/unidadesSaude.mjs` (`DF_BOX`, limpeza de coordenada do
CNES) — mantidos idênticos de propósito.

```ts
import type { Coordinates } from '../types';

// Retângulo que cobre todo o Distrito Federal (com folga). Mesmos limites
// de scripts/lib/unidadesSaude.mjs — mudou lá, confira aqui.
export const DF_BOUNDING_BOX = {
  south: -16.1,
  west: -48.35,
  north: -15.4,
  east: -47.3,
} as const;

// Centro aproximado do DF (Esplanada/Plano Piloto). Usado como âncora de
// proximidade quando a busca acontece sem GPS. Mesmo ponto que
// geoapifyClient.DEFAULT_SEARCH_CENTER (não unificado agora para não
// mexer em arquivo fora do escopo).
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

### Peça 2 — `src/services/overpassClient.ts`

Segue o padrão dos clientes existentes: funções puras, `fetch` direto,
um erro tipado próprio, conversão para `PlaceSuggestion`.

**Assinatura**

```ts
export class OverpassRequestError extends Error {}

export async function searchDeepOsm(
  query: string,
  proximity: Coordinates | null,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]>;
```

**Constantes**

```ts
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const NAME_KEYS = [
  'name', 'name:pt', 'alt_name', 'old_name',
  'short_name', 'official_name', 'loc_name', 'brand',
];
const MIN_TERM_LENGTH = 4;
const ELEMENT_LIMIT = 30;      // "out center 30"
const MAX_SUGGESTIONS = 6;
const TIMEOUT_MS = 6000;
```

**Padrão de busca tolerante a acento (função pura, testável).**
O regex do Overpass não dobra acento. Como não dá para normalizar o
lado do servidor, o termo digitado é normalizado (`normalize` de
`src/utils/text.ts`: NFD + remoção de diacríticos + minúsculas + trim)
e então expandido:

1. quebra o termo em palavras por espaço;
2. para cada palavra, caractere a caractere:
   - metacaractere de regex (`. * + ? ( ) [ ] { } ^ $ | \`) → escapado
     com `\`;
   - letra com formas acentuadas → classe: `a`→`[aáàâãä]`,
     `e`→`[eéèêë]`, `i`→`[iíìî]`, `o`→`[oóòôõ]`, `u`→`[uúùû]`,
     `c`→`[cç]`, `n`→`[nñ]`;
   - qualquer outro caractere → ele mesmo;
3. junta as palavras com `\s+` (espaço flexível → "nessa ordem").

Ex.: `"guará"` → `normalize` → `"guara"` → `g[uúùû][aáàâãä]r[aáàâãä]`
(casa "guara", "Guará", "GUARÁ" com o flag `,i`).
`"padaria bonanza"` → `p[aáàâãä]d[aáàâãä]r[iíìî][aáàâãä]\s+b[oóòôõ]n[aáàâãä]nz[aáàâãä]`.

**Query Overpass QL** (`{S}{W}{N}{E}` do `DF_BOUNDING_BOX`):

```
[out:json][timeout:25];
nwr[~"^(name|name:pt|alt_name|old_name|short_name|official_name|loc_name|brand)$"~"<PADRÃO>",i]({S},{W},{N},{E});
out center 30;
```

`nwr` = node + way + relation; `out center` dá lat/lon para node e um
ponto representativo para way/relation. Enviada por `POST` com
`Content-Type: application/x-www-form-urlencoded` e corpo
`data=${encodeURIComponent(ql)}`.

**Tempo e cancelamento.** O cliente cria um `AbortController` próprio;
`setTimeout(() => controller.abort(), 6000)` para o teto, e
`signal?.addEventListener('abort', () => controller.abort())` para o
cancelamento externo (nova tecla). `finally` limpa o timer e o
listener. Abort externo → devolve `[]` (não lança); timeout ou
resposta não-ok → `OverpassRequestError` (o hook trata como fonte
vazia).

**Conversão da resposta.** Para cada elemento:

- coordenada: `lat`/`lon` do próprio elemento, senão `center.lat`/`center.lon`;
  sem nenhum dos dois → descarta;
- nome de exibição: `tags.name ?? tags.official_name ?? tags.brand ??
  tags['name:pt'] ?? tags.alt_name ?? tags.short_name`; nenhum →
  descarta;
- rótulo (`placeName`): `nome` + `", " + partes + ", Brasília - DF"`,
  onde `partes` = `[rua(+", "+número), addr:suburb ?? addr:district]`
  sem os vazios; **sem nenhuma parte de endereço, o rótulo é só o
  nome** (ainda útil — a pessoa reconhece o nome que buscou);
- `id`: `` `osm:${element.type}:${element.id}` `` (prefixo evita
  colisão com `place_id` da Geoapify e `mapbox:` na deduplicação).

Depois: calcula `haversineDistanceMeters(centro, coord)` com
`centro = proximity ?? DF_CENTER`, **ordena crescente por distância**,
corta em `MAX_SUGGESTIONS` (6).

Se `normalize(query).length < MIN_TERM_LENGTH`, devolve `[]` sem
chamar a rede.

### Peça 3 — `src/services/photonClient.ts`

**Assinatura**

```ts
export class PhotonRequestError extends Error {}

export async function searchPhoton(
  query: string,
  proximity: Coordinates | null,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]>;
```

**Constantes**

```ts
const PHOTON_URL = 'https://photon.komoot.io/api';
const REQUEST_LIMIT = 10;
const MAX_SUGGESTIONS = 6;
const TIMEOUT_MS = 4000;
```

**Requisição** — `GET` com querystring:

- `q` = termo (`normalize` **não** é aplicado aqui — o Photon lida bem
  com acento e maiúscula; passa-se `query.trim()`);
- `lang=pt` (o Photon pode ignorar e cair no nome padrão — aceitável);
- `limit=10`;
- `lat` / `lon` = `proximity ?? DF_CENTER` (**viés** de ordenação, não
  filtro);
- `bbox` = `` `${DF_BOUNDING_BOX.west},${DF_BOUNDING_BOX.south},${DF_BOUNDING_BOX.east},${DF_BOUNDING_BOX.north}` ``
  (**filtro** — Photon usa a ordem `minLon,minLat,maxLon,maxLat`).

Mesmo padrão de `AbortController` + timeout do Overpass. Resposta
não-ok → `PhotonRequestError`; abort externo → `[]`.

**Conversão da resposta** (GeoJSON `FeatureCollection`). Para cada
`feature`:

- coordenada: `feature.geometry.coordinates` = `[lon, lat]`; ausente
  ou fora do formato → descarta;
- `p = feature.properties`; se `p.countrycode` existe e não é `'BR'` →
  descarta (defensivo; o `bbox` já deve garantir);
- nome de exibição: `p.name ?? p.street`; nenhum → descarta;
- rótulo: mesmo formato do Overpass — `nome` + partes
  (`[p.name ? rua(+", "+número) : null, p.district ?? p.city]` sem
  vazios) + `", Brasília - DF"`; sem partes, só o nome;
- `id`: `` `photon:${p.osm_type ?? 'x'}:${p.osm_id ?? indice}` ``.

**Ordem preservada** — o Photon já ordena por relevância de nome +
proximidade, que é o que se quer aqui; o cliente **não reordena**. Só
corta em `MAX_SUGGESTIONS` (6).

### Peça 4 — alteração em `useGeocodingSearch.ts`

**Constantes novas** (no topo do arquivo):

```ts
const DEEP_SEARCH_MIN_QUERY_LENGTH = 4;
const DEEP_SEARCH_RESULT_FLOOR = 3;     // passe rápido com < 3 → dispara
const DEEP_SEARCH_COOLDOWN_MS = 3000;
```

**Estado de módulo** (fora do hook, como o descanso é por aba/sessão):

```ts
let lastDeepSearchStartedAt = 0;
```

**`search()` passa a orquestrar os dois passes.** Assinatura nova:

```ts
async function search(
  query: string,
  proximity: Coordinates | null,
  signal: AbortSignal,
  onFastResults: (results: PlaceSuggestion[]) => void,
): Promise<PlaceSuggestion[]>;
```

Fluxo:

1. **Passe rápido** — idêntico ao `search()` de hoje (cadastro local +
   `Promise.allSettled` das 3–4 tarefas remotas + regra de erro +
   `interleave`/`dedupeByProximity` + `slice(0, MAX_SUGGESTIONS)`).
   Chame o resultado de `fastList`.
2. `onFastResults(fastList)` — a UI mostra já.
3. **Decide o segundo passe.** Dispara sse:
   - `fastList.length < DEEP_SEARCH_RESULT_FLOOR`; **e**
   - `query.trim().length >= DEEP_SEARCH_MIN_QUERY_LENGTH`; **e**
   - `Date.now() - lastDeepSearchStartedAt >= DEEP_SEARCH_COOLDOWN_MS`; **e**
   - `!signal.aborted`.

   Não dispara → `return fastList;`.
4. `lastDeepSearchStartedAt = Date.now();`
5. `const outcomes = await Promise.allSettled([
     searchDeepOsm(query, proximity, signal),
     searchPhoton(query, proximity, signal),
   ]);`
6. `if (signal.aborted) return fastList;` (não atualiza mais nada).
7. Mescla: `dedupeByProximity([...fastList, ...osmResults, ...photonResults])
   .slice(0, MAX_SUGGESTIONS)` — Overpass antes do Photon; o `fastList`
   na frente garante que, se o mesmo lugar vier dos dois, a versão do
   passe rápido (rótulo melhor) vence.
8. `return` a lista mesclada.

O segundo passe é `allSettled` e **nunca relança** — só o passe rápido
pode produzir o erro de "todas as fontes falharam".

**`useEffect`** — muda para carregar um `AbortController` e aceitar as
duas atualizações:

```ts
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
    search(query, proximity ?? null, deepController.signal, (fast) => {
      if (!isCancelled) {
        setSuggestions(fast);
        setError(null);
        setIsLoading(false);   // resultado rápido já na tela
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
        if (!isCancelled) setIsLoading(false);
      });
  }, DEBOUNCE_MS);

  return () => {
    isCancelled = true;
    clearTimeout(timeoutId);
    deepController.abort();
  };
}, [query, proximity]);
```

`MIN_QUERY_LENGTH` (3), `DEBOUNCE_MS` (300), `MAX_SUGGESTIONS` (12) e
`resolveSuggestion` **não mudam** — sugestões do segundo passe já
chegam com `coordinates`, então o caminho atual
`suggestion.coordinates as Coordinates` já cobre.

### Peça 5 — CSP, cache offline e README

**CSP** (`vercel.json`). Único ponto de segurança alterado no projeto.
No `connect-src`, acrescentar `https://overpass-api.de` e
`https://photon.komoot.io`:

```
connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://api.geoapify.com https://overpass-api.de https://photon.komoot.io;
```

O resto do header fica igual. Não há CSP no `npm run dev` (só no site
publicado), então o desenvolvimento local já funciona sem esta
mudança.

**Cache offline** (`vite.config.ts`). Nenhuma mudança: o `workbox`
só faz precache do esqueleto (`globPatterns`) e não tem
`runtimeCaching` — respostas de Overpass/Photon nunca seriam cacheadas,
igual às da Geoapify/Mapbox.

**README.** Acrescentar:

- na lista de APIs: Overpass API (OpenStreetMap) e Photon (komoot) como
  **busca de reforço** para lugar pequeno/periférico e nome
  desatualizado — gratuitas, sem chave, consultadas só quando o passe
  rápido traz pouco;
- no item `connect-src` da seção de CSP: os dois endereços novos;
- uma frase na descrição da busca sobre o comportamento de "segundo
  passe" (lista que se completa um instante depois).

## Resiliência a erros

- **Overpass/Photon fora do ar, lentos, ou recusando por uso justo:**
  `searchDeepOsm`/`searchPhoton` rejeitam; o `Promise.allSettled` do
  segundo passe absorve; a lista fica só com o passe rápido; **sem
  erro na tela**.
- **Nova tecla durante o segundo passe:** `deepController.abort()` no
  cleanup do efeito → os `fetch` são abortados, `signal.aborted` corta
  a atualização, o efeito seguinte assume.
- **Descanso de 3 s** evita rajada de consultas profundas ao segurar
  uma tecla ou colar/editar texto rápido.
- **Passe rápido inalterado:** a regra "só é erro se todas as remotas
  falharem E a local não achar nada" continua valendo, e só sobre o
  passe rápido.

## Testes

- **`src/data/dfBounds.test.ts` (novo):** `isWithinDf` aceita Plano
  Piloto, Guará II e Ceilândia; rejeita um ponto de Goiânia; o
  retângulo tem `south < north` e `west < east`.

- **`src/services/overpassClient.test.ts` (novo):**
  - monta a query com o retângulo do DF e o regex `^(name|name:pt|...)$`
    dos 8 campos de nome (inspeciona o corpo do `POST`);
  - `"guará"` no input vira padrão que casa `"guara"` (classe de
    caractere por vogal);
  - escapa metacaractere de regex no texto (`"a.b"` → `a\.b`);
  - várias palavras viram `\s+` entre elas, na ordem digitada;
  - converte elementos em `PlaceSuggestion`, **ordenados por distância**
    do centro informado;
  - usa `center` para elementos `way`/`relation`; descarta os sem
    coordenada;
  - descarta elementos sem nenhum campo de nome; usa `official_name`/
    `brand` quando não há `name`;
  - monta o rótulo com `rua, número - bairro, Brasília - DF` quando os
    `addr:*` existem; cai para só o nome sem `addr:*`;
  - corta em 6;
  - `proximity` null → usa `DF_CENTER` como âncora de distância;
  - resposta não-ok → `OverpassRequestError`;
  - `signal` já abortado → devolve `[]` sem chamar `fetch`;
  - `normalize(query).length < 4` → devolve `[]` sem chamar `fetch`.

- **`src/services/photonClient.test.ts` (novo):**
  - monta a URL com `q`, `bbox` do DF (`minLon,minLat,maxLon,maxLat`) e
    viés `lat`/`lon`;
  - converte a `FeatureCollection` em `PlaceSuggestion` **preservando a
    ordem** do Photon;
  - descarta `feature` com `countrycode` ≠ `BR`;
  - descarta `feature` sem coordenada utilizável;
  - monta o rótulo a partir de `name`/`street`/`housenumber`/`district`/
    `city`;
  - corta em 6;
  - `proximity` null → `lat`/`lon` = `DF_CENTER`, `bbox` continua o do
    DF;
  - resposta não-ok → `PhotonRequestError`;
  - `signal` já abortado → devolve `[]` sem chamar `fetch`.

- **`src/features/search/useGeocodingSearch.test.ts` (só acrescenta):**
  - o `beforeEach` ganha
    `vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([])` e
    `vi.spyOn(photonClient, 'searchPhoton').mockResolvedValue([])`
    (padrão desligado, como já se faz com fullText/mapbox); asserções
    dos casos existentes **não mudam**;
  - passe rápido com < 3 resultados e query ≥ 4 chars → `searchDeepOsm`
    **e** `searchPhoton` são chamados, e os achados do segundo passe
    aparecem **anexados ao fim** da lista;
  - passe rápido com ≥ 3 resultados → nenhum dos dois é chamado;
  - query com 3 caracteres → nenhum dos dois é chamado (piso de 4);
  - achado do segundo passe com a mesma coordenada (~11 m) de um do
    passe rápido **não duplica** (o do passe rápido vence);
  - `searchDeepOsm` e `searchPhoton` ambos rejeitando → `error`
    permanece `null` e a lista do passe rápido continua na tela;
  - desmontar/rebuscar durante o segundo passe → `deepController.abort()`
    é chamado (spy em `AbortController.prototype.abort` ou no `signal`),
    e o resultado obsoleto não entra na lista;
  - dois ciclos em menos de 3 s → o segundo ciclo **não** dispara o
    segundo passe (descanso);
  - repassa `proximity` para `searchDeepOsm`/`searchPhoton`.

- **Verificação manual** (`npm run dev`, tarefa final sem código): com
  o passe rápido vindo fraco, buscar (a) uma padaria/mercadinho de
  bairro pelo nome, (b) uma rua específica de cidade satélite, (c) um
  lugar conhecido por um nome antigo; confirmar que a lista **cresce**
  um instante depois do resultado rápido; confirmar que digitar
  rápido não trava nem repete a busca; após deploy de preview,
  confirmar no console que não há violação de CSP.

- Pipeline completo (`npm run lint && npx tsc -b && npm run test`)
  verde ao fim de cada tarefa.

## Manutenção e operação

- Overpass e Photon são infraestrutura pública compartilhada, com
  política de uso justo. Se ficarem instáveis, o recurso degrada em
  silêncio — não há nada para regenerar nem chave para rotacionar.
- Se o `lang=pt` do Photon se mostrar sempre ignorado (rótulos com
  exônimo em inglês), revisitar só se alguém notar.
- Nova RA ou novo endereço no OSM aparece automaticamente na busca de
  reforço (é o OSM cru) — sem passo de regeneração, ao contrário do
  cadastro de unidades de saúde.

## Fora de escopo (YAGNI)

- Busca aproximada local (Levenshtein/fuzzy) — o padrão acento-tolerante
  + `\s+` cobre os casos reais.
- Servidor espelho de reserva do Overpass (`kumi.systems` etc.).
- Resultados fora do DF.
- Cache das respostas do segundo passe.
- Qualquer mudança no passe rápido (fontes, ordem, teto, erro).
- Foursquare / HERE (dados fora do OSM, exigem conta) — fase seguinte,
  só se ainda faltar cobertura.
- Unificar `DF_CENTER` com `geoapifyClient.DEFAULT_SEARCH_CENTER`
  (mesmo valor, arquivos separados por ora — refactor fora do escopo).
