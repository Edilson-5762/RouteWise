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
