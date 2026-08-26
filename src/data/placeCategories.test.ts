import { describe, it, expect } from 'vitest';
import { matchPlaceCategory } from './placeCategories';

describe('matchPlaceCategory', () => {
  it('reconhece "farmácia" (com acento) como categoria Farmácia', () => {
    const category = matchPlaceCategory('farmácia');
    expect(category?.categoryLabel).toBe('Farmácia');
    expect(category?.osmTag).toEqual({ key: 'amenity', value: 'pharmacy' });
  });

  it('reconhece a categoria mesmo com texto adicional na busca', () => {
    expect(matchPlaceCategory('farmácia 24 horas')?.categoryLabel).toBe('Farmácia');
    expect(matchPlaceCategory('hospital perto de mim')?.categoryLabel).toBe('Hospital');
  });

  it('reconhece palavras-chave com mais de uma palavra', () => {
    expect(matchPlaceCategory('posto de gasolina')?.categoryLabel).toBe('Posto de combustível');
  });

  it('retorna null para uma busca de endereço comum', () => {
    expect(matchPlaceCategory('Rua das Flores, 123')).toBeNull();
    expect(matchPlaceCategory('Águas Claras')).toBeNull();
  });

  it('usa o filtro de existência de chave (sem valor) para "loja"', () => {
    expect(matchPlaceCategory('loja')?.osmTag).toEqual({ key: 'shop', value: '' });
  });
});
