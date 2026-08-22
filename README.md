# RouteWise

App web de navegação GPS interativa, no estilo Waze/Google Maps: busque um destino, veja a rota traçada no mapa e seja guiado ao vivo, passo a passo, até chegar lá.

🔗 **Demo ao vivo:** _(adicionar o link da Vercel aqui após o deploy)_

## Funcionalidades

- Detecção automática da localização atual como ponto de partida
- Busca de destino com sugestões (autocomplete)
- Cálculo de rota com distância e tempo estimado
- Navegação ao vivo: a posição é rastreada e as instruções avançam automaticamente conforme você se move
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
  components/    # Componentes de UI (SearchBar, MapView, RouteInstructions...)
  features/      # Lógica de domínio: mapa, geolocalização, busca, rotas
  services/      # Cliente HTTP tipado para as APIs do Mapbox
  utils/         # Funções puras (distância, formatação)
  types/         # Tipos TypeScript compartilhados
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

| Variável             | Obrigatória | Descrição                                              |
| -------------------- | ----------- | -------------------------------------------------------- |
| `VITE_MAPBOX_TOKEN`  | Sim         | Token público de acesso à API do Mapbox                  |

## Scripts Disponíveis

| Comando           | Descrição                                    |
| ------------------ | --------------------------------------------- |
| `npm run dev`       | Inicia o servidor de desenvolvimento          |
| `npm run build`     | Gera a build de produção                      |
| `npm run test`      | Roda a suíte de testes                        |
| `npm run lint`      | Roda o ESLint                                 |
| `npm run format`    | Formata o código com Prettier                 |

## Segurança

- O token do Mapbox nunca é commitado — é lido de uma variável de ambiente e deve ser restrito por domínio no painel do Mapbox:
  1. Acesse o painel de tokens em https://account.mapbox.com/access-tokens/.
  2. Edite o token público usado por esta aplicação (`VITE_MAPBOX_TOKEN`).
  3. Em "URL restrictions", adicione o domínio de produção (ex.: `https://routewise.vercel.app`) e `http://localhost:5173` para desenvolvimento local.
- Headers de segurança (CSP, `X-Content-Type-Options`, `X-Frame-Options`) são aplicados via `vercel.json`.
- O pipeline de CI roda `npm audit` a cada push para checar vulnerabilidades nas dependências. Advisories do toolchain de desenvolvimento (ex.: vite/vitest) são tratados separadamente do que é enviado ao navegador — o CI usa `npm audit --omit=dev`, que reflete apenas as dependências que entram no bundle final.

## Próximos Passos

- Suporte a modos de transporte a pé e bicicleta
- Instruções por voz
- Recálculo automático de rota em caso de desvio
- Suporte offline (cache de mapas e motor de rotas local)

## Licença

Este projeto está sob a licença MIT — veja o arquivo [LICENSE](LICENSE) para detalhes.
