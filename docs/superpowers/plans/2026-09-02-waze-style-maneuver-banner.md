# Painel de manobra estilo Waze — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o banner de manobra simples da navegação por um painel estilo Waze — desenho da manobra (com diagrama de rotatória), texto da via em duas linhas, setas de faixa na aproximação, preview "e depois", pílula da via atual e velocímetro dedicado.

**Architecture:** A chamada de rota do Mapbox ganha `banner_instructions=true` e o parser passa a ler campos hoje ignorados (`name`, `maneuver.exit`, `bannerInstructions`). Uma função pura `selectGuidance(route, currentStepIndex, distanceToManeuverMeters)` transforma isso num view-model `GuidanceView` já mastigado, com todas as regras de "quando mostrar o quê". Componentes novos, todos apresentacionais, desenham o que o view-model diz; `NavigationView` faz a fiação.

**Tech Stack:** React 18 + TypeScript strict, Vite, Vitest + @testing-library/react, Tailwind (cores via CSS vars em `src/index.css` + `tailwind.config.js`), API Directions v5 do Mapbox.

**Spec:** [`docs/superpowers/specs/2026-09-02-waze-style-maneuver-banner-design.md`](../specs/2026-09-02-waze-style-maneuver-banner-design.md)

## Global Constraints

- **pt-BR** em todo comentário e texto de usuário (código e testes inclusos).
- **TypeScript `strict`**, sem `any` implícito.
- **TDD**: teste falhando primeiro, rodar e ver falhar, implementação mínima, rodar e ver passar, commit. Um passo = uma ação (2–5 min).
- **A voz não muda neste trabalho.** `useVoiceGuidance` continua consumindo a `instruction` de uma linha; `NavigationView` mantém o cálculo `upcomingStepIndex`/`currentStep`/`upcomingManeuver` só para a voz.
- **`RouteStep` só ganha campos, todos opcionais** (`roadName?`, `roundaboutExit?`, `banners?`) — o parser sempre os popula; opcionais evitam churn em 14 literais de `RouteStep` espalhados por 5 arquivos de teste não relacionados.
- **`getDirections` continua igual** fora do parâmetro novo: mesma base URL, `geometries=geojson`, `steps=true`, `overview=full`, `language=pt`; mesma checagem `code !== 'Ok'` / `routes.length === 0`; mesma conversão de `geometry` e totais.
- **Cor do painel de manobra** não varia por tema: definida só em `:root` (não em `:root.dark`).
- Ao fim de **cada task**: `npm run lint && npx tsc -b && npm run test` verde, saída limpa (sem warnings novos).
- Commits pequenos e frequentes, mensagens em pt-BR seguindo o padrão do repo (`feat(nav): …`, `test(nav): …`, `refactor(nav): …`).

---

## Estrutura de arquivos

| Arquivo | Papel | Task |
|---|---|---|
| `src/types/index.ts` | + `ManeuverLane`, `BannerInstruction`; `RouteStep` += 3 campos opcionais | 1 |
| `src/services/mapboxClient.ts` | + `banner_instructions=true`; parse `name`/`exit`/`bannerInstructions` | 1 |
| `src/services/mapboxClient.test.ts` | asserções novas | 1 |
| `src/features/navigation/selectGuidance.ts` | `GuidanceView`, `ThenView`, `selectGuidance`, constantes | 2 |
| `src/features/navigation/selectGuidance.test.ts` | regras do view-model | 2 |
| `src/components/maneuvers/ManeuverGlyph.tsx` | SVGs esquemáticos (7 tipos) | 3 |
| `src/components/maneuvers/getManeuverIcon.tsx` | mapa `tipo`×`modificador` → componente | 3 |
| `src/components/maneuvers/getManeuverIcon.test.tsx` | tabela + fallback | 3 |
| `src/utils/maneuverIcon.ts` / `.test.ts` | **removidos** (movidos p/ `maneuvers/`) | 3 |
| `src/components/maneuvers/RoundaboutDiagram.tsx` | diagrama SVG da rotatória | 4 |
| `src/components/maneuvers/RoundaboutDiagram.test.tsx` | rotação + selo + fallback | 4 |
| `src/components/LaneGuidance.tsx` (+ test) | fileira de setas de faixa | 5 |
| `src/components/ThenPreview.tsx` (+ test) | linha "Depois: …" | 5 |
| `src/components/CurrentRoadPill.tsx` (+ test) | pílula da via atual | 5 |
| `src/components/Speedometer.tsx` (+ test) | círculo de velocidade | 5 |
| `src/components/NavigationStatusBar.tsx` (+ test) | remove velocidade | 6 |
| `tailwind.config.js`, `src/index.css` | token de cor `maneuver` | 7 |
| `src/components/ManeuverBanner.tsx` (+ test) | painel escuro; prop = `GuidanceView` | 7 |
| `src/components/NavigationView.tsx` (+ test) | fia `selectGuidance` + pílula + velocímetro | 7 |

---

## Task 1: Dados — tipos + parse da API

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/mapboxClient.ts`
- Test: `src/services/mapboxClient.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces:
  - `ManeuverLane { active: boolean; directions: string[] }`
  - `BannerInstruction { triggerDistanceMeters: number; primaryText: string; secondaryText: string | null; maneuverType: string; maneuverModifier: string | null; roundaboutDegrees: number | null; lanes: ManeuverLane[] }`
  - `RouteStep` ganha `roadName?: string`, `roundaboutExit?: number | null`, `banners?: BannerInstruction[]`
  - `getDirections(origin, destination, profile): Promise<Route>` (assinatura inalterada) agora popula os 3 campos novos em cada `RouteStep`; `banners` ordenado por `triggerDistanceMeters` decrescente.

- [ ] **Step 1: Escrever o teste falhando (URL + parse dos campos novos)**

Adicionar a `src/services/mapboxClient.test.ts`:

```typescript
  it('pede banner_instructions na URL', async () => {
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

    await getDirections({ lng: -46.6333, lat: -23.5505 }, { lng: -46.63, lat: -23.55 }, 'driving');

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('banner_instructions=true');
  });

  it('converte name, maneuver.exit e bannerInstructions em cada passo', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: { coordinates: [[-46.6333, -23.5505], [-46.63, -23.55]] },
            distance: 1200,
            duration: 300,
            legs: [
              {
                steps: [
                  {
                    name: '1ª Avenida Norte',
                    maneuver: {
                      instruction: 'Entre na rotatória e pegue a 2ª saída',
                      location: [-46.6333, -23.5505],
                      type: 'roundabout',
                      exit: 2,
                    },
                    distance: 1200,
                    duration: 300,
                    bannerInstructions: [
                      {
                        distanceAlongGeometry: 1200,
                        primary: { text: 'Qn 401/402 Conjunto L', type: 'roundabout', modifier: 'right', degrees: 135 },
                        secondary: { text: '1ª Avenida Norte' },
                        sub: null,
                      },
                      {
                        distanceAlongGeometry: 400,
                        primary: { text: 'Qn 401/402 Conjunto L', type: 'roundabout', modifier: 'right', degrees: 135 },
                        secondary: null,
                        sub: {
                          text: '',
                          components: [
                            { type: 'lane', active: false, directions: ['left'] },
                            { type: 'lane', active: true, directions: ['straight', 'right'] },
                          ],
                        },
                      },
                    ],
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
    const step = route.steps[0];

    expect(step.roadName).toBe('1ª Avenida Norte');
    expect(step.roundaboutExit).toBe(2);
    expect(step.banners).toHaveLength(2);
    // Ordenado por triggerDistanceMeters DESC: o de 1200 vem antes do de 400.
    expect(step.banners?.[0].triggerDistanceMeters).toBe(1200);
    expect(step.banners?.[0].primaryText).toBe('Qn 401/402 Conjunto L');
    expect(step.banners?.[0].secondaryText).toBe('1ª Avenida Norte');
    expect(step.banners?.[0].roundaboutDegrees).toBe(135);
    expect(step.banners?.[0].lanes).toEqual([]);
    expect(step.banners?.[1].triggerDistanceMeters).toBe(400);
    expect(step.banners?.[1].secondaryText).toBeNull();
    expect(step.banners?.[1].lanes).toEqual([
      { active: false, directions: ['left'] },
      { active: true, directions: ['straight', 'right'] },
    ]);
  });

  it('usa defaults quando a resposta não traz os campos novos', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: { coordinates: [[-46.6333, -23.5505], [-46.63, -23.55]] },
            distance: 1200,
            duration: 300,
            legs: [
              {
                steps: [
                  {
                    maneuver: { instruction: 'Siga em frente', location: [-46.6333, -23.5505], type: 'depart' },
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

    expect(route.steps[0].roadName).toBe('');
    expect(route.steps[0].roundaboutExit).toBeNull();
    expect(route.steps[0].banners).toEqual([]);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/services/mapboxClient.test.ts`
Expected: FAIL — `banner_instructions=true` não está na URL; `step.roadName` etc. `undefined`.

- [ ] **Step 3: Estender os tipos**

Em `src/types/index.ts`, logo antes de `export interface RouteStep {`:

```typescript
export interface ManeuverLane {
  // `active`: esta faixa faz parte do caminho da manobra.
  active: boolean;
  // Direções que a faixa serve, ex.: ['left'], ['straight', 'right'].
  directions: string[];
}

// Uma "instrução de banner" do Mapbox: o texto em duas linhas da manobra,
// o ângulo da saída (em rotatória) e a guia de faixa. A API entrega várias
// por passo, cada uma com sua distância de gatilho; guardamos todas.
export interface BannerInstruction {
  // Distância (m) antes da manobra a partir da qual este banner passa a valer.
  triggerDistanceMeters: number;
  primaryText: string;
  secondaryText: string | null;
  maneuverType: string;
  maneuverModifier: string | null;
  roundaboutDegrees: number | null;
  lanes: ManeuverLane[];
}
```

E dentro de `RouteStep`, após `maneuverModifier: string | null;`:

```typescript
  // Campos do turn-by-turn estilo Waze. Opcionais no tipo, mas SEMPRE
  // populados por `getDirections` — opcionais só para não quebrar fixtures
  // de teste antigas que constroem `RouteStep` à mão.
  roadName?: string;
  roundaboutExit?: number | null;
  banners?: BannerInstruction[];
```

- [ ] **Step 4: Ligar `banner_instructions` e parsear**

Em `src/services/mapboxClient.ts`:

4a. Na `url` de `getDirections`, acrescentar `&banner_instructions=true` logo após `&steps=true`:

```typescript
  const url = `${DIRECTIONS_BASE_URL}/${MAPBOX_DIRECTIONS_PROFILE[profile]}/${coordinates}?geometries=geojson&steps=true&banner_instructions=true&overview=full&language=pt&access_token=${MAPBOX_TOKEN}`;
```

4b. Ampliar as interfaces raw (após `interface DirectionsManeuver {`):

```typescript
interface DirectionsManeuver {
  instruction: string;
  location: [number, number];
  type: string;
  modifier?: string;
  exit?: number;
}

interface BannerComponentRaw {
  type: string;
  active?: boolean;
  directions?: string[];
}

interface BannerTextRaw {
  text: string;
  type?: string;
  modifier?: string;
  degrees?: number;
  components?: BannerComponentRaw[];
}

interface BannerInstructionRaw {
  distanceAlongGeometry: number;
  primary: BannerTextRaw;
  secondary?: BannerTextRaw | null;
  sub?: BannerTextRaw | null;
}
```

E em `DirectionsStep`:

```typescript
interface DirectionsStep {
  maneuver: DirectionsManeuver;
  distance: number;
  duration: number;
  name?: string;
  bannerInstructions?: BannerInstructionRaw[];
}
```

4c. Adicionar uma função pura de conversão de banner, antes de `export async function getDirections`:

```typescript
import type {
  BannerInstruction,
  Coordinates,
  ManeuverLane,
  Route,
  RouteStep,
  TravelProfile,
} from '../types';

function toBannerInstruction(raw: BannerInstructionRaw, step: DirectionsStep): BannerInstruction {
  const lanes: ManeuverLane[] = (raw.sub?.components ?? [])
    .filter((component) => component.type === 'lane')
    .map((component) => ({
      active: component.active === true,
      directions: component.directions ?? [],
    }));

  return {
    triggerDistanceMeters: raw.distanceAlongGeometry,
    primaryText: raw.primary.text,
    secondaryText: raw.secondary?.text ?? null,
    maneuverType: raw.primary.type ?? step.maneuver.type,
    maneuverModifier: raw.primary.modifier ?? null,
    roundaboutDegrees: typeof raw.primary.degrees === 'number' ? raw.primary.degrees : null,
    lanes,
  };
}
```

(Ajustar o `import type` do topo do arquivo para incluir `BannerInstruction` e `ManeuverLane` — o arquivo já importa `Coordinates, Route, RouteStep, TravelProfile`.)

4d. No `.map` de cada step (dentro de `mapboxRoute.legs.flatMap`), acrescentar os 3 campos:

```typescript
  const steps: RouteStep[] = mapboxRoute.legs.flatMap((leg) =>
    leg.steps.map((step) => ({
      instruction: step.maneuver.instruction,
      distanceMeters: step.distance,
      durationSeconds: step.duration,
      maneuverLocation: { lng: step.maneuver.location[0], lat: step.maneuver.location[1] },
      maneuverType: step.maneuver.type,
      maneuverModifier: step.maneuver.modifier ?? null,
      roadName: step.name ?? '',
      roundaboutExit: step.maneuver.exit ?? null,
      banners: [...(step.bannerInstructions ?? [])]
        .map((raw) => toBannerInstruction(raw, step))
        .sort((a, b) => b.triggerDistanceMeters - a.triggerDistanceMeters),
    })),
  );
```

- [ ] **Step 5: Rodar e ver passar (arquivo + suíte)**

Run: `npx vitest run src/services/mapboxClient.test.ts`
Expected: PASS (8 casos antigos + 3 novos).

Run: `npm run lint && npx tsc -b && npm run test`
Expected: tudo verde (os 14 literais de `RouteStep` em testes seguem válidos — campos novos são opcionais).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/services/mapboxClient.ts src/services/mapboxClient.test.ts
git commit -m "feat(nav): parsear banner_instructions, name e exit da rota do Mapbox"
```

---

## Task 2: `selectGuidance` — o view-model

**Files:**
- Create: `src/features/navigation/selectGuidance.ts`
- Test: `src/features/navigation/selectGuidance.test.ts`

**Interfaces:**
- Consumes (de Task 1): `Route`, `RouteStep`, `BannerInstruction`, `ManeuverLane` de `../../types`.
- Produces:
  - `LANE_GUIDANCE_DISTANCE_M = 450`, `THEN_PREVIEW_DISTANCE_M = 400` (constantes exportadas)
  - `interface ThenView { maneuverType: string; maneuverModifier: string | null; text: string }`
  - `interface GuidanceView { maneuverType: string; maneuverModifier: string | null; roundaboutDegrees: number | null; roundaboutExit: number | null; distanceMeters: number | null; primaryText: string; secondaryText: string | null; lanes: ManeuverLane[]; then: ThenView | null; currentRoadName: string }`
  - `selectGuidance(route: Route | null, currentStepIndex: number, distanceToManeuverMeters: number | null): GuidanceView | null`

- [ ] **Step 1: Escrever os testes falhando**

Criar `src/features/navigation/selectGuidance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  selectGuidance,
  LANE_GUIDANCE_DISTANCE_M,
  THEN_PREVIEW_DISTANCE_M,
} from './selectGuidance';
import type { Route, RouteStep } from '../../types';

function step(overrides: Partial<RouteStep> = {}): RouteStep {
  return {
    instruction: 'Siga em frente',
    distanceMeters: 1000,
    durationSeconds: 120,
    maneuverLocation: { lat: -15.8, lng: -47.9 },
    maneuverType: 'continue',
    maneuverModifier: null,
    roadName: '',
    roundaboutExit: null,
    banners: [],
    ...overrides,
  };
}

function route(steps: RouteStep[]): Route {
  return { geometry: [], steps, distanceMeters: 5000, durationSeconds: 600 };
}

describe('selectGuidance', () => {
  it('devolve null quando não há rota ou não há passos', () => {
    expect(selectGuidance(null, 0, null)).toBeNull();
    expect(selectGuidance(route([]), 0, null)).toBeNull();
  });

  it('a manobra mostrada é a do próximo passo e satura no último', () => {
    const r = route([
      step({ instruction: 'Partiu', maneuverType: 'depart' }),
      step({ instruction: 'Vire à direita', maneuverType: 'turn', maneuverModifier: 'right' }),
      step({ instruction: 'Chegou', maneuverType: 'arrive' }),
    ]);
    expect(selectGuidance(r, 0, 500)?.primaryText).toBe('Vire à direita');
    // currentStepIndex no último passo → satura, não estoura
    expect(selectGuidance(r, 2, 500)?.primaryText).toBe('Chegou');
  });

  it('escolhe o banner ativo pela distância: o de menor gatilho já ativado', () => {
    const upcoming = step({
      instruction: 'fallback',
      distanceMeters: 800,
      banners: [
        { triggerDistanceMeters: 800, primaryText: 'longe', secondaryText: null, maneuverType: 'turn', maneuverModifier: 'left', roundaboutDegrees: null, lanes: [] },
        { triggerDistanceMeters: 200, primaryText: 'perto', secondaryText: null, maneuverType: 'turn', maneuverModifier: 'left', roundaboutDegrees: null, lanes: [] },
      ],
    });
    const r = route([step(), upcoming]);
    expect(selectGuidance(r, 0, 500)?.primaryText).toBe('longe'); // 200 ainda não ativou
    expect(selectGuidance(r, 0, 150)?.primaryText).toBe('perto'); // 200 já ativou
    expect(selectGuidance(r, 0, null)?.primaryText).toBe('longe'); // distância nula → o primeiro
  });

  it('sem banners, cai para a instruction e o tipo do passo', () => {
    const r = route([step(), step({ instruction: 'Vire à esquerda', maneuverType: 'turn', maneuverModifier: 'left', banners: [] })]);
    const g = selectGuidance(r, 0, 300);
    expect(g?.primaryText).toBe('Vire à esquerda');
    expect(g?.secondaryText).toBeNull();
    expect(g?.maneuverType).toBe('turn');
    expect(g?.maneuverModifier).toBe('left');
  });

  it('faixas: vazio além de 450 m, preenchido dentro de 450 m quando o banner ativo tem faixa', () => {
    const lanes = [{ active: true, directions: ['straight'] }];
    const upcoming = step({
      distanceMeters: 900,
      banners: [
        { triggerDistanceMeters: 900, primaryText: 'x', secondaryText: null, maneuverType: 'turn', maneuverModifier: 'right', roundaboutDegrees: null, lanes: [] },
        { triggerDistanceMeters: 500, primaryText: 'x', secondaryText: null, maneuverType: 'turn', maneuverModifier: 'right', roundaboutDegrees: null, lanes },
      ],
    });
    const r = route([step(), upcoming]);
    expect(selectGuidance(r, 0, 600)?.lanes).toEqual([]); // banner ativo é o de 900, sem faixa
    expect(selectGuidance(r, 0, 400)?.lanes).toEqual(lanes); // banner ativo é o de 500, com faixa, e 400 <= 450
  });

  it('faixas: vazias se o banner ativo não tem faixa, mesmo perto', () => {
    const upcoming = step({
      distanceMeters: 300,
      banners: [{ triggerDistanceMeters: 300, primaryText: 'x', secondaryText: null, maneuverType: 'turn', maneuverModifier: 'right', roundaboutDegrees: null, lanes: [] }],
    });
    expect(selectGuidance(route([step(), upcoming]), 0, 100)?.lanes).toEqual([]);
  });

  it('then: null quando a manobra seguinte está longe; preenchido quando <= 400 m; null quando não há passo depois', () => {
    const mkNext = (dist: number) => route([
      step(),
      step({ instruction: 'Vire à direita', maneuverType: 'turn', maneuverModifier: 'right', distanceMeters: dist }),
      step({ instruction: 'Vire à esquerda', maneuverType: 'turn', maneuverModifier: 'left' }),
    ]);
    expect(selectGuidance(mkNext(900), 0, 500)?.then).toBeNull();
    const then = selectGuidance(mkNext(250), 0, 500)?.then;
    expect(then?.text).toBe('Vire à esquerda');
    expect(then?.maneuverType).toBe('turn');
    expect(then?.maneuverModifier).toBe('left');
    // próximo passo é o último → sem "then"
    const r2 = route([step(), step({ instruction: 'Chegou', maneuverType: 'arrive', distanceMeters: 100 })]);
    expect(selectGuidance(r2, 0, 300)?.then).toBeNull();
  });

  it('currentRoadName vem do passo sendo percorrido; vazio quando ausente ou fora do range', () => {
    const r = route([step({ roadName: '2ª Avenida Norte' }), step({ instruction: 'Vire', maneuverType: 'turn', maneuverModifier: 'right' })]);
    expect(selectGuidance(r, 0, 300)?.currentRoadName).toBe('2ª Avenida Norte');
    expect(selectGuidance(route([step({ roadName: '' }), step()]), 0, 300)?.currentRoadName).toBe('');
    expect(selectGuidance(r, 9, 300)?.currentRoadName).toBe('');
  });

  it('repassa roundaboutDegrees do banner e roundaboutExit do passo; distância cai para a do passo quando nula', () => {
    const upcoming = step({
      distanceMeters: 700,
      roundaboutExit: 3,
      banners: [{ triggerDistanceMeters: 700, primaryText: 'Rotatória', secondaryText: null, maneuverType: 'roundabout', maneuverModifier: 'right', roundaboutDegrees: 240, lanes: [] }],
    });
    const g = selectGuidance(route([step(), upcoming]), 0, null);
    expect(g?.roundaboutDegrees).toBe(240);
    expect(g?.roundaboutExit).toBe(3);
    expect(g?.distanceMeters).toBe(700);
  });

  it('exporta os dois limiares', () => {
    expect(LANE_GUIDANCE_DISTANCE_M).toBe(450);
    expect(THEN_PREVIEW_DISTANCE_M).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/navigation/selectGuidance.test.ts`
Expected: FAIL — `Cannot find module './selectGuidance'`.

- [ ] **Step 3: Implementar**

Criar `src/features/navigation/selectGuidance.ts`:

```typescript
import type { BannerInstruction, ManeuverLane, Route } from '../../types';

// Distância (m) da manobra abaixo da qual as setas de faixa aparecem.
export const LANE_GUIDANCE_DISTANCE_M = 450;
// A manobra seguinte só entra no preview "e depois" se vier até esta
// distância (m) depois da próxima — ou seja, manobras "coladas".
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

// `banners` chega ordenado por triggerDistanceMeters DESC (ver getDirections).
// O banner "ativo" é o de menor gatilho que já valeu para a distância atual.
function pickActiveBanner(
  banners: BannerInstruction[],
  distanceToManeuverMeters: number | null,
): BannerInstruction | null {
  if (banners.length === 0) {
    return null;
  }
  const remaining = distanceToManeuverMeters ?? Number.POSITIVE_INFINITY;
  let active = banners[0];
  for (const banner of banners) {
    if (banner.triggerDistanceMeters >= remaining) {
      active = banner;
    }
  }
  return active;
}

export function selectGuidance(
  route: Route | null,
  currentStepIndex: number,
  distanceToManeuverMeters: number | null,
): GuidanceView | null {
  if (!route || route.steps.length === 0) {
    return null;
  }

  const stepCount = route.steps.length;
  const upcomingIndex = Math.min(currentStepIndex + 1, stepCount - 1);
  const upcoming = route.steps[upcomingIndex];
  const activeBanner = pickActiveBanner(upcoming.banners ?? [], distanceToManeuverMeters);

  const lanes =
    distanceToManeuverMeters != null &&
    distanceToManeuverMeters <= LANE_GUIDANCE_DISTANCE_M &&
    activeBanner != null &&
    activeBanner.lanes.length > 0
      ? activeBanner.lanes
      : [];

  let then: ThenView | null = null;
  const afterIndex = upcomingIndex + 1;
  if (afterIndex <= stepCount - 1 && upcoming.distanceMeters <= THEN_PREVIEW_DISTANCE_M) {
    const after = route.steps[afterIndex];
    const afterBanner = (after.banners ?? [])[0] ?? null;
    then = {
      maneuverType: afterBanner?.maneuverType ?? after.maneuverType,
      maneuverModifier: afterBanner?.maneuverModifier ?? after.maneuverModifier,
      text: afterBanner?.primaryText ?? after.instruction,
    };
  }

  return {
    maneuverType: activeBanner?.maneuverType ?? upcoming.maneuverType,
    maneuverModifier: activeBanner?.maneuverModifier ?? upcoming.maneuverModifier,
    roundaboutDegrees: activeBanner?.roundaboutDegrees ?? null,
    roundaboutExit: upcoming.roundaboutExit ?? null,
    distanceMeters: distanceToManeuverMeters ?? upcoming.distanceMeters,
    primaryText: activeBanner?.primaryText ?? upcoming.instruction,
    secondaryText: activeBanner?.secondaryText ?? null,
    lanes,
    then,
    currentRoadName: route.steps[currentStepIndex]?.roadName ?? '',
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/navigation/selectGuidance.test.ts`
Expected: PASS (11 casos).

Run: `npm run lint && npx tsc -b && npm run test`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/features/navigation/selectGuidance.ts src/features/navigation/selectGuidance.test.ts
git commit -m "feat(nav): selectGuidance — view-model do painel de manobra"
```

---

## Task 3: Ícones de manobra

**Files:**
- Create: `src/components/maneuvers/ManeuverGlyph.tsx`
- Create: `src/components/maneuvers/getManeuverIcon.tsx`
- Create: `src/components/maneuvers/getManeuverIcon.test.tsx`
- Modify: `src/components/ManeuverBanner.tsx` (só a linha de import)
- Delete: `src/utils/maneuverIcon.ts`, `src/utils/maneuverIcon.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `type ManeuverGlyphKind = 'arrow' | 'fork' | 'merge' | 'ramp' | 'uturn' | 'arrive' | 'roundabout-generic'`
  - `ManeuverGlyph({ kind, degrees, size, className }): JSX.Element` — SVG que gira `degrees` (default 0)
  - `type ManeuverIconProps = { size?: number; className?: string }`
  - `getManeuverIcon(maneuverType: string, maneuverModifier: string | null): (props: ManeuverIconProps) => JSX.Element` — devolve um componente pronto (mesma forma de uso de hoje: `const Icon = getManeuverIcon(...)` → `<Icon size={44} />`)

> **Nota de desvio da spec:** a spec pede "vendorizar o conjunto oficial de SVGs do Mapbox". Este plano entrega **glifos esquemáticos próprios** (7 formas), com a mesma API de componente. Trocar depois pelos SVGs exatos do Mapbox é substituir os `d=` dos paths mantendo os nomes — fica como polimento, fora do caminho crítico.

- [ ] **Step 1: Escrever os testes falhando**

Criar `src/components/maneuvers/getManeuverIcon.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { getManeuverIcon } from './getManeuverIcon';

function rotationOf(type: string, modifier: string | null): string | null {
  const Icon = getManeuverIcon(type, modifier);
  const { container } = render(<Icon />);
  const rotated = container.querySelector('[data-glyph-rotation]');
  return rotated?.getAttribute('data-glyph-rotation') ?? null;
}

function kindOf(type: string, modifier: string | null): string | null {
  const Icon = getManeuverIcon(type, modifier);
  const { container } = render(<Icon />);
  return container.querySelector('[data-glyph-kind]')?.getAttribute('data-glyph-kind') ?? null;
}

describe('getManeuverIcon', () => {
  it('turn/right → glifo arrow girado 90°', () => {
    expect(kindOf('turn', 'right')).toBe('arrow');
    expect(rotationOf('turn', 'right')).toBe('90');
  });

  it('turn/left → arrow girado -90°', () => {
    expect(rotationOf('turn', 'left')).toBe('-90');
  });

  it('turn/slight right → arrow girado 45°; sharp right → 135°', () => {
    expect(rotationOf('turn', 'slight right')).toBe('45');
    expect(rotationOf('turn', 'sharp right')).toBe('135');
  });

  it('continue / depart / null → arrow reto (0°)', () => {
    expect(kindOf('continue', null)).toBe('arrow');
    expect(rotationOf('continue', null)).toBe('0');
    expect(rotationOf('depart', 'straight')).toBe('0');
  });

  it('uturn → glifo uturn', () => {
    expect(kindOf('turn', 'uturn')).toBe('uturn');
  });

  it('fork/right e off ramp/right → glifos próprios', () => {
    expect(kindOf('fork', 'right')).toBe('fork');
    expect(kindOf('off ramp', 'slight right')).toBe('ramp');
  });

  it('merge/left → glifo merge', () => {
    expect(kindOf('merge', 'left')).toBe('merge');
  });

  it('roundabout / rotary → glifo roundabout-generic', () => {
    expect(kindOf('roundabout', null)).toBe('roundabout-generic');
    expect(kindOf('rotary', null)).toBe('roundabout-generic');
  });

  it('arrive → glifo arrive', () => {
    expect(kindOf('arrive', null)).toBe('arrive');
  });

  it('combinação desconhecida → arrow reto', () => {
    expect(kindOf('tipo-x', 'mod-y')).toBe('arrow');
    expect(rotationOf('tipo-x', 'mod-y')).toBe('0');
  });

  it('o componente aceita size e repassa para o svg', () => {
    const Icon = getManeuverIcon('turn', 'right');
    const { container } = render(<Icon size={48} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('48');
    expect(svg?.getAttribute('height')).toBe('48');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/maneuvers/getManeuverIcon.test.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `ManeuverGlyph`**

Criar `src/components/maneuvers/ManeuverGlyph.tsx`:

```tsx
export type ManeuverGlyphKind =
  | 'arrow'
  | 'fork'
  | 'merge'
  | 'ramp'
  | 'uturn'
  | 'arrive'
  | 'roundabout-generic';

interface ManeuverGlyphProps {
  kind: ManeuverGlyphKind;
  /** Graus de rotação horária aplicados ao desenho (0 = apontando p/ cima). */
  degrees?: number;
  size?: number;
  className?: string;
}

// Desenhos esquemáticos simples, em viewBox 24x24, traço em currentColor.
// Cada `path` aponta "para cima" no estado neutro; a rotação é aplicada no
// grupo externo.
const PATHS: Record<ManeuverGlyphKind, JSX.Element> = {
  arrow: (
    <path
      d="M12 21V5M12 5l-6 6M12 5l6 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  fork: (
    <path
      d="M12 21v-6M12 15c0-4-4-5-5-8M12 15c0-4 4-5 5-8M7 7l0-3M7 7l3 0M17 7l0-3M17 7l-3 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  merge: (
    <path
      d="M12 21v-7M12 14c0-4 4-6 4-10M16 4l0 3M16 4l-3 1M8 8c1 2 4 3 4 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  ramp: (
    <path
      d="M8 21V9c0-2 1-4 4-5M12 4l0 4M12 4l-4 1"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  uturn: (
    <path
      d="M8 21V10a4 4 0 0 1 8 0v3M16 13l-2-3M16 13l2-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  arrive: (
    <>
      <path d="M7 21V4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M7 5h9l-2 3 2 3H7z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </>
  ),
  'roundabout-generic': (
    <path
      d="M12 21v-6M12 15a4 4 0 1 0-3.5-2M12 9l-2 2M12 9l2 2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

export function ManeuverGlyph({ kind, degrees = 0, size = 40, className }: ManeuverGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <g data-glyph-kind={kind} data-glyph-rotation={String(degrees)} transform={`rotate(${degrees} 12 12)`}>
        {PATHS[kind]}
      </g>
    </svg>
  );
}
```

- [ ] **Step 4: Implementar `getManeuverIcon`**

Criar `src/components/maneuvers/getManeuverIcon.tsx`:

```tsx
import { ManeuverGlyph, type ManeuverGlyphKind } from './ManeuverGlyph';

export interface ManeuverIconProps {
  size?: number;
  className?: string;
}

// Rotação horária, em graus, por modificador (0 = seguir reto).
const MODIFIER_DEGREES: Record<string, number> = {
  straight: 0,
  'slight right': 45,
  right: 90,
  'sharp right': 135,
  uturn: 180,
  'sharp left': -135,
  left: -90,
  'slight left': -45,
};

function degreesFor(modifier: string | null): number {
  if (modifier && modifier in MODIFIER_DEGREES) {
    return MODIFIER_DEGREES[modifier];
  }
  return 0;
}

function resolve(
  maneuverType: string,
  maneuverModifier: string | null,
): { kind: ManeuverGlyphKind; degrees: number } {
  if (maneuverType === 'arrive') {
    return { kind: 'arrive', degrees: 0 };
  }
  if (maneuverType === 'roundabout' || maneuverType === 'rotary' || maneuverType === 'roundabout turn') {
    return { kind: 'roundabout-generic', degrees: 0 };
  }
  if (maneuverModifier === 'uturn' || maneuverType === 'uturn') {
    return { kind: 'uturn', degrees: 0 };
  }
  if (maneuverType === 'fork') {
    return { kind: 'fork', degrees: degreesFor(maneuverModifier) };
  }
  if (maneuverType === 'merge') {
    return { kind: 'merge', degrees: degreesFor(maneuverModifier) };
  }
  if (maneuverType === 'on ramp' || maneuverType === 'off ramp') {
    return { kind: 'ramp', degrees: degreesFor(maneuverModifier) };
  }
  return { kind: 'arrow', degrees: degreesFor(maneuverModifier) };
}

export function getManeuverIcon(
  maneuverType: string,
  maneuverModifier: string | null,
): (props: ManeuverIconProps) => JSX.Element {
  const { kind, degrees } = resolve(maneuverType, maneuverModifier);
  return function ManeuverIcon({ size, className }: ManeuverIconProps) {
    return <ManeuverGlyph kind={kind} degrees={degrees} size={size} className={className} />;
  };
}
```

- [ ] **Step 5: Repontar o import do `ManeuverBanner` e remover o arquivo antigo**

5a. Em `src/components/ManeuverBanner.tsx`, trocar a linha 1:

```tsx
import { getManeuverIcon } from './maneuvers/getManeuverIcon';
```

(O uso `const Icon = getManeuverIcon(step.maneuverType, step.maneuverModifier);` … `<Icon size={40} aria-hidden="true" />` segue compilando — o componente aceita `size`. `aria-hidden` no wrapper é redundante com o `aria-hidden` interno do svg; deixar como está, será refeito na Task 7.)

5b. Remover:

```bash
git rm src/utils/maneuverIcon.ts src/utils/maneuverIcon.test.ts
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/components/maneuvers/getManeuverIcon.test.tsx`
Expected: PASS (11 casos).

Run: `npm run lint && npx tsc -b && npm run test`
Expected: verde. (O antigo `maneuverIcon.test.ts` sumiu; `ManeuverBanner.test.tsx` continua passando — só checa texto e distância.)

- [ ] **Step 7: Commit**

```bash
git add src/components/maneuvers/ src/components/ManeuverBanner.tsx src/utils/maneuverIcon.ts src/utils/maneuverIcon.test.ts
git commit -m "feat(nav): conjunto de glifos de manobra + getManeuverIcon ampliado"
```

---

## Task 4: `RoundaboutDiagram`

**Files:**
- Create: `src/components/maneuvers/RoundaboutDiagram.tsx`
- Test: `src/components/maneuvers/RoundaboutDiagram.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `RoundaboutDiagram({ degrees, exitNumber, size, className }): JSX.Element`
  - `degrees: number | null` — ângulo da saída (ver nota); `null` → glifo genérico
  - `exitNumber: number | null` — nº da saída no selo; `null` → sem selo
  - `size?: number` (default 44), `className?: string`

> **Convenção de `degrees` — A CONFIRMAR na verificação manual (Task 8) contra uma resposta real da API.** Hipótese: `degrees` é o ângulo horário da entrada (fundo, 6 h) até a saída; ~180° ≈ seguir em frente. A implementação usa `transform="rotate(<degrees> 22 22)"` no grupo da seta de saída; o teste fixa essa relação. Se a rua mostrar a seta no lado errado, ajustar aqui um offset/sinal e o teste junto.

- [ ] **Step 1: Escrever os testes falhando**

Criar `src/components/maneuvers/RoundaboutDiagram.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RoundaboutDiagram } from './RoundaboutDiagram';

describe('RoundaboutDiagram', () => {
  it('gira a seta da saída pelo ângulo informado', () => {
    const { container } = render(<RoundaboutDiagram degrees={135} exitNumber={2} />);
    const exit = container.querySelector('[data-testid="roundabout-exit"]');
    expect(exit).not.toBeNull();
    expect(exit?.getAttribute('transform')).toBe('rotate(135 22 22)');
  });

  it('mostra o selo com o número da saída', () => {
    const { getByText } = render(<RoundaboutDiagram degrees={90} exitNumber={3} />);
    expect(getByText('3')).toBeInTheDocument();
  });

  it('sem exitNumber, não há selo', () => {
    const { queryByTestId } = render(<RoundaboutDiagram degrees={90} exitNumber={null} />);
    expect(queryByTestId('roundabout-exit-badge')).toBeNull();
  });

  it('degrees null → sem grupo girado (glifo genérico), selo ainda aparece', () => {
    const { container, getByText } = render(<RoundaboutDiagram degrees={null} exitNumber={2} />);
    expect(container.querySelector('[data-testid="roundabout-exit"]')).toBeNull();
    expect(container.querySelector('[data-testid="roundabout-generic"]')).not.toBeNull();
    expect(getByText('2')).toBeInTheDocument();
  });

  it('aceita size', () => {
    const { container } = render(<RoundaboutDiagram degrees={90} exitNumber={null} size={60} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('60');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/maneuvers/RoundaboutDiagram.test.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Criar `src/components/maneuvers/RoundaboutDiagram.tsx`:

```tsx
interface RoundaboutDiagramProps {
  // Ângulo horário (graus) da entrada até a saída. null → desenho genérico.
  // CONVENÇÃO A CONFIRMAR contra resposta real da API (ver plano, Task 4).
  degrees: number | null;
  exitNumber: number | null;
  size?: number;
  className?: string;
}

const CX = 22;
const CY = 22;

export function RoundaboutDiagram({
  degrees,
  exitNumber,
  size = 44,
  className,
}: RoundaboutDiagramProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      className={className}
      role="img"
      aria-hidden="true"
    >
      {/* Anel da rotatória */}
      <circle
        cx={CX}
        cy={CY}
        r={11}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.85"
      />
      {/* Entrada: stub a partir do fundo até o anel */}
      <path d={`M${CX} 44 L${CX} ${CY + 11}`} stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />

      {degrees == null ? (
        // Genérico: seta circular curta saindo pra cima.
        <g data-testid="roundabout-generic">
          <path
            d={`M${CX} ${CY - 11} L${CX} 3 M${CX} 3 l-3 4 M${CX} 3 l3 4`}
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ) : (
        // Saída escolhida: seta saindo do anel pra fora, girada pelo ângulo.
        <g data-testid="roundabout-exit" transform={`rotate(${degrees} ${CX} ${CY})`}>
          <path
            d={`M${CX} ${CY - 11} L${CX} 4 M${CX} 4 l-3.5 4 M${CX} 4 l3.5 4`}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* Tracinhos decorativos das outras saídas (não são dados reais) */}
      <path d={`M${CX + 11} ${CY} l4 0`} stroke="currentColor" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
      <path d={`M${CX - 11} ${CY} l-4 0`} stroke="currentColor" strokeWidth="2" opacity="0.35" strokeLinecap="round" />

      {exitNumber != null && (
        <g data-testid="roundabout-exit-badge">
          <circle cx={38} cy={7} r={6} fill="currentColor" />
          <text
            x={38}
            y={7}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="9"
            fontWeight="700"
            fill="var(--color-maneuver, #0c3b3f)"
          >
            {exitNumber}
          </text>
        </g>
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/maneuvers/RoundaboutDiagram.test.tsx`
Expected: PASS (5 casos).

Run: `npm run lint && npx tsc -b && npm run test`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/components/maneuvers/RoundaboutDiagram.tsx src/components/maneuvers/RoundaboutDiagram.test.tsx
git commit -m "feat(nav): RoundaboutDiagram — diagrama de rotatória com a saída"
```

---

## Task 5: Componentes apresentacionais — faixas, "e depois", pílula, velocímetro

**Files:**
- Create: `src/components/LaneGuidance.tsx` + `src/components/LaneGuidance.test.tsx`
- Create: `src/components/ThenPreview.tsx` + `src/components/ThenPreview.test.tsx`
- Create: `src/components/CurrentRoadPill.tsx` + `src/components/CurrentRoadPill.test.tsx`
- Create: `src/components/Speedometer.tsx` + `src/components/Speedometer.test.tsx`

**Interfaces:**
- Consumes: `ManeuverLane` de `../types`; `ThenView` de `../features/navigation/selectGuidance`; `getManeuverIcon` de `./maneuvers/getManeuverIcon`; `formatSpeedKmh` de `../utils/format`.
- Produces:
  - `LaneGuidance({ lanes: ManeuverLane[] }): JSX.Element`
  - `ThenPreview({ then: ThenView }): JSX.Element`
  - `CurrentRoadPill({ name: string }): JSX.Element | null`
  - `Speedometer({ speedMetersPerSecond: number | null }): JSX.Element`

- [ ] **Step 1: `LaneGuidance` — teste falhando**

Criar `src/components/LaneGuidance.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LaneGuidance } from './LaneGuidance';

describe('LaneGuidance', () => {
  it('renderiza uma marca por faixa', () => {
    const { container } = render(
      <LaneGuidance
        lanes={[
          { active: false, directions: ['left'] },
          { active: true, directions: ['straight', 'right'] },
          { active: false, directions: ['right'] },
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-testid="lane"]')).toHaveLength(3);
  });

  it('faixas ativas e inativas se distinguem por data-active', () => {
    const { container } = render(
      <LaneGuidance
        lanes={[
          { active: true, directions: ['straight'] },
          { active: false, directions: ['left'] },
        ]}
      />,
    );
    const lanes = container.querySelectorAll('[data-testid="lane"]');
    expect(lanes[0].getAttribute('data-active')).toBe('true');
    expect(lanes[1].getAttribute('data-active')).toBe('false');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/components/LaneGuidance.test.tsx` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `LaneGuidance`**

Criar `src/components/LaneGuidance.tsx`:

```tsx
import type { ManeuverLane } from '../types';
import { getManeuverIcon } from './maneuvers/getManeuverIcon';

interface LaneGuidanceProps {
  lanes: ManeuverLane[];
}

// Mapeia a direção de uma faixa para um ícone de seta reaproveitando a
// tabela de manobras (turn + modificador).
function laneIcon(direction: string) {
  return getManeuverIcon('turn', direction === 'straight' ? 'straight' : direction);
}

export function LaneGuidance({ lanes }: LaneGuidanceProps) {
  return (
    <div className="flex items-center justify-center gap-3 bg-black/25 px-4 py-1.5">
      {lanes.map((lane, laneIndex) => (
        <div
          key={laneIndex}
          data-testid="lane"
          data-active={String(lane.active)}
          className={lane.active ? 'flex opacity-100' : 'flex opacity-30'}
        >
          {lane.directions.map((direction, dirIndex) => {
            const Icon = laneIcon(direction);
            return <Icon key={dirIndex} size={18} />;
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/components/LaneGuidance.test.tsx` → PASS.

- [ ] **Step 5: `ThenPreview` — teste falhando**

Criar `src/components/ThenPreview.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThenPreview } from './ThenPreview';

describe('ThenPreview', () => {
  it('mostra o rótulo "Depois", o texto e um ícone', () => {
    const { getByText, container } = render(
      <ThenPreview then={{ maneuverType: 'turn', maneuverModifier: 'left', text: 'Rua das Flores' }} />,
    );
    expect(getByText('Depois')).toBeInTheDocument();
    expect(getByText('Rua das Flores')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
```

- [ ] **Step 6: Rodar e ver falhar** — FAIL (módulo inexistente).

- [ ] **Step 7: Implementar `ThenPreview`**

Criar `src/components/ThenPreview.tsx`:

```tsx
import type { ThenView } from '../features/navigation/selectGuidance';
import { getManeuverIcon } from './maneuvers/getManeuverIcon';

interface ThenPreviewProps {
  then: ThenView;
}

export function ThenPreview({ then }: ThenPreviewProps) {
  const Icon = getManeuverIcon(then.maneuverType, then.maneuverModifier);
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-sm opacity-80">
      <span className="font-semibold uppercase tracking-wide">Depois</span>
      <Icon size={18} />
      <span className="truncate">{then.text}</span>
    </div>
  );
}
```

- [ ] **Step 8: Rodar e ver passar** — PASS.

- [ ] **Step 9: `CurrentRoadPill` — teste falhando**

Criar `src/components/CurrentRoadPill.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CurrentRoadPill } from './CurrentRoadPill';

describe('CurrentRoadPill', () => {
  it('mostra o nome da via', () => {
    const { getByText } = render(<CurrentRoadPill name="2ª Avenida Norte" />);
    expect(getByText('2ª Avenida Norte')).toBeInTheDocument();
  });

  it('não renderiza nada quando o nome está vazio', () => {
    const { container } = render(<CurrentRoadPill name="" />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 10: Rodar e ver falhar** — FAIL.

- [ ] **Step 11: Implementar `CurrentRoadPill`**

Criar `src/components/CurrentRoadPill.tsx`:

```tsx
interface CurrentRoadPillProps {
  name: string;
}

export function CurrentRoadPill({ name }: CurrentRoadPillProps) {
  if (name === '') {
    return null;
  }
  return (
    <div className="max-w-[80vw] truncate rounded-full bg-white px-4 py-1.5 text-sm font-medium text-slate-900 shadow-lg">
      {name}
    </div>
  );
}
```

- [ ] **Step 12: Rodar e ver passar** — PASS.

- [ ] **Step 13: `Speedometer` — teste falhando**

Criar `src/components/Speedometer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Speedometer } from './Speedometer';

describe('Speedometer', () => {
  it('mostra a velocidade em km/h arredondada', () => {
    const { getByText } = render(<Speedometer speedMetersPerSecond={10} />);
    expect(getByText('36')).toBeInTheDocument();
    expect(getByText('km/h')).toBeInTheDocument();
  });

  it('mostra 0 quando não há leitura (estilo Waze)', () => {
    const { getByText } = render(<Speedometer speedMetersPerSecond={null} />);
    expect(getByText('0')).toBeInTheDocument();
  });
});
```

- [ ] **Step 14: Rodar e ver falhar** — FAIL.

- [ ] **Step 15: Implementar `Speedometer`**

Criar `src/components/Speedometer.tsx`:

```tsx
interface SpeedometerProps {
  speedMetersPerSecond: number | null;
}

export function Speedometer({ speedMetersPerSecond }: SpeedometerProps) {
  const kmh = speedMetersPerSecond != null ? Math.round(speedMetersPerSecond * 3.6) : 0;
  return (
    <div className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-white text-slate-900 shadow-lg">
      <span className="text-lg font-bold leading-none">{kmh}</span>
      <span className="text-[10px] leading-none opacity-70">km/h</span>
    </div>
  );
}
```

- [ ] **Step 16: Rodar e ver passar** — PASS.

- [ ] **Step 17: Suíte + pipeline**

Run: `npm run lint && npx tsc -b && npm run test`
Expected: verde.

- [ ] **Step 18: Commit**

```bash
git add src/components/LaneGuidance.tsx src/components/LaneGuidance.test.tsx src/components/ThenPreview.tsx src/components/ThenPreview.test.tsx src/components/CurrentRoadPill.tsx src/components/CurrentRoadPill.test.tsx src/components/Speedometer.tsx src/components/Speedometer.test.tsx
git commit -m "feat(nav): LaneGuidance, ThenPreview, CurrentRoadPill e Speedometer"
```

---

## Task 6: `NavigationStatusBar` — tirar a velocidade

**Files:**
- Modify: `src/components/NavigationStatusBar.tsx`
- Modify: `src/components/NavigationView.tsx` (só a chamada — deixa de passar `speedMetersPerSecond` ao status bar)
- Test: `src/components/NavigationStatusBar.test.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `NavigationStatusBarProps` sem `speedMetersPerSecond`.

- [ ] **Step 1: Ajustar o teste**

Em `src/components/NavigationStatusBar.test.tsx`:

1a. No caso `'mostra tempo restante e distância'`, remover `speedMetersPerSecond={12}` das props e remover a linha `expect(screen.getByText('43 km/h')).toBeInTheDocument();`.

1b. Remover o caso inteiro `it('não mostra velocidade quando indisponível', ...)`.

1c. Nos casos restantes (`chama onExit…`, `chama onExitApp…`, `não mostra o botão de voz…`), remover `speedMetersPerSecond={null}` das props.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/NavigationStatusBar.test.tsx`
Expected: FAIL de tipo/compilação nos testes ainda não ajustados? Não — ajustados no Step 1. O FAIL esperado agora é **de TypeScript**: `speedMetersPerSecond` ainda é obrigatório em `NavigationStatusBarProps`, então os `render(<NavigationStatusBar … />)` sem a prop não compilam.
Alternativa de verificação: `npx tsc -b` → erro "Property 'speedMetersPerSecond' is missing".

- [ ] **Step 3: Remover a velocidade do componente**

Em `src/components/NavigationStatusBar.tsx`:

3a. Remover `speedMetersPerSecond: number | null;` de `NavigationStatusBarProps`.

3b. Remover `speedMetersPerSecond,` da desestruturação dos props.

3c. Remover a linha `const speedKmh = speedMetersPerSecond !== null ? Math.round(speedMetersPerSecond * 3.6) : null;`.

3d. Remover o JSX `{speedKmh !== null && <span className="text-sm text-muted">{speedKmh} km/h</span>}`.

- [ ] **Step 4: Parar de passar a prop no `NavigationView`**

Em `src/components/NavigationView.tsx`, na `<NavigationStatusBar … />`, remover a linha `speedMetersPerSecond={speedMetersPerSecond}`. (A prop `speedMetersPerSecond` do próprio `NavigationView` continua existindo — será usada pelo `Speedometer` na Task 7. Até lá o parâmetro fica sem uso; o lint pode reclamar de variável não usada — se reclamar, prefixar com `void speedMetersPerSecond;` num comentário TEMP **não**; em vez disso, seguir direto para a Task 7 sem commitar entre 6 e 7. Para manter as tasks independentes, ver Step 6.)

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/components/NavigationStatusBar.test.tsx`
Expected: PASS (4 casos).

- [ ] **Step 6: Pipeline + commit**

Se `npm run lint` acusar `speedMetersPerSecond` sem uso em `NavigationView.tsx`: manter o uso vivo de forma honesta passando-o ao `MapView`? Não — `MapView` já recebe do `App`. Em vez disso, **manter este commit e a Task 7 juntos**: rodar a Task 7 antes de commitar. Ou seja, o commit abaixo só acontece se o lint passar; se não passar por causa da prop órfã, seguir direto para a Task 7 e fazer um único commit ao fim dela cobrindo 6+7.

Run: `npm run lint && npx tsc -b && npm run test`

Se verde:

```bash
git add src/components/NavigationStatusBar.tsx src/components/NavigationStatusBar.test.tsx src/components/NavigationView.tsx
git commit -m "refactor(nav): tirar a velocidade da barra de status (vai para o velocímetro)"
```

Se vermelho só pela prop órfã em `NavigationView`: não commitar; ir para a Task 7.

---

## Task 7: Montar o painel + fiar no `NavigationView`

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/index.css`
- Modify: `src/components/ManeuverBanner.tsx` (reescrito)
- Modify: `src/components/ManeuverBanner.test.tsx` (reescrito)
- Modify: `src/components/NavigationView.tsx`
- Modify: `src/components/NavigationView.test.tsx`

**Interfaces:**
- Consumes: `GuidanceView` de `../features/navigation/selectGuidance`; `selectGuidance`; `getManeuverIcon`; `RoundaboutDiagram`; `LaneGuidance`; `ThenPreview`; `CurrentRoadPill`; `Speedometer`.
- Produces: `ManeuverBanner({ guidance: GuidanceView | null }): JSX.Element | null`.

- [ ] **Step 1: Token de cor do painel**

1a. Em `src/index.css`, dentro de `:root { … }` (NÃO em `:root.dark`), acrescentar:

```css
    --color-maneuver: 12 59 63; /* teal escuro do painel de manobra (fixo nos dois temas) */
    --color-maneuver-foreground: 255 255 255;
```

1b. Em `tailwind.config.js`, dentro de `theme.extend.colors`, acrescentar:

```js
        maneuver: {
          DEFAULT: 'rgb(var(--color-maneuver) / <alpha-value>)',
          foreground: 'rgb(var(--color-maneuver-foreground) / <alpha-value>)',
        },
```

- [ ] **Step 2: Reescrever o teste do `ManeuverBanner`**

Substituir todo o conteúdo de `src/components/ManeuverBanner.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManeuverBanner } from './ManeuverBanner';
import type { GuidanceView } from '../features/navigation/selectGuidance';

function guidance(overrides: Partial<GuidanceView> = {}): GuidanceView {
  return {
    maneuverType: 'turn',
    maneuverModifier: 'right',
    roundaboutDegrees: null,
    roundaboutExit: null,
    distanceMeters: 250,
    primaryText: 'Qn 401/402 Conjunto L',
    secondaryText: '1ª Avenida Norte',
    lanes: [],
    then: null,
    currentRoadName: '2ª Avenida Norte',
    ...overrides,
  };
}

describe('ManeuverBanner', () => {
  it('mostra a distância e as duas linhas de texto', () => {
    render(<ManeuverBanner guidance={guidance()} />);
    expect(screen.getByText('250 m')).toBeInTheDocument();
    expect(screen.getByText('Qn 401/402 Conjunto L')).toBeInTheDocument();
    expect(screen.getByText('1ª Avenida Norte')).toBeInTheDocument();
  });

  it('usa o RoundaboutDiagram quando a manobra é rotatória', () => {
    const { container } = render(
      <ManeuverBanner guidance={guidance({ maneuverType: 'roundabout', roundaboutDegrees: 135, roundaboutExit: 2 })} />,
    );
    expect(container.querySelector('[data-testid="roundabout-exit"]')).not.toBeNull();
  });

  it('mostra a fileira de faixas só quando lanes não está vazio', () => {
    const { rerender, container } = render(<ManeuverBanner guidance={guidance()} />);
    expect(container.querySelector('[data-testid="lane"]')).toBeNull();
    rerender(<ManeuverBanner guidance={guidance({ lanes: [{ active: true, directions: ['straight'] }] })} />);
    expect(container.querySelector('[data-testid="lane"]')).not.toBeNull();
  });

  it('mostra a linha "Depois" só quando then existe', () => {
    const { rerender, queryByText } = render(<ManeuverBanner guidance={guidance()} />);
    expect(queryByText('Depois')).toBeNull();
    rerender(
      <ManeuverBanner guidance={guidance({ then: { maneuverType: 'turn', maneuverModifier: 'left', text: 'Rua X' } })} />,
    );
    expect(queryByText('Depois')).toBeInTheDocument();
  });

  it('não renderiza nada quando guidance é null', () => {
    const { container } = render(<ManeuverBanner guidance={null} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/components/ManeuverBanner.test.tsx`
Expected: FAIL — `ManeuverBanner` ainda espera a prop `step`; `guidance` não existe.

- [ ] **Step 4: Reescrever o `ManeuverBanner`**

Substituir todo o conteúdo de `src/components/ManeuverBanner.tsx`:

```tsx
import { formatDistance } from '../utils/format';
import type { GuidanceView } from '../features/navigation/selectGuidance';
import { getManeuverIcon } from './maneuvers/getManeuverIcon';
import { RoundaboutDiagram } from './maneuvers/RoundaboutDiagram';
import { LaneGuidance } from './LaneGuidance';
import { ThenPreview } from './ThenPreview';

interface ManeuverBannerProps {
  guidance: GuidanceView | null;
}

const ROUNDABOUT_TYPES = new Set(['roundabout', 'rotary', 'roundabout turn']);

export function ManeuverBanner({ guidance }: ManeuverBannerProps) {
  if (!guidance) {
    return null;
  }

  const isRoundabout = ROUNDABOUT_TYPES.has(guidance.maneuverType);
  const Icon = getManeuverIcon(guidance.maneuverType, guidance.maneuverModifier);

  return (
    <div className="mx-2 overflow-hidden rounded-b-2xl bg-maneuver text-maneuver-foreground shadow-xl">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="shrink-0">
          {isRoundabout ? (
            <RoundaboutDiagram
              degrees={guidance.roundaboutDegrees}
              exitNumber={guidance.roundaboutExit}
              size={48}
            />
          ) : (
            <Icon size={44} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold leading-tight">
            {formatDistance(guidance.distanceMeters ?? 0)}
          </p>
          <p className="line-clamp-2 text-lg font-semibold leading-snug">{guidance.primaryText}</p>
          {guidance.secondaryText && (
            <p className="truncate text-sm opacity-70">{guidance.secondaryText}</p>
          )}
        </div>
      </div>

      {guidance.lanes.length > 0 && <LaneGuidance lanes={guidance.lanes} />}

      {guidance.then && (
        <>
          <div className="mx-4 border-t border-white/15" />
          <ThenPreview then={guidance.then} />
        </>
      )}
    </div>
  );
}
```

> `line-clamp-2` faz parte do core do Tailwind atual — se o build acusar classe desconhecida, trocar por `overflow-hidden` simples.

- [ ] **Step 5: Rodar e ver passar (banner)**

Run: `npx vitest run src/components/ManeuverBanner.test.tsx`
Expected: PASS (5 casos).

- [ ] **Step 6: Fiar no `NavigationView`**

Em `src/components/NavigationView.tsx`:

6a. Nos imports, acrescentar:

```tsx
import { selectGuidance } from '../features/navigation/selectGuidance';
import { CurrentRoadPill } from './CurrentRoadPill';
import { Speedometer } from './Speedometer';
```

6b. Dentro do componente, após o cálculo de `remainingDurationSeconds` (ou junto dos outros `useMemo`/derivados, antes do `return`), acrescentar:

```tsx
  const guidance = useMemo(
    () => selectGuidance(state.route, state.currentStepIndex, state.distanceToManeuverMeters),
    [state.route, state.currentStepIndex, state.distanceToManeuverMeters],
  );
```

(O arquivo já importa `useMemo`.)

6c. Trocar o bloco do banner:

```tsx
      <div className="pointer-events-auto">
        <ManeuverBanner guidance={guidance} />
      </div>
```

6d. Logo antes do bloco `<div className="pointer-events-auto"><NavigationStatusBar … /></div>`, inserir a pílula e o velocímetro:

```tsx
      <div className="pointer-events-none flex items-end justify-between px-3 pb-2">
        <div className="pointer-events-auto">
          <Speedometer speedMetersPerSecond={speedMetersPerSecond} />
        </div>
        <div className="pointer-events-auto">
          <CurrentRoadPill name={guidance?.currentRoadName ?? ''} />
        </div>
        <div className="w-14" aria-hidden="true" />
      </div>
```

6e. Confirmar que a `<NavigationStatusBar … />` **não** recebe mais `speedMetersPerSecond` (removido na Task 6; se as tasks 6 e 7 foram unidas, remover agora).

6f. O cálculo antigo `currentStep` / `currentStepInstruction` / `upcomingManeuver` permanece — alimenta `useVoiceGuidance`. A guarda `if (!state.route || !currentStep)` permanece.

- [ ] **Step 7: Ajustar o teste do `NavigationView`**

Em `src/components/NavigationView.test.tsx`:

7a. No fixture `navigatingState`, o passo único não tem manobra seguinte — `selectGuidance` vai olhar `steps[currentStepIndex + 1]` que satura no próprio passo 0. O texto do banner passará a ser `'Vire à direita na Rua Augusta'` (a `instruction` do passo 0, via fallback sem `banners`). O caso `'mostra o banner de manobra do passo atual'` já espera exatamente esse texto — **mantém**.

7b. Adicionar um caso cobrindo a pílula da via atual:

```tsx
  it('mostra a pílula com a via atual quando o passo tem roadName', () => {
    const state: NavigationState = {
      ...navigatingState,
      route: {
        ...navigatingState.route!,
        steps: [
          { ...navigatingState.route!.steps[0], roadName: '2ª Avenida Norte' },
          {
            instruction: 'Vire à esquerda',
            distanceMeters: 100,
            durationSeconds: 20,
            maneuverLocation: { lat: -23.55, lng: -46.64 },
            maneuverType: 'turn',
            maneuverModifier: 'left',
          },
        ],
      },
    };
    render(
      <NavigationView
        state={state}
        placeName="Av. Paulista, São Paulo"
        speedMetersPerSecond={null}
        isRecalculating={false}
        routeError={null}
        onRetryRecalc={vi.fn()}
        onExit={vi.fn()}
        onArrivalDone={vi.fn()}
        onExitApp={vi.fn()}
      />,
    );
    expect(screen.getByText('2ª Avenida Norte')).toBeInTheDocument();
  });
```

7c. Adicionar um caso do velocímetro:

```tsx
  it('mostra o velocímetro com a velocidade atual', () => {
    render(
      <NavigationView
        state={navigatingState}
        placeName="Av. Paulista, São Paulo"
        speedMetersPerSecond={10}
        isRecalculating={false}
        routeError={null}
        onRetryRecalc={vi.fn()}
        onExit={vi.fn()}
        onArrivalDone={vi.fn()}
        onExitApp={vi.fn()}
      />,
    );
    expect(screen.getByText('36')).toBeInTheDocument();
  });
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run src/components/NavigationView.test.tsx src/components/ManeuverBanner.test.tsx`
Expected: PASS.

Run: `npm run lint && npx tsc -b && npm run test`
Expected: verde, suíte inteira.

- [ ] **Step 9: Commit**

```bash
git add tailwind.config.js src/index.css src/components/ManeuverBanner.tsx src/components/ManeuverBanner.test.tsx src/components/NavigationView.tsx src/components/NavigationView.test.tsx src/components/NavigationStatusBar.tsx src/components/NavigationStatusBar.test.tsx
git commit -m "feat(nav): painel de manobra estilo Waze montado e fiado no NavigationView"
```

---

## Task 8: Verificação manual + fechamento

**Files:** nenhum (a menos que a verificação revele ajuste).

- [ ] **Step 1: Pipeline completo**

Run: `npm run lint && npx tsc -b && npm run test`
Expected: verde. Anotar a contagem de testes.

- [ ] **Step 2: Subir o app**

Run: `npm run dev`
Abrir no navegador, iniciar uma navegação para um destino no DF que passe por **pelo menos uma rotatória** e por **manobras coladas** (ex.: quadras do Plano Piloto).

- [ ] **Step 3: Conferência visual (checklist)**

- [ ] Painel de cima escuro (teal), cantos de baixo arredondados, margem lateral.
- [ ] Ícone da manobra à esquerda; distância grande; via em até 2 linhas; via secundária menor embaixo.
- [ ] **Rotatória:** aparece o diagrama (círculo + seta da saída + selo do número). **Confirmar que a seta aponta para o lado correto da saída real.** Se estiver errada, ajustar a convenção de `degrees` em `RoundaboutDiagram.tsx` (offset/sinal no `rotate`) e o teste `RoundaboutDiagram.test.tsx` junto; commitar `fix(nav): convenção do ângulo da rotatória`.
- [ ] Setas de faixa aparecem só na aproximação (~450 m) e somem depois.
- [ ] "Depois: …" aparece só quando a manobra seguinte está colada (~400 m).
- [ ] Pílula branca com a via atual, centralizada acima da barra de baixo; some quando a via não tem nome.
- [ ] Velocímetro (círculo) no canto inferior esquerdo; mostra "0 km/h" parado.
- [ ] Barra de baixo **não** repete a velocidade.
- [ ] A voz continua falando as instruções como antes.
- [ ] Tema claro/escuro do mapa não altera a cor do painel de manobra.

- [ ] **Step 4: Commit de fechamento (se houve ajuste no Step 3)**

Se nada mudou, não há commit. Se a rotatória exigiu ajuste, ele já foi commitado no Step 3.

- [ ] **Step 5: Atualizar a memória do projeto**

Anotar em `C:\Users\edils\.claude\projects\c--Users-edils-OneDrive-Desktop-Nova-pasta--4-\memory\` que o painel estilo Waze foi implementado (branch, estado, e que a **voz melhorada** é o próximo passo com spec própria).

---

## Self-Review (feito na escrita do plano)

**1. Cobertura da spec:**

| Requisito da spec | Task |
|---|---|
| `banner_instructions=true` na URL | 1 |
| `RouteStep` += `roadName`, `roundaboutExit`, `banners` | 1 |
| Parse de `bannerInstructions` (primary/secondary/sub-lanes), ordenado desc | 1 |
| Sem `bannerInstructions` → `banners: []` | 1 |
| `selectGuidance` + `GuidanceView` + constantes | 2 |
| Regra 1 (manobra = próximo passo, satura) | 2 |
| Regra 2 (banner ativo por distância; fallback `instruction`) | 2 |
| Regra 3 (via atual do passo corrente; vazio some) | 2 |
| Regra 4 (faixas só ≤ 450 m e se houver) | 2 |
| Regra 5 (then só se ≤ 400 m e há passo depois) | 2 |
| Tabela de ícones ampliada + fallback seta reta | 3 |
| `RoundaboutDiagram` (gira por `degrees`, selo, genérico sem `degrees`) | 4 |
| `LaneGuidance`, `ThenPreview`, `CurrentRoadPill` | 5 |
| `Speedometer` (círculo, "0 km/h" sem leitura) | 5 |
| `NavigationStatusBar` perde a velocidade + teste ajustado | 6 |
| Token de cor `maneuver` só em `:root` | 7 |
| `ManeuverBanner` refeito (prop `guidance`, painel escuro, compõe tudo) | 7 |
| `NavigationView` fia `selectGuidance` + pílula + velocímetro; voz intacta | 7 |
| Verificação manual (rotatória, faixas, then, pílula, velocímetro, voz, tema) | 8 |
| Confirmar convenção de `degrees` contra a API real | 8 |

Sem lacunas.

**2. Placeholders:** nenhum `TBD`/`TODO`/"similar à Task N". Todo passo de código tem bloco de código real. A única indefinição declarada — convenção exata de `degrees` — está isolada num componente, com hipótese concreta implementada e um passo de verificação/ajuste na Task 8.

**3. Consistência de tipos:** `GuidanceView`/`ThenView` definidos na Task 2 e consumidos com os mesmos nomes de campo nas Tasks 5 e 7. `getManeuverIcon(type, modifier)` (2 args) usado igual nas Tasks 3, 5, 7. `ManeuverLane { active, directions }` da Task 1 usado igual nas Tasks 2 e 5. `RoundaboutDiagram` props (`degrees`, `exitNumber`, `size`) iguais nas Tasks 4 e 7. `banners` sempre `BannerInstruction[]` ordenado desc por `triggerDistanceMeters` (Task 1) — `pickActiveBanner` (Task 2) depende dessa ordem e o comentário registra isso.
