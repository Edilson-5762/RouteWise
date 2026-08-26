import type { Coordinates } from '../types';

// A Search Box API do Mapbox não tem, para a maioria das Regiões
// Administrativas do Distrito Federal, uma entrada do tipo "place"/
// "locality"/"district" — só variações de nomes de POIs (shoppings,
// escolas, salões...) que contêm o nome da região no meio do texto (ex.:
// "Ceilândia Mall", "Águas Claras Shopping"). Confirmado testando a API
// diretamente com `types=place,district,locality,neighborhood,region`: para
// "Plano Piloto", "Águas Claras", "Ceilândia", "Guará" e "Sobradinho" ela
// não retorna nenhum resultado desses tipos. Isso é uma lacuna de dados da
// própria Mapbox para o DF, não um problema na nossa consulta — por isso
// mantemos aqui um gazetteer local só com as RAs mais buscadas, injetado
// como sugestão de alta prioridade antes dos resultados da API (ver
// `findLocalAdministrativeRegionMatches` em `services/mapboxClient.ts`).
// Coordenadas são o centro aproximado de cada região (não um endereço
// exato), suficiente para centralizar o mapa e calcular uma rota até lá.
export interface AdministrativeRegion {
  name: string;
  coordinates: Coordinates;
}

export const DF_ADMINISTRATIVE_REGIONS: AdministrativeRegion[] = [
  { name: 'Plano Piloto', coordinates: { lat: -15.7939, lng: -47.8828 } },
  { name: 'Brazlândia', coordinates: { lat: -15.6815, lng: -48.1972 } },
  { name: 'Taguatinga', coordinates: { lat: -15.8318, lng: -48.0575 } },
  { name: 'Ceilândia', coordinates: { lat: -15.8153, lng: -48.1093 } },
  { name: 'Águas Claras', coordinates: { lat: -15.8378, lng: -48.0264 } },
  { name: 'Guará', coordinates: { lat: -15.8267, lng: -47.9767 } },
  { name: 'Sobradinho', coordinates: { lat: -15.6529, lng: -47.7911 } },
  { name: 'Planaltina', coordinates: { lat: -15.4528, lng: -47.6547 } },
  { name: 'Gama', coordinates: { lat: -16.0181, lng: -48.0603 } },
  { name: 'Santa Maria', coordinates: { lat: -16.0181, lng: -48.0339 } },
  { name: 'Recanto das Emas', coordinates: { lat: -15.9078, lng: -48.0664 } },
  { name: 'Riacho Fundo', coordinates: { lat: -15.8794, lng: -47.9264 } },
  { name: 'Riacho Fundo II', coordinates: { lat: -15.9139, lng: -48.0067 } },
  { name: 'Samambaia', coordinates: { lat: -15.8756, lng: -48.0917 } },
  { name: 'São Sebastião', coordinates: { lat: -15.9047, lng: -47.7783 } },
  { name: 'Paranoá', coordinates: { lat: -15.7761, lng: -47.7719 } },
  { name: 'Núcleo Bandeirante', coordinates: { lat: -15.8664, lng: -47.9683 } },
  { name: 'Candangolândia', coordinates: { lat: -15.8206, lng: -47.9528 } },
  { name: 'Cruzeiro', coordinates: { lat: -15.7936, lng: -47.9433 } },
  { name: 'Lago Sul', coordinates: { lat: -15.8244, lng: -47.8497 } },
  { name: 'Lago Norte', coordinates: { lat: -15.7331, lng: -47.8489 } },
  { name: 'Jardim Botânico', coordinates: { lat: -15.8664, lng: -47.7847 } },
  { name: 'Itapoã', coordinates: { lat: -15.7433, lng: -47.7383 } },
  { name: 'Vicente Pires', coordinates: { lat: -15.8078, lng: -48.0289 } },
];
