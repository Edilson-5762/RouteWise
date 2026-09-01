import { describe, it, expect } from 'vitest';
import { matchPlaceCategory } from './placeCategories';

describe('matchPlaceCategory', () => {
  it('reconhece "farmácia" (com acento) como categoria Farmácia', () => {
    const category = matchPlaceCategory('farmácia');
    expect(category?.categoryLabel).toBe('Farmácia');
    expect(category?.geoapifyCategory).toBe('commercial.health_and_beauty.pharmacy');
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

  it('usa a categoria genérica "commercial" para "loja"', () => {
    expect(matchPlaceCategory('loja')?.geoapifyCategory).toBe('commercial');
  });

  it('prefere a palavra-chave mais específica quando uma é substring da outra ("bar" dentro de "barbearia")', () => {
    expect(matchPlaceCategory('bar')?.categoryLabel).toBe('Bar');
    expect(matchPlaceCategory('barbearia')?.categoryLabel).toBe('Barbearia');
    expect(matchPlaceCategory('quero ir num bar hoje')?.categoryLabel).toBe('Bar');
  });

  it('reconhece categorias adicionadas após o relato de cobertura incompleta', () => {
    expect(matchPlaceCategory('bar')?.categoryLabel).toBe('Bar');
    expect(matchPlaceCategory('barbearia')?.categoryLabel).toBe('Barbearia');
    expect(matchPlaceCategory('salão de estética')?.categoryLabel).toBe('Salão de beleza');
    expect(matchPlaceCategory('salão de beleza')?.categoryLabel).toBe('Salão de beleza');
    expect(matchPlaceCategory('açougue')?.categoryLabel).toBe('Açougue');
    expect(matchPlaceCategory('panificadora')?.categoryLabel).toBe('Padaria');
    expect(matchPlaceCategory('posto de saúde')?.categoryLabel).toBe('Clínica');
    expect(matchPlaceCategory('órgão público')?.categoryLabel).toBe('Órgão público');
  });

  it('reconhece "UBS" e variações como categoria Clínica (postos de saúde do DF)', () => {
    expect(matchPlaceCategory('UBS')?.categoryLabel).toBe('Clínica');
    expect(matchPlaceCategory('UBS 01 Guará')?.categoryLabel).toBe('Clínica');
    expect(matchPlaceCategory('unidade de saúde')?.categoryLabel).toBe('Clínica');
    expect(matchPlaceCategory('Clínica')?.geoapifyCategory).toContain('healthcare');
  });
});
