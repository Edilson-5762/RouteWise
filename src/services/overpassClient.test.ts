import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchPlacesByCategory, OverpassRequestError } from './overpassClient';
import type { PlaceCategoryDefinition } from '../data/placeCategories';

const FARMACIA: PlaceCategoryDefinition = {
  keywords: ['farmacia'],
  osmTag: { key: 'amenity', value: 'pharmacy' },
  categoryLabel: 'Farmácia',
};

const LOJA: PlaceCategoryDefinition = {
  keywords: ['loja'],
  osmTag: { key: 'shop', value: '' },
  categoryLabel: 'Loja',
};

describe('searchPlacesByCategory', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte nodes do Overpass em PlaceSuggestion, ordenados por distância do centro', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          { type: 'node', id: 1, lat: -15.85, lon: -47.95, tags: { name: 'Farmácia Longe' } },
          { type: 'node', id: 2, lat: -15.8, lon: -47.9, tags: { name: 'Farmácia Perto' } },
        ],
      }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results.map((r) => r.placeName)).toEqual(['Farmácia Perto', 'Farmácia Longe']);
  });

  it('usa o centro (`center`) para elementos do tipo way', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [{ type: 'way', id: 10, center: { lat: -15.8, lon: -47.9 }, tags: { name: 'Farmácia Way' } }],
      }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results).toEqual([
      { id: 'osm-way-10', placeName: 'Farmácia Way', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);
  });

  it('descarta elementos sem nome', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [{ type: 'node', id: 1, lat: -15.8, lon: -47.9, tags: {} }] }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results).toEqual([]);
  });

  it('descarta elementos sem coordenadas resolvíveis (sem lat/lon nem center)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [{ type: 'relation', id: 1, tags: { name: 'Algo' } }] }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results).toEqual([]);
  });

  it('inclui o endereço no rótulo quando addr:street e addr:housenumber estão presentes', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          {
            type: 'node',
            id: 1,
            lat: -15.8,
            lon: -47.9,
            tags: { name: 'Farmácia X', 'addr:street': 'Rua das Flores', 'addr:housenumber': '123' },
          },
        ],
      }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results[0].placeName).toBe('Farmácia X, Rua das Flores, 123');
  });

  it('usa o filtro de existência de chave (sem valor) para categorias como "loja"', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });

    await searchPlacesByCategory(LOJA, { lat: -15.8, lng: -47.9 });

    const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body as string;
    expect(decodeURIComponent(body)).toContain('["shop"]');
    expect(decodeURIComponent(body)).not.toContain('["shop"=""]');
  });

  it('usa a localização informada como centro da busca (`around`)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });

    await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body as string;
    expect(decodeURIComponent(body)).toContain('around:8000,-15.8,-47.9');
  });

  it('usa um centro padrão (DF) quando nenhuma localização é informada', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });

    await searchPlacesByCategory(FARMACIA, null);

    const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body as string;
    expect(decodeURIComponent(body)).toContain('around:8000,-15.7939,-47.8828');
  });

  it('lança OverpassRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    await expect(searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 })).rejects.toThrow(
      OverpassRequestError,
    );
  });

  it('limita o resultado a 8 sugestões', async () => {
    const elements = Array.from({ length: 20 }, (_, i) => ({
      type: 'node' as const,
      id: i,
      lat: -15.8 + i * 0.001,
      lon: -47.9,
      tags: { name: `Farmácia ${i}` },
    }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ elements }) });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results).toHaveLength(8);
  });
});
