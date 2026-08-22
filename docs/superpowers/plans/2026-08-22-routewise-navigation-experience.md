# RouteWise Navigation Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace RouteWise's minimal MVP UI with a Waze/Google-Maps-style navigation experience — full-screen turn-by-turn view, travel mode toggle, voice guidance, auto-reroute, saved places, and a real design system — without any gamified/fake-data elements.

**Architecture:** `App.tsx` composes two top-level screens by `NavigationStatus`: `PlanningView` (`idle`/`routePlanned`) and `NavigationView` (`navigating`/`arrived`). New pure logic (maneuver icon mapping, deviation/arrival thresholds) lives in `utils/`, new stateful concerns (voice, saved places, theme) live in dedicated `features/` hooks, all wired together in the two view components.

**Tech Stack:** Vite + React + TypeScript (strict), Tailwind CSS (`darkMode: 'class'`), Mapbox GL JS, `lucide-react`, `@fontsource-variable/inter`, Web Speech API, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-22-routewise-navigation-experience-design.md` (extends `docs/superpowers/specs/2026-08-22-routewise-gps-design.md`)

**Working directory for all tasks:** `.worktrees/routewise-mvp/` (branch `feature/routewise-mvp`)

## Global Constraints

- No mascots, animated characters, hazard/traffic icons, or any "reported by other users" data (spec §1, §2) — real or simulated.
- No fields not backed by real API data (e.g. no rating/phone on destination card) — spec §6.
- Travel mode is only changeable before `START_NAVIGATION`, never during `navigating` — spec §7.
- Fonts and icons must be npm packages bundled into the build, never CDN-loaded — `vercel.json` CSP has `script-src 'self'` and `font-src 'self' data:` and must not need to change — spec §5, §11.
- Deviation threshold: 50m. Arrival threshold: 30m — spec §4, §12 (adjustable later if real-GPS testing shows otherwise, but implement with these values now).
- All new hooks/components follow existing patterns: Tailwind utility classes inline (no CSS modules), `data-testid` for elements asserted in tests, Portuguese (pt-BR) user-facing strings and test descriptions, Vitest + React Testing Library, `mapbox-gl` mocked via `vi.mock('mapbox-gl', ...)` the same way `useMapboxMap.test.ts` and `App.test.tsx` already do it.

---

## Task 1: Maneuver data on `RouteStep`

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/mapboxClient.ts`
- Test: `src/services/mapboxClient.test.ts`

**Interfaces:**
- Produces: `RouteStep.maneuverType: string`, `RouteStep.maneuverModifier: string | null` — consumed by Task 4 (`maneuverIcon`) and Task 13 (`ManeuverBanner`).

- [ ] **Step 1: Write the failing test**

Add to `src/services/mapboxClient.test.ts`, inside the existing `describe('getDirections', ...)` block (reuse the existing mocked response shape, just add `maneuver.type`/`maneuver.modifier` and assert on them):

```ts
  it('inclui o tipo e modificador da manobra em cada passo', async () => {
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
                    maneuver: {
                      instruction: 'Vire à direita na Rua X',
                      location: [-46.6333, -23.5505],
                      type: 'turn',
                      modifier: 'right',
                    },
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

    expect(route.steps[0].maneuverType).toBe('turn');
    expect(route.steps[0].maneuverModifier).toBe('right');
  });

  it('usa maneuverModifier nulo quando a API não retorna modificador', async () => {
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
                    maneuver: {
                      instruction: 'Chegou ao destino',
                      location: [-46.6333, -23.5505],
                      type: 'arrive',
                    },
                    distance: 0,
                    duration: 0,
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

    expect(route.steps[0].maneuverType).toBe('arrive');
    expect(route.steps[0].maneuverModifier).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `.worktrees/routewise-mvp/`): `npm run test -- mapboxClient`
Expected: FAIL — `route.steps[0].maneuverType` is `undefined`.

- [ ] **Step 3: Implement**

In `src/types/index.ts`, add the two fields to `RouteStep`:

```ts
export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuverLocation: Coordinates;
  maneuverType: string;
  maneuverModifier: string | null;
}
```

In `src/services/mapboxClient.ts`, update `DirectionsManeuver` and the step-mapping in `getDirections`:

```ts
interface DirectionsManeuver {
  instruction: string;
  location: [number, number];
  type: string;
  modifier?: string;
}
```

```ts
  const steps: RouteStep[] = mapboxRoute.legs.flatMap((leg) =>
    leg.steps.map((step) => ({
      instruction: step.maneuver.instruction,
      distanceMeters: step.distance,
      durationSeconds: step.duration,
      maneuverLocation: { lng: step.maneuver.location[0], lat: step.maneuver.location[1] },
      maneuverType: step.maneuver.type,
      maneuverModifier: step.maneuver.modifier ?? null,
    })),
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- mapboxClient`
Expected: PASS (all `mapboxClient.test.ts` tests, including the two new ones)

- [ ] **Step 5: Fix existing fixtures broken by the new required fields**

`RouteStep` is a required-fields interface, so every test fixture building a `RouteStep`/`Route` literal now fails to type-check. Add `maneuverType: 'turn', maneuverModifier: null` (or a fixture-appropriate value) to every step literal in: `src/App.test.tsx`, `src/features/routing/navigationReducer.test.ts`, `src/features/routing/useRoute.test.ts`, `src/components/RouteInstructions.test.tsx`. Run `npm run build` (runs `tsc -b`) to find every remaining error and fix each.

- [ ] **Step 6: Run full suite and build**

Run: `npm run test && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/services/mapboxClient.ts src/services/mapboxClient.test.ts src/App.test.tsx src/features/routing/navigationReducer.test.ts src/features/routing/useRoute.test.ts src/components/RouteInstructions.test.tsx
git commit -m "feat: capture maneuver type and modifier from Directions API"
```

---

## Task 2: Speed and heading in `useGeolocation`

**Files:**
- Modify: `src/features/geolocation/useGeolocation.ts`
- Test: `src/features/geolocation/useGeolocation.test.ts`

**Interfaces:**
- Produces: `useGeolocation()` return now includes `speedMetersPerSecond: number | null`, `headingDegrees: number | null` — consumed by Task 8 (camera) and Task 15 (`NavigationStatusBar`).

- [ ] **Step 1: Write the failing test**

Read `src/features/geolocation/useGeolocation.test.ts` first to match its existing mocking style, then add:

```ts
  it('expõe velocidade e direção quando o navegador fornece esses dados', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn((success: PositionCallback) => {
          success({
            coords: {
              latitude: -23.5505,
              longitude: -46.6333,
              speed: 8.3,
              heading: 90,
            },
          } as GeolocationPosition);
          return 1;
        }),
        clearWatch: vi.fn(),
      },
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.speedMetersPerSecond).toBe(8.3);
      expect(result.current.headingDegrees).toBe(90);
    });
  });

  it('usa null para velocidade/direção quando o navegador não os fornece', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn((success: PositionCallback) => {
          success({
            coords: { latitude: -23.5505, longitude: -46.6333, speed: null, heading: null },
          } as GeolocationPosition);
          return 1;
        }),
        clearWatch: vi.fn(),
      },
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.speedMetersPerSecond).toBeNull();
      expect(result.current.headingDegrees).toBeNull();
    });
  });
```

(Add `waitFor` to the existing `@testing-library/react` import if not already imported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- useGeolocation`
Expected: FAIL — `speedMetersPerSecond` is `undefined`.

- [ ] **Step 3: Implement**

In `src/features/geolocation/useGeolocation.ts`:

```ts
interface GeolocationState {
  position: Coordinates | null;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  error: string | null;
  isLoading: boolean;
}
```

```ts
  const [state, setState] = useState<GeolocationState>({
    position: null,
    speedMetersPerSecond: null,
    headingDegrees: null,
    error: null,
    isLoading: true,
  });
```

In the `watchPosition` success callback, replace the `setState` call with:

```ts
      (result) => {
        setState({
          position: { lat: result.coords.latitude, lng: result.coords.longitude },
          speedMetersPerSecond: result.coords.speed ?? null,
          headingDegrees: result.coords.heading ?? null,
          error: null,
          isLoading: false,
        });
      },
```

And the error callback's `setState` needs the two new fields too (set to `null`):

```ts
      () => {
        setState({
          position: null,
          speedMetersPerSecond: null,
          headingDegrees: null,
          error: 'Não foi possível acessar sua localização. Permita o acesso e tente novamente.',
          isLoading: false,
        });
      },
```

And the no-geolocation-support branch similarly needs the two new fields set to `null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- useGeolocation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/geolocation/useGeolocation.ts src/features/geolocation/useGeolocation.test.ts
git commit -m "feat: expose speed and heading from geolocation watch"
```

---

## Task 3: `arrived` status and deviation flag in `navigationReducer`

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/features/routing/navigationReducer.ts`
- Test: `src/features/routing/navigationReducer.test.ts`

**Interfaces:**
- Consumes: `haversineDistanceMeters`, `findNearestPointIndex` from `src/utils/distance.ts` (existing).
- Produces: `NavigationStatus` now includes `'arrived'`. `NavigationState.routeDeviated: boolean`. New action `{ type: 'ROUTE_DEVIATED' }` and `{ type: 'ROUTE_RECALCULATED'; route: Route }`. Consumed by Task 17 (`NavigationView`/`ArrivalScreen`) and Task 18 (reroute hook).

- [ ] **Step 1: Write the failing tests**

Add to `src/features/routing/navigationReducer.test.ts`:

```ts
  it('transiciona para arrived quando a posição fica a menos de 30m do destino', () => {
    const routeToClose: Route = {
      ...sampleRoute,
      geometry: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.0002 },
      ],
    };
    const planned = navigationReducer(
      { ...initialNavigationState, destination: { lat: 0, lng: 0.0002 } },
      { type: 'ROUTE_PLANNED', route: routeToClose },
    );
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });

    const chegou = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 0.0002 },
    });

    expect(chegou.status).toBe('arrived');
  });

  it('marca routeDeviated quando a posição fica a mais de 50m da rota', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });

    const desviado = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0.01, lng: 1 },
    });

    expect(desviado.routeDeviated).toBe(true);
  });

  it('limpa routeDeviated quando uma rota recalculada chega', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });
    const desviado = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0.01, lng: 1 },
    });

    const recalculada = navigationReducer(desviado, {
      type: 'ROUTE_RECALCULATED',
      route: sampleRoute,
    });

    expect(recalculada.routeDeviated).toBe(false);
    expect(recalculada.route).toBe(sampleRoute);
    expect(recalculada.currentStepIndex).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- navigationReducer`
Expected: FAIL — `chegou.status` is `'navigating'`, `desviado.routeDeviated` is `undefined`.

- [ ] **Step 3: Implement**

In `src/types/index.ts`:

```ts
export type NavigationStatus = 'idle' | 'routePlanned' | 'navigating' | 'arrived';

export interface NavigationState {
  status: NavigationStatus;
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  currentStepIndex: number;
  travelProfile: TravelProfile;
  routeDeviated: boolean;
}
```

In `src/features/routing/navigationReducer.ts`:

```ts
import { findNearestPointIndex, haversineDistanceMeters } from '../../utils/distance';

const ARRIVAL_THRESHOLD_METERS = 30;
const DEVIATION_THRESHOLD_METERS = 50;

export type NavigationAction =
  | { type: 'SET_ORIGIN'; origin: Coordinates }
  | { type: 'SET_DESTINATION'; destination: Coordinates }
  | { type: 'SET_TRAVEL_PROFILE'; profile: TravelProfile }
  | { type: 'ROUTE_PLANNED'; route: Route }
  | { type: 'ROUTE_RECALCULATED'; route: Route }
  | { type: 'ROUTE_DEVIATED' }
  | { type: 'START_NAVIGATION' }
  | { type: 'POSITION_UPDATED'; position: Coordinates }
  | { type: 'RESET' };

export const initialNavigationState: NavigationState = {
  status: 'idle',
  origin: null,
  destination: null,
  route: null,
  currentStepIndex: 0,
  travelProfile: 'driving',
  routeDeviated: false,
};
```

Replace the `ROUTE_PLANNED`, add `ROUTE_RECALCULATED`/`ROUTE_DEVIATED`, and rewrite `POSITION_UPDATED`:

```ts
    case 'ROUTE_PLANNED':
      return { ...state, route: action.route, status: 'routePlanned', currentStepIndex: 0 };

    case 'ROUTE_RECALCULATED':
      return { ...state, route: action.route, currentStepIndex: 0, routeDeviated: false };

    case 'ROUTE_DEVIATED':
      return { ...state, routeDeviated: true };
```

```ts
    case 'POSITION_UPDATED': {
      if (state.status !== 'navigating' || !state.route) {
        return { ...state, origin: action.position };
      }

      if (
        state.destination &&
        haversineDistanceMeters(action.position, state.destination) < ARRIVAL_THRESHOLD_METERS
      ) {
        return { ...state, origin: action.position, status: 'arrived' };
      }

      const nearestIndex = findNearestPointIndex(action.position, state.route.geometry);
      const distanceToRoute = haversineDistanceMeters(
        action.position,
        state.route.geometry[nearestIndex],
      );
      const stepCount = state.route.steps.length;
      const progressRatio = nearestIndex / Math.max(state.route.geometry.length - 1, 1);
      const nextStepIndex = Math.min(Math.floor(progressRatio * stepCount), stepCount - 1);

      return {
        ...state,
        origin: action.position,
        currentStepIndex: Math.max(nextStepIndex, state.currentStepIndex),
        routeDeviated: distanceToRoute > DEVIATION_THRESHOLD_METERS ? true : state.routeDeviated,
      };
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- navigationReducer`
Expected: PASS

- [ ] **Step 5: Fix type errors in dependent fixtures**

`NavigationState` gained `routeDeviated`. Run `npm run build`; any test constructing a `NavigationState` literal directly (rather than via `initialNavigationState`) needs the new field. Fix each reported location.

- [ ] **Step 6: Run full suite and build**

Run: `npm run test && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/features/routing/navigationReducer.ts src/features/routing/navigationReducer.test.ts
git commit -m "feat: add arrived status and route-deviation tracking to navigation reducer"
```

---

## Task 4: `maneuverIcon` pure mapping function

**Files:**
- Create: `src/utils/maneuverIcon.ts`
- Test: `src/utils/maneuverIcon.test.ts`

**Interfaces:**
- Consumes: `RouteStep.maneuverType`/`maneuverModifier` (Task 1). `lucide-react` icon components (installed in Task 5 — see note below).
- Produces: `getManeuverIcon(maneuverType: string, maneuverModifier: string | null): LucideIcon` — consumed by Task 13 (`ManeuverBanner`).

**Note:** this task depends on `lucide-react` being installed. Do Task 5's `npm install` step first if working strictly in order, or install `lucide-react` as part of this task's Step 3 — either is fine since the two tasks touch disjoint files. This plan assumes Task 5 runs first.

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/maneuverIcon.test.ts
import { describe, it, expect } from 'vitest';
import {
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  ArrowRight,
  ArrowLeft,
  RotateCw,
  Flag,
} from 'lucide-react';
import { getManeuverIcon } from './maneuverIcon';

describe('getManeuverIcon', () => {
  it('retorna seta reta para continue sem modificador', () => {
    expect(getManeuverIcon('continue', null)).toBe(ArrowUp);
  });

  it('retorna seta de virar à direita para turn/right', () => {
    expect(getManeuverIcon('turn', 'right')).toBe(ArrowRight);
  });

  it('retorna seta de virar à esquerda para turn/left', () => {
    expect(getManeuverIcon('turn', 'left')).toBe(ArrowLeft);
  });

  it('retorna seta diagonal para slight right', () => {
    expect(getManeuverIcon('turn', 'slight right')).toBe(ArrowUpRight);
  });

  it('retorna seta diagonal para slight left', () => {
    expect(getManeuverIcon('turn', 'slight left')).toBe(ArrowUpLeft);
  });

  it('retorna ícone de rotatória para roundabout', () => {
    expect(getManeuverIcon('roundabout', null)).toBe(RotateCw);
  });

  it('retorna ícone de bandeira para arrive', () => {
    expect(getManeuverIcon('arrive', null)).toBe(Flag);
  });

  it('usa seta reta como fallback para combinações desconhecidas', () => {
    expect(getManeuverIcon('unknown-type', 'unknown-modifier')).toBe(ArrowUp);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- maneuverIcon`
Expected: FAIL — `getManeuverIcon` module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/utils/maneuverIcon.ts
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  ArrowRight,
  ArrowLeft,
  RotateCw,
  Flag,
  CornerUpRight,
  CornerUpLeft,
} from 'lucide-react';

const MODIFIER_ICONS: Record<string, LucideIcon> = {
  straight: ArrowUp,
  right: ArrowRight,
  left: ArrowLeft,
  'slight right': ArrowUpRight,
  'slight left': ArrowUpLeft,
  'sharp right': CornerUpRight,
  'sharp left': CornerUpLeft,
  uturn: RotateCw,
};

export function getManeuverIcon(
  maneuverType: string,
  maneuverModifier: string | null,
): LucideIcon {
  if (maneuverType === 'arrive') {
    return Flag;
  }
  if (maneuverType === 'roundabout' || maneuverType === 'rotary') {
    return RotateCw;
  }
  if (maneuverModifier && MODIFIER_ICONS[maneuverModifier]) {
    return MODIFIER_ICONS[maneuverModifier];
  }
  return ArrowUp;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- maneuverIcon`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/maneuverIcon.ts src/utils/maneuverIcon.test.ts
git commit -m "feat: map Directions API maneuver type/modifier to Lucide icons"
```

---

## Task 5: Design system foundations — dependencies, Tailwind tokens, fonts

**Files:**
- Modify: `package.json` (via `npm install`)
- Modify: `tailwind.config.js`
- Modify: `src/index.css`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: Tailwind color tokens (`primary`, `surface`, `success`, `warning`, `danger` — light/dark pairs via CSS variables), `darkMode: 'class'` strategy, Inter font applied globally. Consumed by every component task from here on (Tasks 9–17 use the new token classes instead of raw `blue-600`/etc).

- [ ] **Step 1: Install dependencies**

```bash
npm install lucide-react @fontsource-variable/inter
```

- [ ] **Step 2: Verify install**

Run: `npm run build`
Expected: still passes (new deps unused so far, no code changes yet).

- [ ] **Step 3: Add design tokens to `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --color-primary: 37 99 235; /* indigo-blue, RGB for Tailwind's rgb(<value> / <alpha>) syntax */
    --color-primary-foreground: 255 255 255;
    --color-surface: 255 255 255;
    --color-surface-foreground: 15 23 42;
    --color-muted: 100 116 139;
    --color-success: 22 163 74;
    --color-warning: 217 119 6;
    --color-danger: 220 38 38;
  }

  :root.dark {
    --color-primary: 96 165 250;
    --color-primary-foreground: 15 23 42;
    --color-surface: 15 23 42;
    --color-surface-foreground: 241 245 249;
    --color-muted: 148 163 184;
    --color-success: 74 222 128;
    --color-warning: 251 191 36;
    --color-danger: 248 113 113;
  }

  body {
    font-family: 'InterVariable', system-ui, sans-serif;
  }
}
```

- [ ] **Step 4: Wire tokens into `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          foreground: 'rgb(var(--color-surface-foreground) / <alpha-value>)',
        },
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 5: Import the font in `src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@fontsource-variable/inter';
import './index.css';
```

- [ ] **Step 6: Verify build and existing tests still pass**

Run: `npm run build && npm run test`
Expected: PASS — this task adds tokens/fonts but doesn't change any component markup, so nothing existing should break.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tailwind.config.js src/index.css src/main.tsx
git commit -m "feat: add design tokens, dark mode strategy, and self-hosted Inter font"
```

---

## Task 6: `useTheme` hook (light/dark, persisted)

**Files:**
- Create: `src/features/theme/useTheme.ts`
- Test: `src/features/theme/useTheme.test.ts`

**Interfaces:**
- Produces: `useTheme(): { theme: 'light' | 'dark'; toggleTheme: () => void }`. Toggling adds/removes the `dark` class on `document.documentElement` and persists to `localStorage['routewise-theme']`. Consumed by Task 8 (map style swap) and wherever a theme toggle control is rendered (Task 15, `NavigationStatusBar`, or a settings affordance in `PlanningView` — wired in Task 12).

- [ ] **Step 1: Write the failing test**

```ts
// src/features/theme/useTheme.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from './useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('inicia em light quando não há preferência salva e o sistema prefere claro', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('alterna para dark e aplica a classe no elemento raiz', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persiste a preferência em localStorage e a recupera em uma nova instância', () => {
    const { result, unmount } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });
    unmount();

    const { result: secondResult } = renderHook(() => useTheme());
    expect(secondResult.current.theme).toBe('dark');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- useTheme`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/features/theme/useTheme.ts
import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'routewise-theme';

function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // localStorage indisponível (modo privado, etc.) — segue com o padrão do sistema.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Sem persistência disponível — o tema continua funcionando só na sessão atual.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- useTheme`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/theme/useTheme.ts src/features/theme/useTheme.test.ts
git commit -m "feat: add persisted light/dark theme hook"
```

---

## Task 7: `useSavedPlaces` hook (Casa/Trabalho/custom, `localStorage`)

**Files:**
- Create: `src/features/places/useSavedPlaces.ts`
- Test: `src/features/places/useSavedPlaces.test.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `SavedPlace { id: string; label: string; coordinates: Coordinates }`. `useSavedPlaces(): { places: SavedPlace[]; savePlace: (label: string, coordinates: Coordinates) => void; removePlace: (id: string) => void }`. Consumed by Task 11 (`SavedPlacesShortcuts`) and Task 9 (`DestinationCard`'s "Salvar" action).

- [ ] **Step 1: Add the type**

In `src/types/index.ts`:

```ts
export interface SavedPlace {
  id: string;
  label: string;
  coordinates: Coordinates;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/features/places/useSavedPlaces.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSavedPlaces } from './useSavedPlaces';

describe('useSavedPlaces', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('inicia vazio quando não há nada salvo', () => {
    const { result } = renderHook(() => useSavedPlaces());
    expect(result.current.places).toEqual([]);
  });

  it('salva um local e persiste em localStorage', () => {
    const { result } = renderHook(() => useSavedPlaces());

    act(() => {
      result.current.savePlace('Casa', { lat: -23.55, lng: -46.63 });
    });

    expect(result.current.places).toHaveLength(1);
    expect(result.current.places[0].label).toBe('Casa');
    const stored = JSON.parse(localStorage.getItem('routewise-saved-places') ?? '[]');
    expect(stored).toHaveLength(1);
  });

  it('remove um local salvo pelo id', () => {
    const { result } = renderHook(() => useSavedPlaces());
    act(() => {
      result.current.savePlace('Trabalho', { lat: -23.56, lng: -46.64 });
    });
    const id = result.current.places[0].id;

    act(() => {
      result.current.removePlace(id);
    });

    expect(result.current.places).toEqual([]);
  });

  it('trata dado corrompido em localStorage como lista vazia', () => {
    localStorage.setItem('routewise-saved-places', 'não é json válido {{{');

    const { result } = renderHook(() => useSavedPlaces());

    expect(result.current.places).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- useSavedPlaces`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement**

```ts
// src/features/places/useSavedPlaces.ts
import { useCallback, useState } from 'react';
import type { Coordinates, SavedPlace } from '../../types';

const STORAGE_KEY = 'routewise-saved-places';

function readStoredPlaces(): SavedPlace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedPlace[]) : [];
  } catch {
    return [];
  }
}

function persist(places: SavedPlace[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  } catch {
    // Sem persistência disponível — os locais salvos ficam só na sessão atual.
  }
}

export function useSavedPlaces() {
  const [places, setPlaces] = useState<SavedPlace[]>(readStoredPlaces);

  const savePlace = useCallback((label: string, coordinates: Coordinates) => {
    setPlaces((current) => {
      const next = [...current, { id: crypto.randomUUID(), label, coordinates }];
      persist(next);
      return next;
    });
  }, []);

  const removePlace = useCallback((id: string) => {
    setPlaces((current) => {
      const next = current.filter((place) => place.id !== id);
      persist(next);
      return next;
    });
  }, []);

  return { places, savePlace, removePlace };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- useSavedPlaces`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/features/places/useSavedPlaces.ts src/features/places/useSavedPlaces.test.ts
git commit -m "feat: add localStorage-backed saved places hook"
```

---

## Task 8: Driving-mode camera and day/night map style in `useMapboxMap`

**Files:**
- Modify: `src/features/map/useMapboxMap.ts`
- Test: `src/features/map/useMapboxMap.test.ts`

**Interfaces:**
- Consumes: `Theme` shape from Task 6 (just the string `'light' | 'dark'`, hook itself not imported here — `MapView`, wired in Task 17/19, passes the value down).
- Produces: `useMapboxMap` options gain `isNavigating: boolean`, `headingDegrees: number | null`, `theme: 'light' | 'dark'`. Consumed by `MapView` (modified in this task) and `NavigationView` (Task 17).

- [ ] **Step 1: Write the failing tests**

Add to `src/features/map/useMapboxMap.test.ts` (extend the existing `FakeMap` class in the `vi.mock('mapbox-gl', ...)` block with `setStyle = vi.fn()`, `easeTo = vi.fn()`, and `getBearing = vi.fn().mockReturnValue(0)`; the hook already returns `mapRef`, so tests read spy calls off `result.current.current`):

```ts
  it('chama easeTo com pitch e bearing ao entrar em modo navegação', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result, rerender } = renderHook(
      (props: { isNavigating: boolean; headingDegrees: number | null }) =>
        useMapboxMap({
          containerRef,
          origin: { lat: -23.5505, lng: -46.6333 },
          destination: null,
          route: null,
          theme: 'light',
          ...props,
        }),
      { initialProps: { isNavigating: false, headingDegrees: null } },
    );

    rerender({ isNavigating: true, headingDegrees: 120 });

    expect(result.current.current?.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 60, bearing: 120, zoom: 17 }),
    );
  });

  it('nivela a câmera (pitch/bearing 0) ao sair do modo navegação', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result, rerender } = renderHook(
      (props: { isNavigating: boolean }) =>
        useMapboxMap({
          containerRef,
          origin: { lat: -23.5505, lng: -46.6333 },
          destination: null,
          route: null,
          theme: 'light',
          headingDegrees: null,
          ...props,
        }),
      { initialProps: { isNavigating: true } },
    );

    rerender({ isNavigating: false });

    expect(result.current.current?.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 0, bearing: 0 }),
    );
  });

  it('troca o estilo do mapa quando o tema muda', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result, rerender } = renderHook(
      (props: { theme: 'light' | 'dark' }) =>
        useMapboxMap({
          containerRef,
          origin: null,
          destination: null,
          route: null,
          isNavigating: false,
          headingDegrees: null,
          ...props,
        }),
      { initialProps: { theme: 'light' as const } },
    );

    rerender({ theme: 'dark' });

    expect(result.current.current?.setStyle).toHaveBeenCalledWith(
      'mapbox://styles/mapbox/navigation-night-v1',
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- useMapboxMap`
Expected: FAIL — `useMapboxMap` doesn't accept `isNavigating`/`headingDegrees`/`theme` yet, and `easeTo`/`setStyle` are never called.

- [ ] **Step 3: Implement**

In `src/features/map/useMapboxMap.ts`, add the map style constants and extend the options interface:

```ts
const DAY_STYLE = 'mapbox://styles/mapbox/navigation-day-v1';
const NIGHT_STYLE = 'mapbox://styles/mapbox/navigation-night-v1';

interface UseMapboxMapOptions {
  containerRef: RefObject<HTMLDivElement>;
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  isNavigating: boolean;
  headingDegrees: number | null;
  theme: 'light' | 'dark';
}
```

Update the map-creation effect to use the theme-appropriate style, and change `[containerRef]` deps to also reference `theme` for the initial pick (theme changes after creation are handled by the new effect below, so the dependency array stays `[containerRef]` — only the initial `style:` value needs the current theme, read once):

```ts
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: theme === 'dark' ? NIGHT_STYLE : DAY_STYLE,
      center: [-46.6333, -23.5505],
      zoom: 12,
    });
```

Add a new effect for theme changes after the map exists:

```ts
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    map.setStyle(theme === 'dark' ? NIGHT_STYLE : DAY_STYLE);
  }, [theme]);
```

The existing origin-marker effect (the one that calls `map.setCenter([origin.lng, origin.lat])` on every origin change) must stop doing that while navigating, or it will fight the new `easeTo` camera below (an instant snap racing an animated move on every GPS tick). Guard that one line:

```ts
    if (!isNavigating) {
      map.setCenter([origin.lng, origin.lat]);
    }
```

(Leave the marker creation/update lines in that same effect untouched — only the trailing `setCenter` call gets the guard. This means the effect now also depends on `isNavigating`; add it to that effect's dependency array.)

Add a new effect for driving-mode camera behavior:

```ts
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) {
      return;
    }

    if (isNavigating) {
      map.easeTo({
        center: [origin.lng, origin.lat],
        zoom: 17,
        pitch: 60,
        bearing: headingDegrees ?? map.getBearing(),
        duration: 500,
      });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    }
  }, [origin, isNavigating, headingDegrees]);
```

- [ ] **Step 4: Update `MapView` to pass the new required props**

In `src/components/MapView.tsx`:

```tsx
interface MapViewProps {
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  isNavigating: boolean;
  headingDegrees: number | null;
  theme: 'light' | 'dark';
}

export function MapView({
  origin,
  destination,
  route,
  isNavigating,
  headingDegrees,
  theme,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useMapboxMap({ containerRef, origin, destination, route, isNavigating, headingDegrees, theme });

  return <div ref={containerRef} data-testid="map-view" className="h-full w-full" />;
}
```

- [ ] **Step 5: Fix the existing `useMapboxMap.test.ts` first test and `App.test.tsx`'s `FakeMap`**

The existing test in `useMapboxMap.test.ts` and every `FakeMap` mock (`useMapboxMap.test.ts`, `App.test.tsx`) need `setStyle = vi.fn()`, `easeTo = vi.fn()`, and `getBearing = vi.fn().mockReturnValue(0)` added to the `FakeMap` class, and every `useMapboxMap(...)` / `<MapView .../>` call site in tests needs the three new required props (e.g. `isNavigating: false, headingDegrees: null, theme: 'light' as const`).

- [ ] **Step 6: Run full suite and build**

Run: `npm run test && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/map/useMapboxMap.ts src/features/map/useMapboxMap.test.ts src/components/MapView.tsx src/App.test.tsx
git commit -m "feat: driving-mode camera and day/night navigation map styles"
```

---

## Task 9: `TravelModeToggle` component

**Files:**
- Create: `src/components/TravelModeToggle.tsx`
- Test: `src/components/TravelModeToggle.test.tsx`

**Interfaces:**
- Consumes: `TravelProfile` (existing type).
- Produces: `<TravelModeToggle profile={TravelProfile} onChange={(profile: TravelProfile) => void} />`. Consumed by Task 10 (`DestinationCard`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/TravelModeToggle.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TravelModeToggle } from './TravelModeToggle';

describe('TravelModeToggle', () => {
  it('destaca o modo atualmente selecionado', () => {
    render(<TravelModeToggle profile="walking" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'A pé' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Carro' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('chama onChange com o novo modo ao clicar', () => {
    const onChange = vi.fn();
    render(<TravelModeToggle profile="driving" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bicicleta' }));

    expect(onChange).toHaveBeenCalledWith('cycling');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- TravelModeToggle`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/TravelModeToggle.tsx
import { Car, Footprints, Bike } from 'lucide-react';
import type { TravelProfile } from '../types';

interface TravelModeToggleProps {
  profile: TravelProfile;
  onChange: (profile: TravelProfile) => void;
}

const MODES: { profile: TravelProfile; label: string; Icon: typeof Car }[] = [
  { profile: 'driving', label: 'Carro', Icon: Car },
  { profile: 'walking', label: 'A pé', Icon: Footprints },
  { profile: 'cycling', label: 'Bicicleta', Icon: Bike },
];

export function TravelModeToggle({ profile, onChange }: TravelModeToggleProps) {
  return (
    <div className="flex gap-2" role="group" aria-label="Modo de transporte">
      {MODES.map(({ profile: modeProfile, label, Icon }) => {
        const isSelected = modeProfile === profile;
        return (
          <button
            key={modeProfile}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(modeProfile)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface text-muted hover:bg-primary/10'
            }`}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- TravelModeToggle`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/TravelModeToggle.tsx src/components/TravelModeToggle.test.tsx
git commit -m "feat: add travel mode toggle component"
```

---

## Task 10: `DestinationCard` component

**Files:**
- Create: `src/components/DestinationCard.tsx`
- Test: `src/components/DestinationCard.test.tsx`

**Interfaces:**
- Consumes: `TravelModeToggle` (Task 9), `formatDistance`/`formatDuration` (existing `utils/format.ts`), `SavedPlace`/`Coordinates`/`TravelProfile` types.
- Produces: `<DestinationCard placeName distanceMeters durationSeconds travelProfile onTravelProfileChange onSave onShare onStartNavigation isSaved />`. Consumed by Task 12 (`PlanningView`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/DestinationCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DestinationCard } from './DestinationCard';

const baseProps = {
  placeName: 'Av. Paulista, São Paulo',
  distanceMeters: 5000,
  durationSeconds: 600,
  travelProfile: 'driving' as const,
  onTravelProfileChange: vi.fn(),
  onSave: vi.fn(),
  onShare: vi.fn(),
  onStartNavigation: vi.fn(),
  isSaved: false,
};

describe('DestinationCard', () => {
  it('mostra nome, distância e ETA reais, sem nota nem telefone', () => {
    render(<DestinationCard {...baseProps} />);

    expect(screen.getByText('Av. Paulista, São Paulo')).toBeInTheDocument();
    expect(screen.getByText('5.0 km')).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ligar' })).not.toBeInTheDocument();
  });

  it('chama onStartNavigation ao clicar em Iniciar navegação', () => {
    const onStartNavigation = vi.fn();
    render(<DestinationCard {...baseProps} onStartNavigation={onStartNavigation} />);

    fireEvent.click(screen.getByText('Iniciar navegação'));

    expect(onStartNavigation).toHaveBeenCalled();
  });

  it('chama onSave ao clicar em Salvar', () => {
    const onSave = vi.fn();
    render(<DestinationCard {...baseProps} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalled();
  });

  it('chama onTravelProfileChange ao trocar o modo de transporte', () => {
    const onTravelProfileChange = vi.fn();
    render(<DestinationCard {...baseProps} onTravelProfileChange={onTravelProfileChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'A pé' }));

    expect(onTravelProfileChange).toHaveBeenCalledWith('walking');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- DestinationCard`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/DestinationCard.tsx
import { Bookmark, Share2 } from 'lucide-react';
import { TravelModeToggle } from './TravelModeToggle';
import { formatDistance, formatDuration } from '../utils/format';
import type { TravelProfile } from '../types';

interface DestinationCardProps {
  placeName: string;
  distanceMeters: number;
  durationSeconds: number;
  travelProfile: TravelProfile;
  onTravelProfileChange: (profile: TravelProfile) => void;
  onSave: () => void;
  onShare: () => void;
  onStartNavigation: () => void;
  isSaved: boolean;
}

export function DestinationCard({
  placeName,
  distanceMeters,
  durationSeconds,
  travelProfile,
  onTravelProfileChange,
  onSave,
  onShare,
  onStartNavigation,
  isSaved,
}: DestinationCardProps) {
  return (
    <div className="space-y-4 rounded-2xl bg-surface p-4 text-surface-foreground shadow-lg">
      <div>
        <h2 className="text-lg font-bold">{placeName}</h2>
        <p className="text-sm text-muted">
          {formatDistance(distanceMeters)} · {formatDuration(durationSeconds)}
        </p>
      </div>

      <TravelModeToggle profile={travelProfile} onChange={onTravelProfileChange} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary/10 py-2 text-sm font-medium text-primary"
        >
          <Bookmark size={16} aria-hidden="true" />
          {isSaved ? 'Salvo' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onShare}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary/10 py-2 text-sm font-medium text-primary"
        >
          <Share2 size={16} aria-hidden="true" />
          Compartilhar
        </button>
      </div>

      <button
        type="button"
        onClick={onStartNavigation}
        className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground"
      >
        Iniciar navegação
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- DestinationCard`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/DestinationCard.tsx src/components/DestinationCard.test.tsx
git commit -m "feat: add destination card with real-data-only fields"
```

---

## Task 11: `SavedPlacesShortcuts` component

**Files:**
- Create: `src/components/SavedPlacesShortcuts.tsx`
- Test: `src/components/SavedPlacesShortcuts.test.tsx`

**Interfaces:**
- Consumes: `SavedPlace` type (Task 7).
- Produces: `<SavedPlacesShortcuts places={SavedPlace[]} onSelect={(place: SavedPlace) => void} onAddNew={() => void} />`. Consumed by Task 12 (`PlanningView`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/SavedPlacesShortcuts.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavedPlacesShortcuts } from './SavedPlacesShortcuts';

describe('SavedPlacesShortcuts', () => {
  it('sempre mostra o atalho de Novo', () => {
    render(<SavedPlacesShortcuts places={[]} onSelect={vi.fn()} onAddNew={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Novo/ })).toBeInTheDocument();
  });

  it('lista os locais salvos e chama onSelect ao clicar', () => {
    const onSelect = vi.fn();
    const place = { id: '1', label: 'Casa', coordinates: { lat: -23.55, lng: -46.63 } };
    render(<SavedPlacesShortcuts places={[place]} onSelect={onSelect} onAddNew={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Casa' }));

    expect(onSelect).toHaveBeenCalledWith(place);
  });

  it('chama onAddNew ao clicar em Novo', () => {
    const onAddNew = vi.fn();
    render(<SavedPlacesShortcuts places={[]} onSelect={vi.fn()} onAddNew={onAddNew} />);

    fireEvent.click(screen.getByRole('button', { name: /Novo/ }));

    expect(onAddNew).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- SavedPlacesShortcuts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/SavedPlacesShortcuts.tsx
import { Home, Briefcase, Plus, MapPin } from 'lucide-react';
import type { SavedPlace } from '../types';

interface SavedPlacesShortcutsProps {
  places: SavedPlace[];
  onSelect: (place: SavedPlace) => void;
  onAddNew: () => void;
}

function iconForLabel(label: string) {
  if (label === 'Casa') return Home;
  if (label === 'Trabalho') return Briefcase;
  return MapPin;
}

export function SavedPlacesShortcuts({ places, onSelect, onAddNew }: SavedPlacesShortcutsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {places.map((place) => {
        const Icon = iconForLabel(place.label);
        return (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelect(place)}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-surface px-4 py-2 text-sm font-medium text-surface-foreground shadow"
          >
            <Icon size={16} aria-hidden="true" />
            {place.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAddNew}
        className="flex shrink-0 items-center gap-2 rounded-xl bg-surface px-4 py-2 text-sm font-medium text-primary shadow"
      >
        <Plus size={16} aria-hidden="true" />
        Novo
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- SavedPlacesShortcuts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/SavedPlacesShortcuts.tsx src/components/SavedPlacesShortcuts.test.tsx
git commit -m "feat: add saved places shortcut row"
```

---

## Task 12: `PlanningView` composition

**Files:**
- Create: `src/components/PlanningView.tsx`
- Test: `src/components/PlanningView.test.tsx`

**Interfaces:**
- Consumes: `SearchBar` (existing), `SavedPlacesShortcuts` (Task 11), `DestinationCard` (Task 10), `ErrorBanner` (existing), `MapView` (Task 8), `useSavedPlaces` (Task 7), `NavigationState`/`GeocodingSuggestion`/`TravelProfile` types.
- Produces: `<PlanningView state={NavigationState} routeError={string|null} isRouteLoading={boolean} onDestinationSelected onTravelProfileChange onStartNavigation onRetryRoute theme headingDegrees />`. Consumed by Task 19 (`App.tsx` rewire).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/PlanningView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanningView } from './PlanningView';
import { initialNavigationState } from '../features/routing/navigationReducer';
import type { NavigationState } from '../types';

vi.mock('mapbox-gl', () => {
  class FakeMap {
    isStyleLoaded = () => true;
    on = vi.fn();
    once = vi.fn();
    remove = vi.fn();
    setCenter = vi.fn();
    setStyle = vi.fn();
    easeTo = vi.fn();
    getBearing = vi.fn().mockReturnValue(0);
    getSource = vi.fn().mockReturnValue(undefined);
    addSource = vi.fn();
    addLayer = vi.fn();
    getLayer = vi.fn().mockReturnValue(undefined);
    removeLayer = vi.fn();
    removeSource = vi.fn();
    fitBounds = vi.fn();
  }
  class FakeMarker {
    setLngLat = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
  }
  class FakeLngLatBounds {
    extend = vi.fn().mockReturnThis();
    constructor(public sw?: unknown, public ne?: unknown) {}
  }
  return {
    default: { Map: FakeMap, Marker: FakeMarker, LngLatBounds: FakeLngLatBounds, accessToken: '' },
  };
});

describe('PlanningView', () => {
  it('mostra o cartão de destino quando uma rota já foi planejada', () => {
    const state: NavigationState = {
      ...initialNavigationState,
      destination: { lat: -23.56, lng: -46.65 },
      status: 'routePlanned',
      route: {
        geometry: [],
        steps: [],
        distanceMeters: 5000,
        durationSeconds: 600,
      },
    };

    render(
      <PlanningView
        state={state}
        placeName="Av. Paulista, São Paulo"
        routeError={null}
        isRouteLoading={false}
        onDestinationSelected={vi.fn()}
        onTravelProfileChange={vi.fn()}
        onStartNavigation={vi.fn()}
        onRetryRoute={vi.fn()}
        theme="light"
        headingDegrees={null}
      />,
    );

    expect(screen.getByText('Av. Paulista, São Paulo')).toBeInTheDocument();
    expect(screen.getByText('Iniciar navegação')).toBeInTheDocument();
  });

  it('chama onStartNavigation ao clicar em iniciar', () => {
    const onStartNavigation = vi.fn();
    const state: NavigationState = {
      ...initialNavigationState,
      destination: { lat: -23.56, lng: -46.65 },
      status: 'routePlanned',
      route: { geometry: [], steps: [], distanceMeters: 5000, durationSeconds: 600 },
    };

    render(
      <PlanningView
        state={state}
        placeName="Av. Paulista, São Paulo"
        routeError={null}
        isRouteLoading={false}
        onDestinationSelected={vi.fn()}
        onTravelProfileChange={vi.fn()}
        onStartNavigation={onStartNavigation}
        onRetryRoute={vi.fn()}
        theme="light"
        headingDegrees={null}
      />,
    );

    fireEvent.click(screen.getByText('Iniciar navegação'));

    expect(onStartNavigation).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- PlanningView`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/PlanningView.tsx
import { MapView } from './MapView';
import { SearchBar } from './SearchBar';
import { SavedPlacesShortcuts } from './SavedPlacesShortcuts';
import { DestinationCard } from './DestinationCard';
import { ErrorBanner } from './ErrorBanner';
import { useSavedPlaces } from '../features/places/useSavedPlaces';
import { hasMapboxToken } from '../services/mapboxClient';
import type { GeocodingSuggestion, NavigationState, TravelProfile } from '../types';

interface PlanningViewProps {
  state: NavigationState;
  placeName: string | null;
  routeError: string | null;
  isRouteLoading: boolean;
  onDestinationSelected: (suggestion: GeocodingSuggestion) => void;
  onTravelProfileChange: (profile: TravelProfile) => void;
  onStartNavigation: () => void;
  onRetryRoute: () => void;
  theme: 'light' | 'dark';
  headingDegrees: number | null;
}

export function PlanningView({
  state,
  placeName,
  routeError,
  isRouteLoading,
  onDestinationSelected,
  onTravelProfileChange,
  onStartNavigation,
  onRetryRoute,
  theme,
  headingDegrees,
}: PlanningViewProps) {
  const { places, savePlace } = useSavedPlaces();

  const isPlaceSaved =
    state.destination !== null &&
    places.some(
      (place) =>
        place.coordinates.lat === state.destination?.lat &&
        place.coordinates.lng === state.destination?.lng,
    );

  const handleSave = () => {
    if (state.destination && placeName) {
      savePlace(placeName, state.destination);
    }
  };

  const handleShare = () => {
    if (!state.destination) {
      return;
    }
    const url = `https://www.google.com/maps?q=${state.destination.lat},${state.destination.lng}`;
    if (navigator.share) {
      void navigator.share({ title: placeName ?? 'Destino', url });
    } else if (navigator.clipboard) {
      void navigator.clipboard.writeText(url);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="z-10 space-y-3 bg-surface p-4 shadow">
        {!hasMapboxToken() && (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            Token do Mapbox não configurado. Defina <code>VITE_MAPBOX_TOKEN</code> no arquivo{' '}
            <code>.env</code> para habilitar busca, mapa e rotas.
          </p>
        )}
        <SearchBar onSelect={onDestinationSelected} />
        {state.status === 'idle' && (
          <SavedPlacesShortcuts
            places={places}
            onSelect={(place) =>
              onDestinationSelected({
                id: place.id,
                placeName: place.label,
                coordinates: place.coordinates,
              })
            }
            onAddNew={() => {
              /* Foca a busca acima; sem passo adicional necessário nesta versão. */
            }}
          />
        )}
        {routeError && <ErrorBanner message={routeError} onRetry={onRetryRoute} />}
        {isRouteLoading && <p className="text-sm text-muted">Calculando rota...</p>}
      </header>

      <div className="relative flex-1">
        <MapView
          origin={state.origin}
          destination={state.destination}
          route={state.route}
          isNavigating={false}
          headingDegrees={headingDegrees}
          theme={theme}
        />
      </div>

      {state.status === 'routePlanned' && state.route && placeName && (
        <div className="border-t border-surface-foreground/10 bg-surface p-4">
          <DestinationCard
            placeName={placeName}
            distanceMeters={state.route.distanceMeters}
            durationSeconds={state.route.durationSeconds}
            travelProfile={state.travelProfile}
            onTravelProfileChange={onTravelProfileChange}
            onSave={handleSave}
            onShare={handleShare}
            onStartNavigation={onStartNavigation}
            isSaved={isPlaceSaved}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- PlanningView`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/PlanningView.tsx src/components/PlanningView.test.tsx
git commit -m "feat: compose PlanningView from search, saved places, and destination card"
```

---

## Task 13: `ManeuverBanner` component

**Files:**
- Create: `src/components/ManeuverBanner.tsx`
- Test: `src/components/ManeuverBanner.test.tsx`

**Interfaces:**
- Consumes: `getManeuverIcon` (Task 4), `formatDistance` (existing), `RouteStep` type.
- Produces: `<ManeuverBanner step={RouteStep} />`. Consumed by Task 17 (`NavigationView`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ManeuverBanner.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManeuverBanner } from './ManeuverBanner';

describe('ManeuverBanner', () => {
  it('mostra a instrução e a distância do passo atual', () => {
    render(
      <ManeuverBanner
        step={{
          instruction: 'Vire à direita na Rua Augusta',
          distanceMeters: 250,
          durationSeconds: 30,
          maneuverLocation: { lat: 0, lng: 0 },
          maneuverType: 'turn',
          maneuverModifier: 'right',
        }}
      />,
    );

    expect(screen.getByText('Vire à direita na Rua Augusta')).toBeInTheDocument();
    expect(screen.getByText('250 m')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ManeuverBanner`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/ManeuverBanner.tsx
import { getManeuverIcon } from '../utils/maneuverIcon';
import { formatDistance } from '../utils/format';
import type { RouteStep } from '../types';

interface ManeuverBannerProps {
  step: RouteStep;
}

export function ManeuverBanner({ step }: ManeuverBannerProps) {
  const Icon = getManeuverIcon(step.maneuverType, step.maneuverModifier);

  return (
    <div className="flex items-center gap-4 bg-surface-foreground px-4 py-3 text-surface shadow-lg">
      <Icon size={40} aria-hidden="true" />
      <div>
        <p className="text-lg font-semibold">{step.instruction}</p>
        <p className="text-sm opacity-80">{formatDistance(step.distanceMeters)}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- ManeuverBanner`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ManeuverBanner.tsx src/components/ManeuverBanner.test.tsx
git commit -m "feat: add maneuver banner for turn-by-turn navigation"
```

---

## Task 14: `useVoiceGuidance` hook

**Files:**
- Create: `src/features/voice/useVoiceGuidance.ts`
- Test: `src/features/voice/useVoiceGuidance.test.ts`

**Interfaces:**
- Produces: `useVoiceGuidance(instruction: string | null, options: { enabled: boolean }): { isSupported: boolean; isMuted: boolean; toggleMute: () => void }`. Speaks `instruction` whenever it changes and `enabled && !isMuted && isSupported`. Consumed by Task 17 (`NavigationView`).

- [ ] **Step 1: Write the failing test**

```ts
// src/features/voice/useVoiceGuidance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceGuidance } from './useVoiceGuidance';

describe('useVoiceGuidance', () => {
  const speakMock = vi.fn();

  beforeEach(() => {
    speakMock.mockClear();
    vi.stubGlobal('speechSynthesis', { speak: speakMock, cancel: vi.fn() });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation((text: string) => ({ text, lang: '' })),
    );
  });

  it('reporta suporte quando speechSynthesis existe', () => {
    const { result } = renderHook(() => useVoiceGuidance(null, { enabled: true }));
    expect(result.current.isSupported).toBe(true);
  });

  it('fala a instrução quando ela muda e não está mudo', () => {
    const { rerender } = renderHook(
      ({ instruction }: { instruction: string | null }) =>
        useVoiceGuidance(instruction, { enabled: true }),
      { initialProps: { instruction: null as string | null } },
    );

    rerender({ instruction: 'Vire à direita na Rua Augusta' });

    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  it('não fala quando está mudo', () => {
    const { result, rerender } = renderHook(
      ({ instruction }: { instruction: string | null }) =>
        useVoiceGuidance(instruction, { enabled: true }),
      { initialProps: { instruction: null as string | null } },
    );

    act(() => {
      result.current.toggleMute();
    });
    rerender({ instruction: 'Vire à direita' });

    expect(speakMock).not.toHaveBeenCalled();
  });

  it('não fala quando enabled é false', () => {
    const { rerender } = renderHook(
      ({ instruction }: { instruction: string | null }) =>
        useVoiceGuidance(instruction, { enabled: false }),
      { initialProps: { instruction: null as string | null } },
    );

    rerender({ instruction: 'Vire à direita' });

    expect(speakMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- useVoiceGuidance`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/features/voice/useVoiceGuidance.ts
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'routewise-voice-muted';

function readInitialMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useVoiceGuidance(
  instruction: string | null,
  options: { enabled: boolean },
): { isSupported: boolean; isMuted: boolean; toggleMute: () => void } {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [isMuted, setIsMuted] = useState(readInitialMuted);
  const lastSpokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupported || !options.enabled || isMuted || !instruction) {
      return;
    }
    if (lastSpokenRef.current === instruction) {
      return;
    }
    lastSpokenRef.current = instruction;

    const utterance = new SpeechSynthesisUtterance(instruction);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.speak(utterance);
  }, [instruction, options.enabled, isMuted, isSupported]);

  const toggleMute = useCallback(() => {
    setIsMuted((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Sem persistência disponível — a preferência de mudo vale só pra sessão atual.
      }
      return next;
    });
  }, []);

  return { isSupported, isMuted, toggleMute };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- useVoiceGuidance`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/voice/useVoiceGuidance.ts src/features/voice/useVoiceGuidance.test.ts
git commit -m "feat: add Web Speech API voice guidance hook"
```

---

## Task 15: `NavigationStatusBar` component

**Files:**
- Create: `src/components/NavigationStatusBar.tsx`
- Test: `src/components/NavigationStatusBar.test.tsx`

**Interfaces:**
- Consumes: `formatDistance`/`formatDuration` (existing).
- Produces: `<NavigationStatusBar durationSeconds distanceMeters speedMetersPerSecond isVoiceSupported isVoiceMuted onToggleVoice onExit />`. Consumed by Task 17 (`NavigationView`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/NavigationStatusBar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavigationStatusBar } from './NavigationStatusBar';

describe('NavigationStatusBar', () => {
  it('mostra tempo restante e distância', () => {
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        speedMetersPerSecond={12}
        isVoiceSupported
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByText('13 min')).toBeInTheDocument();
    expect(screen.getByText('6.3 km')).toBeInTheDocument();
    expect(screen.getByText('43 km/h')).toBeInTheDocument();
  });

  it('não mostra velocidade quando indisponível', () => {
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        speedMetersPerSecond={null}
        isVoiceSupported
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByText(/km\/h/)).not.toBeInTheDocument();
  });

  it('chama onExit ao clicar em sair', () => {
    const onExit = vi.fn();
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        speedMetersPerSecond={null}
        isVoiceSupported
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={onExit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sair da navegação' }));

    expect(onExit).toHaveBeenCalled();
  });

  it('não mostra o botão de voz quando não suportado', () => {
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        speedMetersPerSecond={null}
        isVoiceSupported={false}
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /voz/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- NavigationStatusBar`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/NavigationStatusBar.tsx
import { Volume2, VolumeX, X } from 'lucide-react';
import { formatDistance, formatDuration } from '../utils/format';

interface NavigationStatusBarProps {
  durationSeconds: number;
  distanceMeters: number;
  speedMetersPerSecond: number | null;
  isVoiceSupported: boolean;
  isVoiceMuted: boolean;
  onToggleVoice: () => void;
  onExit: () => void;
}

export function NavigationStatusBar({
  durationSeconds,
  distanceMeters,
  speedMetersPerSecond,
  isVoiceSupported,
  isVoiceMuted,
  onToggleVoice,
  onExit,
}: NavigationStatusBarProps) {
  const speedKmh =
    speedMetersPerSecond !== null ? Math.round(speedMetersPerSecond * 3.6) : null;

  return (
    <div className="flex items-center justify-between gap-4 bg-surface px-4 py-3 text-surface-foreground shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
      <div className="flex items-baseline gap-3">
        <span className="text-lg font-bold">{formatDuration(durationSeconds)}</span>
        <span className="text-sm text-muted">{formatDistance(distanceMeters)}</span>
        {speedKmh !== null && <span className="text-sm text-muted">{speedKmh} km/h</span>}
      </div>
      <div className="flex items-center gap-2">
        {isVoiceSupported && (
          <button
            type="button"
            onClick={onToggleVoice}
            aria-label={isVoiceMuted ? 'Ativar voz' : 'Silenciar voz'}
            className="rounded-full bg-primary/10 p-2 text-primary"
          >
            {isVoiceMuted ? (
              <VolumeX size={20} aria-hidden="true" />
            ) : (
              <Volume2 size={20} aria-hidden="true" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onExit}
          aria-label="Sair da navegação"
          className="rounded-full bg-danger/10 p-2 text-danger"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- NavigationStatusBar`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/NavigationStatusBar.tsx src/components/NavigationStatusBar.test.tsx
git commit -m "feat: add navigation status bar with ETA, speed, and voice controls"
```

---

## Task 16: `ArrivalScreen` component

**Files:**
- Create: `src/components/ArrivalScreen.tsx`
- Test: `src/components/ArrivalScreen.test.tsx`

**Interfaces:**
- Produces: `<ArrivalScreen placeName={string | null} onDone={() => void} />`. Consumed by Task 17 (`NavigationView`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ArrivalScreen.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArrivalScreen } from './ArrivalScreen';

describe('ArrivalScreen', () => {
  it('mostra o nome do destino e chama onDone ao concluir', () => {
    const onDone = vi.fn();
    render(<ArrivalScreen placeName="Av. Paulista, São Paulo" onDone={onDone} />);

    expect(screen.getByText('Você chegou!')).toBeInTheDocument();
    expect(screen.getByText('Av. Paulista, São Paulo')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Concluir'));

    expect(onDone).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ArrivalScreen`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/ArrivalScreen.tsx
import { PartyPopper } from 'lucide-react';

interface ArrivalScreenProps {
  placeName: string | null;
  onDone: () => void;
}

export function ArrivalScreen({ placeName, onDone }: ArrivalScreenProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface p-6 text-center text-surface-foreground">
      <PartyPopper size={48} className="text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Você chegou!</h1>
      {placeName && <p className="text-muted">{placeName}</p>}
      <button
        type="button"
        onClick={onDone}
        className="mt-4 rounded-xl bg-primary px-8 py-3 font-semibold text-primary-foreground"
      >
        Concluir
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- ArrivalScreen`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ArrivalScreen.tsx src/components/ArrivalScreen.test.tsx
git commit -m "feat: add arrival confirmation screen"
```

---

## Task 17: `NavigationView` composition

**Files:**
- Create: `src/components/NavigationView.tsx`
- Test: `src/components/NavigationView.test.tsx`

**Interfaces:**
- Consumes: `MapView` (Task 8), `ManeuverBanner` (Task 13), `NavigationStatusBar` (Task 15), `ArrivalScreen` (Task 16), `useVoiceGuidance` (Task 14), `NavigationState` type.
- Produces: `<NavigationView state={NavigationState} placeName speedMetersPerSecond headingDegrees theme isRecalculating onExit onArrivalDone />`. `isRecalculating` shows a non-blocking "Recalculando rota..." banner (spec §8/§9 — the recalculation must be visible, not silent). Consumed by Task 19 (`App.tsx` rewire).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/NavigationView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavigationView } from './NavigationView';
import { initialNavigationState } from '../features/routing/navigationReducer';
import type { NavigationState } from '../types';

vi.mock('mapbox-gl', () => {
  class FakeMap {
    isStyleLoaded = () => true;
    on = vi.fn();
    once = vi.fn();
    remove = vi.fn();
    setCenter = vi.fn();
    setStyle = vi.fn();
    easeTo = vi.fn();
    getBearing = vi.fn().mockReturnValue(0);
    getSource = vi.fn().mockReturnValue(undefined);
    addSource = vi.fn();
    addLayer = vi.fn();
    getLayer = vi.fn().mockReturnValue(undefined);
    removeLayer = vi.fn();
    removeSource = vi.fn();
    fitBounds = vi.fn();
  }
  class FakeMarker {
    setLngLat = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
  }
  class FakeLngLatBounds {
    extend = vi.fn().mockReturnThis();
    constructor(public sw?: unknown, public ne?: unknown) {}
  }
  return {
    default: { Map: FakeMap, Marker: FakeMarker, LngLatBounds: FakeLngLatBounds, accessToken: '' },
  };
});

vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() });
vi.stubGlobal(
  'SpeechSynthesisUtterance',
  vi.fn().mockImplementation((text: string) => ({ text, lang: '' })),
);

const navigatingState: NavigationState = {
  ...initialNavigationState,
  status: 'navigating',
  origin: { lat: -23.5505, lng: -46.6333 },
  destination: { lat: -23.56, lng: -46.65 },
  route: {
    geometry: [{ lat: -23.5505, lng: -46.6333 }],
    steps: [
      {
        instruction: 'Vire à direita na Rua Augusta',
        distanceMeters: 250,
        durationSeconds: 30,
        maneuverLocation: { lat: -23.5505, lng: -46.6333 },
        maneuverType: 'turn',
        maneuverModifier: 'right',
      },
    ],
    distanceMeters: 5000,
    durationSeconds: 600,
  },
  currentStepIndex: 0,
};

describe('NavigationView', () => {
  it('mostra o banner de manobra do passo atual', () => {
    render(
      <NavigationView
        state={navigatingState}
        placeName="Av. Paulista, São Paulo"
        speedMetersPerSecond={null}
        headingDegrees={null}
        theme="light"
        isRecalculating={false}
        onExit={vi.fn()}
        onArrivalDone={vi.fn()}
      />,
    );

    expect(screen.getByText('Vire à direita na Rua Augusta')).toBeInTheDocument();
  });

  it('mostra a tela de chegada quando o status é arrived', () => {
    render(
      <NavigationView
        state={{ ...navigatingState, status: 'arrived' }}
        placeName="Av. Paulista, São Paulo"
        speedMetersPerSecond={null}
        headingDegrees={null}
        theme="light"
        isRecalculating={false}
        onExit={vi.fn()}
        onArrivalDone={vi.fn()}
      />,
    );

    expect(screen.getByText('Você chegou!')).toBeInTheDocument();
  });

  it('mostra aviso não bloqueante quando está recalculando a rota', () => {
    render(
      <NavigationView
        state={navigatingState}
        placeName="Av. Paulista, São Paulo"
        speedMetersPerSecond={null}
        headingDegrees={null}
        theme="light"
        isRecalculating
        onExit={vi.fn()}
        onArrivalDone={vi.fn()}
      />,
    );

    expect(screen.getByText('Recalculando rota...')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- NavigationView`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/NavigationView.tsx
import { MapView } from './MapView';
import { ManeuverBanner } from './ManeuverBanner';
import { NavigationStatusBar } from './NavigationStatusBar';
import { ArrivalScreen } from './ArrivalScreen';
import { useVoiceGuidance } from '../features/voice/useVoiceGuidance';
import type { NavigationState } from '../types';

interface NavigationViewProps {
  state: NavigationState;
  placeName: string | null;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  theme: 'light' | 'dark';
  isRecalculating: boolean;
  onExit: () => void;
  onArrivalDone: () => void;
}

export function NavigationView({
  state,
  placeName,
  speedMetersPerSecond,
  headingDegrees,
  theme,
  isRecalculating,
  onExit,
  onArrivalDone,
}: NavigationViewProps) {
  const currentStep = state.route?.steps[state.currentStepIndex] ?? null;
  const voice = useVoiceGuidance(currentStep?.instruction ?? null, {
    enabled: state.status === 'navigating',
  });

  if (state.status === 'arrived') {
    return <ArrivalScreen placeName={placeName} onDone={onArrivalDone} />;
  }

  if (!state.route || !currentStep) {
    return null;
  }

  const remainingDistanceMeters = state.route.steps
    .slice(state.currentStepIndex)
    .reduce((total, step) => total + step.distanceMeters, 0);
  const remainingDurationSeconds =
    (remainingDistanceMeters / state.route.distanceMeters) * state.route.durationSeconds;

  return (
    <div className="relative flex h-screen flex-col">
      <ManeuverBanner step={currentStep} />
      {isRecalculating && (
        <p
          role="status"
          className="absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-full bg-surface px-4 py-2 text-sm font-medium text-surface-foreground shadow-lg"
        >
          Recalculando rota...
        </p>
      )}

      <div className="relative flex-1">
        <MapView
          origin={state.origin}
          destination={state.destination}
          route={state.route}
          isNavigating
          headingDegrees={headingDegrees}
          theme={theme}
        />
      </div>

      <NavigationStatusBar
        durationSeconds={remainingDurationSeconds}
        distanceMeters={remainingDistanceMeters}
        speedMetersPerSecond={speedMetersPerSecond}
        isVoiceSupported={voice.isSupported}
        isVoiceMuted={voice.isMuted}
        onToggleVoice={voice.toggleMute}
        onExit={onExit}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- NavigationView`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/NavigationView.tsx src/components/NavigationView.test.tsx
git commit -m "feat: compose full-screen NavigationView with maneuver banner and status bar"
```

---

## Task 18: Automatic reroute on deviation

**Files:**
- Modify: `src/features/routing/useRoute.ts`
- Test: `src/features/routing/useRoute.test.ts`

**Interfaces:**
- Consumes: `getDirections` (existing), `NavigationAction` (Task 3, `ROUTE_RECALCULATED`).
- Produces: `useRoute` return gains `recalculateRoute: (origin, destination, profile) => Promise<void>` — dispatches `ROUTE_RECALCULATED` instead of `ROUTE_PLANNED` on success. Consumed by Task 19 (`App.tsx` rewire, which watches `state.routeDeviated`).

- [ ] **Step 1: Write the failing test**

Read `src/features/routing/useRoute.test.ts` first to match its existing style, then add:

```ts
  it('recalculateRoute despacha ROUTE_RECALCULATED em vez de ROUTE_PLANNED', async () => {
    const dispatch = vi.fn();
    vi.spyOn(mapboxClient, 'getDirections').mockResolvedValue({
      geometry: [{ lat: 0, lng: 0 }],
      steps: [],
      distanceMeters: 100,
      durationSeconds: 10,
    });

    const { result } = renderHook(() => useRoute(dispatch));

    await act(async () => {
      await result.current.recalculateRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, 'driving');
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ROUTE_RECALCULATED' }),
    );
  });
```

(Match the imports/mocking already present in the file — it already mocks `mapboxClient.getDirections` via `vi.spyOn`, per the existing tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- useRoute`
Expected: FAIL — `recalculateRoute` doesn't exist on the hook's return value.

- [ ] **Step 3: Implement**

In `src/features/routing/useRoute.ts`, add a second callback alongside `planRoute`:

```ts
  const recalculateRoute = useCallback(
    async (origin: Coordinates, destination: Coordinates, profile: TravelProfile) => {
      setIsLoading(true);
      setError(null);
      try {
        const route = await getDirections(origin, destination, profile);
        dispatch({ type: 'ROUTE_RECALCULATED', route });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao recalcular a rota.');
      } finally {
        setIsLoading(false);
      }
    },
    [dispatch],
  );

  return { planRoute, recalculateRoute, isLoading, error };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- useRoute`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/routing/useRoute.ts src/features/routing/useRoute.test.ts
git commit -m "feat: add recalculateRoute for automatic reroute on deviation"
```

---

## Task 19: Rewire `App.tsx` to compose `PlanningView` / `NavigationView`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–18.
- Produces: the composed application — no further consumers within this plan.

- [ ] **Step 1: Update failing/adjusted tests first**

`App.test.tsx`'s existing assertions target the old single-layout markup (e.g. `screen.getByText('1 min')` for the route summary, `screen.getByText('Iniciar navegação')` inline in the header). With `PlanningView` now rendering the `DestinationCard` instead, update each existing test's assertions to match the new copy (`DestinationCard` shows `formatDuration`/`formatDistance` combined as `"1 min"` is no longer a standalone summary — check the actual rendered text: `DestinationCard` renders `{formatDistance} · {formatDuration}` in one `<p>`, so replace `screen.getByText('1 min')` with `screen.getByText(/1 min/)` or scope by container). Also add `vi.stubGlobal('speechSynthesis', ...)` and the `SpeechSynthesisUtterance` stub (Task 14 pattern) to `App.test.tsx`'s setup, since `NavigationView` now renders during the navigating flow tests if any are added.

Add one new integration test:

```tsx
  it('transiciona para a NavigationView em tela cheia ao iniciar a navegação', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);
    vi.spyOn(mapboxClient, 'getDirections').mockResolvedValue({
      geometry: [
        { lat: -23.5505, lng: -46.6333 },
        { lat: -23.5613, lng: -46.6564 },
      ],
      steps: [
        {
          instruction: 'Siga em frente',
          distanceMeters: 500,
          durationSeconds: 60,
          maneuverLocation: { lat: -23.5505, lng: -46.6333 },
          maneuverType: 'continue',
          maneuverModifier: null,
        },
      ],
      distanceMeters: 500,
      durationSeconds: 60,
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });
    const option = await screen.findByText('Av. Paulista, São Paulo');
    fireEvent.click(option);

    await screen.findByText('Iniciar navegação');
    fireEvent.click(screen.getByText('Iniciar navegação'));

    await waitFor(() => {
      expect(screen.getByText('Siga em frente')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Buscar destino')).not.toBeInTheDocument();
  });
```

(Add the `speechSynthesis`/`SpeechSynthesisUtterance` `vi.stubGlobal` calls near the top of the file, alongside the existing `vi.mock('mapbox-gl', ...)`.)

- [ ] **Step 2: Run tests to verify failures**

Run: `npm run test -- App`
Expected: FAIL on old assertions and the new test (component doesn't compose the two views yet).

- [ ] **Step 3: Implement**

Replace `src/App.tsx` entirely:

```tsx
import { useEffect, useReducer, useRef, useState } from 'react';
import { PlanningView } from './components/PlanningView';
import { NavigationView } from './components/NavigationView';
import { ErrorBanner } from './components/ErrorBanner';
import { useGeolocation } from './features/geolocation/useGeolocation';
import { useRoute } from './features/routing/useRoute';
import { useTheme } from './features/theme/useTheme';
import { navigationReducer, initialNavigationState } from './features/routing/navigationReducer';
import type { GeocodingSuggestion } from './types';

const DEVIATION_RECALC_DEBOUNCE_MS = 3000;

export function App() {
  const [state, dispatch] = useReducer(navigationReducer, initialNavigationState);
  const geolocation = useGeolocation();
  const { planRoute, recalculateRoute, isLoading: isRouteLoading, error: routeError } =
    useRoute(dispatch);
  const { theme } = useTheme();
  const [placeName, setPlaceName] = useState<string | null>(null);

  useEffect(() => {
    if (geolocation.position) {
      dispatch({ type: 'SET_ORIGIN', origin: geolocation.position });
    }
  }, [geolocation.position]);

  useEffect(() => {
    if (state.status === 'navigating' && geolocation.position) {
      dispatch({ type: 'POSITION_UPDATED', position: geolocation.position });
    }
  }, [geolocation.position, state.status]);

  const attemptedDestinationRef = useRef<typeof state.destination>(null);

  useEffect(() => {
    if (
      state.origin &&
      state.destination &&
      !state.route &&
      attemptedDestinationRef.current !== state.destination
    ) {
      attemptedDestinationRef.current = state.destination;
      void planRoute(state.origin, state.destination, state.travelProfile);
    }
  }, [state.origin, state.destination, state.route, state.travelProfile, planRoute]);

  const lastRecalcAtRef = useRef(0);

  useEffect(() => {
    if (!state.routeDeviated || !state.origin || !state.destination) {
      return;
    }
    const now = Date.now();
    if (now - lastRecalcAtRef.current < DEVIATION_RECALC_DEBOUNCE_MS) {
      return;
    }
    lastRecalcAtRef.current = now;
    void recalculateRoute(state.origin, state.destination, state.travelProfile);
  }, [state.routeDeviated, state.origin, state.destination, state.travelProfile, recalculateRoute]);

  const handleDestinationSelected = (suggestion: GeocodingSuggestion) => {
    setPlaceName(suggestion.placeName);
    dispatch({ type: 'SET_DESTINATION', destination: { ...suggestion.coordinates } });
  };

  const handleTravelProfileChange = (profile: (typeof state)['travelProfile']) => {
    dispatch({ type: 'SET_TRAVEL_PROFILE', profile });
    if (state.origin && state.destination) {
      void planRoute(state.origin, state.destination, profile);
    }
  };

  const handleStartNavigation = () => {
    dispatch({ type: 'START_NAVIGATION' });
  };

  const handleRetryRoute = () => {
    if (state.origin && state.destination) {
      void planRoute(state.origin, state.destination, state.travelProfile);
    }
  };

  const handleExitNavigation = () => {
    dispatch({ type: 'RESET' });
    setPlaceName(null);
  };

  if (geolocation.error) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <ErrorBanner message={geolocation.error} onRetry={geolocation.retry} />
      </div>
    );
  }

  if (state.status === 'navigating' || state.status === 'arrived') {
    return (
      <NavigationView
        state={state}
        placeName={placeName}
        speedMetersPerSecond={geolocation.speedMetersPerSecond}
        headingDegrees={geolocation.headingDegrees}
        theme={theme}
        isRecalculating={state.routeDeviated && isRouteLoading}
        onExit={handleExitNavigation}
        onArrivalDone={handleExitNavigation}
      />
    );
  }

  return (
    <PlanningView
      state={state}
      placeName={placeName}
      routeError={routeError}
      isRouteLoading={isRouteLoading}
      onDestinationSelected={handleDestinationSelected}
      onTravelProfileChange={handleTravelProfileChange}
      onStartNavigation={handleStartNavigation}
      onRetryRoute={handleRetryRoute}
      theme={theme}
      headingDegrees={geolocation.headingDegrees}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- App`
Expected: PASS

- [ ] **Step 5: Run full suite and build**

Run: `npm run lint && npm run test && npm run build`
Expected: PASS with no lint or type errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: compose App from PlanningView and NavigationView by navigation status"
```

---

## Task 20: README update and final verification pass

**Files:**
- Modify: `.worktrees/routewise-mvp/README.md`

- [ ] **Step 1: Update the Funcionalidades section**

In `README.md`, replace the `## Funcionalidades` bullet list with:

```markdown
## Funcionalidades

- Detecção automática da localização atual como ponto de partida
- Busca de destino com sugestões (autocomplete) e locais salvos (Casa/Trabalho/outros)
- Cálculo de rota com distância e tempo estimado, com seletor de modo de transporte (carro/a pé/bicicleta)
- Tela de navegação em tela cheia: câmera em modo condução (segue e gira com a direção do usuário), banner de manobra com seta e distância, velocidade atual
- Instruções por voz (Web Speech API) e recálculo automático de rota ao desviar do trajeto
- Modo escuro, com estilos de mapa dedicados para navegação diurna/noturna
- Interface responsiva construída com Tailwind CSS
```

- [ ] **Step 2: Update the Arquitetura section's folder structure**

Update the `src/` tree in the `## Arquitetura` section to reflect the new files added across Tasks 1–19 (components, `features/voice`, `features/places`, `features/theme`, `utils/maneuverIcon.ts`).

- [ ] **Step 3: Run the full verification suite**

Run: `npm run lint && npm run test && npm run build`
Expected: all PASS, matching the Global Constraints and confirming no regressions across the whole feature.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README for the Waze-style navigation experience"
```
