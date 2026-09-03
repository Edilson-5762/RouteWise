# Busca de unidades de saúde do DF a partir de um cadastro local (CNES)

**Data:** 2026-09-01
**Status:** Aprovado para planejamento

## Contexto e motivação

A busca de destino do RouteWise hoje consulta, em paralelo, três fontes
de texto (Geoapify `/autocomplete`, Geoapify `/search`, geocoder clássico
do Mapbox) e, quando a query bate com uma categoria conhecida
(`matchPlaceCategory`), também a Geoapify Places por proximidade. Ver
`src/features/search/useGeocodingSearch.ts`.

Um usuário relatou que buscar as UBS (Unidades Básicas de Saúde) do DF
não funciona — por exemplo, "UBS 1 Guará" / "UBS 2 Guará" não retornam
nada. A investigação (systematic-debugging, com testes diretos às APIs)
encontrou **três causas somadas**:

1. **A busca por categoria/proximidade não alcança as cidades-satélite
   sem GPS.** Sem localização, o centro é o Plano Piloto e o raio é 8 km
   (`SEARCH_RADIUS_METERS` em `geoapifyClient.ts`). O Guará I fica a
   ~8,0 km e o Guará II a ~10,7 km desse ponto — fora do círculo.
   Aumentar o raio não resolve: o `bias=proximity` ordena por distância
   do centro e a densidade de clínicas do Plano Piloto empurra as
   unidades das RAs para fora das primeiras dezenas de resultados.
2. **"UBS" e "Guará" são termos ruins para geocoder.** "UBS" sozinho é
   nome comum no Brasil inteiro; "Guará" (4 letras) casa por proximidade
   textual com Guaratinguetá, Guararema, Guarani, Jaboatão dos
   Guararapes. O `bias` só favorece, não filtra.
3. **As UBS 1 e 2 do Guará não estão na base OpenStreetMap/Geoapify nem
   no Mapbox** sob nenhum nome recuperável (mais de 20 variações
   testadas). Não há ajuste de query que traga o que não está indexado.

As causas 1 e 2 têm mitigação parcial via ajuste de query; a causa 3
não. O usuário optou por resolver de vez: **embutir no app um cadastro
próprio das unidades de saúde do DF**, com nome e coordenada de cada
uma, e casar a busca localmente contra esse cadastro.

Confirmação de viabilidade (feita antes deste spec): o **CNES**
(Cadastro Nacional de Estabelecimentos de Saúde, DATASUS) publica um
dump nacional em JSON (domínio público). Filtrando `CO_UF === "53"` e os
tipos de unidade de interesse, sobram **~360 unidades no DF**. As UBS
01, 02, 03 e 04 do Guará aparecem com `NO_FANTASIA` exatamente no
formato que as pessoas buscam ("UBS 02 GUARA") e com coordenada válida.
Cerca de 55 registros têm coordenada ausente ou "chumbada" (um ponto
genérico repetido no centro de Brasília) — recuperáveis pelo endereço
de rua, que o cadastro traz.

## Requisitos (decididos com o usuário)

- **Abrangência:** DF inteiro (todas as RAs), não só o Guará.
- **Geração dos dados:** um script rodado **à mão** (`npm run
  generate:unidades-saude`) baixa o CNES, filtra, limpa e grava um
  arquivo versionado dentro de `src/`. O app **nunca** depende, em
  runtime nem em build, de o servidor do DATASUS estar no ar.
- **Quando a busca local é consultada:** sempre, em paralelo com as
  fontes remotas. É busca em memória, sem rede — instantânea.
- **Ordenação:** acertos do cadastro local aparecem **no topo** da
  lista de sugestões, acima dos resultados das fontes remotas, sem
  duplicar um lugar que também venha de uma fonte remota.
- **Peso no bundle:** embutir direto (≈15 KB comprimidos). Sem
  carregamento sob demanda.

## Restrições — preservar a estrutura que já funciona

Nada abaixo pode mudar como efeito colateral deste trabalho:

- O tipo `PlaceSuggestion` (`src/types/index.ts`) **não muda**.
- `src/components/SearchBar.tsx` **não muda** — continua consumindo só
  `suggestions` / `resolveSuggestion`.
- Os clientes remotos (`geoapifyClient.ts`, `mapboxGeocodingClient.ts`)
  e `placeCategories.ts` **não mudam** de comportamento. O único
  arquivo de lógica de busca alterado é `useGeocodingSearch.ts`, e só
  para **somar** uma fonte.
- **Nenhuma requisição de rede nova no app.** Os dados são estáticos e
  embutidos. Logo: **nenhuma mudança na CSP** (`connect-src` continua
  Mapbox + Geoapify), **nenhuma variável de ambiente nova**, nenhuma
  mudança em `.env.example`.
- Todos os testes já existentes continuam passando sem alteração.
- Comentários e texto de usuário em pt-BR; TypeScript `strict`, sem
  `any` implícito. Pipeline local (`npm run lint`, `npx tsc -b`,
  `npm run test`) verde ao fim de cada tarefa.

## Arquitetura

Três peças novas + uma alteração cirúrgica:

```
scripts/generate-unidades-saude.mjs   (novo, roda em Node, à mão)
        │  baixa CNES nacional → filtra DF → limpa coords → gera apelidos
        ▼
src/data/dfHealthUnits.generated.ts   (novo, versionado)
        export const DF_HEALTH_UNITS: DfHealthUnit[] = [ ...~360 ]
        ▲
        │ importado por
        ▼
src/data/dfHealthUnits.ts             (novo)
        interface DfHealthUnit
        searchDfHealthUnits(query, proximity, limit?): PlaceSuggestion[]
        ▲
        │ chamado por
        ▼
src/features/search/useGeocodingSearch.ts   (alterado: +1 fonte local)
```

`scripts/data/unidades-saude.overrides.json` (novo, versionado) —
correções manuais aplicadas por cima da geração e nunca sobrescritas.

### Peça 1 — `scripts/generate-unidades-saude.mjs`

Segue o padrão de `scripts/generate-og.mjs`: script Node ESM, rodado à
mão, saída versionada, comentário de cabeçalho explicando o porquê. Novo
item em `package.json` → `"generate:unidades-saude": "node
scripts/generate-unidades-saude.mjs"`.

**Fonte.** `https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos_json.zip`
(dump do Portal de Dados Abertos do SUS; ~67 MB comprimido, ~640 MB
JSON). O script:

1. Baixa o ZIP para um diretório temporário fora do repo (não
   versionar o dump).
2. Descompacta e varre o JSON de topo em modo streaming — o arquivo
   passa do limite de string do Node (`readFileSync` como Buffer +
   varredura por profundidade de chave/aspas; registros são objetos
   planos, só valores string).
3. Filtra `CO_UF === "53"`.

**Filtro de tipo.** Mantém os `TP_UNIDADE` (sem zero à esquerda, como
vêm no dump) relevantes para um destino de navegação:

| Código | Rótulo                         | ~qtde no DF |
|--------|--------------------------------|-------------|
| `1`    | Posto de Saúde                 | 2           |
| `2`    | UBS / Centro de Saúde          | 211         |
| `5`    | Hospital Geral                 | 59          |
| `7`    | Hospital Especializado         | 43          |
| `15`   | Unidade Mista                  | 0–poucos    |
| `20`   | Pronto-Socorro Geral           | 4           |
| `21`   | Pronto-Socorro Especializado   | 2           |
| `70`/`72` | CAPS                        | 20          |
| `73`   | UPA / Pronto Atendimento       | 16          |

**Exclui o tipo `4` (Policlínica, 786 registros):** no DF é dominado
por clínicas privadas de medicina do trabalho e afins, e ~28% têm
coordenada ruim. As policlínicas públicas de referência que interessam
(ex.: "Policlínica do Guará") entram pela lista de `overrides` se o
usuário sentir falta.

**Limpeza de coordenadas.** `NU_LATITUDE`/`NU_LONGITUDE` são strings.
Considera **ruim** quando: não é número finito; é `0`; cai fora da
caixa do DF (`lat ∈ [-16.10, -15.40]`, `lng ∈ [-48.35, -47.30]`); ou é
placeholder — família `-15.78,-47.9x` com 2 casas decimais, ou 5+
dígitos idênticos seguidos (ex.: `-15.783333`).

**Recuperação de coordenada ruim.** Para cada unidade com coord ruim
mas com `NO_LOGRADOURO` + `CO_CEP`, o script geocodifica o endereço
montado (`"{logradouro}, {nº}, {bairro}, Brasília - DF, {CEP}"`) via
Geoapify `/search` (`filter=countrycode:br`, `lang=pt`), usando a chave
de `.env` (`VITE_GEOAPIFY_API_KEY`). São ~55 chamadas, uma vez, dentro
da cota grátis. Se o resultado cair dentro da caixa do DF, usa; senão
mantém como ruim.

**Unidades sem coordenada utilizável ao fim** são **excluídas** da
saída e **listadas no stdout** do script (nome + endereço + CNES) para
correção manual via `overrides`.

**Overrides.** `scripts/data/unidades-saude.overrides.json`:

```json
{
  "byCnes": {
    "0000000": {
      "exclude": true
    },
    "1234567": {
      "displayName": "Policlínica do Guará",
      "coordinates": { "lat": -15.8405, "lng": -47.9670 },
      "extraAliases": ["policlinica guara", "posto guara ii"]
    }
  },
  "add": [
    {
      "id": "manual-ubs-x",
      "displayName": "UBS Nova (não cadastrada no CNES ainda)",
      "kind": "UBS",
      "ra": "Guará",
      "coordinates": { "lat": -15.83, "lng": -47.97 },
      "aliases": ["ubs nova guara"]
    }
  ]
}
```

O script aplica `overrides` **por último**: mescla campos em `byCnes`,
respeita `exclude`, e concatena `add`. Regenerar o dataset nunca perde
essas correções.

**Geração de apelidos (`searchText`).** Para cada unidade o script
monta uma string normalizada (via o mesmo `normalize()` de
`src/utils/text.ts` — reimplementado no script, que não importa de
`src/`) concatenando:

- `NO_FANTASIA` normalizado ("ubs 02 guara");
- variações de número: dígito ↔ com zero à esquerda ↔ romano ↔ por
  extenso, só no lugar do número da unidade ("ubs 2 guara", "ubs 02
  guara", "ubs ii guara", "ubs dois guara");
- expansões de sigla: "unidade basica de saude {n} {ra}", "posto de
  saude {n} {ra}", "centro de saude {n} {ra}";
- o bairro/RA (`NO_BAIRRO`) normalizado, com e sem número romano
  convertido ("guara ii" e "guara 2");
- sinônimos do tipo ("ubs"/"posto de saude"/"unidade de saude" para
  tipos 1/2; "upa"/"pronto atendimento" para 73; "caps" para 70/72;
  "pronto socorro" para 20/21).

**Saída.** `src/data/dfHealthUnits.generated.ts`, com aviso de
"arquivo gerado, não editar à mão", ordenado por `id` (CNES) para o
diff ser estável:

```ts
// GERADO por scripts/generate-unidades-saude.mjs — não edite à mão.
// Fonte: CNES/DATASUS (domínio público). Regenerar: npm run generate:unidades-saude
import type { DfHealthUnit } from './dfHealthUnits';

export const DF_HEALTH_UNITS: DfHealthUnit[] = [
  {
    id: 'cnes-0010203',             // `cnes-${CO_CNES}`
    displayName: 'UBS 02 Guará, QE 23, Guará II, Brasília - DF',
    kind: 'UBS',
    ra: 'Guará',
    coordinates: { lat: -15.8327655, lng: -47.973277 },
    searchText: 'ubs 02 guara ubs 2 guara unidade basica de saude 2 guara posto de saude 2 guara guara ii guara 2 ...',
  },
  // ...
];
```

`displayName` já vem no formato "Nome, Rua, Bairro, Cidade - UF" — igual
ao `formatted` da Geoapify — para as sugestões ficarem visualmente
homogêneas na lista. O CAIXA ALTA do CNES vira Title Case; acentos são
repostos por uma tabela pequena de RAs conhecidas (Guará, Ceilândia,
Brazlândia, São Sebastião, Planaltina...).

### Peça 2 — `src/data/dfHealthUnits.ts`

```ts
export interface DfHealthUnit {
  id: string;                 // `cnes-${CO_CNES}` (ou `manual-*` de overrides)
  displayName: string;        // rótulo pronto para a lista de sugestões
  kind: 'UBS' | 'Posto' | 'Hospital' | 'UPA' | 'CAPS' | 'Pronto-Socorro' | 'Unidade Mista';
  ra: string;                 // Região Administrativa, ex.: "Guará"
  coordinates: Coordinates;   // sempre presente (unidades sem coord são excluídas na geração)
  searchText: string;         // string normalizada com nome + apelidos (montada na geração)
}

export function searchDfHealthUnits(
  query: string,
  proximity: Coordinates | null,
  limit = 6,
): PlaceSuggestion[];
```

Algoritmo de `searchDfHealthUnits`:

1. `normalize(query)` (o util já existente). Se vazia, retorna `[]`.
2. Tokeniza por espaço. Expande cada token numérico para o conjunto
   {dígito, com-zero, romano, extenso} — o mesmo mapa usado na geração,
   para o token da query casar com o `searchText`.
3. **Guarda contra query genérica:** se, removidos os tokens que são só
   palavra de tipo ("ubs", "posto", "saude", "hospital", "upa", "caps",
   "unidade", "basica", "de", "pronto", "socorro"), **não sobrar
   nenhum** token distintivo (número ou nome de lugar), retorna `[]` —
   "hospital" sozinho continua sendo respondido pela busca por
   categoria/proximidade de hoje, não por esta lista.
4. Uma unidade **casa** se, para cada token (grupo expandido) da query,
   **alguma** variação aparece como substring de `unit.searchText`.
5. Ordena os que casaram: se `proximity != null`, por distância
   crescente (`haversineDistanceMeters`); senão, por `searchText` mais
   curto primeiro (heurística "nome mais específico bate melhor"),
   desempate alfabético por `displayName`.
6. Corta em `limit` e mapeia para `PlaceSuggestion`:
   `{ id, placeName: displayName, coordinates }`.

Pura, síncrona, sem rede, não lança.

### Peça 3 — alteração em `useGeocodingSearch.ts`

Uma mudança, aditiva, dentro da função `search()`:

```ts
import { searchDfHealthUnits } from '../../data/dfHealthUnits';

async function search(query, proximity) {
  // Fonte local: cadastro de unidades de saúde do DF (CNES embutido).
  // Síncrona, sem rede, não entra na conta de "todas as fontes falharam".
  const localUnits = searchDfHealthUnits(query, proximity);

  const tasks = [ /* ...as três/quatro tasks remotas de hoje, inalteradas... */ ];
  const outcomes = await Promise.allSettled(tasks);

  const remoteAllFailed = outcomes.every((o) => o.status === 'rejected');
  // Só é erro se as remotas falharam E a busca local também não achou nada.
  if (remoteAllFailed && localUnits.length === 0) {
    throw (outcomes[0] as PromiseRejectedResult).reason;
  }

  // ...interleave/dedupe de hoje, sem mudança...
  const byText = dedupeByProximity(interleave([resultOf(0), resultOf(2), resultOf(1)]));
  const byCategory = /* ...igual a hoje... */;

  // Unidades locais primeiro, deduplicadas por proximidade contra tudo
  // que veio das fontes remotas.
  const merged = dedupeByProximity([...localUnits, ...byText, ...byCategory]);
  return merged.slice(0, MAX_SUGGESTIONS);
}
```

Notas:

- `dedupeByProximity` já existe e usa `proximityKey` (lat/lng com 4
  casas ≈ 11 m). Passar `localUnits` na frente garante que, se a mesma
  unidade vier também da Geoapify, a versão local (rótulo melhor)
  vence e a remota é descartada.
- `MAX_SUGGESTIONS` (12) inalterado.
- `resolveSuggestion` **não muda**: sugestões locais já trazem
  `coordinates`, então o caminho `suggestion.coordinates as Coordinates`
  já cobre.
- O `useEffect` (debounce de 300 ms, `MIN_QUERY_LENGTH` 3, cancelamento)
  **não muda**. A busca local roda junto, dentro do mesmo `setTimeout`.

### Peça 4 — exibição

Nenhuma mudança de componente. `displayName` é construído na geração no
mesmo formato dos outros resultados, e `SearchBar.tsx` renderiza
`suggestion.placeName` como hoje.

## Resiliência a erros

- **Script:** falha de download/descompactação → aborta com mensagem
  clara e código de saída ≠ 0 (não grava saída parcial). Falha de
  geocodificação de um endereço → trata como coord não recuperada
  (unidade excluída + logada), não derruba o script.
- **App:** `searchDfHealthUnits` é pura e em memória — não tem modo de
  falha. Se o arquivo gerado estiver vazio (ex.: nunca rodaram o
  script), a função retorna `[]` e o app se comporta exatamente como
  hoje.

## Testes

- **`scripts/generate-unidades-saude.mjs`:** extrair as funções puras
  (limpeza/validação de coordenada, expansão de número, montagem de
  `searchText`, aplicação de `overrides`) para um módulo irmão
  testável, `scripts/lib/unidadesSaude.mjs`, com testes Vitest:
  rejeita placeholder `-15.78,-47.93`; rejeita fora da caixa do DF;
  aceita coord válida do Guará; `"ubs 2 guara"` e `"ubs 02 guara"`
  ambos presentes no `searchText` gerado a partir de "UBS 02 GUARA";
  `override` com `exclude` remove a unidade; `override` de
  `coordinates` prevalece sobre a do CNES. O download em si não é
  testado (efeito de rede).
- **`src/data/dfHealthUnits.test.ts`:** com um `DF_HEALTH_UNITS` de
  fixture (mock do módulo `.generated`): "UBS 2 Guará" acha a unidade
  certa; "ubs 02 guara" idem; "unidade básica de saúde 2 guará" idem;
  "posto de saúde 2 guará" idem; "hospital" sozinho retorna `[]`
  (guarda contra genérico); com `proximity`, ordena por distância;
  respeita `limit`; query vazia → `[]`.
- **`src/features/search/useGeocodingSearch.test.ts`:** novos testes,
  sem alterar os existentes — mockando `dfHealthUnits`: unidade local
  aparece **antes** dos resultados remotos; unidade local que também
  vem da Geoapify não duplica (a local vence); se todas as fontes
  remotas rejeitam mas a local achou algo, `error` fica `null` e a
  unidade é exibida; query sem match local mantém o comportamento
  atual byte a byte.
- Pipeline completo (`npm run lint && npx tsc -b && npm run test`)
  verde.

## Manutenção e dados

- **README:** acrescentar na seção de tecnologias/fontes uma linha
  sobre o CNES/DATASUS como origem do cadastro local de unidades de
  saúde do DF (domínio público), e uma nota curta em "como rodar"
  sobre `npm run generate:unidades-saude` ser manual e opcional (o
  arquivo gerado já vem versionado).
- **Quando regenerar:** a cada poucos meses, ou quando alguém reportar
  unidade faltando/movida. O diff do arquivo gerado é revisável.
- O dump do CNES **não** é versionado; só o `.generated.ts` destilado
  (~360 linhas de dados) e o `overrides.json`.

## Fora de escopo (YAGNI)

- Casamento aproximado (Levenshtein/fuzzy) — o casamento por
  substring de tokens com expansão de número/sigla cobre os casos
  reais; fuzzy pode entrar depois se necessário.
- Sincronização automática com o CNES (cron, build-time fetch).
- Outras UFs além do DF.
- Metadados por unidade além do necessário para achar e rotear
  (telefone, horário, serviços, especialidades).
- Carregamento sob demanda (`import()` dinâmico) do dataset.
- Mudar as causas 1 e 2 do diagnóstico (raio/termos do geocoder) —
  este spec cobre só a causa 3; o cadastro local passa a responder
  antes das fontes remotas nesses casos de qualquer modo.
