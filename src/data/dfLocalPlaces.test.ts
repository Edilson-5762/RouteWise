import { describe, it, expect } from 'vitest';
import { searchDfLocalPlaces } from './dfLocalPlaces';

describe('searchDfLocalPlaces', () => {
  it('acha o Atacadão Dia a Dia de Vicente Pires com a coordenada da ENTRADA', () => {
    const r = searchDfLocalPlaces('atacadão dia a dia vicente pires', null);
    expect(r[0].id).toBe('local-atacadao-dia-a-dia-vicente-pires');
    expect(r[0].coordinates).toEqual({ lat: -15.813558, lng: -48.016237 });
  });

  it('acha o Atacadão digitando só "atacadão dia dia"', () => {
    expect(searchDfLocalPlaces('atacadão dia dia', null)[0]?.id).toBe(
      'local-atacadao-dia-a-dia-vicente-pires',
    );
  });

  it('acha o Atacadão por "atacadao rua 4a"', () => {
    expect(searchDfLocalPlaces('atacadao rua 4a', null)[0]?.id).toBe(
      'local-atacadao-dia-a-dia-vicente-pires',
    );
  });

  it('acha o Edifício Meridien por "meridien vicente pires"', () => {
    const r = searchDfLocalPlaces('meridien vicente pires', null);
    expect(r[0].id).toBe('local-edificio-meridien-vicente-pires');
    expect(r[0].coordinates).toEqual({ lat: -15.814632, lng: -48.018474 });
  });

  it('acha o Meridien digitando só "meridien"', () => {
    expect(searchDfLocalPlaces('meridien', null)[0]?.id).toBe(
      'local-edificio-meridien-vicente-pires',
    );
  });

  it('devolve um rótulo amigável em placeName', () => {
    expect(searchDfLocalPlaces('meridien', null)[0]?.placeName).toContain('Edifício Meridien');
  });

  it('"vicente pires" sozinho não retorna nada (sem termo distintivo)', () => {
    expect(searchDfLocalPlaces('vicente pires', null)).toEqual([]);
  });

  it('"rua" sozinho não retorna nada', () => {
    expect(searchDfLocalPlaces('rua', null)).toEqual([]);
  });

  it('query vazia -> []', () => {
    expect(searchDfLocalPlaces('   ', null)).toEqual([]);
  });

  it('query sem relação -> []', () => {
    expect(searchDfLocalPlaces('aeroporto de brasília', null)).toEqual([]);
  });

  it('proximidade não quebra o match', () => {
    const perto = { lat: -15.8136, lng: -48.0163 };
    expect(searchDfLocalPlaces('atacadão dia dia', perto)[0]?.id).toBe(
      'local-atacadao-dia-a-dia-vicente-pires',
    );
  });

  it('respeita o limite', () => {
    expect(
      searchDfLocalPlaces('vicente pires meridien atacadao', null, 1).length,
    ).toBeLessThanOrEqual(1);
  });
});
