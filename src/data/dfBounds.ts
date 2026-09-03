import type { Coordinates } from '../types';

// Retângulo que cobre todo o Distrito Federal (com folga). Os mesmos
// limites de scripts/lib/unidadesSaude.mjs (DF_BOX, limpeza de coordenada
// do CNES) — mantidos idênticos de propósito; mudou lá, confira aqui.
export const DF_BOUNDING_BOX = {
  south: -16.1,
  west: -48.35,
  north: -15.4,
  east: -47.3,
} as const;

// Centro aproximado do DF (Esplanada / Plano Piloto). Âncora de
// proximidade quando a busca acontece sem GPS. Mesmo valor de
// geoapifyClient.DEFAULT_SEARCH_CENTER (não unificado agora para não
// mexer em arquivo fora do escopo desta mudança).
export const DF_CENTER: Coordinates = { lat: -15.7939, lng: -47.8828 };

export function isWithinDf(c: Coordinates): boolean {
  return (
    c.lat >= DF_BOUNDING_BOX.south &&
    c.lat <= DF_BOUNDING_BOX.north &&
    c.lng >= DF_BOUNDING_BOX.west &&
    c.lng <= DF_BOUNDING_BOX.east
  );
}
