import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchDeepOsm, OverpassRequestError } from './overpassClient';

function mockFetchOnceJson(body: unknown) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

function lastFetchBody(): string {
  const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  return decodeURIComponent(String(call[1]?.body ?? ''));
}

describe('searchDeepOsm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não chama a rede para termo com menos de 4 caracteres', async () => {
    const results = await searchDeepOsm('ub', { lat: -15.8, lng: -47.9 });
    expect(results).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('monta a query com o retângulo do DF e o regex dos campos de nome', async () => {
    mockFetchOnceJson({ elements: [] });
    await searchDeepOsm('guará', { lat: -15.8, lng: -47.9 });
    const body = lastFetchBody();
    expect(body).toContain('[out:json][timeout:8];');
    expect(body).toContain('"^(name|name:pt|alt_name|old_name|short_name|official_name|loc_name|brand)$"');
    expect(body).toContain('(-16.1,-48.35,-15.4,-47.3);');
    // "guará" normalizado ("guara") e expandido em classes por vogal
    expect(body).toContain('g[uúùû][aáàâãä]r[aáàâãä]');
  });

  it('escapa aspas do termo para a string ~"..." não fechar antes da hora', async () => {
    mockFetchOnceJson({ elements: [] });
    await searchDeepOsm('pa"x guara', { lat: -15.8, lng: -47.9 });
    const body = lastFetchBody();
    // A aspas do termo vira \" dentro de ~"...",i — a string segue delimitada
    // e o retângulo do DF continua logo depois do fechamento.
    expect(body).toContain('\\"');
    expect(body).toContain('",i](-16.1,-48.35,-15.4,-47.3);');
  });

  it('converte elementos em PlaceSuggestion, ordenados por distância do centro informado', async () => {
    mockFetchOnceJson({
      elements: [
        { type: 'node', id: 1, lat: -15.86, lon: -47.96, tags: { name: 'Longe' } },
        { type: 'node', id: 2, lat: -15.81, lon: -47.91, tags: { name: 'Perto' } },
      ],
    });
    const results = await searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 });
    expect(results.map((r) => r.placeName)).toEqual(['Perto', 'Longe']);
    expect(results[1]).toEqual({
      id: 'osm:node:1',
      placeName: 'Longe',
      coordinates: { lat: -15.86, lng: -47.96 },
    });
  });

  it('usa o center para elementos way/relation e descarta os sem coordenada', async () => {
    mockFetchOnceJson({
      elements: [
        { type: 'way', id: 10, center: { lat: -15.8, lon: -47.9 }, tags: { name: 'Via' } },
        { type: 'relation', id: 11, tags: { name: 'Sem ponto' } },
      ],
    });
    const results = await searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 });
    expect(results).toEqual([
      { id: 'osm:way:10', placeName: 'Via', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);
  });

  it('descarta elementos sem nenhum campo de nome e usa official_name/brand quando não há name', async () => {
    mockFetchOnceJson({
      elements: [
        { type: 'node', id: 1, lat: -15.8, lon: -47.9, tags: { amenity: 'cafe' } },
        { type: 'node', id: 2, lat: -15.8, lon: -47.9, tags: { brand: 'Marca X' } },
      ],
    });
    const results = await searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 });
    expect(results).toEqual([
      { id: 'osm:node:2', placeName: 'Marca X', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);
  });

  it('inclui rua, número e bairro no rótulo quando os addr:* existem', async () => {
    mockFetchOnceJson({
      elements: [
        {
          type: 'node',
          id: 1,
          lat: -15.8,
          lon: -47.9,
          tags: {
            name: 'Padaria X',
            'addr:street': 'QE 23',
            'addr:housenumber': '10',
            'addr:suburb': 'Guará II',
          },
        },
      ],
    });
    const results = await searchDeepOsm('padaria x', { lat: -15.8, lng: -47.9 });
    expect(results[0].placeName).toBe('Padaria X, QE 23, 10 - Guará II, Brasília - DF');
  });

  it('cai para só o nome quando não há addr:*', async () => {
    mockFetchOnceJson({
      elements: [{ type: 'node', id: 1, lat: -15.8, lon: -47.9, tags: { name: 'Só o Nome' } }],
    });
    const results = await searchDeepOsm('so o nome', { lat: -15.8, lng: -47.9 });
    expect(results[0].placeName).toBe('Só o Nome');
  });

  it('limita a 6 resultados', async () => {
    mockFetchOnceJson({
      elements: Array.from({ length: 12 }, (_, i) => ({
        type: 'node' as const,
        id: i,
        lat: -15.8 - i * 0.001,
        lon: -47.9,
        tags: { name: `N${i}` },
      })),
    });
    const results = await searchDeepOsm('nnnn', { lat: -15.8, lng: -47.9 });
    expect(results).toHaveLength(6);
  });

  it('usa DF_CENTER como âncora de distância quando proximity é null', async () => {
    mockFetchOnceJson({ elements: [] });
    await searchDeepOsm('lugar', null);
    expect(fetch).toHaveBeenCalledTimes(1); // sem erro; só confirma que rodou
  });

  it('lança OverpassRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 429 });
    await expect(searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 })).rejects.toBeInstanceOf(
      OverpassRequestError,
    );
  });

  it('devolve [] sem chamar a rede se o signal já estava abortado', async () => {
    const controller = new AbortController();
    controller.abort();
    const results = await searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 }, controller.signal);
    expect(results).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('devolve [] (não lança) quando o signal externo aborta durante a chamada', async () => {
    const controller = new AbortController();
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const promise = searchDeepOsm('lugar', { lat: -15.8, lng: -47.9 }, controller.signal);
    controller.abort();
    await expect(promise).resolves.toEqual([]);
  });
});
