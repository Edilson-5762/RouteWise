// Gera src/data/dfHealthUnits.generated.ts a partir do dump nacional do
// CNES (Cadastro Nacional de Estabelecimentos de Saúde, DATASUS —
// domínio público).
//
// Rode manualmente:  npm run generate:unidades-saude
// O arquivo gerado é versionado (entra no commit). O app NÃO baixa nada
// em runtime nem no build — depende só do arquivo gerado.
//
// Requer VITE_GEOAPIFY_API_KEY (lido de .env) só para recuperar o
// endereço das unidades com coordenada ruim. Sem a chave, essas
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

// Extrai via `unzip` (disponível no ambiente). `node:zlib` não lê ZIP.
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
  const overrides = JSON.parse(readFileSync(OVERRIDES, 'utf8'));
  const overrideCoord = (cnes) => overrides.byCnes?.[cnes]?.coordinates ?? null;

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
    // Um override de coordenada resgata a unidade antes de tentar
    // geocodificar/excluir — é o caso de uma coord tão quebrada que o
    // registro seria descartado.
    const coord = overrideCoord(rec.CO_CNES) ?? parseCoordinate(rec.NU_LATITUDE, rec.NU_LONGITUDE);
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
    console.log(
      `\n${unrecovered.length} unidades SEM coordenada (excluídas) — corrija via overrides:`,
    );
    for (const u of unrecovered) console.log(`  ${u.id}  ${u.displayName}`);
  }

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
