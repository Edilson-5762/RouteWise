# RouteWise

App web de navegação GPS interativa, no estilo Waze/Google Maps: busque um destino, veja a rota traçada no mapa e seja guiado ao vivo, passo a passo, até chegar lá.

🔗 **Demo ao vivo:** _(adicionar o link da Vercel aqui após o deploy)_

## Funcionalidades

- Detecção automática da localização atual como ponto de partida
- Busca de destino com sugestões (autocomplete) e locais salvos (Casa/Trabalho/outros)
- Cálculo de rota com distância e tempo estimado, com seletor de modo de transporte (carro/a pé/bicicleta)
- Tela de navegação em tela cheia: câmera em modo condução (segue e gira com a direção do usuário), banner de manobra com seta e distância, velocidade atual
- Instruções por voz (Web Speech API) e recálculo automático de rota ao desviar do trajeto
- Modo escuro, com estilos de mapa dedicados para navegação diurna/noturna
- Interface responsiva construída com Tailwind CSS

## Stack Técnica

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (modo `strict`)
- [Tailwind CSS](https://tailwindcss.com/)
- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/guides/) para mapa, geocoding e cálculo de rotas
- [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) para testes
- Deploy na [Vercel](https://vercel.com/)

## Arquitetura

O projeto é uma SPA 100% client-side, sem backend. O estado da navegação é controlado por uma máquina de estados (`idle → routePlanned → navigating`) implementada com `useReducer`. O código é organizado por feature:

```
src/
  components/    # Componentes de UI
    ArrivalScreen.tsx
    DestinationCard.tsx
    ErrorBanner.tsx
    ManeuverBanner.tsx
    MapView.tsx
    NavigationStatusBar.tsx
    NavigationView.tsx
    PlanningView.tsx
    SavedPlacesShortcuts.tsx
    SearchBar.tsx
    TravelModeToggle.tsx
  features/      # Lógica de domínio, organizada por feature
    geolocation/
      useGeolocation.ts
    map/
      useMapboxMap.ts
    places/      # Locais salvos (Casa, Trabalho, etc.)
      useSavedPlaces.ts
    routing/     # Cálculo de rotas e estado de navegação
      navigationReducer.ts
      useRoute.ts
    search/      # Geocoding e busca de destinos
      useGeocodingSearch.ts
    theme/       # Modo escuro e gerenciamento de tema
      useTheme.ts
    voice/       # Instruções por voz
      useVoiceGuidance.ts
  services/      # Clientes HTTP tipados
    mapboxClient.ts
  types/         # Tipos TypeScript compartilhados
    index.ts
  utils/         # Funções puras
    distance.ts
    format.ts
    maneuverIcon.ts  # Ícones de manobras para instruções passo a passo
  App.tsx        # Componente raiz que renderiza PlanningView ou NavigationView
  main.tsx       # Ponto de entrada do React
  index.css      # Estilos globais
  vite-env.d.ts  # Definições de tipos do Vite
```

## Configuração Local

### Pré-requisitos

- Node.js 20+
- Uma conta gratuita no [Mapbox](https://account.mapbox.com/) e um token de acesso público

### Passo a passo

1. Clone o repositório e instale as dependências:

   ```bash
   git clone https://github.com/Edilson-5762/RouteWise.git
   cd RouteWise
   npm install
   ```

2. Copie o arquivo de exemplo de variáveis de ambiente e insira seu token do Mapbox:

   ```bash
   cp .env.example .env
   ```

   Edite `.env` e substitua o valor de `VITE_MAPBOX_TOKEN` pelo seu token público (encontrado em https://account.mapbox.com/access-tokens/).

3. Rode o projeto localmente:

   ```bash
   npm run dev
   ```

4. Acesse `http://localhost:5173` e permita o acesso à localização quando solicitado.

### Variáveis de Ambiente

| Variável            | Obrigatória | Descrição                               |
| ------------------- | ----------- | --------------------------------------- |
| `VITE_MAPBOX_TOKEN` | Sim         | Token público de acesso à API do Mapbox |

## Scripts Disponíveis

| Comando          | Descrição                            |
| ---------------- | ------------------------------------ |
| `npm run dev`    | Inicia o servidor de desenvolvimento |
| `npm run build`  | Gera a build de produção             |
| `npm run test`   | Roda a suíte de testes               |
| `npm run lint`   | Roda o ESLint                        |
| `npm run format` | Formata o código com Prettier        |

## Segurança

- O token do Mapbox nunca é commitado — é lido de uma variável de ambiente e deve ser restrito por domínio no painel do Mapbox:
  1. Acesse o painel de tokens em https://account.mapbox.com/access-tokens/.
  2. Edite o token público usado por esta aplicação (`VITE_MAPBOX_TOKEN`).
  3. Em "URL restrictions", adicione o domínio de produção (ex.: `https://routewise.vercel.app`) e `http://localhost:5173` para desenvolvimento local.
- Headers de segurança (CSP, `X-Content-Type-Options`, `X-Frame-Options`) são aplicados via `vercel.json`.
- O pipeline de CI roda `npm audit` a cada push para checar vulnerabilidades nas dependências. Advisories do toolchain de desenvolvimento (ex.: vite/vitest) são tratados separadamente do que é enviado ao navegador — o CI usa `npm audit --omit=dev`, que reflete apenas as dependências que entram no bundle final.

## Próximos Passos

- Suporte offline (cache de mapas e motor de rotas local)
- Integração com sistemas de navegação nativa do dispositivo (Apple Maps, Google Maps)

## Licença

Este projeto está sob a licença MIT — veja o arquivo [LICENSE](LICENSE) para detalhes.
