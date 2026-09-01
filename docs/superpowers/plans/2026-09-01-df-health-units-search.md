# Plano de Implementação — Busca de unidades de saúde do DF via cadastro local (CNES)

> **Para quem for executar:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Fazer a busca de destino do RouteWise achar as unidades públicas de saúde do DF (UBS, postos, hospitais regionais, UPAs, CAPS) a partir de um cadastro próprio embutido no app, destilado do CNES/DATASUS, consultado localmente e mesclado no topo das sugestões.

**Arquitetura:** Um script Node rodado à mão (`npm run generate:unidades-saude`) baixa o dump nacional do CNES, filtra o DF, limpa coordenadas e grava `src/data/dfHealthUnits.generated.ts` (versionado). Um módulo novo `src/data/dfHealthUnits.ts` expõe `searchDfHealthUnits(query, proximity)` — casamento por texto normalizado com expansão de número/sigla. `useGeocodingSearch.ts` ganha **uma** fonte a mais: a busca local roda junto com Geoapify/Mapbox e seus acertos entram antes, deduplicados por proximidade. Nenhuma requisição de rede nova no app.

**Tech Stack:** TypeScript (`strict`), React 18, Vitest + Testing Library, Node ESM para o script (sem dependências novas — `fetch` nativo, `node:zlib`/`unzip` via `node:stream`). Mesma stack já usada no projeto.

**Spec:** [docs/superpowers/specs/2026-09-01-df-health-units-search-design.md](../specs/2026-09-01-df-health-units-search-design.md)

## Restrições Globais

- **Não alterar** `src/types/index.ts` (o tipo `PlaceSuggestion`), `src/components/SearchBar.tsx`, `src/services/geoapifyClient.ts`, `src/services/mapboxGeocodingClient.ts`, `src/data/placeCategories.ts`. O único arquivo de lógica de busca modificado é `src/features/search/useGeocodingSearch.ts`, e só para **somar** a fonte local.
- **Nenhuma requisição de rede nova no app em runtime.** Dados estáticos e embutidos. Logo: **nenhuma mudança na CSP** (`index.html` / cabeçalhos), **nenhuma variável de ambiente nova**, nenhuma mudança em `.env.example`.
- Todos os testes já existentes continuam passando **sem alteração**.
- Todo comentário de código e todo texto de usuário em **português**.
- TypeScript em modo `strict`; nenhum `any` implícito.
- O dump do CNES **não** é versionado — só o `.generated.ts` destilado e o `overrides.json`.
- Cada tarefa termina com o pipeline local verde, **na ordem em que a CI roda** (`.github/workflows/ci.yml`): `npm run format:check`, `npm run lint`, `npx tsc -b`, `npm run test`. Se `format:check` acusar qualquer arquivo novo/alterado, rode `npm run format` e inclua o resultado no mesmo commit. O Prettier do projeto usa `singleQuote`, `semi`, `trailingComma: all`, `printWidth: 100`; `docs/superpowers/**` está em `.prettierignore` (spec e este plano não são reformatados).
- ESLint só processa `**/*.{ts,tsx}` (ver `eslint.config.js`) — os arquivos `.mjs` em `scripts/` ficam fora do lint, mas **entram** no `format:check`.
- Trabalho todo na branch `feature/df-health-units-search` (já criada). Caminhos relativos à raiz do repo.

---

## Tarefa 1: Funções puras do gerador (`scripts/lib/unidadesSaude.mjs`)

**Contexto:** O script de geração (Tarefa 2) faz muita coisa de I/O (download, unzip, geocodificação) que não dá para testar barato. Toda a lógica pura — validar coordenada, expandir número, montar o texto de busca, aplicar overrides — fica neste módulo irmão, coberto por testes. Não importa nada de `src/` (é Node ESM, fora do build do TS).

**Files:**
- Create: `scripts/lib/unidadesSaude.mjs`
- Test: `scripts/lib/unidadesSaude.test.mjs`

**Interfaces:**
- Produz:
  - `normalize(s: string): string` — NFD, remove diacríticos, minúsculas, trim.
  - `romanToDigit(r: string): string | null` / `digitToRoman(d: string): string | null` — 1..15.
  - `numberVariants(token: string): string[]` — se `token` é número (dígito / com zero / romano / por extenso), devolve todas as grafias equivalentes; senão `[token]`.
  - `parseCoordinate(latStr: string, lngStr: string): { lat: number; lng: number } | null` — `null` para coordenada inválida/placeholder/fora do DF.
  - `TYPE_META: Record<string, { kind: string; synonyms: string[] }>` — por `TP_UNIDADE` (sem zero à esquerda).
  - `resolveRa(noBairro: string): string` — Região Administrativa a partir do bairro do CNES.
  - `prettify(raw: string): string` — CAIXA ALTA do CNES → Title Case com acento reposto e siglas mantidas em maiúsculas.
  - `buildDisplayName(rec): string` — rótulo "Nome, Rua, Bairro, Brasília - DF".
  - `buildSearchText(rec, kind: string): string` — string normalizada com nome + apelidos.
  - `applyOverrides(units: Unit[], overrides): Unit[]` — mescla correções manuais por CNES + `add` + `exclude`.
- Consome: nada.

- [ ] **Passo 1: Criar `scripts/lib/unidadesSaude.mjs` com `normalize`, `romanToDigit`, `digitToRoman`, `numberVariants`**

```js
// Funções puras do gerador de cadastro de unidades de saúde do DF.
// Testável isoladamente (scripts/lib/unidadesSaude.test.mjs). Não importa
// de src/ — é Node ESM, fora do build do TypeScript.
//
// A lógica de `numberVariants` é espelhada em src/data/dfHealthUnits.ts
// (lado do app). Mudou aqui, mude lá.

// Mesmo padrão de src/utils/text.ts — construído por code point para não
// depender de caracteres combinantes literais no fonte.
const COMBINING_DIACRITICS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
);

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .trim();
}

const ROMAN_BY_DIGIT = {
  '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v', '6': 'vi', '7': 'vii',
  '8': 'viii', '9': 'ix', '10': 'x', '11': 'xi', '12': 'xii', '13': 'xiii',
  '14': 'xiv', '15': 'xv',
};
const WRITTEN_BY_DIGIT = {
  '1': 'um', '2': 'dois', '3': 'tres', '4': 'quatro', '5': 'cinco', '6': 'seis',
  '7': 'sete', '8': 'oito', '9': 'nove', '10': 'dez', '11': 'onze', '12': 'doze',
  '13': 'treze', '14': 'quatorze', '15': 'quinze',
};
const DIGIT_BY_ROMAN = Object.fromEntries(
  Object.entries(ROMAN_BY_DIGIT).map(([d, r]) => [r, d]),
);
const DIGIT_BY_WRITTEN = Object.fromEntries(
  Object.entries(WRITTEN_BY_DIGIT).map(([d, w]) => [w, d]),
);

export function romanToDigit(r) {
  return DIGIT_BY_ROMAN[normalize(r)] ?? null;
}
export function digitToRoman(d) {
  return ROMAN_BY_DIGIT[String(parseInt(d, 10))] ?? null;
}

export function numberVariants(token) {
  const t = normalize(token);
  let digit = null;
  if (/^\d{1,2}$/.test(t)) digit = String(parseInt(t, 10));
  else if (DIGIT_BY_ROMAN[t]) digit = DIGIT_BY_ROMAN[t];
  else if (DIGIT_BY_WRITTEN[t]) digit = DIGIT_BY_WRITTEN[t];
  if (!digit) return [t];
  const out = new Set([t, digit, digit.padStart(2, '0')]);
  if (ROMAN_BY_DIGIT[digit]) out.add(ROMAN_BY_DIGIT[digit]);
  if (WRITTEN_BY_DIGIT[digit]) out.add(WRITTEN_BY_DIGIT[digit]);
  return [...out];
}
```

- [ ] **Passo 2: Criar `scripts/lib/unidadesSaude.test.mjs` com os testes de número**

```js
import { describe, it, expect } from 'vitest';
import {
  normalize,
  romanToDigit,
  numberVariants,
} from './unidadesSaude.mjs';

describe('normalize', () => {
  it('remove acento, minúsculas e trim', () => {
    expect(normalize('  UBS 02 Guará  ')).toBe('ubs 02 guara');
  });
});

describe('numberVariants', () => {
  it('expande dígito para com-zero, romano e por extenso', () => {
    const v = numberVariants('2');
    expect(v).toEqual(expect.arrayContaining(['2', '02', 'ii', 'dois']));
  });

  it('expande romano de volta para dígito', () => {
    expect(numberVariants('ii')).toEqual(expect.arrayContaining(['2', '02', 'ii', 'dois']));
  });

  it('expande "02" igual a "2"', () => {
    expect(numberVariants('02')).toEqual(expect.arrayContaining(['2', '02', 'ii', 'dois']));
  });

  it('devolve o token cru quando não é número', () => {
    expect(numberVariants('guara')).toEqual(['guara']);
  });
});

describe('romanToDigit', () => {
  it('converte romanos de 1 a 15', () => {
    expect(romanToDigit('IV')).toBe('4');
    expect(romanToDigit('x')).toBe('10');
  });
  it('null para não-romano', () => {
    expect(romanToDigit('guara')).toBeNull();
  });
});
```

- [ ] **Passo 3: Rodar os testes**

Run: `npm run test -- scripts/lib/unidadesSaude.test.mjs`
Expected: 6 testes passando.

- [ ] **Passo 4: Adicionar `parseCoordinate` ao `scripts/lib/unidadesSaude.mjs`**

```js
// Caixa aproximada do DF, com folga.
const DF_BOX = { minLat: -16.1, maxLat: -15.4, minLng: -48.35, maxLng: -47.3 };

// `null` quando a coordenada é inválida, zerada, fora do DF ou um
// placeholder conhecido (o CNES "chumba" alguns registros num ponto
// genérico no centro de Brasília, ou repete um dígito muitas vezes).
export function parseCoordinate(latStr, lngStr) {
  const rawLat = String(latStr ?? '').trim();
  const rawLng = String(lngStr ?? '').trim();
  const lat = Number.parseFloat(rawLat.replace(',', '.'));
  const lng = Number.parseFloat(rawLng.replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 || lng === 0) return null;
  if (lat < DF_BOX.minLat || lat > DF_BOX.maxLat) return null;
  if (lng < DF_BOX.minLng || lng > DF_BOX.maxLng) return null;
  if (/^-15\.78$/.test(rawLat) && /^-47\.9\d$/.test(rawLng)) return null;
  if (/(\d)\1{3,}/.test(rawLat) || /(\d)\1{3,}/.test(rawLng)) return null;
  return { lat, lng };
}
```

- [ ] **Passo 5: Testes de `parseCoordinate`** (adicionar ao mesmo arquivo de teste)

```js
import { parseCoordinate } from './unidadesSaude.mjs';

describe('parseCoordinate', () => {
  it('aceita coordenada válida do Guará', () => {
    expect(parseCoordinate('-15.8327655591', '-47.9732769728')).toEqual({
      lat: -15.8327655591,
      lng: -47.9732769728,
    });
  });
  it('rejeita placeholder -15.78,-47.93', () => {
    expect(parseCoordinate('-15.78', '-47.93')).toBeNull();
  });
  it('rejeita dígito repetido (-15.783333)', () => {
    expect(parseCoordinate('-15.783333', '-47.933333')).toBeNull();
  });
  it('rejeita vazio e zero', () => {
    expect(parseCoordinate('', '')).toBeNull();
    expect(parseCoordinate('0', '0')).toBeNull();
  });
  it('rejeita fora da caixa do DF', () => {
    expect(parseCoordinate('-23.55', '-46.63')).toBeNull();
  });
  it('aceita vírgula decimal', () => {
    expect(parseCoordinate('-15,83', '-47,97')).toEqual({ lat: -15.83, lng: -47.97 });
  });
});
```

- [ ] **Passo 6: Rodar os testes**

Run: `npm run test -- scripts/lib/unidadesSaude.test.mjs`
Expected: 12 testes passando.

- [ ] **Passo 7: Adicionar `TYPE_META` e `resolveRa`**

```js
// TP_UNIDADE (como vem no dump, SEM zero à esquerda) -> tipo e sinônimos
// para o texto de busca. Tipos fora deste mapa são descartados.
export const TYPE_META = {
  '1': { kind: 'Posto', synonyms: ['posto de saude', 'unidade de saude', 'ubs'] },
  '2': { kind: 'UBS', synonyms: ['ubs', 'unidade basica de saude', 'posto de saude', 'unidade de saude', 'centro de saude'] },
  '5': { kind: 'Hospital', synonyms: ['hospital'] },
  '7': { kind: 'Hospital', synonyms: ['hospital'] },
  '15': { kind: 'Unidade Mista', synonyms: ['unidade mista', 'posto de saude'] },
  '20': { kind: 'Pronto-Socorro', synonyms: ['pronto socorro', 'ps'] },
  '21': { kind: 'Pronto-Socorro', synonyms: ['pronto socorro', 'ps'] },
  '70': { kind: 'CAPS', synonyms: ['caps', 'centro de atencao psicossocial'] },
  '72': { kind: 'CAPS', synonyms: ['caps', 'centro de atencao psicossocial'] },
  '73': { kind: 'UPA', synonyms: ['upa', 'pronto atendimento', 'unidade de pronto atendimento'] },
};

// Regiões Administrativas do DF, casadas por prefixo do bairro normalizado
// do CNES. Ordem importa: prefixos mais longos primeiro.
const RA_PREFIXES = [
  ['nucleo bandeirante', 'Núcleo Bandeirante'],
  ['sao sebastiao', 'São Sebastião'],
  ['recanto das emas', 'Recanto das Emas'],
  ['riacho fundo', 'Riacho Fundo'],
  ['santa maria', 'Santa Maria'],
  ['vicente pires', 'Vicente Pires'],
  ['aguas claras', 'Águas Claras'],
  ['jardim botanico', 'Jardim Botânico'],
  ['sol nascente', 'Sol Nascente'],
  ['por do sol', 'Pôr do Sol'],
  ['lago norte', 'Lago Norte'],
  ['lago sul', 'Lago Sul'],
  ['sudoeste', 'Sudoeste'],
  ['octogonal', 'Sudoeste/Octogonal'],
  ['guara', 'Guará'],
  ['ceilandia', 'Ceilândia'],
  ['taguatinga', 'Taguatinga'],
  ['samambaia', 'Samambaia'],
  ['planaltina', 'Planaltina'],
  ['brazlandia', 'Brazlândia'],
  ['sobradinho', 'Sobradinho'],
  ['paranoa', 'Paranoá'],
  ['itapoa', 'Itapoã'],
  ['gama', 'Gama'],
  ['cruzeiro', 'Cruzeiro'],
  ['candangolandia', 'Candangolândia'],
  ['varjao', 'Varjão'],
  ['estrutural', 'Estrutural'],
  ['scia', 'Estrutural'],
  ['fercal', 'Fercal'],
  ['arniqueira', 'Arniqueira'],
  ['asa norte', 'Plano Piloto'],
  ['asa sul', 'Plano Piloto'],
  ['plano piloto', 'Plano Piloto'],
];

export function resolveRa(noBairro) {
  const b = normalize(noBairro);
  for (const [prefix, ra] of RA_PREFIXES) {
    if (b.startsWith(prefix)) return ra;
  }
  return prettify(noBairro) || 'Distrito Federal';
}
```

- [ ] **Passo 8: Testes de `TYPE_META` e `resolveRa`**

```js
import { TYPE_META, resolveRa } from './unidadesSaude.mjs';

describe('resolveRa', () => {
  it('mapeia "GUARA I" e "GUARA II" para "Guará"', () => {
    expect(resolveRa('GUARA I')).toBe('Guará');
    expect(resolveRa('GUARA II')).toBe('Guará');
  });
  it('mapeia "CEILANDIA SUL" para "Ceilândia"', () => {
    expect(resolveRa('CEILANDIA SUL')).toBe('Ceilândia');
  });
  it('cai no bairro formatado quando não conhece', () => {
    expect(resolveRa('BAIRRO INVENTADO')).toBe('Bairro Inventado');
  });
});

describe('TYPE_META', () => {
  it('tipo 2 é UBS com sinônimos de atenção básica', () => {
    expect(TYPE_META['2'].kind).toBe('UBS');
    expect(TYPE_META['2'].synonyms).toEqual(expect.arrayContaining(['ubs', 'unidade basica de saude']));
  });
});
```

- [ ] **Passo 9: Adicionar `prettify` e `buildDisplayName`**

```js
// Palavras que ficam em CAIXA ALTA no rótulo (siglas / códigos de quadra).
const KEEP_UPPER = new Set([
  'ubs', 'upa', 'caps', 'ps', 'df', 'sia', 'scia', 'hran', 'hrg', 'hrc', 'hrp',
  'hrs', 'hrt', 'hrsam', 'qe', 'qi', 'qn', 'qnm', 'qnl', 'qnn', 'qno', 'qnp',
  'qng', 'qsa', 'qsb', 'eq', 'ae', 'ac', 'ci', 'cnb', 'epct', 'eptg', 'epia',
  'eptg', 'l2', 'l3', 'l4', 'w3', 'w4', 'w5', 's2', 'n2',
]);
// Acentos por palavra, aplicados antes do Title Case.
const WORD_ACCENTS = {
  guara: 'Guará', ceilandia: 'Ceilândia', brazlandia: 'Brazlândia',
  paranoa: 'Paranoá', itapoa: 'Itapoã', varjao: 'Varjão', sao: 'São',
  sebastiao: 'Sebastião', nucleo: 'Núcleo', candangolandia: 'Candangolândia',
  agua: 'Água', aguas: 'Águas', botanico: 'Botânico', por: 'Pôr',
  saude: 'Saúde', basica: 'Básica', regiao: 'Região', area: 'Área',
  policlinica: 'Policlínica', psicossocial: 'Psicossocial', atencao: 'Atenção',
};

export function prettify(raw) {
  const base = String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!base) return '';
  return base
    .split(' ')
    .map((w) => {
      const n = normalize(w).replace(/[^a-z0-9]/g, '');
      if (!n) return w;
      if (KEEP_UPPER.has(n)) return w.toUpperCase();
      if (/^\d+[a-z]?$/.test(n)) return w;                 // "02", "3a"
      if (/^[ivx]{1,4}$/.test(n)) return w.toUpperCase();  // romanos
      if (WORD_ACCENTS[n]) return WORD_ACCENTS[n];
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

// "Nome, Rua, Bairro, Brasília - DF" — mesmo formato do `formatted` da
// Geoapify, para as sugestões ficarem homogêneas na lista.
export function buildDisplayName(rec) {
  const name = prettify(rec.NO_FANTASIA);
  const street = prettify(rec.NO_LOGRADOURO);
  const numero = rec.NU_ENDERECO && !/^s\/?n$/i.test(String(rec.NU_ENDERECO).trim())
    ? String(rec.NU_ENDERECO).trim()
    : '';
  const streetWithNo = [street, numero].filter(Boolean).join(', ');
  const bairro = prettify(rec.NO_BAIRRO);
  return [name, streetWithNo, bairro, 'Brasília - DF'].filter(Boolean).join(', ');
}
```

- [ ] **Passo 10: Testes de `prettify` / `buildDisplayName`**

```js
import { prettify, buildDisplayName } from './unidadesSaude.mjs';

describe('prettify', () => {
  it('Title Case com acento de RA e sigla mantida', () => {
    expect(prettify('UBS 02 GUARA')).toBe('UBS 02 Guará');
  });
  it('mantém código de quadra em maiúsculas', () => {
    expect(prettify('QE 23 LOTE C AREA ESPECIAL')).toBe('QE 23 Lote C Área Especial');
  });
});

describe('buildDisplayName', () => {
  it('monta rótulo no formato da Geoapify, ignorando S/N', () => {
    const rec = {
      NO_FANTASIA: 'UBS 02 GUARA',
      NO_LOGRADOURO: 'QE 23 AREA ESPECIAL',
      NU_ENDERECO: 'S/N',
      NO_BAIRRO: 'GUARA II',
    };
    expect(buildDisplayName(rec)).toBe('UBS 02 Guará, QE 23 Área Especial, Guará II, Brasília - DF');
  });
});
```

- [ ] **Passo 11: Adicionar `extractUnitNumber` e `buildSearchText`**

```js
// Primeiro número (dígito 1-3 casas ou romano) que aparece no nome —
// "UBS 02 GUARA" -> "02"; "HOSPITAL REGIONAL DO GUARA I" -> "i".
export function extractUnitNumber(noFantasia) {
  const m = normalize(noFantasia).match(/\b(\d{1,3}|[ivx]{1,4})\b/);
  return m ? m[1] : null;
}

// String normalizada com nome + apelidos, testada por substring de token
// em `searchDfHealthUnits` (lado do app).
export function buildSearchText(rec, kind) {
  const nf = normalize(rec.NO_FANTASIA);
  const bairro = normalize(rec.NO_BAIRRO);
  const ra = normalize(resolveRa(rec.NO_BAIRRO));
  const meta = TYPE_META[String(rec.TP_UNIDADE).trim()];
  const typeSyn = meta ? meta.synonyms : [];

  const chunks = [nf, bairro, ra];
  // bairro com romano -> dígito ("guara ii" -> "guara 2")
  chunks.push(
    bairro.replace(/\b([ivx]{1,4})\b/g, (mm, r) => romanToDigit(r) ?? mm),
  );

  const num = extractUnitNumber(rec.NO_FANTASIA);
  const numVars = num ? numberVariants(num) : [''];
  for (const v of numVars) {
    const n = v ? `${v} ` : '';
    for (const syn of typeSyn) chunks.push(`${syn} ${n}${ra}`.trim());
    chunks.push(`${n}${ra}`.trim());
  }
  chunks.push(...typeSyn);

  return normalize(chunks.join(' ')).replace(/\s+/g, ' ').trim();
}
```

- [ ] **Passo 12: Testes de `buildSearchText`**

```js
import { buildSearchText } from './unidadesSaude.mjs';

const GUARA_UBS2 = {
  NO_FANTASIA: 'UBS 02 GUARA',
  NO_BAIRRO: 'GUARA II',
  TP_UNIDADE: '2',
};

describe('buildSearchText', () => {
  it('cobre "ubs 2 guara" e "ubs 02 guara"', () => {
    const t = buildSearchText(GUARA_UBS2, 'UBS');
    expect(t).toContain('ubs 2 guara');
    expect(t).toContain('ubs 02 guara');
  });
  it('cobre a expansão da sigla e do posto', () => {
    const t = buildSearchText(GUARA_UBS2, 'UBS');
    expect(t).toContain('unidade basica de saude 2 guara');
    expect(t).toContain('posto de saude 2 guara');
  });
  it('cobre "guara 2" derivado de "guara ii"', () => {
    expect(buildSearchText(GUARA_UBS2, 'UBS')).toContain('guara 2');
  });
});
```

- [ ] **Passo 13: Adicionar `applyOverrides`**

```js
// Correções manuais aplicadas DEPOIS da destilação do CNES — nunca
// sobrescritas por uma nova geração. `overrides` tem a forma:
//   { byCnes: { "1234567": { exclude?, displayName?, coordinates?, extraAliases? } },
//     add: [ { id, displayName, kind, ra, coordinates, aliases? } ] }
export function applyOverrides(units, overrides) {
  const byCnes = (overrides && overrides.byCnes) || {};
  const add = (overrides && overrides.add) || [];

  const patched = units
    .map((u) => {
      const cnes = u.id.replace(/^cnes-/, '');
      const ov = byCnes[cnes];
      if (!ov) return u;
      if (ov.exclude) return null;
      return {
        ...u,
        displayName: ov.displayName ?? u.displayName,
        coordinates: ov.coordinates ?? u.coordinates,
        searchText: ov.extraAliases
          ? normalize(`${u.searchText} ${ov.extraAliases.join(' ')}`)
          : u.searchText,
      };
    })
    .filter(Boolean);

  const extras = add.map((a) => ({
    id: a.id,
    displayName: a.displayName,
    kind: a.kind,
    ra: a.ra,
    coordinates: a.coordinates,
    searchText: normalize(
      [a.displayName, a.ra, ...(a.aliases || [])].join(' '),
    ),
  }));

  return [...patched, ...extras].sort((x, y) => x.id.localeCompare(y.id));
}
```

- [ ] **Passo 14: Testes de `applyOverrides`**

```js
import { applyOverrides } from './unidadesSaude.mjs';

const BASE = [
  { id: 'cnes-1', displayName: 'A', kind: 'UBS', ra: 'Guará', coordinates: { lat: -15.8, lng: -47.9 }, searchText: 'a guara' },
  { id: 'cnes-2', displayName: 'B', kind: 'UBS', ra: 'Guará', coordinates: { lat: -15.81, lng: -47.91 }, searchText: 'b guara' },
];

describe('applyOverrides', () => {
  it('exclui unidade marcada com exclude', () => {
    const out = applyOverrides(BASE, { byCnes: { '1': { exclude: true } } });
    expect(out.map((u) => u.id)).toEqual(['cnes-2']);
  });
  it('coordenada do override prevalece', () => {
    const out = applyOverrides(BASE, { byCnes: { '2': { coordinates: { lat: -15.99, lng: -47.99 } } } });
    expect(out.find((u) => u.id === 'cnes-2').coordinates).toEqual({ lat: -15.99, lng: -47.99 });
  });
  it('add entra na lista e é ordenado por id', () => {
    const out = applyOverrides(BASE, { add: [{ id: 'cnes-0', displayName: 'Z', kind: 'UBS', ra: 'Gama', coordinates: { lat: -16, lng: -48 }, aliases: ['z gama'] }] });
    expect(out.map((u) => u.id)).toEqual(['cnes-0', 'cnes-1', 'cnes-2']);
    expect(out[0].searchText).toContain('z gama');
  });
});
```

- [ ] **Passo 15: Rodar toda a suíte do módulo**

Run: `npm run test -- scripts/lib/unidadesSaude.test.mjs`
Expected: ~24 testes passando.

- [ ] **Passo 16: Formatar, lint e typecheck**

Run: `npm run format && npm run format:check && npm run lint && npx tsc -b`
Expected: `format` normaliza os dois `.mjs` novos; `format:check` passa; `lint` não toca `.mjs` (só `.ts`/`.tsx`) e passa; `tsc -b` cobre só `src/` e passa.

- [ ] **Passo 17: Commit**

```bash
git add scripts/lib/unidadesSaude.mjs scripts/lib/unidadesSaude.test.mjs
git commit -m "feat(busca): funções puras do gerador de cadastro de unidades de saúde do DF"
```

---

## Tarefa 2: Script de geração + dataset versionado

**Contexto:** O script orquestra download → unzip streaming → filtro DF → limpeza de coordenada → recuperação por geocodificação → `applyOverrides` → escrita do `.generated.ts`. Ele roda à mão. O produto commitado é o `src/data/dfHealthUnits.generated.ts`. A verificação desta tarefa é rodar o script de verdade e conferir o resultado (contagem, presença das UBS do Guará, `tsc` compilando).

**Files:**
- Create: `scripts/generate-unidades-saude.mjs`
- Create: `scripts/data/unidades-saude.overrides.json`
- Create: `src/data/dfHealthUnits.ts` (só a interface `DfHealthUnit` nesta tarefa; a função vem na Tarefa 3)
- Create (gerado): `src/data/dfHealthUnits.generated.ts`
- Modify: `package.json` (script `generate:unidades-saude`)

**Interfaces:**
- Consome: tudo de `scripts/lib/unidadesSaude.mjs` (Tarefa 1).
- Produz:
  - `src/data/dfHealthUnits.ts` exporta `interface DfHealthUnit { id: string; displayName: string; kind: DfHealthUnitKind; ra: string; coordinates: Coordinates; searchText: string }` e `type DfHealthUnitKind = 'UBS' | 'Posto' | 'Hospital' | 'UPA' | 'CAPS' | 'Pronto-Socorro' | 'Unidade Mista'`.
  - `src/data/dfHealthUnits.generated.ts` exporta `const DF_HEALTH_UNITS: DfHealthUnit[]`.

- [ ] **Passo 1: Criar `src/data/dfHealthUnits.ts` só com a interface**

```ts
import type { Coordinates } from '../types';

export type DfHealthUnitKind =
  | 'UBS'
  | 'Posto'
  | 'Hospital'
  | 'UPA'
  | 'CAPS'
  | 'Pronto-Socorro'
  | 'Unidade Mista';

// Uma unidade pública de saúde do DF, destilada do CNES/DATASUS pelo
// script `scripts/generate-unidades-saude.mjs`. Ver
// `src/data/dfHealthUnits.generated.ts` (dados) e a função
// `searchDfHealthUnits` (adicionada na Tarefa 3 deste plano).
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
```

- [ ] **Passo 2: Criar `scripts/data/unidades-saude.overrides.json` vazio**

```json
{
  "byCnes": {},
  "add": []
}
```

- [ ] **Passo 3: Criar `scripts/generate-unidades-saude.mjs`**

```js
// Gera src/data/dfHealthUnits.generated.ts a partir do dump nacional do
// CNES (Cadastro Nacional de Estabelecimentos de Saúde, DATASUS —
// domínio público).
//
// Rode manualmente:  npm run generate:unidades-saude
// O arquivo gerado é versionado (entra no commit). O app NÃO baixa nada
// em runtime nem no build — depende só do arquivo gerado.
//
// Requer VITE_GEOAPIFY_API_KEY (lido de .env) só para recuperar o
// endereço das ~55 unidades com coordenada ruim. Sem a chave, essas
// unidades são apenas listadas e excluídas.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import {
  normalize,
  parseCoordinate,
  TYPE_META,
  resolveRa,
  buildDisplayName,
  buildSearchText,
  applyOverrides,
} from './lib/unidadesSaude.mjs';

const CNES_ZIP_URL =
  'https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos_json.zip';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'src/data/dfHealthUnits.generated.ts');
const OVERRIDES = join(ROOT, 'scripts/data/unidades-saude.overrides.json');

function loadEnv() {
  try {
    const txt = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* .env é opcional */
  }
}

async function download(url, destZip) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download CNES falhou: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destZip, buf);
}

// Extrai via `unzip` (disponível no ambiente). Alternativa sem binário
// externo: `node:zlib` não lê ZIP; manter `unzip`.
function unzip(zipPath, destDir) {
  execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'inherit' });
  return join(destDir, 'cnes_estabelecimentos.json');
}

// O JSON tem ~640 MB — passa do limite de string do Node. Varre o Buffer
// emitindo cada objeto {...} de topo (registros são planos, só strings).
function* iterRecords(jsonPath) {
  const buf = readFileSync(jsonPath);
  let depth = 0;
  let inStr = false;
  let esc = false;
  let start = -1;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === 0x5c) esc = true;
      else if (c === 0x22) inStr = false;
      continue;
    }
    if (c === 0x22) {
      inStr = true;
      continue;
    }
    if (c === 0x7b) {
      if (depth === 0) start = i;
      depth++;
    } else if (c === 0x7d) {
      depth--;
      if (depth === 0 && start >= 0) {
        yield JSON.parse(buf.toString('utf8', start, i + 1));
        start = -1;
      }
    }
  }
}

async function geocodeAddress(rec) {
  const key = process.env.VITE_GEOAPIFY_API_KEY;
  if (!key) return null;
  const numero =
    rec.NU_ENDERECO && !/^s\/?n$/i.test(String(rec.NU_ENDERECO).trim())
      ? String(rec.NU_ENDERECO).trim()
      : '';
  const text = [rec.NO_LOGRADOURO, numero, rec.NO_BAIRRO, 'Brasília - DF', rec.CO_CEP]
    .filter(Boolean)
    .join(', ');
  const params = new URLSearchParams({
    text,
    filter: 'countrycode:br',
    lang: 'pt',
    limit: '1',
    apiKey: key,
  });
  try {
    const res = await fetch(`https://api.geoapify.com/v1/geocode/search?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data.features && data.features[0];
    if (!f) return null;
    return parseCoordinate(String(f.properties.lat), String(f.properties.lon));
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  loadEnv();
  const workDir = mkdtempSync(join(tmpdir(), 'cnes-'));
  const zipPath = join(workDir, 'cnes.zip');
  console.log('baixando CNES…');
  await download(CNES_ZIP_URL, zipPath);
  console.log('descompactando…');
  const jsonPath = unzip(zipPath, workDir);

  const kept = [];
  const needGeo = [];
  for (const rec of iterRecords(jsonPath)) {
    if (rec.CO_UF !== '53') continue;
    const meta = TYPE_META[String(rec.TP_UNIDADE).trim()];
    if (!meta) continue;
    const coord = parseCoordinate(rec.NU_LATITUDE, rec.NU_LONGITUDE);
    const unit = {
      id: `cnes-${rec.CO_CNES}`,
      displayName: buildDisplayName(rec),
      kind: meta.kind,
      ra: resolveRa(rec.NO_BAIRRO),
      coordinates: coord,
      searchText: buildSearchText(rec, meta.kind),
    };
    if (coord) kept.push(unit);
    else needGeo.push({ unit, rec });
  }

  console.log(`DF: ${kept.length} com coord boa, ${needGeo.length} a recuperar por endereço`);
  const unrecovered = [];
  for (const { unit, rec } of needGeo) {
    const coord = await geocodeAddress(rec);
    await sleep(150);
    if (coord) {
      unit.coordinates = coord;
      kept.push(unit);
    } else {
      unrecovered.push(unit);
    }
  }

  if (unrecovered.length) {
    console.log(`\n${unrecovered.length} unidades SEM coordenada (excluídas) — corrija via overrides:`);
    for (const u of unrecovered) console.log(`  ${u.id}  ${u.displayName}`);
  }

  const overrides = JSON.parse(readFileSync(OVERRIDES, 'utf8'));
  const finalUnits = applyOverrides(kept, overrides);

  const header =
    '// GERADO por scripts/generate-unidades-saude.mjs — não edite à mão.\n' +
    '// Fonte: CNES/DATASUS (domínio público). Regerar: npm run generate:unidades-saude\n' +
    "import type { DfHealthUnit } from './dfHealthUnits';\n\n" +
    'export const DF_HEALTH_UNITS: DfHealthUnit[] = ';
  writeFileSync(OUT, header + JSON.stringify(finalUnits, null, 2) + ';\n');
  // O `format:check` da CI cobre este arquivo — deixa o Prettier normalizar
  // aspas/vírgulas/quebras já na geração, para o commit nascer limpo.
  execSync(`npx prettier --write "${OUT}"`, { stdio: 'inherit' });
  console.log(`\n${finalUnits.length} unidades escritas em ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Passo 4: Adicionar o script ao `package.json`**

Em `"scripts"`, após `"generate:og"`:

```json
    "generate:unidades-saude": "node scripts/generate-unidades-saude.mjs",
```

- [ ] **Passo 5: Rodar o gerador de verdade**

Run: `npm run generate:unidades-saude`
Expected: baixa (~67 MB), descompacta, imprime algo como "DF: ~305 com coord boa, ~55 a recuperar", lista as não recuperadas, e escreve `src/data/dfHealthUnits.generated.ts` com ~340–360 unidades.

- [ ] **Passo 6: Conferência manual do resultado**

O gerador já roda o Prettier no arquivo, então as chaves saem sem aspas
(`id: 'cnes-...'`).

```bash
grep -c "id: '" src/data/dfHealthUnits.generated.ts        # ~340-360
grep -i 'UBS 02 Guará' src/data/dfHealthUnits.generated.ts # tem que achar
grep -i 'UBS 01 Guará' src/data/dfHealthUnits.generated.ts # idem
grep -i "ubs 2 guara" src/data/dfHealthUnits.generated.ts  # searchText expandido
```
Expected: contagem na faixa esperada; UBS 01 e 02 do Guará presentes, com `coordinates` dentro do DF e `searchText` contendo `ubs 2 guara`.

- [ ] **Passo 7: Typecheck do arquivo gerado**

Run: `npx tsc -b`
Expected: sem erros — o `.generated.ts` bate com a interface `DfHealthUnit`.

- [ ] **Passo 8: Confirmar que o dump não foi versionado**

Run: `git status --porcelain`
Expected: aparecem só `package.json`, `scripts/generate-unidades-saude.mjs`, `scripts/data/unidades-saude.overrides.json`, `src/data/dfHealthUnits.ts`, `src/data/dfHealthUnits.generated.ts`. Nenhum `.zip`/`.json` de CNES (fica em `os.tmpdir()`, fora do repo).

- [ ] **Passo 9: Formatar, format:check e lint**

Run: `npm run format && npm run format:check && npm run lint`
Expected: `format` normaliza `scripts/generate-unidades-saude.mjs`, `scripts/data/unidades-saude.overrides.json` e `src/data/dfHealthUnits.ts` (o `.generated.ts` já saiu formatado do gerador); `format:check` e `lint` passam. Se `npm run format` alterar o `.generated.ts`, algo no header do gerador destoa do Prettier — ajuste o header no script e regenere, não edite o arquivo à mão.

- [ ] **Passo 10: Commit**

```bash
git add package.json scripts/generate-unidades-saude.mjs scripts/data/unidades-saude.overrides.json src/data/dfHealthUnits.ts src/data/dfHealthUnits.generated.ts
git commit -m "feat(busca): gerador e cadastro local de unidades de saúde do DF (CNES)"
```

---

## Tarefa 3: `searchDfHealthUnits` (casamento local)

**Contexto:** A função que o hook vai chamar. Pura, síncrona, sem rede. Casa os tokens da query (com expansão de número) contra `searchText`, com uma guarda contra query genérica ("hospital" sozinho continua indo para a busca por categoria de hoje). Testada com um dataset de fixture.

**Files:**
- Modify: `src/data/dfHealthUnits.ts` (adiciona a função e helpers; mantém a interface da Tarefa 2)
- Test: `src/data/dfHealthUnits.test.ts`

**Interfaces:**
- Consome: `DF_HEALTH_UNITS` de `./dfHealthUnits.generated`; `normalize` de `../utils/text`; `haversineDistanceMeters` de `../utils/distance`; `Coordinates`, `PlaceSuggestion` de `../types`.
- Produz: `searchDfHealthUnits(query: string, proximity: Coordinates | null, limit?: number): PlaceSuggestion[]` e `numberVariants(token: string): string[]` (exportada para teste).

- [ ] **Passo 1: Escrever o teste que falha (`src/data/dfHealthUnits.test.ts`)**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('./dfHealthUnits.generated', () => ({
  DF_HEALTH_UNITS: [
    {
      id: 'cnes-1',
      displayName: 'UBS 01 Guará, QE 06, Guará I, Brasília - DF',
      kind: 'UBS',
      ra: 'Guará',
      coordinates: { lat: -15.81994, lng: -47.98601 },
      searchText:
        'ubs 01 guara guara i guara 1 ubs 1 guara ubs 01 guara unidade basica de saude 1 guara posto de saude 1 guara ubs unidade basica de saude posto de saude unidade de saude centro de saude',
    },
    {
      id: 'cnes-2',
      displayName: 'UBS 02 Guará, QE 23, Guará II, Brasília - DF',
      kind: 'UBS',
      ra: 'Guará',
      coordinates: { lat: -15.83277, lng: -47.97328 },
      searchText:
        'ubs 02 guara guara ii guara 2 ubs 2 guara ubs 02 guara ubs ii guara ubs dois guara unidade basica de saude 2 guara posto de saude 2 guara ubs unidade basica de saude posto de saude unidade de saude centro de saude',
    },
    {
      id: 'cnes-3',
      displayName: 'Hospital Regional do Guará, Via Central 1, Guará I, Brasília - DF',
      kind: 'Hospital',
      ra: 'Guará',
      coordinates: { lat: -15.8175, lng: -47.986 },
      searchText: 'hospital regional do guara guara i guara 1 hospital',
    },
    {
      id: 'cnes-4',
      displayName: 'UBS 05 de Ceilândia, QNM 18, Ceilândia, Brasília - DF',
      kind: 'UBS',
      ra: 'Ceilândia',
      coordinates: { lat: -15.82, lng: -48.11 },
      searchText:
        'ubs 05 de ceilandia ceilandia ubs 5 ceilandia ubs 05 ceilandia unidade basica de saude 5 ceilandia posto de saude 5 ceilandia ubs unidade basica de saude posto de saude',
    },
  ],
}));

import { searchDfHealthUnits, numberVariants } from './dfHealthUnits';

describe('numberVariants', () => {
  it('expande 2 -> {2, 02, ii, dois}', () => {
    expect(numberVariants('2')).toEqual(expect.arrayContaining(['2', '02', 'ii', 'dois']));
  });
  it('token não-numérico volta cru', () => {
    expect(numberVariants('guara')).toEqual(['guara']);
  });
});

describe('searchDfHealthUnits', () => {
  it('acha "UBS 2 Guará"', () => {
    const r = searchDfHealthUnits('UBS 2 Guará', null);
    expect(r[0].id).toBe('cnes-2');
    expect(r[0].placeName).toBe('UBS 02 Guará, QE 23, Guará II, Brasília - DF');
    expect(r[0].coordinates).toEqual({ lat: -15.83277, lng: -47.97328 });
  });

  it('acha com "ubs 02 guara"', () => {
    expect(searchDfHealthUnits('ubs 02 guara', null)[0].id).toBe('cnes-2');
  });

  it('acha com "unidade básica de saúde 2 guará"', () => {
    expect(searchDfHealthUnits('unidade básica de saúde 2 guará', null)[0].id).toBe('cnes-2');
  });

  it('acha com "posto de saúde 2 guará"', () => {
    expect(searchDfHealthUnits('posto de saúde 2 guará', null)[0].id).toBe('cnes-2');
  });

  it('acha "hospital regional do guará"', () => {
    expect(searchDfHealthUnits('hospital regional do guará', null)[0].id).toBe('cnes-3');
  });

  it('"hospital" sozinho não retorna nada (sem token distintivo)', () => {
    expect(searchDfHealthUnits('hospital', null)).toEqual([]);
  });

  it('"ubs" sozinho não retorna nada', () => {
    expect(searchDfHealthUnits('ubs', null)).toEqual([]);
  });

  it('"ceilândia" sozinho não retorna nada (sem palavra de tipo)', () => {
    expect(searchDfHealthUnits('ceilândia', null)).toEqual([]);
  });

  it('query vazia -> []', () => {
    expect(searchDfHealthUnits('   ', null)).toEqual([]);
  });

  it('com proximidade, ordena por distância', () => {
    const perto2 = { lat: -15.833, lng: -47.973 };
    const r = searchDfHealthUnits('UBS Guará', perto2);
    expect(r.map((s) => s.id)).toEqual(['cnes-2', 'cnes-1']);
  });

  it('respeita o limite', () => {
    expect(searchDfHealthUnits('UBS Guará', null, 1)).toHaveLength(1);
  });
});
```

- [ ] **Passo 2: Rodar — deve falhar**

Run: `npm run test -- src/data/dfHealthUnits.test.ts`
Expected: FALHA — `searchDfHealthUnits` / `numberVariants` não existem.

- [ ] **Passo 3: Implementar em `src/data/dfHealthUnits.ts`** (abaixo da interface já existente)

```ts
import { normalize } from '../utils/text';
import { haversineDistanceMeters } from '../utils/distance';
import type { PlaceSuggestion } from '../types';
import { DF_HEALTH_UNITS } from './dfHealthUnits.generated';

// Espelha scripts/lib/unidadesSaude.mjs — mudou lá, mude aqui.
const ROMAN_BY_DIGIT: Record<string, string> = {
  '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v', '6': 'vi', '7': 'vii',
  '8': 'viii', '9': 'ix', '10': 'x', '11': 'xi', '12': 'xii', '13': 'xiii',
  '14': 'xiv', '15': 'xv',
};
const WRITTEN_BY_DIGIT: Record<string, string> = {
  '1': 'um', '2': 'dois', '3': 'tres', '4': 'quatro', '5': 'cinco', '6': 'seis',
  '7': 'sete', '8': 'oito', '9': 'nove', '10': 'dez', '11': 'onze', '12': 'doze',
  '13': 'treze', '14': 'quatorze', '15': 'quinze',
};
const DIGIT_BY_ROMAN = Object.fromEntries(
  Object.entries(ROMAN_BY_DIGIT).map(([d, r]) => [r, d]),
);
const DIGIT_BY_WRITTEN = Object.fromEntries(
  Object.entries(WRITTEN_BY_DIGIT).map(([d, w]) => [w, d]),
);

// Todas as grafias equivalentes de um token, se ele for um número.
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
  'ubs', 'upa', 'caps', 'ps', 'posto', 'hospital', 'unidade', 'basica', 'de',
  'da', 'do', 'dos', 'das', 'centro', 'saude', 'regional', 'pronto', 'socorro',
  'atendimento', 'mista', 'policlinica', 'samu', 'e',
]);
// Pelo menos uma destas precisa aparecer para a busca local entrar em ação
// (sinal de que a pessoa procura uma unidade de saúde).
const TYPE_ANCHORS = new Set([
  'ubs', 'upa', 'caps', 'hospital', 'posto', 'policlinica', 'pronto',
  'socorro', 'saude', 'samu',
]);

// Casa o cadastro local de unidades de saúde do DF contra o texto digitado.
// Pura e síncrona — não faz rede, não lança. Retorna [] quando a query é
// vazia, genérica demais, ou não parece uma busca por unidade de saúde.
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
```

Nota: o `import type { Coordinates }` já está no topo do arquivo (Tarefa 2, `import type { Coordinates } from '../types'`). Se o lint pedir, junte `Coordinates` e `PlaceSuggestion` num único `import type ... from '../types'`.

- [ ] **Passo 4: Rodar — deve passar**

Run: `npm run test -- src/data/dfHealthUnits.test.ts`
Expected: PASSA — 13 testes.

- [ ] **Passo 5: Pipeline completo (ordem da CI)**

Run: `npm run format && npm run format:check && npm run lint && npx tsc -b && npm run test`
Expected: tudo verde, nenhuma regressão nos testes que já existiam.

- [ ] **Passo 6: Commit**

```bash
git add src/data/dfHealthUnits.ts src/data/dfHealthUnits.test.ts
git commit -m "feat(busca): casamento local de unidades de saúde do DF (searchDfHealthUnits)"
```

---

## Tarefa 4: Integrar a fonte local no `useGeocodingSearch`

**Contexto:** Uma mudança aditiva na função `search()` de `useGeocodingSearch.ts`: chama `searchDfHealthUnits` (síncrona), põe os acertos na frente do `interleave`, deduplica por proximidade, e trata o caso "todas as fontes remotas falharam mas a local achou algo" sem erro. O `useEffect` (debounce, `MIN_QUERY_LENGTH`, cancelamento) não muda. Nenhum teste existente muda.

**Files:**
- Modify: `src/features/search/useGeocodingSearch.ts`
- Modify: `src/features/search/useGeocodingSearch.test.ts` (só adiciona testes)

**Interfaces:**
- Consome: `searchDfHealthUnits` de `../../data/dfHealthUnits` (Tarefa 3).

- [ ] **Passo 1: Adicionar os testes novos em `useGeocodingSearch.test.ts`**

No topo, junto aos imports existentes:

```ts
import * as dfHealthUnits from '../../data/dfHealthUnits';
```

Dentro do `describe('useGeocodingSearch', ...)`, após o teste `'resolveSuggestion repassa as coordenadas...'`:

```ts
  it('põe as unidades de saúde locais no topo, antes dos resultados remotos', async () => {
    vi.spyOn(dfHealthUnits, 'searchDfHealthUnits').mockReturnValue([
      { id: 'cnes-2', placeName: 'UBS 02 Guará, Brasília - DF', coordinates: { lat: -15.833, lng: -47.973 } },
    ]);
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      { id: 'geo-x', placeName: 'Guará, DF', coordinates: { lat: -15.82, lng: -47.98 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('UBS 2 Guará'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions.map((s) => s.id)).toEqual(['cnes-2', 'geo-x']);
  });

  it('não duplica uma unidade local que também volta de uma fonte remota (a local vence)', async () => {
    vi.spyOn(dfHealthUnits, 'searchDfHealthUnits').mockReturnValue([
      { id: 'cnes-2', placeName: 'UBS 02 Guará (local)', coordinates: { lat: -15.8327, lng: -47.9732 } },
    ]);
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      { id: 'geo-dup', placeName: 'UBS 02 do Guará (Geoapify)', coordinates: { lat: -15.83271, lng: -47.97319 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('UBS 2 Guará'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions.map((s) => s.id)).toEqual(['cnes-2']);
  });

  it('não reporta erro se as fontes remotas falham mas a busca local achou algo', async () => {
    vi.spyOn(dfHealthUnits, 'searchDfHealthUnits').mockReturnValue([
      { id: 'cnes-2', placeName: 'UBS 02 Guará', coordinates: { lat: -15.833, lng: -47.973 } },
    ]);
    vi.spyOn(geoapifyClient, 'searchPlaces').mockRejectedValue(new Error('geoapify fora'));
    vi.spyOn(geoapifyClient, 'searchPlacesFullText').mockRejectedValue(new Error('geoapify fora'));
    vi.spyOn(mapboxGeocodingClient, 'searchPlacesMapbox').mockRejectedValue(new Error('mapbox fora'));

    const { result } = renderHook(() => useGeocodingSearch('UBS 2 Guará'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.suggestions.map((s) => s.id)).toEqual(['cnes-2']);
  });

  it('query sem match local mantém o comportamento atual (só fontes remotas)', async () => {
    vi.spyOn(dfHealthUnits, 'searchDfHealthUnits').mockReturnValue([]);
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      { id: 'geo-1', placeName: 'São Paulo', coordinates: { lat: -23.55, lng: -46.63 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('São Paulo'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions.map((s) => s.id)).toEqual(['geo-1']);
  });
```

- [ ] **Passo 2: Rodar — os 3 primeiros testes novos devem falhar**

Run: `npm run test -- src/features/search/useGeocodingSearch.test.ts`
Expected: FALHA nos testes "põe as unidades... no topo", "não duplica uma unidade local...", "não reporta erro se as fontes remotas falham mas a busca local achou algo". O 4º ("sem match local") já passa (comportamento atual).

- [ ] **Passo 3: Implementar a mudança em `useGeocodingSearch.ts`**

Adicionar o import (junto aos outros de serviço/dado):

```ts
import { searchDfHealthUnits } from '../../data/dfHealthUnits';
```

Na função `search()`, logo no início (antes de `const category = ...`):

```ts
  // Fonte local: cadastro de unidades de saúde do DF (CNES embutido).
  // Síncrona, sem rede — não entra na conta de "todas as fontes falharam".
  const localUnits = searchDfHealthUnits(query, proximity);
```

Trocar a condição de erro:

```ts
  const outcomes = await Promise.allSettled(tasks);
  if (
    outcomes.every((outcome) => outcome.status === 'rejected') &&
    localUnits.length === 0
  ) {
    throw (outcomes[0] as PromiseRejectedResult).reason;
  }
```

Trocar o `return` final:

```ts
  const byText = dedupeByProximity(interleave([resultOf(0), resultOf(2), resultOf(1)]));
  const seen = new Set(byText.map(proximityKey));
  const byCategory = dedupeByProximity(category ? resultOf(3) : []).filter(
    (suggestion) => !seen.has(proximityKey(suggestion)),
  );

  // Unidades locais primeiro; a deduplicação por proximidade descarta a
  // versão remota de uma unidade que a local já trouxe (a local tem
  // rótulo melhor).
  return dedupeByProximity([...localUnits, ...byText, ...byCategory]).slice(
    0,
    MAX_SUGGESTIONS,
  );
```

- [ ] **Passo 4: Rodar — tudo verde**

Run: `npm run test -- src/features/search/useGeocodingSearch.test.ts`
Expected: PASSA — os 11 testes antigos + os 4 novos.

- [ ] **Passo 5: Pipeline completo (ordem da CI)**

Run: `npm run format && npm run format:check && npm run lint && npx tsc -b && npm run test`
Expected: tudo verde. Confirme, no `git diff`, que os testes de `useGeocodingSearch` que já existiam **não** foram tocados (só acrescentados) e que o único arquivo de lógica de busca alterado é `useGeocodingSearch.ts`.

- [ ] **Passo 6: Commit**

```bash
git add src/features/search/useGeocodingSearch.ts src/features/search/useGeocodingSearch.test.ts
git commit -m "feat(busca): mesclar cadastro local de unidades de saúde do DF no topo das sugestões"
```

---

## Tarefa 5: README + verificação manual no navegador

**Contexto:** Testes cobrem a lógica; falta registrar a origem dos dados e confirmar a experiência real. Sem código novo além do README.

**Files:**
- Modify: `README.md`

- [ ] **Passo 1: Nota de origem dos dados no README**

Na lista de tecnologias/fontes de dados (perto das linhas de Geoapify/Mapbox, por volta da linha 143), acrescentar:

```markdown
- [CNES / DATASUS](https://cnes.datasus.gov.br/) — cadastro (domínio
  público) de onde é destilado o arquivo local de unidades públicas de
  saúde do DF (`src/data/dfHealthUnits.generated.ts`), usado para achar
  UBS, postos, hospitais regionais, UPAs e CAPS que o OpenStreetMap não
  cobre. Regeração manual e opcional: `npm run generate:unidades-saude`
  (o arquivo já vem versionado; o app não baixa nada em runtime).
```

- [ ] **Passo 2: Formatar e checar**

Run: `npm run format && npm run format:check && npm run lint && npx tsc -b && npm run test`
Expected: tudo verde (o `README.md` também passa pelo Prettier — `.prettierignore` não o cobre).

- [ ] **Passo 3: Commit**

```bash
git add README.md
git commit -m "docs: registrar CNES/DATASUS como fonte do cadastro local de unidades de saúde"
```

- [ ] **Passo 4: Subir o app**

Run: `npm run dev`

- [ ] **Passo 5: Buscar as UBS do Guará**

No campo de busca, digitar, uma de cada vez: **"UBS 1 Guará"**, **"UBS 2 Guará"**, **"posto de saúde 2 guará"**, **"unidade básica de saúde 2 guará"**.
Expected: em todas, a unidade correta do Guará aparece **no topo** da lista, antes de qualquer resultado de Guaratinguetá/etc. Selecionar uma → o mapa centraliza no ponto certo e a rota é calculada normalmente (mesmo fluxo de sempre; `resolveSuggestion` já trata `coordinates` presentes).

- [ ] **Passo 6: Regressão da busca comum**

Digitar **"Águas Claras"**, **"farmácia"**, **"Rua 4B Vicente Pires"**.
Expected: resultados iguais aos de antes desta mudança — a fonte local não interfere (sem palavra-âncora de saúde → `searchDfHealthUnits` devolve `[]`).

- [ ] **Passo 7: Buscar unidade em outra RA**

Digitar **"UBS Ceilândia"**, **"hospital regional de taguatinga"**, **"UPA Sobradinho"**.
Expected: as unidades correspondentes aparecem no topo (confirma que o cadastro cobre o DF inteiro, não só o Guará).

- [ ] **Passo 8: Anotar o que observar**

Se alguma unidade conhecida não aparecer ou vier com coordenada visivelmente errada, anotar o `id` (CNES) e o nome — a correção é adicionar uma entrada em `scripts/data/unidades-saude.overrides.json` (campo `byCnes`), fora do escopo desta implementação inicial.

---

## Auto-revisão do plano

- **Cobertura do spec:**
  - "script rodado à mão + arquivo versionado" → Tarefa 2 (script) + Tarefas 1/2 (funções puras, saída `.generated.ts`).
  - "filtro DF + filtro de tipo (exclui policlínica tipo 4)" → `TYPE_META` na Tarefa 1 (tipo 4 ausente do mapa) + `iterRecords`/`CO_UF` na Tarefa 2.
  - "limpeza de coordenada (ausente/zero/fora da caixa/placeholder)" → `parseCoordinate` Tarefa 1, Passos 4–6.
  - "recuperação por geocodificação das ~55 sem coord" → `geocodeAddress` Tarefa 2, Passo 3.
  - "overrides aplicados por último, nunca sobrescritos" → `applyOverrides` Tarefa 1 (Passos 13–14) + uso na Tarefa 2.
  - "geração de apelidos (número/sigla/RA)" → `buildSearchText` + `numberVariants` Tarefa 1 (Passos 11–12).
  - "módulo `dfHealthUnits.ts` com `searchDfHealthUnits`" → Tarefas 2 (interface) e 3 (função).
  - "guarda contra query genérica; 'hospital' sozinho segue como hoje" → `TYPE_ANCHORS`/`GENERIC_TOKENS` Tarefa 3, testes cobrindo "hospital"/"ubs"/"ceilândia" sozinhos.
  - "integração aditiva no hook; local no topo; dedupe; sem erro se local achou" → Tarefa 4.
  - "displayName no formato da Geoapify; SearchBar não muda" → `buildDisplayName` Tarefa 1; nenhuma tarefa toca `SearchBar.tsx`.
  - "README com origem dos dados; dump não versionado" → Tarefa 5 Passo 1; Tarefa 2 Passo 8.
  - "sem CSP/env nova; nenhuma requisição de rede no app" → nenhuma tarefa altera `index.html`/CSP/`.env.example`; o app só importa um `.ts`.
  - "todos os testes existentes intactos" → Tarefa 4 Passo 5 verifica explicitamente.
- **Placeholders:** nenhum "TBD"/"depois"; todo passo de código traz o código completo.
- **Consistência de tipos:** `DfHealthUnit` (Tarefa 2) é o tipo do `DF_HEALTH_UNITS` (Tarefa 2, gerado) e o retorno filtrado em `searchDfHealthUnits` (Tarefa 3); `searchDfHealthUnits(query, proximity, limit?)` tem a mesma assinatura no teste (Tarefa 3) e na chamada do hook (Tarefa 4, sem passar `limit` → default 6). `numberVariants` existe em dois lugares (script `.mjs` e app `.ts`) com a mesma lógica, marcado com comentário-espelho em ambos. `parseCoordinate`, `buildDisplayName`, `buildSearchText`, `applyOverrides`, `TYPE_META`, `resolveRa` são definidos na Tarefa 1 e só consumidos pela Tarefa 2 com as mesmas assinaturas.
