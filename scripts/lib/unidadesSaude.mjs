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
  1: 'i',
  2: 'ii',
  3: 'iii',
  4: 'iv',
  5: 'v',
  6: 'vi',
  7: 'vii',
  8: 'viii',
  9: 'ix',
  10: 'x',
  11: 'xi',
  12: 'xii',
  13: 'xiii',
  14: 'xiv',
  15: 'xv',
};
const WRITTEN_BY_DIGIT = {
  1: 'um',
  2: 'dois',
  3: 'tres',
  4: 'quatro',
  5: 'cinco',
  6: 'seis',
  7: 'sete',
  8: 'oito',
  9: 'nove',
  10: 'dez',
  11: 'onze',
  12: 'doze',
  13: 'treze',
  14: 'quatorze',
  15: 'quinze',
};
const DIGIT_BY_ROMAN = Object.fromEntries(Object.entries(ROMAN_BY_DIGIT).map(([d, r]) => [r, d]));
const DIGIT_BY_WRITTEN = Object.fromEntries(
  Object.entries(WRITTEN_BY_DIGIT).map(([d, w]) => [w, d]),
);

export function romanToDigit(r) {
  return DIGIT_BY_ROMAN[normalize(r)] ?? null;
}
export function digitToRoman(d) {
  return ROMAN_BY_DIGIT[String(parseInt(d, 10))] ?? null;
}

// Todas as grafias equivalentes de um token, se ele for um número
// (dígito / com zero à esquerda / romano / por extenso). Senão, `[token]`.
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

// TP_UNIDADE (como vem no dump, SEM zero à esquerda) -> tipo e sinônimos
// para o texto de busca. Tipos fora deste mapa são descartados.
export const TYPE_META = {
  1: { kind: 'Posto', synonyms: ['posto de saude', 'unidade de saude', 'ubs'] },
  2: {
    kind: 'UBS',
    synonyms: [
      'ubs',
      'unidade basica de saude',
      'posto de saude',
      'unidade de saude',
      'centro de saude',
    ],
  },
  5: { kind: 'Hospital', synonyms: ['hospital'] },
  7: { kind: 'Hospital', synonyms: ['hospital'] },
  15: { kind: 'Unidade Mista', synonyms: ['unidade mista', 'posto de saude'] },
  20: { kind: 'Pronto-Socorro', synonyms: ['pronto socorro', 'ps'] },
  21: { kind: 'Pronto-Socorro', synonyms: ['pronto socorro', 'ps'] },
  70: { kind: 'CAPS', synonyms: ['caps', 'centro de atencao psicossocial'] },
  72: { kind: 'CAPS', synonyms: ['caps', 'centro de atencao psicossocial'] },
  73: {
    kind: 'UPA',
    synonyms: ['upa', 'pronto atendimento', 'unidade de pronto atendimento'],
  },
};

// Regiões Administrativas do DF, casadas por prefixo do bairro normalizado
// do CNES. Ordem importa: prefixos mais longos/específicos primeiro.
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

// Palavras que ficam em CAIXA ALTA no rótulo (siglas / códigos de quadra).
const KEEP_UPPER = new Set([
  'ubs',
  'upa',
  'caps',
  'ps',
  'df',
  'sia',
  'scia',
  'hran',
  'hrg',
  'hrc',
  'hrp',
  'hrs',
  'hrt',
  'hrsam',
  'qe',
  'qi',
  'qn',
  'qnm',
  'qnl',
  'qnn',
  'qno',
  'qnp',
  'qng',
  'qsa',
  'qsb',
  'eq',
  'ae',
  'ac',
  'ci',
  'cnb',
  'epct',
  'eptg',
  'epia',
  'l2',
  'l3',
  'l4',
  'w3',
  'w4',
  'w5',
  's2',
  'n2',
]);
// Acentos por palavra, aplicados antes do Title Case.
const WORD_ACCENTS = {
  guara: 'Guará',
  ceilandia: 'Ceilândia',
  brazlandia: 'Brazlândia',
  paranoa: 'Paranoá',
  itapoa: 'Itapoã',
  varjao: 'Varjão',
  sao: 'São',
  sebastiao: 'Sebastião',
  nucleo: 'Núcleo',
  candangolandia: 'Candangolândia',
  agua: 'Água',
  aguas: 'Águas',
  botanico: 'Botânico',
  por: 'Pôr',
  saude: 'Saúde',
  basica: 'Básica',
  regiao: 'Região',
  area: 'Área',
  policlinica: 'Policlínica',
  psicossocial: 'Psicossocial',
  atencao: 'Atenção',
};

export function prettify(raw) {
  const base = String(raw ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return '';
  return base
    .split(' ')
    .map((w) => {
      const n = normalize(w).replace(/[^a-z0-9]/g, '');
      if (!n) return w;
      if (KEEP_UPPER.has(n)) return w.toUpperCase();
      if (/^\d+[a-z]?$/.test(n)) return w; // "02", "3a"
      if (/^[ivx]{1,4}$/.test(n)) return w.toUpperCase(); // romanos
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
  const numero =
    rec.NU_ENDERECO && !/^s\/?n$/i.test(String(rec.NU_ENDERECO).trim())
      ? String(rec.NU_ENDERECO).trim()
      : '';
  const streetWithNo = [street, numero].filter(Boolean).join(', ');
  const bairro = prettify(rec.NO_BAIRRO);
  return [name, streetWithNo, bairro, 'Brasília - DF'].filter(Boolean).join(', ');
}

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
  chunks.push(bairro.replace(/\b([ivx]{1,4})\b/g, (mm, r) => romanToDigit(r) ?? mm));

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
    searchText: normalize([a.displayName, a.ra, ...(a.aliases || [])].join(' ')),
  }));

  return [...patched, ...extras].sort((x, y) => x.id.localeCompare(y.id));
}
