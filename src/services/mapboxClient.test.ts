import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchPlaces, retrievePlace, getDirections, MapboxRequestError } from './mapboxClient';

describe('searchPlaces', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte sugestões da Search Box API em PlaceSuggestion', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            mapbox_id: 'suggestion.1',
            full_address: 'Av. Paulista, São Paulo, Brasil',
            place_formatted: 'São Paulo, Brasil',
            name: 'Av. Paulista',
          },
        ],
      }),
    });

    const results = await searchPlaces('Paulista', 'session-1');

    expect(results).toEqual([
      { id: 'suggestion.1', placeName: 'Av. Paulista, São Paulo, Brasil' },
    ]);
  });

  it('usa place_formatted quando não há full_address, e name como último recurso', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          { mapbox_id: 'a', place_formatted: 'São Paulo, Brasil', name: 'Av. Paulista' },
          { mapbox_id: 'b', name: 'Padaria do Zé' },
        ],
      }),
    });

    const results = await searchPlaces('Paulista', 'session-1');

    expect(results).toEqual([
      { id: 'a', placeName: 'São Paulo, Brasil' },
      { id: 'b', placeName: 'Padaria do Zé' },
    ]);
  });

  it('inclui o nome da cidade quando o resultado é do tipo "place" (place_formatted só traz o contexto)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            mapbox_id: 'place.1',
            name: 'Tracuateua',
            place_formatted: 'Pará, Brasil',
            feature_type: 'place',
            context: { region: { name: 'Pará', region_code: 'PA' } },
          },
        ],
      }),
    });

    const results = await searchPlaces('Tracuateua', 'session-1');

    expect(results).toEqual([{ id: 'place.1', placeName: 'Tracuateua, Pará, Brasil' }]);
  });

  it('acrescenta o estado ao rótulo quando o contexto tem region mas o texto formatado não o inclui', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            mapbox_id: 'poi.1',
            name: 'Padaria do Zé',
            full_address: 'Tracuateua, 68647-000, Brasil',
            context: { region: { name: 'Pará', region_code: 'PA' } },
          },
        ],
      }),
    });

    const results = await searchPlaces('Padaria', 'session-1');

    expect(results).toEqual([
      { id: 'poi.1', placeName: 'Tracuateua, 68647-000, Brasil - PA' },
    ]);
  });

  it('não duplica o estado quando o texto formatado já o contém', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            mapbox_id: 'addr.1',
            name: 'Rua X',
            full_address: 'Rua X, Belém - Pará, Brasil',
            context: { region: { name: 'Pará', region_code: 'PA' } },
          },
        ],
      }),
    });

    const results = await searchPlaces('Rua X', 'session-1');

    expect(results).toEqual([{ id: 'addr.1', placeName: 'Rua X, Belém - Pará, Brasil' }]);
  });

  it('lança MapboxRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    await expect(searchPlaces('Paulista', 'session-1')).rejects.toThrow(MapboxRequestError);
  });

  it('pede resultados em português e restringe ao Brasil', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [] }),
    });

    await searchPlaces('Paulista', 'session-1');

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('language=pt');
    expect(url).toContain('country=br');
  });

  it('inclui o session_token informado', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [] }),
    });

    await searchPlaces('Paulista', 'minha-sessao');

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('session_token=minha-sessao');
  });

  it('inclui viés de proximidade quando a localização atual é informada', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [] }),
    });

    await searchPlaces('Paulista', 'session-1', { lng: -46.6333, lat: -23.5505 });

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('proximity=-46.6333,-23.5505');
  });

  it('não inclui proximity quando a localização atual não é informada', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [] }),
    });

    await searchPlaces('Paulista', 'session-1');

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain('proximity=');
  });

  it('faz apenas uma chamada quando não há proximidade', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [] }),
    });

    await searchPlaces('Paulista', 'session-1');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('inclui regiões administrativas do DF do gazetteer local quando a busca corresponde ao nome, mesmo sem resultado equivalente da Mapbox', async () => {
    // Reproduz o gap real de dados confirmado ao consultar a Search Box API
    // diretamente: para "Plano Piloto" ela só retorna POIs cujo nome contém o
    // texto (uma casa, uma escola, uma igreja...), nunca uma entrada do tipo
    // place/district/locality para a região em si.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            mapbox_id: 'poi.casa',
            full_address: 'St. de Habitações Individuais Geminadas Sul 707, Brasília, 70351, Brasil',
            name: 'Plano Piloto',
            feature_type: 'poi',
          },
        ],
      }),
    });

    const results = await searchPlaces('plano piloto', 'session-1');

    expect(results[0]).toEqual({
      id: 'local-region:plano-piloto',
      placeName: 'Plano Piloto, Brasília - DF',
      coordinates: { lat: -15.7939, lng: -47.8828 },
    });
  });

  it('inclui Brazlândia (RA do DF) do gazetteer local, mesmo sem resultado equivalente da Mapbox', async () => {
    // Mesmo gap de dados confirmado para "Plano Piloto" (ver comentário acima):
    // consultando a Search Box API diretamente para "Brazlândia" ela só retorna
    // POIs cujo nome contém o texto (ex.: "Giraffas Brazlândia"), nunca uma
    // entrada place/district/locality para a região em si.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            mapbox_id: 'poi.giraffas',
            full_address: 'QUADRA 03 NORTE, Brasília, 72705, Brasil',
            name: 'Giraffas Brazlândia',
            feature_type: 'poi',
          },
        ],
      }),
    });

    const results = await searchPlaces('brazlandia', 'session-1');

    expect(results[0]).toEqual({
      id: 'local-region:brazlandia',
      placeName: 'Brazlândia, Brasília - DF',
      coordinates: { lat: -15.6815, lng: -48.1972 },
    });
  });

  it('não duplica quando a Mapbox já retorna a própria região administrativa como sugestão', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [{ mapbox_id: 'place.taguatinga', name: 'Taguatinga', feature_type: 'place' }],
      }),
    });

    const results = await searchPlaces('taguatinga', 'session-1');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 'local-region:taguatinga',
      placeName: 'Taguatinga, Brasília - DF',
      coordinates: { lat: -15.8318, lng: -48.0575 },
    });
  });

  it('não confunde uma busca não relacionada com uma região administrativa do DF', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [{ mapbox_id: 'a', full_address: 'Av. Paulista, São Paulo, Brasil', name: 'Av. Paulista' }],
      }),
    });

    const results = await searchPlaces('Paulista', 'session-1');

    expect(results).toEqual([{ id: 'a', placeName: 'Av. Paulista, São Paulo, Brasil' }]);
  });

  it('com proximidade, busca em paralelo local + distante-lugares + distante-geral, priorizando local, depois lugares, depois geral, sem duplicar ids', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('proximity=-48.006')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            suggestions: [
              { mapbox_id: 'local-1', full_address: 'Rua Local, Brasília, Brasil', name: 'Rua Local' },
              { mapbox_id: 'compartilhado', full_address: 'Rua X, Brasil', name: 'Rua X' },
            ],
          }),
        });
      }
      if (url.includes('types=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            suggestions: [
              {
                mapbox_id: 'lugar-1',
                full_address: 'Salvador, Bahia, Brasil',
                name: 'Salvador',
                feature_type: 'place',
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          suggestions: [
            { mapbox_id: 'compartilhado', full_address: 'Rua X, Brasil', name: 'Rua X' },
            {
              mapbox_id: 'distante-1',
              full_address: 'Av. Paulista, São Paulo, Brasil',
              name: 'Av. Paulista',
            },
          ],
        }),
      });
    });

    const results = await searchPlaces('rua', 'session-1', { lng: -48.006, lat: -15.827 });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(results).toEqual([
      { id: 'local-1', placeName: 'Rua Local, Brasília, Brasil' },
      { id: 'compartilhado', placeName: 'Rua X, Brasil' },
      { id: 'lugar-1', placeName: 'Salvador, Bahia, Brasil' },
      { id: 'distante-1', placeName: 'Av. Paulista, São Paulo, Brasil' },
    ]);
  });

  it('acha uma cidade distante mesmo quando seu nome colide com POIs locais no DF (ex.: "Salvador")', async () => {
    // Reproduz o bug confirmado consultando a Search Box API diretamente: para
    // um usuário no DF buscando "Salvador", TANTO a consulta com proximidade
    // real quanto a consulta "sem proximidade" (que a própria Mapbox, sem
    // documentar, faz cair no IP de origem da requisição — que também é o DF
    // para um app usado no DF) devolvem só POIs locais com esse nome
    // (cabeleireiro, condomínio etc.), nunca a cidade. Sem uma terceira
    // consulta restrita a tipos "lugar" (place/district/locality/region/
    // country), a cidade nunca aparece na lista de sugestões.
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('types=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            suggestions: [
              {
                mapbox_id: 'place.salvador',
                full_address: 'Salvador, Bahia, Brasil',
                name: 'Salvador',
                feature_type: 'place',
                context: { region: { name: 'Bahia', region_code: 'BA' } },
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          suggestions: [
            { mapbox_id: 'poi.1', full_address: 'Ed. Green Park, Brasília, Brasil', name: 'Salvador Cabeleireiro' },
            { mapbox_id: 'poi.2', full_address: 'Qc 05, Brasília, Brasil', name: 'Salvador Castro' },
          ],
        }),
      });
    });

    const results = await searchPlaces('Salvador', 'session-1', { lng: -47.929, lat: -15.779 });

    expect(results).toContainEqual({
      id: 'place.salvador',
      placeName: 'Salvador, Bahia, Brasil',
    });
  });
});

describe('retrievePlace', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte a feature retornada em Coordinates', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ geometry: { coordinates: [-46.6333, -23.5505] } }],
      }),
    });

    const coordinates = await retrievePlace('suggestion.1', 'session-1');

    expect(coordinates).toEqual({ lng: -46.6333, lat: -23.5505 });
  });

  it('inclui o id da sugestão e o session_token na URL', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ geometry: { coordinates: [0, 0] } }] }),
    });

    await retrievePlace('suggestion.1', 'minha-sessao');

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/retrieve/suggestion.1');
    expect(url).toContain('session_token=minha-sessao');
  });

  it('lança MapboxRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    await expect(retrievePlace('suggestion.1', 'session-1')).rejects.toThrow(MapboxRequestError);
  });

  it('lança MapboxRequestError quando não há features na resposta', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await expect(retrievePlace('suggestion.1', 'session-1')).rejects.toThrow(MapboxRequestError);
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

  it('pede instruções em português', async () => {
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
            legs: [{ steps: [] }],
          },
        ],
      }),
    });

    await getDirections({ lng: -46.6333, lat: -23.5505 }, { lng: -46.63, lat: -23.55 }, 'driving');

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('language=pt');
  });

  it('usa o perfil driving do Mapbox para o modo motorcycling, que não existe na API', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: { coordinates: [[-46.6333, -23.5505], [-46.63, -23.55]] },
            distance: 1200,
            duration: 300,
            legs: [{ steps: [] }],
          },
        ],
      }),
    });

    await getDirections(
      { lng: -46.6333, lat: -23.5505 },
      { lng: -46.63, lat: -23.55 },
      'motorcycling',
    );

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/directions/v5/mapbox/driving/');
  });
});
