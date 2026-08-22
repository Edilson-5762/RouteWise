import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchPlaces, getDirections, MapboxRequestError } from './mapboxClient';

describe('searchPlaces', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte features de geocoding em sugestões', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          { id: 'place.1', place_name: 'Av. Paulista, São Paulo', center: [-46.6333, -23.5505] },
        ],
      }),
    });

    const results = await searchPlaces('Paulista');

    expect(results).toEqual([
      {
        id: 'place.1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lng: -46.6333, lat: -23.5505 },
      },
    ]);
  });

  it('lança MapboxRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    await expect(searchPlaces('Paulista')).rejects.toThrow(MapboxRequestError);
  });
});

describe('getDirections', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte uma resposta de directions em uma Route', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: {
              coordinates: [
                [-46.6333, -23.5505],
                [-46.63, -23.55],
              ],
            },
            distance: 1200,
            duration: 300,
            legs: [
              {
                steps: [
                  {
                    maneuver: { instruction: 'Siga para o norte', location: [-46.6333, -23.5505] },
                    distance: 1200,
                    duration: 300,
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    const route = await getDirections(
      { lng: -46.6333, lat: -23.5505 },
      { lng: -46.63, lat: -23.55 },
      'driving',
    );

    expect(route.distanceMeters).toBe(1200);
    expect(route.steps).toHaveLength(1);
    expect(route.steps[0].instruction).toBe('Siga para o norte');
  });

  it('lança MapboxRequestError quando nenhuma rota é encontrada', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'NoRoute', routes: [] }),
    });

    await expect(getDirections({ lng: 0, lat: 0 }, { lng: 1, lat: 1 }, 'driving')).rejects.toThrow(
      MapboxRequestError,
    );
  });

  it('inclui o tipo e modificador da manobra em cada passo', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: { coordinates: [[-46.6333, -23.5505], [-46.63, -23.55]] },
            distance: 1200,
            duration: 300,
            legs: [
              {
                steps: [
                  {
                    maneuver: {
                      instruction: 'Vire à direita na Rua X',
                      location: [-46.6333, -23.5505],
                      type: 'turn',
                      modifier: 'right',
                    },
                    distance: 1200,
                    duration: 300,
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    const route = await getDirections(
      { lng: -46.6333, lat: -23.5505 },
      { lng: -46.63, lat: -23.55 },
      'driving',
    );

    expect(route.steps[0].maneuverType).toBe('turn');
    expect(route.steps[0].maneuverModifier).toBe('right');
  });

  it('usa maneuverModifier nulo quando a API não retorna modificador', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: { coordinates: [[-46.6333, -23.5505], [-46.63, -23.55]] },
            distance: 1200,
            duration: 300,
            legs: [
              {
                steps: [
                  {
                    maneuver: {
                      instruction: 'Chegou ao destino',
                      location: [-46.6333, -23.5505],
                      type: 'arrive',
                    },
                    distance: 0,
                    duration: 0,
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    const route = await getDirections(
      { lng: -46.6333, lat: -23.5505 },
      { lng: -46.63, lat: -23.55 },
      'driving',
    );

    expect(route.steps[0].maneuverType).toBe('arrive');
    expect(route.steps[0].maneuverModifier).toBeNull();
  });
});
