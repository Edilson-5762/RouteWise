# Painel de manobra estilo Waze (turn-by-turn)

**Data:** 2026-09-02
**Status:** Aprovado para planejamento

## Contexto e motivação

Durante a navegação, o app mostra hoje um painel simples no topo
([`src/components/ManeuverBanner.tsx`](../../../src/components/ManeuverBanner.tsx)):
uma seta genérica (ícone da biblioteca `lucide-react`, escolhido em
[`src/utils/maneuverIcon.ts`](../../../src/utils/maneuverIcon.ts)), a
frase da manobra (`maneuver.instruction`, uma linha) e a distância que
falta.

O usuário pediu um painel **o mais parecido possível com o do Waze**:
o painel escuro no topo com o desenho da manobra (em especial a
**rotatória**, mostrando a saída certa), o nome da via em duas linhas,
as setas de faixa na aproximação, o preview "e depois…" quando há duas
manobras coladas, e a "pílula" com o nome da via atual perto do carro.

O ponto-chave: **todo esse material já vem da API de rotas do Mapbox**
que o app usa ([`src/services/mapboxClient.ts`](../../../src/services/mapboxClient.ts))
— hoje a chamada pede uma versão enxuta. Basta ligar `banner_instructions`
e ler campos que já chegam e são ignorados. Sem API nova, sem chave
nova, sem custo a mais.

Decisões tomadas com o usuário (brainstorming 2026-09-02):

- **Conjunto completo de ícones de manobra** (não só a rotatória) —
  aproveitando o **conjunto oficial do Mapbox** (SVG, licença MIT),
  não um desenho próprio do zero.
- **A rotatória é desenhada pelo app** (componente SVG próprio), porque
  precisa girar a seta da saída pro ângulo real e mostrar o número da
  saída — coisa que ícone pronto não faz.
- **Setas de faixa só na aproximação** (≤ ~450 m da manobra).
- **Preview "e depois" só quando as manobras estão coladas** (a
  seguinte vem ≤ ~400 m depois).
- **Layout copiando o Waze:** painel de cima escuro sempre (não segue
  o tema do mapa); nome da via atual numa pílula branca centralizada
  logo acima da barra de baixo.
- **Velocímetro dedicado** (círculo de velocidade no canto inferior
  esquerdo, estilo Waze) entra nesta leva; a velocidade sai do texto da
  barra de baixo para não ficar repetida.
- **Voz melhorada fica para um segundo passo** logo em seguida (spec
  própria) — aqui a voz não muda.
- **Organização do código:** um "cérebro" separado — função pura
  `selectGuidance(...)` que devolve um objeto de view-model já
  mastigado; os componentes só desenham o que o objeto diz.

## Requisitos (decididos com o usuário)

- **A chamada de rota ganha `banner_instructions=true`.** Mesma
  requisição, mesmo custo; passa a trazer `bannerInstructions` por
  passo.
- **`RouteStep` ganha campos novos, sem alterar os existentes:**
  `roadName` (nome da via do trecho), `roundaboutExit` (nº da saída em
  rotatória) e `banners` (lista de instruções de banner: texto em duas
  linhas + ângulo da rotatória + faixas).
- **`selectGuidance(route, currentStepIndex, distanceToManeuverMeters)`**
  — função pura, sem rede e sem estado, rodada a cada atualização de
  GPS (via `useMemo` no `NavigationView`). Devolve um `GuidanceView`
  único com tudo pronto, ou `null` quando não há rota/passos.
- **Regras que moram em `selectGuidance`:**
  1. **Manobra mostrada** = a do próximo passo
     (`min(currentStepIndex + 1, último passo)`), como o app já faz.
  2. **Texto de 2 linhas** = do banner "ativo" daquele passo (o de
     menor distância de gatilho que já valeu para a distância atual).
     Sem `banners` da API → cai na `instruction` de uma linha.
  3. **Nome da via atual** (pílula) = `roadName` do passo que está
     sendo percorrido agora (`steps[currentStepIndex]`). Vazio → a
     pílula some.
  4. **Faixas** = só quando `distanceToManeuverMeters ≤
     LANE_GUIDANCE_DISTANCE_M` (450 m) **e** o banner ativo trouxe
     faixa. Fora disso, `[]`.
  5. **Preview "e depois"** = olha a manobra seguinte à próxima; só
     preenche quando `steps[próximo].distanceMeters ≤
     THEN_PREVIEW_DISTANCE_M` (400 m). Senão, `null`.
- **`LANE_GUIDANCE_DISTANCE_M` e `THEN_PREVIEW_DISTANCE_M`** ficam como
  constantes exportadas no topo de `selectGuidance.ts` — são os botões
  de ajuste depois do teste na rua.
- **Ícones:** o conjunto do Mapbox entra no repo como SVG inline
  (componentes React), cobrindo a tabela `tipo` × `modificador`; seta
  reta como padrão para o que sobrar. Renderizados com `currentColor`
  (brancos no painel escuro).
- **Rotatória:** componente `RoundaboutDiagram` (SVG próprio) — círculo,
  entrada por baixo, seta da saída girada por `roundaboutDegrees`,
  tracinhos fracos para as outras saídas, selo com o número da saída.
  Mão à direita fixa (app só do DF). Sem `degrees` → desenho genérico
  da rotatória, ainda com o número se houver.
- **Painel montado (`ManeuverBanner` refeito):** fundo escuro fixo,
  cantos de baixo arredondados, margem lateral, sombra. Ícone à
  esquerda (ou `RoundaboutDiagram`); à direita a distância grande, a
  `primaryText` em até 2 linhas e a `secondaryText` menor. Na borda de
  baixo: fileira de faixas quando houver; divisor fino + linha
  "Depois: …" quando houver.
- **Componentes novos:** `LaneGuidance`, `ThenPreview`, `CurrentRoadPill`,
  `Speedometer` — todos apresentacionais (recebem props prontas, sem
  lógica de decisão).
- **Velocímetro dedicado (`Speedometer`):** círculo branco no canto
  inferior esquerdo com a velocidade atual em km/h (arredondada) e um
  rótulo pequeno "km/h", no estilo Waze. `speedMetersPerSecond` nulo →
  não renderiza (mesmo comportamento de hoje). A velocidade **sai** do
  texto da `NavigationStatusBar` (deixa de ser repetida) — é a única
  mudança na barra de baixo.
- **`NavigationView`** calcula o `guidance` uma vez, passa ao
  `ManeuverBanner`, e posiciona a `CurrentRoadPill` (acima da
  `NavigationStatusBar`, centralizada) e o `Speedometer` (canto
  inferior esquerdo).

## Restrições — preservar o que já funciona

Nada abaixo pode mudar como efeito colateral deste trabalho:

- **A voz não muda neste trabalho.** `useVoiceGuidance` continua
  consumindo a `instruction` de uma linha. `NavigationView` mantém o
  cálculo atual de `upcomingStepIndex` / `currentStep` /
  `upcomingManeuver` só para alimentar a voz; o `guidance` visual roda
  em paralelo. A voz melhorada (`voice_instructions`, frases e timing
  estilo Waze) é um **segundo passo**, logo depois deste — spec própria.
- **`NavigationStatusBar` muda só num ponto:** perde o texto de
  velocidade (que passa para o `Speedometer`). Tempo restante,
  distância, mudo, sair e sair da página continuam iguais. O teste da
  barra é ajustado para não esperar mais a velocidade.
- **`RouteStep` só ganha campos.** Os consumidores atuais
  (`navigationReducer`, `useVoiceGuidance`, detecção de desvio,
  `DebugPanel`, contagem/soma de passos em `NavigationView`) leem só os
  campos antigos e não mudam.
- **O passe de rota (`getDirections`) continua igual** fora do
  parâmetro novo: mesma base URL, `geometries=geojson`, `steps=true`,
  `overview=full`, `language=pt`; mesma checagem `code !== 'Ok'` /
  `routes.length === 0`; mesma conversão de `geometry` e totais.
- **A guarda de erro do `NavigationView`** (`if (!state.route ||
  !currentStep) → <ErrorBanner>`) permanece.
- Comentários e texto de usuário em pt-BR; TypeScript `strict`, sem
  `any` implícito. Pipeline local (`npm run lint`, `npx tsc -b`,
  `npm run test`) verde ao fim de cada tarefa.
- Todos os testes já existentes continuam passando. Dois são
  **reescritos** porque a interface mudou de propósito:
  `ManeuverBanner.test.tsx` (prop `step` → `guidance`) e as asserções
  de `mapboxClient.test.ts` (URL + campos novos). `maneuverIcon.test.ts`
  **ganha casos** (tabela ampliada), sem alterar os existentes.

## Arquitetura

Quatro blocos: dados, cérebro, ícones/rotatória, e UI montada.

```
src/services/mapboxClient.ts             (alterado)  + banner_instructions, + parse
src/types/index.ts                       (alterado)  + ManeuverLane, BannerInstruction; RouteStep += 3 campos
src/features/navigation/selectGuidance.ts (novo)     GuidanceView + regras
src/components/maneuvers/                 (novo)      SVGs do Mapbox + getManeuverIcon ampliado + RoundaboutDiagram
src/components/ManeuverBanner.tsx         (refeito)   painel escuro; prop = GuidanceView
src/components/LaneGuidance.tsx           (novo)      fileira de setas de faixa
src/components/ThenPreview.tsx            (novo)      linha "Depois: …"
src/components/CurrentRoadPill.tsx        (novo)      pílula da via atual
src/components/Speedometer.tsx            (novo)      círculo de velocidade (canto inf. esquerdo)
src/components/NavigationStatusBar.tsx    (alterado)  remove o texto de velocidade
src/components/NavigationView.tsx         (alterado)  fia o guidance + a pílula + o velocímetro
```

### Bloco 1 — dados (`mapboxClient.ts` + `types/index.ts`)

**URL.** Acrescentar `&banner_instructions=true` à query de
`getDirections`. Nada mais muda na requisição.

**Resposta — o que passa a ser lido.** Cada `step` da resposta ganha
`bannerInstructions: BannerInstructionRaw[]`, e já traz (hoje
ignorados) `step.name` e `step.maneuver.exit`:

```ts
interface BannerTextRaw {
  text: string;
  type?: string;
  modifier?: string;
  degrees?: number;                 // ângulo da saída, em rotatória
  components: Array<{
    type: string;                   // 'text' | 'lane' | 'icon' | ...
    active?: boolean;               // faixas: faz parte do caminho da manobra
    directions?: string[];          // faixas: ex. ['left'], ['straight','right']
  }>;
}
interface BannerInstructionRaw {
  distanceAlongGeometry: number;    // distância antes da manobra em que este banner passa a valer
  primary: BannerTextRaw;
  secondary: BannerTextRaw | null;
  sub: BannerTextRaw | null;        // quando é guia de faixa, components[] são 'lane'
}
```

**Tipos novos** ([`src/types/index.ts`](../../../src/types/index.ts)):

```ts
export interface ManeuverLane {
  active: boolean;
  directions: string[];
}

export interface BannerInstruction {
  // Distância (m) antes da manobra a partir da qual este banner vale.
  // A API entrega vários por passo; guardamos todos, ordenados do maior
  // (aparece primeiro) para o menor (mais perto, geralmente com faixas).
  triggerDistanceMeters: number;
  primaryText: string;
  secondaryText: string | null;
  maneuverType: string;             // primary.type; cai para step.maneuverType
  maneuverModifier: string | null;  // primary.modifier
  roundaboutDegrees: number | null; // primary.degrees
  lanes: ManeuverLane[];            // de sub.components type='lane'; [] se não houver
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuverLocation: Coordinates;
  maneuverType: string;
  maneuverModifier: string | null;
  roadName: string;                 // NOVO — step.name; '' se sem nome
  roundaboutExit: number | null;    // NOVO — step.maneuver.exit
  banners: BannerInstruction[];     // NOVO — ordenado por triggerDistance desc; [] se a API não mandar
}
```

**Conversão** (dentro de `getDirections`, no `.map` de cada step):

- `roadName`: `step.name ?? ''`.
- `roundaboutExit`: `step.maneuver.exit ?? null`.
- `banners`: `(step.bannerInstructions ?? [])` mapeado e **ordenado por
  `triggerDistanceMeters` decrescente**; para cada um:
  - `triggerDistanceMeters` = `distanceAlongGeometry`;
  - `primaryText` = `primary.text`;
  - `secondaryText` = `secondary?.text ?? null`;
  - `maneuverType` = `primary.type ?? step.maneuver.type`;
  - `maneuverModifier` = `primary.modifier ?? null`;
  - `roundaboutDegrees` = `typeof primary.degrees === 'number' ? primary.degrees : null`;
  - `lanes` = `(sub?.components ?? []).filter(c => c.type === 'lane').map(c => ({ active: c.active === true, directions: c.directions ?? [] }))`.
- **Sem `bannerInstructions`** na resposta → `banners: []`. Nenhum erro
  novo: o parâmetro é aditivo e a ausência é tratada a jusante.

### Bloco 2 — cérebro (`src/features/navigation/selectGuidance.ts`)

Função pura + duas constantes exportadas:

```ts
export const LANE_GUIDANCE_DISTANCE_M = 450;
export const THEN_PREVIEW_DISTANCE_M = 400;

export interface ThenView {
  maneuverType: string;
  maneuverModifier: string | null;
  text: string;
}

export interface GuidanceView {
  maneuverType: string;
  maneuverModifier: string | null;
  roundaboutDegrees: number | null;
  roundaboutExit: number | null;
  distanceMeters: number | null;
  primaryText: string;
  secondaryText: string | null;
  lanes: ManeuverLane[];
  then: ThenView | null;
  currentRoadName: string;
}

export function selectGuidance(
  route: Route | null,
  currentStepIndex: number,
  distanceToManeuverMeters: number | null,
): GuidanceView | null;
```

**Fluxo:**

1. `route` nulo ou `route.steps.length === 0` → `return null`.
2. `stepCount = route.steps.length`;
   `upcomingIndex = Math.min(currentStepIndex + 1, stepCount - 1)`;
   `upcoming = route.steps[upcomingIndex]`.
3. **Banner ativo** — `pickActiveBanner(upcoming.banners, distanceToManeuverMeters)`:
   - `banners` vazio → `null`;
   - senão, entre os banners com `triggerDistanceMeters >=
     (distanceToManeuverMeters ?? Infinity)`, escolhe o de **menor**
     `triggerDistanceMeters` (o mais "de perto" que já ativou);
   - nenhum qualifica (ainda longe de todos, ou distância nula) →
     `banners[0]` (o de maior gatilho).
4. Monta os campos:
   - `primaryText` = `activeBanner?.primaryText ?? upcoming.instruction`;
   - `secondaryText` = `activeBanner?.secondaryText ?? null`;
   - `maneuverType` = `activeBanner?.maneuverType ?? upcoming.maneuverType`;
   - `maneuverModifier` = `activeBanner?.maneuverModifier ?? upcoming.maneuverModifier`;
   - `roundaboutDegrees` = `activeBanner?.roundaboutDegrees ?? null`;
   - `roundaboutExit` = `upcoming.roundaboutExit`;
   - `distanceMeters` = `distanceToManeuverMeters ?? upcoming.distanceMeters`.
5. **`lanes`**: se `distanceToManeuverMeters != null &&
   distanceToManeuverMeters <= LANE_GUIDANCE_DISTANCE_M && activeBanner
   && activeBanner.lanes.length > 0` → `activeBanner.lanes`; senão `[]`.
6. **`then`**: `afterIndex = upcomingIndex + 1`. Se `afterIndex <=
   stepCount - 1 && upcoming.distanceMeters <= THEN_PREVIEW_DISTANCE_M`:
   - `after = route.steps[afterIndex]`;
   - `afterBanner = after.banners[0] ?? null`;
   - `then = { maneuverType: afterBanner?.maneuverType ?? after.maneuverType,
     maneuverModifier: afterBanner?.maneuverModifier ?? after.maneuverModifier,
     text: afterBanner?.primaryText ?? after.instruction }`;
   - senão `then = null`.
7. **`currentRoadName`**: `route.steps[currentStepIndex]?.roadName ?? ''`
   (protege índice fora do range).

`NavigationView` chama via
`useMemo(() => selectGuidance(state.route, state.currentStepIndex,
state.distanceToManeuverMeters), [state.route, state.currentStepIndex,
state.distanceToManeuverMeters])`.

### Bloco 3 — ícones e rotatória (`src/components/maneuvers/`)

**Conjunto do Mapbox.** Os SVGs de manobra do Mapbox (licença MIT)
entram no repo como componentes React de SVG inline, um por
`nome canônico`. Um `NOTICE`/`LICENSE` curto na pasta registra a
origem e a licença. Sem dependência de runtime, sem fetch externo
(seguro para a CSP). _A fonte exata é fixada na fase de plano — é o
conjunto do turn-by-turn do Mapbox; se a extração dele for
problemática, o equivalente MIT do ecossistema OSRM cobre a mesma
tabela `tipo`/`modificador`._

**`getManeuverIcon(type, modifier, degrees?)`** — cresce dos 8 casos
atuais para a tabela completa:

| `type` | modificadores cobertos |
|---|---|
| `turn` | left, right, slight left/right, sharp left/right, straight, uturn |
| `merge` | left, right, slight left/right, straight |
| `fork` | left, right, slight left/right |
| `on ramp` / `off ramp` | left, right, slight left/right |
| `end of road` | left, right |
| `continue` / `new name` / `depart` | straight (+ left/right quando vier) |
| `arrive` | left, right, straight (variações de bandeira) |
| `roundabout` / `rotary` / `roundabout turn` | → `RoundaboutDiagram` |
| `exit roundabout` / `exit rotary` | seta reta de saída |
| qualquer outra combinação | **seta reta (fallback)** |

**`RoundaboutDiagram`** — `props: { degrees: number | null;
exitNumber: number | null; size?: number }`.

- `viewBox` quadrado (ex. `0 0 44 44`), centro em `(22, 22)`.
- Círculo (r ≈ 13), traço médio.
- **Entrada:** stub curto a partir do fundo (6 h) até tocar o círculo.
- **Saída escolhida:** grupo `<g data-testid="roundabout-exit"
  transform="rotate(<ângulo> 22 22)">` com uma seta (haste + ponta)
  saindo do círculo para fora. **A confirmar na implementação, contra
  uma resposta real da API:** a convenção exata de `primary.degrees`
  (referência 0° — fundo vs. frente — e sentido horário/anti-horário) e
  o mapeamento para o `rotate()` do SVG. Hipótese de trabalho: `degrees`
  é o ângulo da entrada até a saída no sentido horário, ~180° ≈ seguir
  em frente. O teste do componente fixa a relação
  `degrees → transform` que a implementação adotar.
- **Outras saídas:** 2–3 tracinhos fracos em posições fixas
  decorativas (não sabemos os ângulos reais — manter discreto para não
  informar errado).
- **Selo do número:** circulinho com `exitNumber` no canto superior
  direito; omitido se `exitNumber` for `null`.
- `degrees === null` → sem seta girada; desenha um glifo genérico de
  rotatória (seta circular), mantendo o selo se houver número.
- Cor por `currentColor`.

### Bloco 4 — UI montada

**`ManeuverBanner`** (refeito) — `props: { guidance: GuidanceView | null }`.

- `guidance` nulo → `return null` (defensivo; o `NavigationView` já
  barra o caso de rota quebrada com `ErrorBanner`).
- Container: **fundo escuro fixo** (par de tokens novo
  `--color-maneuver` / `--color-maneuver-foreground`, definido uma vez,
  **sem** variação por tema), `rounded-b-2xl`, margem lateral, sombra.
- Linha principal: `flex` — à esquerda `getManeuverIcon(...)` a ~44 px,
  **ou** `<RoundaboutDiagram degrees={guidance.roundaboutDegrees}
  exitNumber={guidance.roundaboutExit} />` quando o tipo é
  rotatória; à direita, coluna com:
  - distância grande (`formatDistance(guidance.distanceMeters ?? 0)`,
    `text-2xl font-bold`);
  - `primaryText` (`text-lg font-semibold`, até 2 linhas, reticências);
  - `secondaryText` quando houver (`text-sm`, opacidade ~70%, 1 linha).
- `{guidance.lanes.length > 0 && <LaneGuidance lanes={guidance.lanes} />}`
  — sub-faixa na borda de baixo.
- `{guidance.then && (<><divisor/><ThenPreview then={guidance.then} /></>)}`.

**`LaneGuidance`** — `props: { lanes: ManeuverLane[] }`. Fileira; por
faixa, uma seta por entrada de `directions` (reaproveita as setas da
tabela de ícones, mapeadas por direção); `active` → opacidade cheia,
resto → ~30%.

**`ThenPreview`** — `props: { then: ThenView }`. Ícone pequeno (~20 px,
via `getManeuverIcon`) + rótulo `Depois` + `then.text` (reticências).

**`CurrentRoadPill`** — `props: { name: string }`. `name === '' →
return null`. Senão, pílula branca `rounded-full`, `text-sm
font-medium`, `max-w`, `truncate`, sombra.

**`Speedometer`** — `props: { speedMetersPerSecond: number | null }`.
`null` → `return null`. Senão, círculo branco (`rounded-full`, sombra,
~56 px) com a velocidade `Math.round(speedMetersPerSecond * 3.6)` em
número grande e um "km/h" pequeno embaixo. Sem lógica de decisão.

**`NavigationStatusBar`** (alterado): remove o `span` de `{speedKmh}
km/h` e o cálculo `speedKmh`; a prop `speedMetersPerSecond` sai da
interface. Resto intacto.

**`NavigationView`** (alterado):

- adiciona o `useMemo` do `guidance` (deps: `state.route`,
  `state.currentStepIndex`, `state.distanceToManeuverMeters`);
- troca `<ManeuverBanner step={currentStep}
  distanceToManeuverMeters={…} />` por `<ManeuverBanner
  guidance={guidance} />`;
- mantém o cálculo `currentStep` / `upcomingManeuver` **só** para
  `useVoiceGuidance`;
- acima da `<NavigationStatusBar>`, dentro de um wrapper
  `pointer-events-auto` centralizado: `<CurrentRoadPill name={guidance?.currentRoadName ?? ''} />`;
- no canto inferior esquerdo, wrapper `pointer-events-auto` com
  `<Speedometer speedMetersPerSecond={speedMetersPerSecond} />` (a prop
  que hoje ia para a `NavigationStatusBar`);
- deixa de passar `speedMetersPerSecond` para `<NavigationStatusBar>`;
- a guarda `if (!state.route || !currentStep)` continua.

## Resiliência a erros

- **API sem `bannerInstructions`** (resposta antiga em cache, perfil
  sem suporte, campo ausente): `banners: []` → `selectGuidance` usa a
  `instruction` de uma linha, sem faixas e sem ângulo de rotatória. O
  painel renderiza, mais simples.
- **`guidance` nulo** (sem rota / sem passos): `ManeuverBanner` não
  renderiza nada; a guarda de erro do `NavigationView` cobre a rota
  realmente quebrada.
- **Rotatória sem `degrees` e/ou sem `exit`:** glifo genérico de
  rotatória; selo do número só se houver `exit`.
- **`distanceToManeuverMeters` nulo** (antes do 1º fix de progresso):
  usa `upcoming.distanceMeters`; faixas ficam `[]` (regra 5 exige
  distância não nula).
- **Voz intocada** → zero risco de regressão no aviso falado.
- **Índices fora do range** (`currentStepIndex` no último passo):
  `upcomingIndex` satura em `stepCount - 1`; `then` fica `null`;
  `currentRoadName` protegido por `?.`.

## Testes

- **`src/features/navigation/selectGuidance.test.ts` (novo):**
  - `route` nulo / sem passos → `null`;
  - manobra mostrada = `currentStepIndex + 1`; satura no último passo;
  - banner ativo: com vários `triggerDistanceMeters`, escolhe o de
    menor gatilho já ativado para a distância atual; distância nula →
    o de maior gatilho;
  - sem `banners` → `primaryText` cai para `instruction`,
    `secondaryText` nulo, `maneuverType` vem do passo;
  - `lanes`: vazio além de 450 m; preenchido dentro de 450 m quando o
    banner ativo tem faixa; vazio se o banner ativo não tem faixa
    mesmo perto;
  - `then`: `null` quando a manobra seguinte está a > 400 m; preenchido
    (com ícone/tipo/texto) quando ≤ 400 m; `null` quando não há passo
    depois;
  - `currentRoadName` = `roadName` de `steps[currentStepIndex]`; `''`
    quando vazio ou índice fora do range;
  - `roundaboutDegrees` / `roundaboutExit` repassados do banner/passo.

- **`src/utils/maneuverIcon.test.ts` (amplia, sem mudar os casos atuais):**
  - novas linhas da tabela (`merge`/`fork`/`on ramp`/`off ramp`/`end of
    road`/`arrive` com modificadores) retornam o componente esperado;
  - combinação desconhecida → seta reta (fallback) — caso já existente,
    mantido.

- **`src/components/maneuvers/RoundaboutDiagram.test.tsx` (novo):**
  - `degrees = 135` → o grupo `roundabout-exit` tem
    `transform="rotate(135 22 22)"`;
  - `exitNumber = 2` → o selo com "2" está no documento;
  - `exitNumber = null` → sem selo;
  - `degrees = null` → sem o grupo girado (glifo genérico), selo ainda
    aparece se houver número.

- **`src/components/LaneGuidance.test.tsx` (novo):**
  - uma marca por faixa; faixas `active` sem a classe/opacidade de
    apagada, as demais com ela.

- **`src/components/ThenPreview.test.tsx` (novo):**
  - renderiza o rótulo "Depois", o texto e um ícone.

- **`src/components/CurrentRoadPill.test.tsx` (novo):**
  - `name` preenchido → texto no documento;
  - `name = ''` → não renderiza nada.

- **`src/components/Speedometer.test.tsx` (novo):**
  - `speedMetersPerSecond = 10` → mostra "36" e "km/h";
  - `null` → não renderiza nada.

- **`src/components/NavigationStatusBar.test.tsx` (ajusta):**
  - remove a asserção que espera a velocidade na barra; a prop
    `speedMetersPerSecond` sai dos casos. Os demais casos (tempo,
    distância, mudo, sair) não mudam.

- **`src/components/ManeuverBanner.test.tsx` (reescrito — prop mudou):**
  - `guidance` com distância + duas linhas → os três textos aparecem;
  - tipo rotatória → `RoundaboutDiagram` presente (por `data-testid`);
  - `lanes` não vazio → `LaneGuidance` presente; vazio → ausente;
  - `then` presente → linha "Depois"; ausente → sem ela;
  - `guidance` nulo → não renderiza nada.

- **`src/services/mapboxClient.test.ts` (amplia asserções):**
  - a URL contém `banner_instructions=true`;
  - `bannerInstructions` da resposta → `banners[]` ordenado por
    `triggerDistanceMeters` desc, com `primaryText`/`secondaryText`/
    `roundaboutDegrees` e `lanes` (de `sub.components` type `lane`);
  - `step.name` → `roadName`; ausência → `''`;
  - `step.maneuver.exit` → `roundaboutExit`; ausência → `null`;
  - resposta **sem** `bannerInstructions` → `banners: []`, e os campos
    antigos seguem convertidos como hoje.

- **Verificação manual** (`npm run dev`, tarefa final sem código):
  navegar até um destino que passe por rotatória e por manobras
  coladas; confirmar o desenho da rotatória com a saída certa e o
  número; confirmar que as faixas só aparecem na aproximação e o
  "Depois" só em manobras coladas; confirmar a pílula da via atual e o
  velocímetro no canto; confirmar que a voz continua igual e que a
  barra de baixo não mostra mais a velocidade repetida.

- Pipeline completo (`npm run lint && npx tsc -b && npm run test`)
  verde ao fim de cada tarefa.

## Manutenção e operação

- **`banner_instructions`** é infraestrutura padrão da API de
  Directions do Mapbox — não há chave nem cota nova; a mesma resposta,
  com mais campos.
- **Os SVGs do Mapbox** são estáticos, versionados no repo, com
  `NOTICE`/`LICENSE` (MIT) na pasta. Não há fetch externo (CSP intacta).
- **`LANE_GUIDANCE_DISTANCE_M` (450) e `THEN_PREVIEW_DISTANCE_M` (400)**
  são os botões de ajuste após o teste na rua.
- **Convenção de `degrees`** documentada no cabeçalho de
  `RoundaboutDiagram` (ângulo horário da entrada até a saída; ~180° =
  seguir em frente; mão à direita).
- Manobra nova ou modificador novo que a tabela não cobre → cai na seta
  reta; acrescentar a linha na tabela quando aparecer.

## Fora de escopo (YAGNI)

- **Voz melhorada** (`voice_instructions`, frases e timing estilo Waze,
  mudanças em `useVoiceGuidance`) — é o **segundo passo**, logo após
  este, com spec própria. Neste trabalho a voz fica exatamente como
  está.
- **Mão inglesa** (dirigir à esquerda) — o app é só do DF; o desenho da
  rotatória é fixo no sentido do Brasil (anti-horário, entrada pela
  direita).
- Mostrar os **ângulos reais de todas as saídas** da rotatória — o
  Mapbox não fornece; o desenho mostra entrada + sua saída + tracinhos
  decorativos.
- **Recálculo / roteamento por faixa**, transições animadas do painel,
  "junction view" com placa foto-realista.
- Conjunto de ícones **desenhado do zero** — decisão explícita de
  aproveitar o do Mapbox; trocar por um estilo próprio, ícone a ícone,
  fica para depois se houver vontade.
