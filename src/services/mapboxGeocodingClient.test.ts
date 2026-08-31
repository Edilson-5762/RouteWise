import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchPlacesMapbox, MapboxGeocodingError, hasMapboxToken } from './mapboxGeocodingClient';

describe('searchPlacesMapbox', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte as features do geocoder do Mapbox em PlaceSuggestion (id com prefixo, center → lat/lng)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            id: 'poi.123',
            place_name: 'Studio Rea Estética Automotiva, Vicente Pires, Brasília',
            center: [-48.0188, -15.8113],
          },
        ],
      }),
    });

    const results = await searchPlacesMapbox('Studio Rea', { lat: -15.81, lng: -48.01 });

    expect(results).toEqual([
      {
        id: 'mapbox:poi.123',
        placeName: 'Studio Rea Estética Automotiva, Vicente Pires, Brasília',
        coordinates: { lat: -15.8113, lng: -48.0188 },
      },
    ]);
  });

  it('monta a URL com país, idioma, viés de proximidade e a query codificada', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await searchPlacesMapbox('Rua 4B, Vicente Pires', { lat: -15.81, lng: -48.01 });

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/geocoding/v5/mapbox.places/Rua%204B%2C%20Vicente%20Pires.json?');
    expect(url).toContain('country=br');
    expect(url).toContain('language=pt');
    expect(url).toContain('proximity=-48.01%2C-15.81');
  });

  it('descarta features sem um center válido', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          { id: 'a', place_name: 'Sem center', center: undefined },
          { id: 'b', place_name: 'Center incompleto', center: [-48.0] },
        ],
      }),
    });

    const results = await searchPlacesMapbox('qualquer', null);

    expect(results).toEqual([]);
  });

  it('lança MapboxGeocodingError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 422 });

    await expect(searchPlacesMapbox('qualquer', null)).rejects.toThrow(MapboxGeocodingError);
  });

  it('tem token configurado no ambiente de teste (via .env)', () => {
    // Garante que os testes de conversão acima exercitam o caminho real, e não
    // o atalho de "sem token → []".
    expect(hasMapboxToken()).toBe(true);
  });
});
