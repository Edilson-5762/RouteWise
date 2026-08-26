# Marcadores de estabelecimentos próximos no mapa

**Data:** 2026-08-26
**Status:** Aprovado para planejamento

## Contexto e motivação

O mapa de fundo do RouteWise usa os estilos oficiais de navegação do
Mapbox (`navigation-day-v1` / `navigation-night-v1`), que já desenham
nomes de rua e de alguns estabelecimentos automaticamente ao aproximar
o zoom. Investigação anterior (via Tilequery API do Mapbox) confirmou
que essa camada de POIs embutida no estilo tem cobertura muito
incompleta de comércio local no DF — redes grandes aparecem, mas lojas,
farmácias e mercados de bairro frequentemente não estão cadastrados
nela. Esse é um limite dos dados do próprio Mapbox, não algo ajustável
por configuração de estilo.

A Geoapify (já usada para a busca por texto e por categoria no app) tem
cobertura melhor desses estabelecimentos na região. Este documento
especifica uma camada de marcadores desenhados pelo próprio app,
buscados dinamicamente na Geoapify conforme o mapa se move, para
preencher essa lacuna — à la Waze/Google Maps.

## Requisitos (decididos com o usuário)

- **Categorias:** amplas — qualquer comércio ou serviço (farmácia,
  mercado, loja, banco, restaurante etc.), não uma lista curada restrita.
- **Zoom mínimo:** só aparecem bem de perto (zoom ≥ 16, nível de
  quarteirão) — evita poluir visões afastadas do mapa.
- **Toque no marcador:** seleciona aquele estabelecimento como novo
  destino (mesmo efeito de escolher um resultado da busca).
- **Telas em que aparece:** sempre — planejamento (antes de escolher
  destino), com rota já traçada, e durante a navegação.
- **Estratégia de busca:** automática (sem botão "buscar nesta área"),
  com controle de frequência para não estourar limite de requisições da
  Geoapify.

## Arquitetura

Novo hook isolado, **não** misturado em `useMapboxMap.ts` (que já reúne
várias responsabilidades — câmera, puck, rota, marcador de destino — e
não deveria crescer mais):

- **`src/features/places/useNearbyPlacesMarkers.ts`** (novo)
  Assinatura: `useNearbyPlacesMarkers({ map, enabled, onSelect })`
  - `map`: a instância `mapboxgl.Map | null` (o mesmo `mapRef.current`
    que `useMapboxMap` já expõe).
  - `enabled`: liga/desliga a camada inteira (permite desativar sem
    desmontar o hook, útil para os testes e para uma eventual tela sem
    mapa).
  - `onSelect`: `(suggestion: GeocodingSuggestion) => void`, chamado ao
    tocar um marcador.
  - Responsabilidades: escutar `moveend`/`zoomend` do mapa, decidir
    quando buscar (regras abaixo), chamar `searchNearbyPlaces`, e
    criar/atualizar/remover os marcadores DOM (`mapboxgl.Marker`) no
    mapa. Nenhum estado React além do necessário para invalidar a
    busca (ex.: refs para o último centro buscado e para os marcadores
    ativos).

- **`src/services/geoapifyClient.ts`** ganha `searchNearbyPlaces(center,
  radiusMeters)`: um único request à Places API da Geoapify com
  `categories=commercial,service,catering,healthcare`,
  `filter=circle:{center},{radiusMeters}`, `limit=100`, `lang=pt`.
  Reaproveita `toSuggestions()` (já existente) para o mapeamento da
  resposta.

- **`src/components/MapView.tsx`** passa a chamar os dois hooks
  (`useMapboxMap` e `useNearbyPlacesMarkers`), conectando o `mapRef` de
  um ao outro. Recebe um novo prop `onDestinationSelected` (o mesmo
  callback que `PlanningView`/`App.tsx` já usam para a busca por
  texto) e repassa como `onSelect`.

- **`App.tsx`**: passa `handleDestinationSelected` (já existente,
  inalterado) para `MapView` como esse novo prop. **Nenhuma mudança**
  no `navigationReducer` — tocar um marcador dispara exatamente o
  mesmo `SET_DESTINATION` que a busca já dispara, incluindo o efeito
  colateral já existente de sair da navegação (`status` volta para
  `'idle'`) quando um novo destino é escolhido em qualquer contexto.

## Fluxo de dados (quando e como buscar)

1. O hook escuta `moveend` no mapa recebido.
2. A cada `moveend`, só considera buscar se **as duas** condições
   valerem:
   - Zoom atual ≥ 16.
   - O centro atual está a mais de **400m** do centro da última busca
     concluída (ou nenhuma busca foi feita ainda desde que a camada
     ficou habilitada nesse nível de zoom).
3. Se as condições valerem, aplica um **debounce de 400ms**: só
   dispara a busca se não houver outro `moveend` nesse intervalo (evita
   buscar no meio de um arrasto/zoom contínuo).
4. A busca usa um **raio de 900m** a partir do centro atual — maior que
   o limiar de 400m que dispara nova busca, criando uma margem: pans
   pequenos dentro da área já coberta não geram nova chamada.
5. Se o zoom cair abaixo de 16 (usuário afasta o mapa), os marcadores
   existentes são removidos e a busca para até o zoom voltar a subir.
6. Resultado da busca substitui os marcadores anteriores (remove os que
   saíram, atualiza os que continuam, adiciona os novos) — sem
   acumular marcadores infinitamente.
7. Como o mapa é uma instância única que persiste entre as telas de
   planejamento e navegação (arquitetura já existente do app), a
   camada de marcadores continua ativa nas trocas de tela sem
   recriação.

### Resiliência a erros

- Falha de rede ou erro genérico da Geoapify: falha silenciosa (sem
  banner de erro para o usuário — esta é uma camada de
  enriquecimento visual, não um caminho crítico). Loga no console em
  desenvolvimento. A próxima busca válida (por movimento do mapa)
  tenta de novo naturalmente.
- HTTP 429 (limite de requisições excedido): o hook entra em um modo
  de espera de alguns minutos antes de permitir nova tentativa, em vez
  de continuar tentando a cada `moveend` e agravar o bloqueio.

## Visual e interação

- Cada estabelecimento é um marcador DOM discreto: um pontinho colorido
  (cor distinta tanto do pino vermelho do destino quanto do
  puck/avatar do usuário) com o nome do estabelecimento escrito ao
  lado — no mesmo espírito visual dos rótulos que o próprio Mapbox já
  desenha, sem competir com os elementos principais do mapa.
- Toque no marcador chama `onSelect` com
  `{ id, placeName, coordinates }` — mesmo formato que
  `GeocodingSuggestion`, permitindo reuso direto do fluxo de seleção de
  destino já existente.

## Testes

- `useNearbyPlacesMarkers`: testes unitários (Vitest, com temporizadores
  falsos) cobrindo: não busca abaixo do zoom mínimo; debounce de
  `moveend`; exige deslocamento mínimo de 400m antes de nova busca;
  remove marcadores ao cair abaixo do zoom mínimo; chama `onSelect`
  corretamente ao "clicar" num marcador (via mock de
  `mapboxgl.Marker`, no mesmo padrão já usado em
  `useMapboxMap.test.ts`); entra em espera após um 429 simulado.
- `geoapifyClient.searchNearbyPlaces`: teste unitário verificando a URL
  montada (categorias, raio, limite) e o mapeamento da resposta.
- Sem testes end-to-end (o projeto não tem essa infraestrutura hoje).

## Fora de escopo (explicitamente)

- Deduplicar contra os POIs que o próprio estilo do Mapbox já desenha
  nativamente (exigiria consultar a Tilequery API a cada movimento,
  consumindo outra cota separada, por um ganho visual pequeno).
- Ícones diferentes por categoria de estabelecimento — todos os
  marcadores desta camada usam o mesmo estilo visual (ponto + nome).
- Um botão manual de "buscar nesta área" (abordagem B, descartada em
  favor da busca automática).
