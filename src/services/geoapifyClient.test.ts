import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchPlacesByCategory,
  searchPlaces,
  searchNearbyPlaces,
  GeoapifyRequestError,
} from './geoapifyClient';
import type { PlaceCategoryDefinition } from '../data/placeCategories';

const FARMACIA: PlaceCategoryDefinition = {
  keywords: ['farmacia'],
  geoapifyCategory: 'commercial.health_and_beauty.pharmacy',
  categoryLabel: 'Farmácia',
};

describe('searchPlacesByCategory', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte features da Geoapify em PlaceSuggestion, usando o endereço formatado como rótulo', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: 'Farmácia do Trabalhador',
              formatted: 'Farmácia do Trabalhador, SCS Quadra 1/2, Brasília - DF, 70317-900, Brasil',
              lat: -15.7982984,
              lon: -47.8870928,
              place_id: 'place-1',
            },
          },
        ],
      }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results).toEqual([
      {
        id: 'place-1',
        placeName: 'Farmácia do Trabalhador, SCS Quadra 1/2, Brasília - DF, 70317-900, Brasil',
        coordinates: { lat: -15.7982984, lng: -47.8870928 },
      },
    ]);
  });

  it('descarta features sem endereço formatado', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ properties: { lat: -15.8, lon: -47.9, place_id: 'place-1' } }],
      }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results).toEqual([]);
  });

  it('preserva a ordem de proximidade devolvida pela API (não reordena no cliente)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          { properties: { formatted: 'Perto', lat: -15.8, lon: -47.9, place_id: 'perto' } },
          { properties: { formatted: 'Longe', lat: -15.9, lon: -48.0, place_id: 'longe' } },
        ],
      }),
    });

    const results = await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    expect(results.map((r) => r.id)).toEqual(['perto', 'longe']);
  });

  it('usa a localização informada como centro do filtro de raio e do viés de proximidade', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('filter=circle%3A-47.9%2C-15.8%2C8000');
    expect(url).toContain('bias=proximity%3A-47.9%2C-15.8');
  });

  it('usa um centro padrão (DF) quando nenhuma localização é informada', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await searchPlacesByCategory(FARMACIA, null);

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('filter=circle%3A-47.8828%2C-15.7939%2C8000');
  });

  it('inclui a categoria da Geoapify e limita a 8 resultados na própria requisição', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 });

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('categories=commercial.health_and_beauty.pharmacy');
    expect(url).toContain('limit=8');
  });

  it('lança GeoapifyRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    await expect(searchPlacesByCategory(FARMACIA, { lat: -15.8, lng: -47.9 })).rejects.toThrow(
      GeoapifyRequestError,
    );
  });
});

describe('searchPlaces', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte features da Geoapify em PlaceSuggestion, usando o endereço formatado como rótulo', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: 'Bradesco',
              formatted: 'Bradesco, C6 7, Setor Central, Taguatinga - DF, 72010-060, Brasil',
              lat: -15.8335435,
              lon: -48.0549342,
              place_id: 'place-bradesco',
            },
          },
        ],
      }),
    });

    const results = await searchPlaces('Bradesco', { lat: -15.8, lng: -47.9 });

    expect(results).toEqual([
      {
        id: 'place-bradesco',
        placeName: 'Bradesco, C6 7, Setor Central, Taguatinga - DF, 72010-060, Brasil',
        coordinates: { lat: -15.8335435, lng: -48.0549342 },
      },
    ]);
  });

  it('descarta features sem endereço formatado', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ properties: { lat: -15.8, lon: -47.9, place_id: 'place-1' } }],
      }),
    });

    const results = await searchPlaces('Bradesco', { lat: -15.8, lng: -47.9 });

    expect(results).toEqual([]);
  });

  it('não restringe por raio, só por país (Brasil) e viés de proximidade', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await searchPlaces('Águas Claras', { lat: -15.8, lng: -47.9 });

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain('circle');
    expect(url).toContain('filter=countrycode%3Abr');
    expect(url).toContain('bias=proximity%3A-47.9%2C-15.8');
  });

  it('usa um centro padrão (DF) quando nenhuma localização é informada', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await searchPlaces('farmácia', null);

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('bias=proximity%3A-47.8828%2C-15.7939');
  });

  it('inclui o texto buscado e limita a 8 resultados na própria requisição', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await searchPlaces('Panificadora Bonanza', { lat: -15.8, lng: -47.9 });

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('text=Panificadora+Bonanza');
    expect(url).toContain('limit=8');
  });

  it('lança GeoapifyRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    await expect(searchPlaces('Bradesco', { lat: -15.8, lng: -47.9 })).rejects.toThrow(
      GeoapifyRequestError,
    );
  });
});

describe('searchNearbyPlaces', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte features da Geoapify em PlaceSuggestion', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: "D'Casa Ferramentas",
              formatted: "D'Casa Ferramentas, SHVP - Rua 4, Vicente Pires - DF, Brasil",
              lat: -15.8306,
              lon: -48.0645,
              place_id: 'place-nearby-1',
            },
          },
        ],
      }),
    });

    const results = await searchNearbyPlaces({ lat: -15.8306, lng: -48.0645 }, 900);

    expect(results).toEqual([
      {
        id: 'place-nearby-1',
        placeName: "D'Casa Ferramentas, SHVP - Rua 4, Vicente Pires - DF, Brasil",
        coordinates: { lat: -15.8306, lng: -48.0645 },
      },
    ]);
  });

  it('monta a URL com categorias amplas, raio circular, limite e idioma corretos', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await searchNearbyPlaces({ lat: -15.8306, lng: -48.0645 }, 900);

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('categories=commercial%2Cservice%2Ccatering%2Chealthcare');
    expect(url).toContain('filter=circle%3A-48.0645%2C-15.8306%2C900');
    expect(url).toContain('limit=100');
    expect(url).toContain('lang=pt');
  });

  it('lança GeoapifyRequestError com o status HTTP quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 429 });

    await expect(searchNearbyPlaces({ lat: -15.8306, lng: -48.0645 }, 900)).rejects.toThrow(
      GeoapifyRequestError,
    );

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 429 });
    try {
      await searchNearbyPlaces({ lat: -15.8306, lng: -48.0645 }, 900);
      throw new Error('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(GeoapifyRequestError);
      expect((error as InstanceType<typeof GeoapifyRequestError>).status).toBe(429);
    }
  });
});
