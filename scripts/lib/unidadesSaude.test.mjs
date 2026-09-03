import { describe, it, expect } from 'vitest';
import {
  normalize,
  romanToDigit,
  numberVariants,
  parseCoordinate,
  TYPE_META,
  resolveRa,
  prettify,
  buildDisplayName,
  buildSearchText,
  applyOverrides,
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
    expect(TYPE_META['2'].synonyms).toEqual(
      expect.arrayContaining(['ubs', 'unidade basica de saude']),
    );
  });
});

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
    expect(buildDisplayName(rec)).toBe(
      'UBS 02 Guará, QE 23 Área Especial, Guará II, Brasília - DF',
    );
  });
});

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

const BASE = [
  {
    id: 'cnes-1',
    displayName: 'A',
    kind: 'UBS',
    ra: 'Guará',
    coordinates: { lat: -15.8, lng: -47.9 },
    searchText: 'a guara',
  },
  {
    id: 'cnes-2',
    displayName: 'B',
    kind: 'UBS',
    ra: 'Guará',
    coordinates: { lat: -15.81, lng: -47.91 },
    searchText: 'b guara',
  },
];

describe('applyOverrides', () => {
  it('exclui unidade marcada com exclude', () => {
    const out = applyOverrides(BASE, { byCnes: { 1: { exclude: true } } });
    expect(out.map((u) => u.id)).toEqual(['cnes-2']);
  });
  it('coordenada do override prevalece', () => {
    const out = applyOverrides(BASE, {
      byCnes: { 2: { coordinates: { lat: -15.99, lng: -47.99 } } },
    });
    expect(out.find((u) => u.id === 'cnes-2').coordinates).toEqual({
      lat: -15.99,
      lng: -47.99,
    });
  });
  it('add entra na lista e é ordenado por id', () => {
    const out = applyOverrides(BASE, {
      add: [
        {
          id: 'cnes-0',
          displayName: 'Z',
          kind: 'UBS',
          ra: 'Gama',
          coordinates: { lat: -16, lng: -48 },
          aliases: ['z gama'],
        },
      ],
    });
    expect(out.map((u) => u.id)).toEqual(['cnes-0', 'cnes-1', 'cnes-2']);
    expect(out[0].searchText).toContain('z gama');
  });
});
