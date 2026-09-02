import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchPhoton, PhotonRequestError } from './photonClient';

function mockFetchOnceJson(body: unknown) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => body });
}

function lastFetchUrl(): string {
  return String((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
}

function feature(
  coordinates: [number, number] | undefined,
  properties: Record<string, unknown>,
) {
  return { geometry: coordinates ? { coordinates } : undefined, properties };
}

describe('searchPhoton', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não chama a rede para termo com menos de 4 caracteres', async () => {
    expect(await searchPhoton('rua', { lat: -15.8, lng: -47.9 })).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('monta a URL com q, bbox do DF e viés lat/lon', async () => {
    mockFetchOnceJson({ features: [] });
    await searchPhoton('padaria bonanza', { lat: -15.8, lng: -47.9 });
    const url = lastFetchUrl();
    expect(url).toContain('q=padaria+bonanza');
    expect(url).toContain('bbox=-48.35%2C-16.1%2C-47.3%2C-15.4');
    expect(url).toContain('lat=-15.8');
    expect(url).toContain('lon=-47.9');
  });

  it('converte a FeatureCollection preservando a ordem do Photon', async () => {
    mockFetchOnceJson({
      features: [
        feature([-47.95, -15.86], { name: 'Primeiro', countrycode: 'BR', osm_type: 'N', osm_id: 1 }),
        feature([-47.91, -15.81], { name: 'Segundo', countrycode: 'BR', osm_type: 'N', osm_id: 2 }),
      ],
    });
    const results = await searchPhoton('lugar', { lat: -15.8, lng: -47.9 });
    expect(results.map((r) => r.placeName)).toEqual(['Primeiro', 'Segundo']);
    expect(results[0]).toEqual({
      id: 'photon:N:1',
      placeName: 'Primeiro',
      coordinates: { lat: -15.86, lng: -47.95 },
    });
  });

  it('descarta feature com countrycode diferente de BR', async () => {
    mockFetchOnceJson({
      features: [
        feature([-47.9, -15.8], { name: 'Fora', countrycode: 'AR' }),
        feature([-47.9, -15.8], { name: 'Dentro', countrycode: 'BR' }),
      ],
    });
    const results = await searchPhoton('lugar', { lat: -15.8, lng: -47.9 });
    expect(results.map((r) => r.placeName)).toEqual(['Dentro']);
  });

  it('descarta feature sem coordenada utilizável', async () => {
    mockFetchOnceJson({
      features: [
        feature(undefined, { name: 'Sem geometria' }),
        feature([-47.9, -15.8], { name: 'Ok' }),
      ],
    });
    const results = await searchPhoton('lugar', { lat: -15.8, lng: -47.9 });
    expect(results.map((r) => r.placeName)).toEqual(['Ok']);
  });

  it('monta o rótulo a partir de name/street/housenumber/district', async () => {
    mockFetchOnceJson({
      features: [
        feature([-47.9, -15.8], {
          name: 'Mercadinho',
          street: 'QNM 34',
          housenumber: '5',
          district: 'Ceilândia',
          countrycode: 'BR',
        }),
      ],
    });
    const results = await searchPhoton('mercadinho', { lat: -15.8, lng: -47.9 });
    expect(results[0].placeName).toBe('Mercadinho, QNM 34, 5 - Ceilândia, Brasília - DF');
  });

  it('quando não há name, usa street como nome e não o repete no rótulo', async () => {
    mockFetchOnceJson({
      features: [
        feature([-47.9, -15.8], { street: 'Rua 4B', district: 'Vicente Pires', countrycode: 'BR' }),
      ],
    });
    const results = await searchPhoton('rua 4b', { lat: -15.8, lng: -47.9 });
    expect(results[0].placeName).toBe('Rua 4B, Vicente Pires, Brasília - DF');
  });

  it('limita a 6 resultados', async () => {
    mockFetchOnceJson({
      features: Array.from({ length: 10 }, (_, i) =>
        feature([-47.9, -15.8 - i * 0.001], { name: `N${i}`, countrycode: 'BR' }),
      ),
    });
    const results = await searchPhoton('nnnn', { lat: -15.8, lng: -47.9 });
    expect(results).toHaveLength(6);
  });

  it('usa DF_CENTER como viés e mantém o bbox do DF quando proximity é null', async () => {
    mockFetchOnceJson({ features: [] });
    await searchPhoton('lugar', null);
    const url = lastFetchUrl();
    expect(url).toContain('lat=-15.7939');
    expect(url).toContain('lon=-47.8828');
    expect(url).toContain('bbox=-48.35%2C-16.1%2C-47.3%2C-15.4');
  });

  it('lança PhotonRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 503 });
    await expect(searchPhoton('lugar', { lat: -15.8, lng: -47.9 })).rejects.toBeInstanceOf(
      PhotonRequestError,
    );
  });

  it('devolve [] sem chamar a rede se o signal já estava abortado', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await searchPhoton('lugar', { lat: -15.8, lng: -47.9 }, controller.signal)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
