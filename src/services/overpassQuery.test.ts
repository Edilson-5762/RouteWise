import { describe, it, expect } from 'vitest';
import { toAccentInsensitivePattern, buildOverpassQuery } from './overpassQuery';

describe('toAccentInsensitivePattern', () => {
  it('troca cada vogal por uma classe que aceita as formas acentuadas', () => {
    expect(toAccentInsensitivePattern('guara')).toBe('g[uúùû][aáàâãä]r[aáàâãä]');
  });

  it('liga as palavras com \\s+ (mesma ordem, espaço flexível)', () => {
    expect(toAccentInsensitivePattern('padaria bonanza')).toBe(
      'p[aáàâãä]d[aáàâãä]r[iíìî][aáàâãä]\\s+b[oóòôõ][nñ][aáàâãä][nñ]z[aáàâãä]',
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
    expect(ql).toContain('[out:json][timeout:8];');
    expect(ql).toContain(
      'nwr[~"^(name|name:pt|alt_name|old_name|short_name|official_name|loc_name|brand)$"~"guara",i](-16.1,-48.35,-15.4,-47.3);',
    );
    expect(ql.trimEnd().endsWith('out center 30;')).toBe(true);
  });

  it('escapa `\\` e depois `"` para não quebrar a string da QL', () => {
    // Entrada: a " b \ c  → escapa `\`→`\\`, depois `"`→`\"`  → a \" b \\ c
    expect(buildOverpassQuery('a"b\\c')).toContain('a\\"b\\\\c');
  });
});
