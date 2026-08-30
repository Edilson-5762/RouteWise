// Gera public/og-card.png a partir de assets/brand/og-card.svg.
//
// Rode manualmente após editar o SVG:  npm run generate:og
// O PNG resultante é versionado (entra no commit) e servido estático pela
// Vercel — o build da Vercel NÃO regera esta imagem, então não depende de
// fontes instaladas no servidor. O texto usa Inter se disponível e cai para
// Segoe UI / Arial (fontes do sistema) caso contrário.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = resolve(root, 'assets/brand/og-card.svg');
const outDir = resolve(root, 'public');
const outPath = resolve(outDir, 'og-card.png');

const svg = readFileSync(svgPath, 'utf8');

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
});

const png = resvg.render().asPng();
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, png);

console.log(`og-card.png gerado (${png.length} bytes) em ${outPath}`);
