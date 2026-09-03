# RouteWise

**App web de navegação GPS interativa, no estilo Waze / Google Maps.** Detecta sua
localização, busca um destino, traça a rota no mapa e guia você ao vivo —
passo a passo, com instruções por voz — até chegar lá.

🔗 **Demo ao vivo:** <https://route-wise-eight.vercel.app>

![RouteWise](public/og-card.png)

---

## Índice

- [Objetivo do projeto](#objetivo-do-projeto)
- [Funcionalidades](#funcionalidades)
- [Identidade visual e compartilhamento](#identidade-visual-e-compartilhamento)
- [Stack e ferramentas](#stack-e-ferramentas)
- [Arquitetura](#arquitetura)
- [Como o projeto foi construído (processo e governança)](#como-o-projeto-foi-construído-processo-e-governança)
- [Segurança](#segurança)
- [Qualidade e CI](#qualidade-e-ci)
- [Configuração local](#configuração-local)
- [Como usar o app](#como-usar-o-app)
- [Scripts disponíveis](#scripts-disponíveis)
- [Deploy](#deploy)
- [Habilidades exercitadas](#habilidades-exercitadas)
- [Roadmap](#roadmap)
- [Licença](#licença)

---

## Objetivo do projeto

Este app foi criado com dois objetivos:

1. **Ampliar meus conhecimentos** em desenvolvimento web moderno — React + TypeScript
   em modo estrito, integração com APIs de mapas e geocodificação, testes
   automatizados, PWA, segurança de front-end e um fluxo de trabalho disciplinado
   (especificação → plano → implementação → revisão).
2. **Construir um GPS de verdade**, com funcionalidades parecidas com as dos
   aplicativos mais conhecidos (Waze, Google Maps): busca de endereços e
   estabelecimentos, cálculo de rota com tempo estimado, navegação em tela cheia
   com câmera em modo condução, instruções por voz e recálculo automático quando
   o usuário sai do trajeto.

Não é um clone visual de nenhum app específico — é uma reconstrução do **fluxo de
navegação** a partir do zero, para entender como cada peça funciona por dentro.

---

## Funcionalidades

**Planejamento da rota**

- Detecção automática da localização atual como ponto de partida (com _fallback_
  para baixa precisão e mensagens de erro específicas por causa: permissão
  negada, posição indisponível, tempo esgotado).
- Busca de destino com **autocomplete** (sugestões enquanto digita), viés de
  proximidade pela localização atual e resultados em português do Brasil.
- Busca inteligente por **estabelecimento**: quando o termo é uma categoria
  ("farmácia", "banco", "padaria"…), o app consulta em paralelo por categoria
  **e** por texto, para achar tanto a marca específica digitada quanto qualquer
  estabelecimento próximo daquele tipo. Quando nenhum resultado desse passe rápido contém o que foi digitado, uma **busca de reforço** consulta em segundo plano o OpenStreetMap cru (Overpass) e o Photon, cobrindo o DF inteiro, e a lista de sugestões se completa um instante depois.
- **Locais salvos** (Casa, Trabalho, etc.), persistidos no navegador, como
  atalhos de destino.
- **Pontos de interesse no mapa**: com zoom aproximado, o mapa exibe marcadores
  dos estabelecimentos próximos; tocar em um deles vira destino.
- Cálculo de rota com **distância e tempo estimado (ETA)** e seletor de modo de
  transporte — carro, a pé ou bicicleta.

**Navegação ao vivo**

- Tela cheia com **câmera em modo condução**: o mapa segue e gira conforme a
  direção (heading) do usuário.
- **Banner de manobra** com seta (ícone por tipo de curva/retorno) e distância
  até a próxima ação.
- **Barra de status** com ETA, distância restante e velocidade atual.
- **Instruções por voz** (Web Speech API), com controle para ligar/desligar.
- **Recálculo automático da rota** ao desviar do trajeto: tenta de novo em
  intervalo (com espera crescente entre falhas) até você reencontrar a rota;
  após várias falhas seguidas, para e mostra um botão de "tentar de novo".
- **Trava de tela** (Screen Wake Lock API) durante a navegação, para o celular
  não bloquear e cortar o GPS — re-solicitada ao voltar do segundo plano.
- **Retomada após descarte da aba**: se o sistema fechar a aba durante a
  navegação (ex.: ligação longa), ela é restaurada de um snapshot em
  `sessionStorage` ao reabrir, em vez de voltar à tela inicial.
- **Tela de chegada** ao alcançar o destino.
- Estilos de mapa dedicados para navegação **diurna e noturna**, seguindo o tema.

**Interface**

- **Modo claro / escuro** persistido, sincronizado com a preferência do sistema.
- Layout responsivo (Tailwind CSS), pensado primeiro para celular.
- **Instalável como PWA** e abre em tela cheia quando adicionado à tela inicial.

---

## Identidade visual e compartilhamento

O app tem uma marca própria — uma seta de navegação _duotone_ dentro de um selo
azul — usada como favicon, ícone de PWA e no cartão de compartilhamento.

**Ao compartilhar o link** (WhatsApp, Telegram, redes sociais), em vez de uma URL
"pelada" aparece um **cartão 1200×630** com o mapa, a rota, o logo e a frase
_"Planeje a rota. Chegue mais rápido."_ — e o cartão inteiro é clicável. Isso é
feito com _meta tags_ **Open Graph** e **Twitter Card** no [`index.html`](index.html).

**Ao abrir no celular**, o usuário pode escolher _"Adicionar à tela inicial"_ e
passa a ter um **ícone de app** de verdade, que abre em tela cheia, sem a barra
do navegador (Web App Manifest + Service Worker via `vite-plugin-pwa`).

Os assets são **gerados de forma reprodutível** a partir de dois SVGs-fonte:

| Fonte                                                  | Gera                                                                                    | Como                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`assets/brand/logo.svg`](assets/brand/logo.svg)       | `favicon.ico`, `favicon`/`logo.svg`, `apple-touch-icon`, `pwa-192/512`, `maskable-icon` | `npm run generate:pwa-assets` (`@vite-pwa/assets-generator`)                  |
| [`assets/brand/og-card.svg`](assets/brand/og-card.svg) | `public/og-card.png`                                                                    | `npm run generate:og` (`@resvg/resvg-js`, sem depender de fontes do servidor) |

O Service Worker faz _precache_ **apenas do "esqueleto" do app** (JS, CSS, HTML,
ícones, fontes). Tiles do Mapbox e respostas da Geoapify **nunca** são cacheados —
precisam vir sempre da rede.

---

## Stack e ferramentas

**Aplicação**

- [Vite](https://vitejs.dev/) 5 — bundler e dev server
- [React](https://react.dev/) 18 + [TypeScript](https://www.typescriptlang.org/) em modo `strict` (com `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`)
- [Tailwind CSS](https://tailwindcss.com/) 3 — estilização, com _design tokens_ próprios e estratégia de modo escuro por classe
- [lucide-react](https://lucide.dev/) — ícones
- [@fontsource-variable/inter](https://fontsource.org/fonts/inter) — fonte Inter auto-hospedada (sem chamada a CDN de terceiros)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) + [@vite-pwa/assets-generator](https://vite-pwa-org.netlify.app/assets-generator/) — manifest, service worker e ícones
- [@resvg/resvg-js](https://github.com/yisibl/resvg-js) — renderização do cartão Open Graph em PNG

**APIs externas**

- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) — renderização do mapa
- [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/) — cálculo de rota, ETA e manobras passo a passo
- [Geoapify Geocoding Autocomplete](https://apidocs.geoapify.com/docs/geocoding/) — busca de endereço com autocomplete
- [Geoapify Places API](https://apidocs.geoapify.com/docs/places/) — busca por categoria de estabelecimento e pontos de interesse próximos
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) — busca de reforço no OpenStreetMap cru (segundo passe), para lugar pequeno/periférico e nome desatualizado; gratuita, sem chave
- [Photon](https://photon.komoot.io/) — geocoder gratuito e sem chave, tolerante a erro de digitação, também no segundo passe da busca
- _(O Geocoding do Mapbox foi testado e descartado: limitado demais para achar endereços específicos e nomes de negócios no Brasil.)_

**Fontes de dados embutidas (sem rede em runtime)**

- [CNES / DATASUS](https://cnes.datasus.gov.br/) — cadastro de domínio
  público de onde é destilado `src/data/dfHealthUnits.generated.ts`, a
  lista local de unidades públicas de saúde do DF (UBS, postos,
  hospitais regionais, UPAs, CAPS) que o OpenStreetMap/Mapbox não
  cobrem. A busca de destino consulta essa lista em memória e mostra os
  acertos no topo. Regeração **manual e opcional**: `npm run
generate:unidades-saude` (o arquivo já vem versionado; o app não baixa
  nada em runtime nem no build). Correções pontuais de nome/coordenada
  ficam em `scripts/data/unidades-saude.overrides.json`.

**APIs do navegador**

- Geolocation API (`watchPosition`) — posição, velocidade e heading
- Web Speech API (`SpeechSynthesis`) — instruções por voz
- Screen Wake Lock API (`navigator.wakeLock`) — mantém a tela ligada na navegação
- Page Visibility API (`visibilitychange`) — re-solicita a trava de tela e
  retoma o recálculo ao voltar do segundo plano
- `localStorage` — locais salvos e preferência de tema
- `sessionStorage` — snapshot da navegação para retomar após descarte da aba
- Service Worker + Web App Manifest — PWA instalável
- `matchMedia` — preferência de tema do sistema

**Qualidade e infra**

- [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/) + jsdom — testes
- [ESLint](https://eslint.org/) 9 (flat config) + [typescript-eslint](https://typescript-eslint.io/) + `eslint-plugin-react-hooks`
- [Prettier](https://prettier.io/) — formatação, exigida no CI
- [GitHub Actions](https://github.com/features/actions) — pipeline de CI
- [Vercel](https://vercel.com/) — hospedagem

---

## Arquitetura

SPA **100% client-side, sem backend**. O estado da navegação é uma **máquina de
estados** (`idle → routePlanned → navigating → arrived`) implementada com
`useReducer`. O código é organizado **por feature**, com hooks isolados e
clientes HTTP tipados.

```
assets/brand/        # SVGs-fonte da identidade visual (logo, cartão OG)
scripts/
  generate-og.mjs    # SVG do cartão OG -> public/og-card.png
public/              # Ícones de PWA, favicon e cartão OG (gerados, versionados)
pwa-assets.config.js # Config do gerador de ícones

src/
  components/        # Componentes de UI
    ArrivalScreen.tsx        DestinationCard.tsx      ErrorBanner.tsx
    ExitedScreen.tsx         ManeuverBanner.tsx       MapView.tsx
    NavigationStatusBar.tsx  NavigationView.tsx       PlanningView.tsx
    SavedPlacesShortcuts.tsx SearchBar.tsx            TravelModeToggle.tsx
  features/          # Lógica de domínio, por feature
    geolocation/   useGeolocation.ts            # posição, velocidade, heading
    layout/        useElementHeight.ts          # medição de altura para o mapa
    map/           useMapboxMap.ts              # ciclo de vida do mapa Mapbox
    places/        useSavedPlaces.ts            # locais salvos (localStorage)
                   useNearbyPlacesMarkers.ts    # POIs no mapa (com debounce e backoff)
    routing/       navigationReducer.ts         # máquina de estados
                   useRoute.ts                  # cálculo e recálculo de rota
                   useRouteRecalcOnDeviation.ts # recálculo repetido enquanto fora da rota
                   navigationPersistence.ts     # snapshot em sessionStorage p/ retomar
    search/        useGeocodingSearch.ts        # autocomplete + busca por categoria
    theme/         useTheme.ts                  # modo claro/escuro persistido
    voice/         useVoiceGuidance.ts          # instruções por voz
    wakelock/      useWakeLock.ts               # mantém a tela ligada na navegação
  services/         # Clientes HTTP tipados
    mapboxClient.ts     # mapa + Directions API
    geoapifyClient.ts   # endereços, categorias e lugares próximos
  data/
    placeCategories.ts # dicionário de categorias de estabelecimento -> Geoapify
  types/index.ts    # tipos compartilhados
  utils/            # funções puras (distância haversine, formatação, ícones de
                    # manobra, avatar de veículo, normalização de texto)
  App.tsx           # raiz: escolhe PlanningView ou NavigationView pelo estado
  main.tsx          # ponto de entrada + registro do service worker
```

**Princípios seguidos**

- Cada hook tem **uma responsabilidade** e uma interface clara; dá para entender
  o que faz sem ler o interior.
- Componentes de UI são "burros": recebem dados e callbacks, não falam com APIs.
- Toda chamada de rede passa por um **cliente tipado** em `services/`, com erros
  próprios (`MapboxRequestError`, `GeoapifyRequestError`).
- Funções puras isoladas em `utils/`, cobertas por testes unitários.
- Corridas e vazamentos tratados explicitamente: _debounce_ na busca, guarda
  contra respostas obsoletas, limpeza de _watchers_ de geolocalização, _backoff_
  de 5 min após um `429` da Geoapify.

---

## Como o projeto foi construído (processo e governança)

O desenvolvimento seguiu um fluxo deliberado, registrado no histórico do Git e
na pasta [`docs/superpowers/`](docs/superpowers/):

1. **Especificação de design primeiro.** Antes de escrever código, cada bloco de
   trabalho ganhou um documento de design em
   [`docs/superpowers/specs/`](docs/superpowers/specs/) — objetivo, decisões,
   trade-offs, tratamento de erros. Commitado antes da implementação.
2. **Plano de implementação.** Cada spec virou um plano em
   [`docs/superpowers/plans/`](docs/superpowers/plans/), quebrado em tarefas
   numeradas e verificáveis.
3. **Implementação com testes.** Cada feature entrou junto com seus testes
   (Vitest + Testing Library). Hoje são **180 casos de teste em 31 arquivos**.
4. **Revisão de código com correção das pendências.** Vários commits registram
   achados de revisão sendo resolvidos antes do merge (ex.: _"resolve
   final-review findings on reroute loop"_, _"fix App.tsx origin-race defect
   found in Task 13 review"_).
5. **Integração por branch.** Trabalho feito em _feature branches_ (e _git
   worktrees_ para isolamento), integrado por merge após o CI passar.

**Convenções**

- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `chore:`, `ci:`.
- **Português** nas mensagens de commit e nos textos de UI; termos técnicos em
  inglês quando é o padrão do ecossistema.
- Nada de segredo no repositório — apenas `.env.example` com _placeholders_.

---

## Segurança

**Chaves de API.** Por ser uma SPA sem backend, o token do Mapbox e a chave da
Geoapify **são entregues ao navegador** — é uma limitação inerente desse tipo de
app. Por isso:

- Nunca são commitadas: vêm de variáveis de ambiente (`.env`, que está no
  `.gitignore`); o repositório só tem `.env.example` com valores fictícios.
- A proteção real é **restrição no provedor**:
  - **Mapbox** → painel de _access tokens_ → _URL restrictions_: adicionar o
    domínio de produção (ex.: `https://route-wise-eight.vercel.app`) e
    `http://localhost:5173`.
  - **Geoapify** → painel do projeto → restrição por _domínio / referrer_ da
    mesma forma.
- Ambas usam **plano gratuito com cota diária** e **sem cartão cadastrado** — se
  a cota estourar, a API passa a responder com erro até renovar, sem gerar
  cobrança.

**Headers HTTP** (aplicados pela Vercel via [`vercel.json`](vercel.json)):

| Header                    | Valor                             |
| ------------------------- | --------------------------------- |
| `Content-Security-Policy` | _allowlist_ estrita (abaixo)      |
| `X-Content-Type-Options`  | `nosniff`                         |
| `X-Frame-Options`         | `DENY` (bloqueia _clickjacking_)  |
| `Referrer-Policy`         | `strict-origin-when-cross-origin` |

**Content-Security-Policy** — tudo é `'self'` por padrão; as únicas exceções:

- `connect-src`: `api.mapbox.com`, `events.mapbox.com`, `api.geoapify.com`, `overpass-api.de`, `photon.komoot.io`
- `img-src`: `'self'`, `data:`, `blob:`, `https://*.mapbox.com` (tiles)
- `script-src`: `'self'` apenas — **sem `unsafe-inline`**
- `worker-src` / `child-src`: `'self'` e `blob:` (worker do Mapbox + service worker)

**Dependências.** O CI roda `npm audit --audit-level=high --omit=dev` a cada push
e PR. O `--omit=dev` foca no que **realmente vai para o navegador**; advisories
que só afetam o _toolchain_ de desenvolvimento (Vite/Vitest) são acompanhados à
parte, sem travar o build.

**Privacidade.** Sem contas de usuário, sem servidor, sem coleta de dados. Locais
salvos e preferência de tema ficam **só no `localStorage`** do próprio
navegador. A localização é usada em tempo real e não é armazenada nem enviada a
lugar nenhum além das APIs de rota/geocodificação.

---

## Qualidade e CI

O [pipeline do GitHub Actions](.github/workflows/ci.yml) roda em **todo push e
pull request**, e cada etapa é um portão:

```
npm ci
npm run lint          # ESLint (flat config) + regras de React Hooks
npm run format:check  # Prettier — falha se algo estiver fora do padrão
npx tsc -b            # checagem de tipos (build composto, TS strict)
npm run test          # Vitest — 180 casos
npm run build         # build de produção precisa compilar
npm audit --audit-level=high --omit=dev   # vulnerabilidades no bundle final
```

Configurações que reforçam a qualidade:

- **TypeScript `strict`** + `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`.
- **ESLint 9** flat config com `eslint-plugin-react-hooks` (regras de
  dependências de hooks) e `react-refresh`.
- **Prettier** com config explícita (`singleQuote`, `trailingComma: all`,
  `printWidth: 100`), obrigatório no CI.

---

## Configuração local

### Pré-requisitos

- **Node.js 20+**
- Conta gratuita no [Mapbox](https://account.mapbox.com/) + token público
- Conta gratuita na [Geoapify](https://myprojects.geoapify.com/) + chave de API

### Passo a passo

1. Clone e instale:

   ```bash
   git clone https://github.com/Edilson-5762/RouteWise.git
   cd RouteWise
   npm install
   ```

2. Crie o `.env` a partir do exemplo:

   ```bash
   cp .env.example .env
   ```

   Preencha:

   | Variável                | Obrigatória | Para quê                                                                                               |
   | ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
   | `VITE_MAPBOX_TOKEN`     | Sim         | Renderizar o mapa e calcular rota / ETA (token público em <https://account.mapbox.com/access-tokens/>) |
   | `VITE_GEOAPIFY_API_KEY` | Sim         | Busca de endereço/estabelecimento e lugares próximos (chave em <https://myprojects.geoapify.com/>)     |

   > ⚠️ Não compartilhe o conteúdo do `.env` em prints, mensagens ou commits.
   > Se um token vazar, revogue-o no painel do provedor e gere outro.

3. Rode:

   ```bash
   npm run dev
   ```

4. Abra <http://localhost:5173> e **permita o acesso à localização** quando o
   navegador pedir.

---

## Como usar o app

1. **Abra o app** — ele detecta sua posição e centraliza o mapa em você.
2. **Digite um destino** no campo de busca. Escolha uma sugestão da lista, um
   local salvo (Casa/Trabalho) ou toque num ponto de interesse no mapa.
3. **Confira a rota** — distância e tempo estimado aparecem no cartão; troque o
   modo de transporte (carro / a pé / bicicleta) se quiser.
4. **Salve o destino** (opcional) com um nome, para virar atalho depois.
5. **Inicie a navegação** — a tela vira modo condução: o mapa segue você, o
   banner mostra a próxima manobra e a voz vai avisando. A tela fica ligada
   durante o trajeto. Se você sair da rota, ela é recalculada sozinha, tentando
   de novo até você voltar à rota.
6. **Chegou** — a tela de chegada confirma o fim do trajeto.

Toque no botão de tema para alternar claro/escuro. Para instalar no celular, use
_"Adicionar à tela inicial"_ no menu do navegador.

---

## Scripts disponíveis

| Comando                           | Descrição                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`                     | Servidor de desenvolvimento (<http://localhost:5173>)                                     |
| `npm run build`                   | Build de produção (`tsc -b` + `vite build`)                                               |
| `npm run preview`                 | Serve a build de produção localmente                                                      |
| `npm run test`                    | Roda a suíte de testes (Vitest)                                                           |
| `npm run test:watch`              | Testes em modo _watch_                                                                    |
| `npm run lint`                    | ESLint                                                                                    |
| `npm run format`                  | Formata o código com Prettier                                                             |
| `npm run format:check`            | Verifica a formatação (usado no CI)                                                       |
| `npm run generate:pwa-assets`     | Regera favicon e ícones de PWA a partir de `public/logo.svg`                              |
| `npm run generate:og`             | Regera `public/og-card.png` a partir de `assets/brand/og-card.svg`                        |
| `npm run generate:unidades-saude` | Regera `src/data/dfHealthUnits.generated.ts` a partir do CNES/DATASUS (manual e opcional) |

---

## Deploy

Hospedado na **Vercel** em <https://route-wise-eight.vercel.app>. O build de
produção é `npm run build`; a Vercel serve a pasta `dist/` como estático e aplica
os headers do [`vercel.json`](vercel.json).

**Checklist pós-deploy:**

1. No painel do **Mapbox** e da **Geoapify**, adicionar
   `https://route-wise-eight.vercel.app` às restrições de URL/referrer.
2. Se o domínio de produção mudar, atualizar `og:url`, `og:image` e
   `twitter:image` em [`index.html`](index.html).
3. Colar o link numa conversa do WhatsApp para conferir o cartão de
   compartilhamento.

---

## Habilidades exercitadas

- **React + TypeScript estrito**: hooks customizados, `useReducer` como máquina
  de estados, tipagem de ponta a ponta, tratamento de corridas e cleanup.
- **Integração de mapas e geodados**: Mapbox GL, Directions API, geocodificação
  com autocomplete, busca por categoria, POIs dinâmicos com _debounce_ e
  _backoff_ de _rate limit_.
- **APIs do navegador**: Geolocation, Web Speech, `localStorage`, `matchMedia`.
- **PWA**: Web App Manifest, Service Worker (Workbox via `vite-plugin-pwa`),
  estratégia de cache consciente (só o _shell_).
- **Identidade visual e metadados sociais**: SVG, geração reprodutível de
  assets, Open Graph / Twitter Cards.
- **Segurança de front-end**: CSP como _allowlist_, headers de segurança,
  gestão de segredos, restrição de chaves no provedor, `npm audit` no CI.
- **Engenharia de software**: design-doc primeiro, planos por tarefa, TDD,
  revisão de código, Conventional Commits, CI com portões de lint/format/tipos/
  testes/build/audit, organização por feature.
- **Deploy**: Vercel, variáveis de ambiente, headers via configuração.

---

## Roadmap

- Suporte offline mais amplo (cache de mapas e motor de rotas local)
- Integração com navegação nativa do dispositivo (Apple Maps, Google Maps)
- Histórico de destinos recentes
- Compartilhar rota / ETA com outra pessoa

---

## Licença

MIT — veja [LICENSE](LICENSE).
