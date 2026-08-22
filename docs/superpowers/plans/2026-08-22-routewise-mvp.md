# Plano de Implementação — RouteWise (MVP)

> **Para quem for executar:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Construir e publicar o MVP do RouteWise — um app web de navegação GPS ao vivo (busca de destino com autocomplete, cálculo de rota, rastreamento de posição em tempo real, instruções passo a passo) — com estrutura, segurança, testes e governança de nível profissional, pronto para avaliação em processo seletivo até 25/08/2026.

**Arquitetura:** SPA client-side (sem backend) em React + TypeScript, usando Mapbox GL JS diretamente por trás de hooks customizados, com uma máquina de estados (`useReducer`) controlando o fluxo de navegação. Build com Vite, estilo com Tailwind CSS, testes com Vitest + React Testing Library, deploy estático na Vercel.

**Stack Tecnológica:** Vite, React 18, TypeScript (`strict`), Tailwind CSS, Mapbox GL JS, Mapbox Geocoding API, Mapbox Directions API, Vitest, @testing-library/react, ESLint (flat config) + Prettier, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-08-22-routewise-gps-design.md](../specs/2026-08-22-routewise-gps-design.md)

## Restrições Globais

- Todo texto voltado ao usuário e toda documentação (README, comentários de commit) devem estar em português.
- O token do Mapbox (`VITE_MAPBOX_TOKEN`) nunca pode ser commitado — sempre via variável de ambiente, com `.env` no `.gitignore` e `.env.example` versionado como referência.
- TypeScript em modo `strict`; nenhum `any` implícito.
- Origem é sempre a localização atual do usuário (nunca entrada manual) — conforme §4 do spec.
- Busca de destino só dispara chamada de API com 3+ caracteres — conforme §6 do spec.
- MVP entrega apenas o modo de transporte "carro" (`driving`); o código de rota/reducer já aceita um parâmetro `profile` para não exigir refatoração ao adicionar os outros modos depois — conforme §5 do spec.
- Cada tarefa deve terminar com o pipeline local passando: `npm run lint`, `npx tsc -b` e `npm run test`.

---

## Task 1: Bootstrap do Projeto

**Arquivos:**
- Criar: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx` (placeholder), `src/index.css`, `src/vite-env.d.ts`, `src/test/setup.ts`
- Criar: `.gitignore`, `.env.example`, `eslint.config.js`, `.prettierrc`, `LICENSE`

**Interfaces:**
- Produz: comandos `npm run dev`, `npm run build`, `npm run lint`, `npm run test`, `npm run format` funcionando
- Produz: variável de ambiente `VITE_MAPBOX_TOKEN` disponível via `import.meta.env.VITE_MAPBOX_TOKEN: string`

- [ ] **Passo 1: Criar `package.json`**

```json
{
  "name": "routewise",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "mapbox-gl": "^3.6.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.9.0",
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@types/geojson": "^7946.0.14",
    "@types/mapbox-gl": "^3.4.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "eslint": "^9.9.0",
    "eslint-plugin-react-hooks": "^4.6.2",
    "eslint-plugin-react-refresh": "^0.4.9",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.41",
    "prettier": "^3.3.3",
    "tailwindcss": "^3.4.9",
    "typescript": "^5.5.4",
    "typescript-eslint": "^8.0.0",
    "vite": "^5.4.1",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Passo 2: Criar `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    passWithNoTests: true,
  },
});
```

- [ ] **Passo 3: Criar `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Passo 4: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Passo 5: Criar `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Passo 6: Criar `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Passo 7: Criar `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Passo 8: Criar `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Passo 9: Criar `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Passo 10: Criar `index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RouteWise</title>
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Passo 11: Criar `src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Passo 12: Criar `src/App.tsx` (placeholder, será substituído na Tarefa 13)**

```tsx
export function App() {
  return <div className="p-4">RouteWise</div>;
}
```

- [ ] **Passo 13: Criar `.gitignore`**

```
node_modules
dist
.env
.env.local
*.log
.DS_Store
*.tsbuildinfo
```

- [ ] **Passo 14: Criar `.env.example`**

```
VITE_MAPBOX_TOKEN=coloque_aqui_seu_token_publico_do_mapbox
```

- [ ] **Passo 15: Criar `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { window: 'readonly', document: 'readonly', navigator: 'readonly' },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
```

- [ ] **Passo 16: Criar `.prettierrc`**

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Passo 17: Criar `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 Edilson Moraes

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Passo 18: Instalar dependências**

Rodar: `npm install`

- [ ] **Passo 19: Verificar que tudo funciona**

Rodar: `npm run lint && npx tsc -b && npm run test && npm run build`
Esperado: os quatro comandos terminam sem erro (o `test` não terá testes ainda, mas deve rodar sem falhar).

- [ ] **Passo 20: Commit**

```bash
git add .
git commit -m "chore: bootstrap do projeto com Vite, React, TypeScript e Tailwind"
```

---

## Task 2: Tipos Compartilhados e Utilitário de Distância

**Arquivos:**
- Criar: `src/types/index.ts`
- Criar: `src/utils/distance.ts`
- Teste: `src/utils/distance.test.ts`

**Interfaces:**
- Produz: `Coordinates`, `TravelProfile`, `GeocodingSuggestion`, `RouteStep`, `Route`, `NavigationStatus`, `NavigationState` (tipos usados por todas as tarefas seguintes)
- Produz: `haversineDistanceMeters(a: Coordinates, b: Coordinates): number`
- Produz: `findNearestPointIndex(point: Coordinates, line: Coordinates[]): number`

- [ ] **Passo 1: Criar `src/types/index.ts`**

```ts
export interface Coordinates {
  lat: number;
  lng: number;
}

export type TravelProfile = 'driving' | 'walking' | 'cycling';

export interface GeocodingSuggestion {
  id: string;
  placeName: string;
  coordinates: Coordinates;
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuverLocation: Coordinates;
}

export interface Route {
  geometry: Coordinates[];
  steps: RouteStep[];
  distanceMeters: number;
  durationSeconds: number;
}

export type NavigationStatus = 'idle' | 'routePlanned' | 'navigating';

export interface NavigationState {
  status: NavigationStatus;
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  currentStepIndex: number;
  travelProfile: TravelProfile;
}
```

- [ ] **Passo 2: Escrever o teste de `haversineDistanceMeters` (deve falhar)**

Criar `src/utils/distance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { haversineDistanceMeters, findNearestPointIndex } from './distance';

describe('haversineDistanceMeters', () => {
  it('retorna 0 para pontos idênticos', () => {
    const point = { lat: -23.5505, lng: -46.6333 };
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it('retorna aproximadamente a distância conhecida entre duas cidades', () => {
    const saoPaulo = { lat: -23.5505, lng: -46.6333 };
    const rioDeJaneiro = { lat: -22.9068, lng: -43.1729 };
    const distance = haversineDistanceMeters(saoPaulo, rioDeJaneiro);
    expect(distance).toBeGreaterThan(350000);
    expect(distance).toBeLessThan(365000);
  });
});

describe('findNearestPointIndex', () => {
  it('encontra o índice do ponto mais próximo em uma linha', () => {
    const line = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
    ];
    const point = { lat: 0.1, lng: 1.05 };
    expect(findNearestPointIndex(point, line)).toBe(1);
  });
});
```

- [ ] **Passo 3: Rodar o teste e confirmar que falha**

Rodar: `npx vitest run src/utils/distance.test.ts`
Esperado: FALHA — `distance.ts` ainda não existe.

- [ ] **Passo 4: Implementar `src/utils/distance.ts`**

```ts
import type { Coordinates } from '../types';

const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function findNearestPointIndex(point: Coordinates, line: Coordinates[]): number {
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  line.forEach((candidate, index) => {
    const distance = haversineDistanceMeters(point, candidate);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}
```

- [ ] **Passo 5: Rodar o teste e confirmar que passa**

Rodar: `npx vitest run src/utils/distance.test.ts`
Esperado: PASSA (4 testes)

- [ ] **Passo 6: Commit**

```bash
git add src/types/index.ts src/utils/distance.ts src/utils/distance.test.ts
git commit -m "feat: adiciona tipos compartilhados e utilitario de distancia"
```

---

## Task 3: Utilitário de Formatação

**Arquivos:**
- Criar: `src/utils/format.ts`
- Teste: `src/utils/format.test.ts`

**Interfaces:**
- Produz: `formatDistance(meters: number): string`
- Produz: `formatDuration(seconds: number): string`

- [ ] **Passo 1: Escrever o teste (deve falhar)**

Criar `src/utils/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatDistance, formatDuration } from './format';

describe('formatDistance', () => {
  it('formata distâncias abaixo de 1km em metros', () => {
    expect(formatDistance(850)).toBe('850 m');
  });

  it('formata distâncias de 1km ou mais em quilômetros com uma casa decimal', () => {
    expect(formatDistance(4230)).toBe('4.2 km');
  });
});

describe('formatDuration', () => {
  it('formata durações abaixo de 60 minutos em minutos', () => {
    expect(formatDuration(1500)).toBe('25 min');
  });

  it('formata durações de uma hora ou mais em horas e minutos', () => {
    expect(formatDuration(5400)).toBe('1h 30min');
  });
});
```

- [ ] **Passo 2: Rodar o teste e confirmar que falha**

Rodar: `npx vitest run src/utils/format.test.ts`
Esperado: FALHA — `format.ts` ainda não existe.

- [ ] **Passo 3: Implementar `src/utils/format.ts`**

```ts
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}min`;
}
```

- [ ] **Passo 4: Rodar o teste e confirmar que passa**

Rodar: `npx vitest run src/utils/format.test.ts`
Esperado: PASSA (4 testes)

- [ ] **Passo 5: Commit**

```bash
git add src/utils/format.ts src/utils/format.test.ts
git commit -m "feat: adiciona utilitario de formatacao de distancia e duracao"
```

---

## Task 4: Cliente Mapbox (Geocoding + Directions)

**Arquivos:**
- Criar: `src/services/mapboxClient.ts`
- Teste: `src/services/mapboxClient.test.ts`

**Interfaces:**
- Consome: `Coordinates`, `GeocodingSuggestion`, `Route`, `RouteStep`, `TravelProfile` de `src/types`
- Produz: `searchPlaces(query: string): Promise<GeocodingSuggestion[]>`
- Produz: `getDirections(origin: Coordinates, destination: Coordinates, profile: TravelProfile): Promise<Route>`
- Produz: `class MapboxRequestError extends Error`

- [ ] **Passo 1: Escrever os testes (devem falhar)**

Criar `src/services/mapboxClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchPlaces, getDirections, MapboxRequestError } from './mapboxClient';

describe('searchPlaces', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte features de geocoding em sugestões', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          { id: 'place.1', place_name: 'Av. Paulista, São Paulo', center: [-46.6333, -23.5505] },
        ],
      }),
    });

    const results = await searchPlaces('Paulista');

    expect(results).toEqual([
      { id: 'place.1', placeName: 'Av. Paulista, São Paulo', coordinates: { lng: -46.6333, lat: -23.5505 } },
    ]);
  });

  it('lança MapboxRequestError quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    await expect(searchPlaces('Paulista')).rejects.toThrow(MapboxRequestError);
  });
});

describe('getDirections', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte uma resposta de directions em uma Route', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: {
              coordinates: [
                [-46.6333, -23.5505],
                [-46.63, -23.55],
              ],
            },
            distance: 1200,
            duration: 300,
            legs: [
              {
                steps: [
                  {
                    maneuver: { instruction: 'Siga para o norte', location: [-46.6333, -23.5505] },
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

    expect(route.distanceMeters).toBe(1200);
    expect(route.steps).toHaveLength(1);
    expect(route.steps[0].instruction).toBe('Siga para o norte');
  });

  it('lança MapboxRequestError quando nenhuma rota é encontrada', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'NoRoute', routes: [] }),
    });

    await expect(
      getDirections({ lng: 0, lat: 0 }, { lng: 1, lat: 1 }, 'driving'),
    ).rejects.toThrow(MapboxRequestError);
  });
});
```

- [ ] **Passo 2: Rodar os testes e confirmar que falham**

Rodar: `npx vitest run src/services/mapboxClient.test.ts`
Esperado: FALHA — `mapboxClient.ts` ainda não existe.

- [ ] **Passo 3: Implementar `src/services/mapboxClient.ts`**

```ts
import type { Coordinates, GeocodingSuggestion, Route, RouteStep, TravelProfile } from '../types';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEOCODING_BASE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const DIRECTIONS_BASE_URL = 'https://api.mapbox.com/directions/v5/mapbox';

export class MapboxRequestError extends Error {}

interface GeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

interface GeocodingResponse {
  features: GeocodingFeature[];
}

export async function searchPlaces(query: string): Promise<GeocodingSuggestion[]> {
  const url = `${GEOCODING_BASE_URL}/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new MapboxRequestError(`Falha na busca de endereço: ${response.status}`);
  }

  const data = (await response.json()) as GeocodingResponse;

  return data.features.map((feature) => ({
    id: feature.id,
    placeName: feature.place_name,
    coordinates: { lng: feature.center[0], lat: feature.center[1] },
  }));
}

interface DirectionsManeuver {
  instruction: string;
  location: [number, number];
}

interface DirectionsStep {
  maneuver: DirectionsManeuver;
  distance: number;
  duration: number;
}

interface DirectionsLeg {
  steps: DirectionsStep[];
}

interface DirectionsRoute {
  geometry: { coordinates: [number, number][] };
  legs: DirectionsLeg[];
  distance: number;
  duration: number;
}

interface DirectionsResponse {
  routes: DirectionsRoute[];
  code: string;
}

export async function getDirections(
  origin: Coordinates,
  destination: Coordinates,
  profile: TravelProfile,
): Promise<Route> {
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${DIRECTIONS_BASE_URL}/${profile}/${coordinates}?geometries=geojson&steps=true&overview=full&access_token=${MAPBOX_TOKEN}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new MapboxRequestError(`Falha ao calcular rota: ${response.status}`);
  }

  const data = (await response.json()) as DirectionsResponse;

  if (data.code !== 'Ok' || data.routes.length === 0) {
    throw new MapboxRequestError('Nenhuma rota encontrada para este modo de transporte');
  }

  const mapboxRoute = data.routes[0];

  const steps: RouteStep[] = mapboxRoute.legs.flatMap((leg) =>
    leg.steps.map((step) => ({
      instruction: step.maneuver.instruction,
      distanceMeters: step.distance,
      durationSeconds: step.duration,
      maneuverLocation: { lng: step.maneuver.location[0], lat: step.maneuver.location[1] },
    })),
  );

  return {
    geometry: mapboxRoute.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })),
    steps,
    distanceMeters: mapboxRoute.distance,
    durationSeconds: mapboxRoute.duration,
  };
}
```

- [ ] **Passo 4: Rodar os testes e confirmar que passam**

Rodar: `npx vitest run src/services/mapboxClient.test.ts`
Esperado: PASSA (4 testes)

- [ ] **Passo 5: Commit**

```bash
git add src/services/mapboxClient.ts src/services/mapboxClient.test.ts
git commit -m "feat: adiciona cliente da API do Mapbox (geocoding e directions)"
```

---

## Task 5: Hook de Geolocalização

**Arquivos:**
- Criar: `src/features/geolocation/useGeolocation.ts`
- Teste: `src/features/geolocation/useGeolocation.test.ts`

**Interfaces:**
- Consome: `Coordinates` de `src/types`
- Produz: `useGeolocation(): { position: Coordinates | null; error: string | null; isLoading: boolean; retry: () => void }`

- [ ] **Passo 1: Escrever os testes (devem falhar)**

Criar `src/features/geolocation/useGeolocation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGeolocation } from './useGeolocation';

describe('useGeolocation', () => {
  beforeEach(() => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      },
      configurable: true,
    });
  });

  it('define a posição em caso de sucesso da geolocalização', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        success({
          coords: { latitude: -23.5505, longitude: -46.6333 },
        } as GeolocationPosition);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.position).toEqual({ lat: -23.5505, lng: -46.6333 });
    });
    expect(result.current.error).toBeNull();
  });

  it('define uma mensagem de erro quando a geolocalização falha', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, message: 'denied' } as GeolocationPositionError);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.position).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar os testes e confirmar que falham**

Rodar: `npx vitest run src/features/geolocation/useGeolocation.test.ts`
Esperado: FALHA — `useGeolocation.ts` ainda não existe.

- [ ] **Passo 3: Implementar `src/features/geolocation/useGeolocation.ts`**

```ts
import { useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../../types';

interface GeolocationState {
  position: Coordinates | null;
  error: string | null;
  isLoading: boolean;
}

export function useGeolocation(): GeolocationState & { retry: () => void } {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    isLoading: true,
  });
  const watchIdRef = useRef<number | null>(null);

  const startWatching = () => {
    if (!navigator.geolocation) {
      setState({
        position: null,
        error: 'Seu navegador não suporta geolocalização.',
        isLoading: false,
      });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (result) => {
        setState({
          position: { lat: result.coords.latitude, lng: result.coords.longitude },
          error: null,
          isLoading: false,
        });
      },
      () => {
        setState({
          position: null,
          error: 'Não foi possível acessar sua localização. Permita o acesso e tente novamente.',
          isLoading: false,
        });
      },
      { enableHighAccuracy: true },
    );
  };

  useEffect(() => {
    startWatching();
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, retry: startWatching };
}
```

- [ ] **Passo 4: Rodar os testes e confirmar que passam**

Rodar: `npx vitest run src/features/geolocation/useGeolocation.test.ts`
Esperado: PASSA (2 testes)

- [ ] **Passo 5: Commit**

```bash
git add src/features/geolocation
git commit -m "feat: adiciona hook de geolocalizacao"
```

---

## Task 6: Hook de Busca com Autocomplete

**Arquivos:**
- Criar: `src/features/search/useGeocodingSearch.ts`
- Teste: `src/features/search/useGeocodingSearch.test.ts`

**Interfaces:**
- Consome: `searchPlaces` de `src/services/mapboxClient`; `GeocodingSuggestion` de `src/types`
- Produz: `useGeocodingSearch(query: string): { suggestions: GeocodingSuggestion[]; isLoading: boolean; error: string | null }`

- [ ] **Passo 1: Escrever os testes (devem falhar)**

Criar `src/features/search/useGeocodingSearch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGeocodingSearch } from './useGeocodingSearch';
import * as mapboxClient from '../../services/mapboxClient';

describe('useGeocodingSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('não busca para queries com menos de 3 caracteres', () => {
    const spy = vi.spyOn(mapboxClient, 'searchPlaces');
    renderHook(() => useGeocodingSearch('Sp'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('faz debounce e retorna sugestões para uma query válida', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      { id: '1', placeName: 'São Paulo', coordinates: { lat: -23.5505, lng: -46.6333 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('São Paulo'));

    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(1);
    });
  });
});
```

- [ ] **Passo 2: Rodar os testes e confirmar que falham**

Rodar: `npx vitest run src/features/search/useGeocodingSearch.test.ts`
Esperado: FALHA — `useGeocodingSearch.ts` ainda não existe.

- [ ] **Passo 3: Implementar `src/features/search/useGeocodingSearch.ts`**

```ts
import { useEffect, useState } from 'react';
import { searchPlaces } from '../../services/mapboxClient';
import type { GeocodingSuggestion } from '../../types';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

export function useGeocodingSearch(query: string) {
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setError(null);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);

    const timeoutId = setTimeout(() => {
      searchPlaces(query)
        .then((results) => {
          if (!isCancelled) {
            setSuggestions(results);
            setError(null);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setError('Não foi possível buscar endereços agora. Tente novamente.');
            setSuggestions([]);
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoading(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [query]);

  return { suggestions, isLoading, error };
}
```

- [ ] **Passo 4: Rodar os testes e confirmar que passam**

Rodar: `npx vitest run src/features/search/useGeocodingSearch.test.ts`
Esperado: PASSA (2 testes)

- [ ] **Passo 5: Commit**

```bash
git add src/features/search
git commit -m "feat: adiciona hook de busca de destino com autocomplete"
```

---

## Task 7: Reducer de Navegação (Máquina de Estados)

**Arquivos:**
- Criar: `src/features/routing/navigationReducer.ts`
- Teste: `src/features/routing/navigationReducer.test.ts`

**Interfaces:**
- Consome: `findNearestPointIndex` de `src/utils/distance`; `Coordinates`, `NavigationState`, `Route`, `TravelProfile` de `src/types`
- Produz: `type NavigationAction` (união de ações), `initialNavigationState: NavigationState`, `navigationReducer(state: NavigationState, action: NavigationAction): NavigationState`

- [ ] **Passo 1: Escrever os testes (devem falhar)**

Criar `src/features/routing/navigationReducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { navigationReducer, initialNavigationState } from './navigationReducer';
import type { Route } from '../../types';

const sampleRoute: Route = {
  geometry: [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 0, lng: 2 },
    { lat: 0, lng: 3 },
  ],
  steps: [
    {
      instruction: 'Siga em frente',
      distanceMeters: 1000,
      durationSeconds: 60,
      maneuverLocation: { lat: 0, lng: 0 },
    },
    {
      instruction: 'Vire à direita',
      distanceMeters: 1000,
      durationSeconds: 60,
      maneuverLocation: { lat: 0, lng: 2 },
    },
  ],
  distanceMeters: 2000,
  durationSeconds: 120,
};

describe('navigationReducer', () => {
  it('vai de idle para routePlanned quando uma rota é planejada', () => {
    const state = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    expect(state.status).toBe('routePlanned');
    expect(state.currentStepIndex).toBe(0);
  });

  it('não inicia a navegação sem uma rota planejada', () => {
    const state = navigationReducer(initialNavigationState, { type: 'START_NAVIGATION' });
    expect(state.status).toBe('idle');
  });

  it('inicia a navegação a partir de routePlanned', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });
    expect(navigating.status).toBe('navigating');
  });

  it('avança o passo atual conforme a posição se move ao longo da rota', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });

    const pertoDoDestino = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 2.9 },
    });

    expect(pertoDoDestino.currentStepIndex).toBe(1);
  });

  it('nunca move o índice do passo para trás', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });
    const avancado = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 2.9 },
    });
    const voltouAtras = navigationReducer(avancado, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 0.1 },
    });

    expect(voltouAtras.currentStepIndex).toBe(1);
  });
});
```

- [ ] **Passo 2: Rodar os testes e confirmar que falham**

Rodar: `npx vitest run src/features/routing/navigationReducer.test.ts`
Esperado: FALHA — `navigationReducer.ts` ainda não existe.

- [ ] **Passo 3: Implementar `src/features/routing/navigationReducer.ts`**

```ts
import type { Coordinates, NavigationState, Route, TravelProfile } from '../../types';
import { findNearestPointIndex } from '../../utils/distance';

export type NavigationAction =
  | { type: 'SET_ORIGIN'; origin: Coordinates }
  | { type: 'SET_DESTINATION'; destination: Coordinates }
  | { type: 'SET_TRAVEL_PROFILE'; profile: TravelProfile }
  | { type: 'ROUTE_PLANNED'; route: Route }
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
};

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'SET_ORIGIN':
      return { ...state, origin: action.origin };

    case 'SET_DESTINATION':
      return { ...state, destination: action.destination, status: 'idle', route: null };

    case 'SET_TRAVEL_PROFILE':
      return { ...state, travelProfile: action.profile };

    case 'ROUTE_PLANNED':
      return { ...state, route: action.route, status: 'routePlanned', currentStepIndex: 0 };

    case 'START_NAVIGATION':
      if (state.status !== 'routePlanned' || !state.route) {
        return state;
      }
      return { ...state, status: 'navigating' };

    case 'POSITION_UPDATED': {
      if (state.status !== 'navigating' || !state.route) {
        return { ...state, origin: action.position };
      }
      const nearestIndex = findNearestPointIndex(action.position, state.route.geometry);
      const stepCount = state.route.steps.length;
      const progressRatio = nearestIndex / Math.max(state.route.geometry.length - 1, 1);
      const nextStepIndex = Math.min(Math.floor(progressRatio * stepCount), stepCount - 1);
      return {
        ...state,
        origin: action.position,
        currentStepIndex: Math.max(nextStepIndex, state.currentStepIndex),
      };
    }

    case 'RESET':
      return initialNavigationState;

    default:
      return state;
  }
}
```

- [ ] **Passo 4: Rodar os testes e confirmar que passam**

Rodar: `npx vitest run src/features/routing/navigationReducer.test.ts`
Esperado: PASSA (5 testes)

- [ ] **Passo 5: Commit**

```bash
git add src/features/routing/navigationReducer.ts src/features/routing/navigationReducer.test.ts
git commit -m "feat: adiciona maquina de estados de navegacao"
```

---

## Task 8: Hook de Planejamento de Rota (useRoute)

**Arquivos:**
- Criar: `src/features/routing/useRoute.ts`
- Teste: `src/features/routing/useRoute.test.ts`

**Interfaces:**
- Consome: `getDirections` de `src/services/mapboxClient`; `NavigationAction` de `./navigationReducer`; `Coordinates`, `TravelProfile` de `src/types`
- Produz: `useRoute(dispatch: Dispatch<NavigationAction>): { planRoute: (origin: Coordinates, destination: Coordinates, profile: TravelProfile) => Promise<void>; isLoading: boolean; error: string | null }`

- [ ] **Passo 1: Escrever os testes (devem falhar)**

Criar `src/features/routing/useRoute.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoute } from './useRoute';
import * as mapboxClient from '../../services/mapboxClient';
import type { Route } from '../../types';

describe('useRoute', () => {
  it('despacha ROUTE_PLANNED quando a requisição de rota tem sucesso', async () => {
    const fakeRoute: Route = {
      geometry: [{ lat: 0, lng: 0 }],
      steps: [],
      distanceMeters: 1000,
      durationSeconds: 60,
    };
    vi.spyOn(mapboxClient, 'getDirections').mockResolvedValue(fakeRoute);
    const dispatch = vi.fn();

    const { result } = renderHook(() => useRoute(dispatch));

    await act(async () => {
      await result.current.planRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, 'driving');
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ROUTE_PLANNED', route: fakeRoute });
    expect(result.current.error).toBeNull();
  });

  it('define uma mensagem de erro quando a requisição de rota falha', async () => {
    vi.spyOn(mapboxClient, 'getDirections').mockRejectedValue(
      new Error('Nenhuma rota encontrada'),
    );
    const dispatch = vi.fn();

    const { result } = renderHook(() => useRoute(dispatch));

    await act(async () => {
      await result.current.planRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, 'driving');
    });

    expect(result.current.error).toBe('Nenhuma rota encontrada');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Passo 2: Rodar os testes e confirmar que falham**

Rodar: `npx vitest run src/features/routing/useRoute.test.ts`
Esperado: FALHA — `useRoute.ts` ainda não existe.

- [ ] **Passo 3: Implementar `src/features/routing/useRoute.ts`**

```ts
import { useCallback, useState } from 'react';
import type { Dispatch } from 'react';
import { getDirections } from '../../services/mapboxClient';
import type { NavigationAction } from './navigationReducer';
import type { Coordinates, TravelProfile } from '../../types';

export function useRoute(dispatch: Dispatch<NavigationAction>) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planRoute = useCallback(
    async (origin: Coordinates, destination: Coordinates, profile: TravelProfile) => {
      setIsLoading(true);
      setError(null);
      try {
        const route = await getDirections(origin, destination, profile);
        dispatch({ type: 'ROUTE_PLANNED', route });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao calcular a rota.');
      } finally {
        setIsLoading(false);
      }
    },
    [dispatch],
  );

  return { planRoute, isLoading, error };
}
```

- [ ] **Passo 4: Rodar os testes e confirmar que passam**

Rodar: `npx vitest run src/features/routing/useRoute.test.ts`
Esperado: PASSA (2 testes)

- [ ] **Passo 5: Commit**

```bash
git add src/features/routing/useRoute.ts src/features/routing/useRoute.test.ts
git commit -m "feat: adiciona hook de planejamento de rota"
```

---

## Task 9: Hook e Componente de Mapa (Mapbox GL)

**Arquivos:**
- Criar: `src/features/map/useMapboxMap.ts`
- Criar: `src/components/MapView.tsx`
- Teste: `src/features/map/useMapboxMap.test.ts`

**Interfaces:**
- Consome: `Coordinates`, `Route` de `src/types`
- Produz: `useMapboxMap(options: { containerRef: RefObject<HTMLDivElement>; origin: Coordinates | null; destination: Coordinates | null; route: Route | null }): RefObject<mapboxgl.Map | null>`
- Produz: componente `MapView({ origin, destination, route }: { origin: Coordinates | null; destination: Coordinates | null; route: Route | null })`

- [ ] **Passo 1: Escrever o teste (deve falhar)**

Criar `src/features/map/useMapboxMap.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useMapboxMap } from './useMapboxMap';

const setLngLatMock = vi.fn().mockReturnThis();
const addToMock = vi.fn().mockReturnThis();

vi.mock('mapbox-gl', () => {
  class FakeMap {
    isStyleLoaded = () => true;
    on = vi.fn();
    once = vi.fn();
    remove = vi.fn();
    setCenter = vi.fn();
    getSource = vi.fn().mockReturnValue(undefined);
    addSource = vi.fn();
    addLayer = vi.fn();
  }
  class FakeMarker {
    setLngLat = setLngLatMock;
    addTo = addToMock;
  }
  return {
    default: {
      Map: FakeMap,
      Marker: FakeMarker,
      accessToken: '',
    },
  };
});

describe('useMapboxMap', () => {
  it('cria um marcador na origem assim que o container está disponível', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    renderHook(() =>
      useMapboxMap({
        containerRef,
        origin: { lat: -23.5505, lng: -46.6333 },
        destination: null,
        route: null,
      }),
    );

    expect(setLngLatMock).toHaveBeenCalledWith([-46.6333, -23.5505]);
    expect(addToMock).toHaveBeenCalled();
  });
});
```

- [ ] **Passo 2: Rodar o teste e confirmar que falha**

Rodar: `npx vitest run src/features/map/useMapboxMap.test.ts`
Esperado: FALHA — `useMapboxMap.ts` ainda não existe.

- [ ] **Passo 3: Implementar `src/features/map/useMapboxMap.ts`**

```ts
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Coordinates, Route } from '../../types';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const ROUTE_SOURCE_ID = 'route-source';
const ROUTE_LAYER_ID = 'route-layer';

interface UseMapboxMapOptions {
  containerRef: RefObject<HTMLDivElement>;
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
}

export function useMapboxMap({ containerRef, origin, destination, route }: UseMapboxMapOptions) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-46.6333, -23.5505],
      zoom: 12,
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [containerRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) {
      return;
    }

    if (!originMarkerRef.current) {
      originMarkerRef.current = new mapboxgl.Marker({ color: '#2563eb' })
        .setLngLat([origin.lng, origin.lat])
        .addTo(map);
    } else {
      originMarkerRef.current.setLngLat([origin.lng, origin.lat]);
    }

    map.setCenter([origin.lng, origin.lat]);
  }, [origin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !destination) {
      return;
    }

    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new mapboxgl.Marker({ color: '#dc2626' })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map);
    } else {
      destinationMarkerRef.current.setLngLat([destination.lng, destination.lat]);
    }
  }, [destination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route) {
      return;
    }

    const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: route.geometry.map((point) => [point.lng, point.lat]),
      },
    };

    const applyRoute = () => {
      const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(geojson);
        return;
      }

      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: geojson });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 5 },
      });
    };

    if (map.isStyleLoaded()) {
      applyRoute();
    } else {
      map.once('load', applyRoute);
    }
  }, [route]);

  return mapRef;
}
```

- [ ] **Passo 4: Rodar o teste e confirmar que passa**

Rodar: `npx vitest run src/features/map/useMapboxMap.test.ts`
Esperado: PASSA (1 teste)

- [ ] **Passo 5: Implementar `src/components/MapView.tsx`**

```tsx
import { useRef } from 'react';
import { useMapboxMap } from '../features/map/useMapboxMap';
import type { Coordinates, Route } from '../types';

interface MapViewProps {
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
}

export function MapView({ origin, destination, route }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useMapboxMap({ containerRef, origin, destination, route });

  return <div ref={containerRef} data-testid="map-view" className="h-full w-full" />;
}
```

- [ ] **Passo 6: Verificar tipos e lint**

Rodar: `npx tsc -b && npm run lint`
Esperado: sem erros

- [ ] **Passo 7: Commit**

```bash
git add src/features/map src/components/MapView.tsx
git commit -m "feat: adiciona hook e componente de mapa com Mapbox GL"
```

---

## Task 10: Componente de Busca (SearchBar)

**Arquivos:**
- Criar: `src/components/SearchBar.tsx`
- Teste: `src/components/SearchBar.test.tsx`

**Interfaces:**
- Consome: `useGeocodingSearch` de `src/features/search/useGeocodingSearch`; `GeocodingSuggestion` de `src/types`
- Produz: componente `SearchBar({ onSelect }: { onSelect: (suggestion: GeocodingSuggestion) => void })`

- [ ] **Passo 1: Escrever o teste (deve falhar)**

Criar `src/components/SearchBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from './SearchBar';
import * as mapboxClient from '../services/mapboxClient';

describe('SearchBar', () => {
  it('mostra sugestões retornadas pela busca e chama onSelect', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);
    const onSelect = vi.fn();

    render(<SearchBar onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });

    const option = await screen.findByText('Av. Paulista, São Paulo', {}, { timeout: 1000 });
    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith({
      id: '1',
      placeName: 'Av. Paulista, São Paulo',
      coordinates: { lat: -23.5613, lng: -46.6564 },
    });
  });
});
```

- [ ] **Passo 2: Rodar o teste e confirmar que falha**

Rodar: `npx vitest run src/components/SearchBar.test.tsx`
Esperado: FALHA — `SearchBar.tsx` ainda não existe.

- [ ] **Passo 3: Implementar `src/components/SearchBar.tsx`**

```tsx
import { useState } from 'react';
import { useGeocodingSearch } from '../features/search/useGeocodingSearch';
import type { GeocodingSuggestion } from '../types';

interface SearchBarProps {
  onSelect: (suggestion: GeocodingSuggestion) => void;
}

export function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const { suggestions, error } = useGeocodingSearch(query);

  const handleSelect = (suggestion: GeocodingSuggestion) => {
    setQuery(suggestion.placeName);
    onSelect(suggestion);
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Para onde você vai?"
        className="w-full rounded-lg border border-slate-300 px-4 py-2 shadow-sm focus:border-blue-500 focus:outline-none"
        aria-label="Buscar destino"
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                onClick={() => handleSelect(suggestion)}
                className="w-full px-4 py-2 text-left hover:bg-slate-100"
              >
                {suggestion.placeName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Passo 4: Rodar o teste e confirmar que passa**

Rodar: `npx vitest run src/components/SearchBar.test.tsx`
Esperado: PASSA (1 teste)

- [ ] **Passo 5: Commit**

```bash
git add src/components/SearchBar.tsx src/components/SearchBar.test.tsx
git commit -m "feat: adiciona componente de busca de destino"
```

---

## Task 11: Componente de Instruções de Rota

**Arquivos:**
- Criar: `src/components/RouteInstructions.tsx`
- Teste: `src/components/RouteInstructions.test.tsx`

**Interfaces:**
- Consome: `RouteStep` de `src/types`; `formatDistance` de `src/utils/format`
- Produz: componente `RouteInstructions({ steps, currentStepIndex }: { steps: RouteStep[]; currentStepIndex: number })`

- [ ] **Passo 1: Escrever os testes (devem falhar)**

Criar `src/components/RouteInstructions.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteInstructions } from './RouteInstructions';

const steps = [
  {
    instruction: 'Siga em frente',
    distanceMeters: 500,
    durationSeconds: 60,
    maneuverLocation: { lat: 0, lng: 0 },
  },
  {
    instruction: 'Vire à direita',
    distanceMeters: 200,
    durationSeconds: 30,
    maneuverLocation: { lat: 0, lng: 1 },
  },
];

describe('RouteInstructions', () => {
  it('renderiza cada passo', () => {
    render(<RouteInstructions steps={steps} currentStepIndex={0} />);
    expect(screen.getAllByTestId('route-step')).toHaveLength(2);
  });

  it('destaca o passo atual', () => {
    render(<RouteInstructions steps={steps} currentStepIndex={1} />);
    expect(screen.getByText('Vire à direita').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });
});
```

- [ ] **Passo 2: Rodar os testes e confirmar que falham**

Rodar: `npx vitest run src/components/RouteInstructions.test.tsx`
Esperado: FALHA — `RouteInstructions.tsx` ainda não existe.

- [ ] **Passo 3: Implementar `src/components/RouteInstructions.tsx`**

```tsx
import type { RouteStep } from '../types';
import { formatDistance } from '../utils/format';

interface RouteInstructionsProps {
  steps: RouteStep[];
  currentStepIndex: number;
}

export function RouteInstructions({ steps, currentStepIndex }: RouteInstructionsProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {steps.map((step, index) => (
        <li
          key={`${step.instruction}-${index}`}
          data-testid="route-step"
          aria-current={index === currentStepIndex ? 'step' : undefined}
          className={`px-4 py-3 ${index === currentStepIndex ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'}`}
        >
          <p>{step.instruction}</p>
          <p className="text-sm text-slate-500">{formatDistance(step.distanceMeters)}</p>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Passo 4: Rodar os testes e confirmar que passam**

Rodar: `npx vitest run src/components/RouteInstructions.test.tsx`
Esperado: PASSA (2 testes)

- [ ] **Passo 5: Commit**

```bash
git add src/components/RouteInstructions.tsx src/components/RouteInstructions.test.tsx
git commit -m "feat: adiciona componente de instrucoes da rota"
```

---

## Task 12: Componentes de Resumo e Erro

**Arquivos:**
- Criar: `src/components/RouteSummary.tsx`
- Criar: `src/components/ErrorBanner.tsx`
- Teste: `src/components/RouteSummary.test.tsx`
- Teste: `src/components/ErrorBanner.test.tsx`

**Interfaces:**
- Consome: `formatDistance`, `formatDuration` de `src/utils/format`
- Produz: componente `RouteSummary({ distanceMeters, durationSeconds }: { distanceMeters: number; durationSeconds: number })`
- Produz: componente `ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void })`

- [ ] **Passo 1: Escrever os testes (devem falhar)**

Criar `src/components/RouteSummary.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteSummary } from './RouteSummary';

describe('RouteSummary', () => {
  it('renderiza duração e distância formatadas', () => {
    render(<RouteSummary distanceMeters={4200} durationSeconds={1500} />);
    expect(screen.getByText('25 min')).toBeInTheDocument();
    expect(screen.getByText('4.2 km')).toBeInTheDocument();
  });
});
```

Criar `src/components/ErrorBanner.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner', () => {
  it('mostra a mensagem e chama onRetry ao clicar', () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Falha ao buscar" onRetry={onRetry} />);

    fireEvent.click(screen.getByText('Tentar novamente'));

    expect(onRetry).toHaveBeenCalled();
  });
});
```

- [ ] **Passo 2: Rodar os testes e confirmar que falham**

Rodar: `npx vitest run src/components/RouteSummary.test.tsx src/components/ErrorBanner.test.tsx`
Esperado: FALHA — os componentes ainda não existem.

- [ ] **Passo 3: Implementar `src/components/RouteSummary.tsx`**

```tsx
import { formatDistance, formatDuration } from '../utils/format';

interface RouteSummaryProps {
  distanceMeters: number;
  durationSeconds: number;
}

export function RouteSummary({ distanceMeters, durationSeconds }: RouteSummaryProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg bg-blue-600 px-4 py-3 text-white">
      <span className="text-lg font-bold">{formatDuration(durationSeconds)}</span>
      <span className="text-sm text-blue-100">{formatDistance(distanceMeters)}</span>
    </div>
  );
}
```

- [ ] **Passo 4: Implementar `src/components/ErrorBanner.tsx`**

```tsx
interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-red-700"
    >
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline">
          Tentar novamente
        </button>
      )}
    </div>
  );
}
```

- [ ] **Passo 5: Rodar os testes e confirmar que passam**

Rodar: `npx vitest run src/components/RouteSummary.test.tsx src/components/ErrorBanner.test.tsx`
Esperado: PASSA (2 testes)

- [ ] **Passo 6: Commit**

```bash
git add src/components/RouteSummary.tsx src/components/RouteSummary.test.tsx src/components/ErrorBanner.tsx src/components/ErrorBanner.test.tsx
git commit -m "feat: adiciona componentes de resumo de rota e aviso de erro"
```

---

## Task 13: Integração Final (App.tsx)

**Arquivos:**
- Modificar: `src/App.tsx` (substitui o placeholder da Tarefa 1)
- Teste: `src/App.test.tsx`

**Interfaces:**
- Consome: todos os hooks e componentes das Tarefas 5–12
- Produz: componente `App()` — ponto de entrada da aplicação

- [ ] **Passo 1: Escrever o teste de integração (deve falhar)**

Criar `src/App.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from './App';
import * as mapboxClient from './services/mapboxClient';

vi.mock('mapbox-gl', () => {
  class FakeMap {
    isStyleLoaded = () => true;
    on = vi.fn();
    once = vi.fn();
    remove = vi.fn();
    setCenter = vi.fn();
    getSource = vi.fn().mockReturnValue(undefined);
    addSource = vi.fn();
    addLayer = vi.fn();
  }
  class FakeMarker {
    setLngLat = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
  }
  return { default: { Map: FakeMap, Marker: FakeMarker, accessToken: '' } };
});

describe('App', () => {
  beforeEach(() => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn((success: PositionCallback) => {
          success({
            coords: { latitude: -23.5505, longitude: -46.6333 },
          } as GeolocationPosition);
          return 1;
        }),
        clearWatch: vi.fn(),
      },
      configurable: true,
    });
  });

  it('planeja uma rota assim que um destino é selecionado e mostra o resumo', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('1 min')).toBeInTheDocument();
    });
    expect(screen.getByText('Iniciar navegação')).toBeInTheDocument();
  });
});
```

- [ ] **Passo 2: Rodar o teste e confirmar que falha**

Rodar: `npx vitest run src/App.test.tsx`
Esperado: FALHA — `App.tsx` ainda é o placeholder da Tarefa 1.

- [ ] **Passo 3: Implementar `src/App.tsx`**

```tsx
import { useEffect, useReducer } from 'react';
import { MapView } from './components/MapView';
import { SearchBar } from './components/SearchBar';
import { RouteInstructions } from './components/RouteInstructions';
import { RouteSummary } from './components/RouteSummary';
import { ErrorBanner } from './components/ErrorBanner';
import { useGeolocation } from './features/geolocation/useGeolocation';
import { useRoute } from './features/routing/useRoute';
import { navigationReducer, initialNavigationState } from './features/routing/navigationReducer';
import type { GeocodingSuggestion } from './types';

export function App() {
  const [state, dispatch] = useReducer(navigationReducer, initialNavigationState);
  const geolocation = useGeolocation();
  const { planRoute, isLoading: isRouteLoading, error: routeError } = useRoute(dispatch);

  useEffect(() => {
    if (geolocation.position) {
      dispatch({ type: 'SET_ORIGIN', origin: geolocation.position });
    }
  }, [geolocation.position]);

  useEffect(() => {
    if (state.status === 'navigating' && geolocation.position) {
      dispatch({ type: 'POSITION_UPDATED', position: geolocation.position });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geolocation.position, state.status]);

  const handleDestinationSelected = (suggestion: GeocodingSuggestion) => {
    dispatch({ type: 'SET_DESTINATION', destination: suggestion.coordinates });
    if (state.origin) {
      void planRoute(state.origin, suggestion.coordinates, state.travelProfile);
    }
  };

  const handleStartNavigation = () => {
    dispatch({ type: 'START_NAVIGATION' });
  };

  if (geolocation.error) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <ErrorBanner message={geolocation.error} onRetry={geolocation.retry} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="z-10 space-y-3 bg-white p-4 shadow">
        <SearchBar onSelect={handleDestinationSelected} />
        {routeError && <ErrorBanner message={routeError} />}
        {state.route && (
          <RouteSummary
            distanceMeters={state.route.distanceMeters}
            durationSeconds={state.route.durationSeconds}
          />
        )}
        {state.status === 'routePlanned' && (
          <button
            type="button"
            onClick={handleStartNavigation}
            className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Iniciar navegação
          </button>
        )}
        {isRouteLoading && <p className="text-sm text-slate-500">Calculando rota...</p>}
      </header>

      <div className="relative flex-1">
        <MapView origin={state.origin} destination={state.destination} route={state.route} />
      </div>

      {state.route && (
        <div className="max-h-64 overflow-y-auto border-t border-slate-200 bg-white">
          <RouteInstructions steps={state.route.steps} currentStepIndex={state.currentStepIndex} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Passo 4: Rodar o teste e confirmar que passa**

Rodar: `npx vitest run src/App.test.tsx`
Esperado: PASSA (1 teste)

- [ ] **Passo 5: Rodar a suíte completa**

Rodar: `npm run test`
Esperado: todos os testes de todas as tarefas anteriores continuam passando

- [ ] **Passo 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: integra busca, mapa, rota e navegacao no App"
```

---

## Task 14: Segurança — Variáveis de Ambiente e Headers

**Arquivos:**
- Criar: `vercel.json`
- Verificar: `.env`, `.gitignore`, `.env.example` (já criados na Tarefa 1)

**Interfaces:**
- Não introduz novas interfaces de código — apenas configuração de deploy.

- [ ] **Passo 1: Criar o arquivo `.env` local (não commitado) com um token real de teste**

Criar `.env` na raiz do projeto (esse arquivo NÃO deve ser commitado):

```
VITE_MAPBOX_TOKEN=<seu_token_publico_do_mapbox>
```

- [ ] **Passo 2: Confirmar que `.env` está ignorado pelo Git**

Rodar: `git check-ignore -v .env`
Esperado: a saída mostra que `.env` casa com a regra do `.gitignore` (sem isso, PARE e corrija o `.gitignore` antes de continuar)

- [ ] **Passo 3: Criar `vercel.json` com headers de segurança**

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; img-src 'self' data: https://*.mapbox.com; style-src 'self' 'unsafe-inline' https://api.mapbox.com; script-src 'self'; connect-src 'self' https://api.mapbox.com https://events.mapbox.com; worker-src 'self' blob:; font-src 'self' data:;"
        }
      ]
    }
  ]
}
```

- [ ] **Passo 4: Rodar o app localmente e confirmar que o mapa carrega com o token do `.env`**

Rodar: `npm run dev`
Esperado: acessar `http://localhost:5173`, o navegador pede permissão de localização, e o mapa do Mapbox é renderizado sem erros de token no console

- [ ] **Passo 5: Commit**

```bash
git add vercel.json
git commit -m "chore: adiciona headers de seguranca para o deploy na Vercel"
```

---

## Task 15: CI/CD (GitHub Actions)

**Arquivos:**
- Criar: `.github/workflows/ci.yml`

**Interfaces:**
- Não introduz novas interfaces de código — apenas pipeline de automação.

- [ ] **Passo 1: Criar `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npx tsc -b
      - run: npm run test
      - run: npm run build
      - run: npm audit --audit-level=high
```

- [ ] **Passo 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: adiciona pipeline de lint, testes, build e audit"
```

- [ ] **Passo 3: Push e verificação**

Rodar: `git push -u origin HEAD` (empurra a branch atual, seja ela qual for — a implementação roda em uma branch de feature, não diretamente em `main`)
Esperado: acessar a aba "Actions" do repositório no GitHub e confirmar que o workflow "CI" rodou e todos os passos ficaram verdes para essa branch. Se algum passo falhar, corrigir o problema, commitar e dar push novamente antes de seguir para a próxima tarefa.

---

## Task 16: README e Documentação Final

**Arquivos:**
- Criar: `README.md`

**Interfaces:**
- Não introduz novas interfaces de código — apenas documentação.

- [ ] **Passo 1: Criar `README.md`**

```markdown
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

- O token do Mapbox nunca é commitado — é lido de uma variável de ambiente e restrito por domínio no painel do Mapbox (produção + `localhost`).
- Headers de segurança (CSP, `X-Content-Type-Options`, `X-Frame-Options`) são aplicados via `vercel.json`.
- O pipeline de CI roda `npm audit` a cada push para checar vulnerabilidades nas dependências.

## Próximos Passos

- Suporte a modos de transporte a pé e bicicleta
- Instruções por voz
- Recálculo automático de rota em caso de desvio
- Suporte offline (cache de mapas e motor de rotas local)

## Licença

Este projeto está sob a licença MIT — veja o arquivo [LICENSE](LICENSE) para detalhes.
```

- [ ] **Passo 2: Tirar prints ou um GIF do app funcionando e adicionar ao README**

Rodar o app localmente (`npm run dev`), tirar 2–3 capturas de tela (tela inicial, busca com sugestões, navegação ativa com instruções), salvar em `docs/screenshots/` e referenciá-las no README com `![descrição](docs/screenshots/arquivo.png)`.

- [ ] **Passo 3: Commit**

```bash
git add README.md docs/screenshots
git commit -m "docs: adiciona README completo com setup, arquitetura e capturas de tela"
```

---

## Task 17: Deploy na Vercel

**Arquivos:** nenhum arquivo de código — checklist manual de deploy.

- [ ] **Passo 1: Conectar o repositório à Vercel**

Acessar https://vercel.com/, importar o repositório `Edilson-5762/RouteWise` do GitHub, manter as configurações padrão de detecção do Vite.

- [ ] **Passo 2: Configurar a variável de ambiente na Vercel**

No painel do projeto na Vercel, ir em Settings → Environment Variables e adicionar `VITE_MAPBOX_TOKEN` com o valor do token do Mapbox, para os ambientes Production e Preview.

- [ ] **Passo 3: Restringir o token do Mapbox por domínio**

No painel do Mapbox (https://account.mapbox.com/access-tokens/), editar o token usado e restringir as URLs permitidas ao domínio gerado pela Vercel (ex: `routewise.vercel.app`) e a `localhost:5173` para desenvolvimento.

- [ ] **Passo 4: Disparar o deploy e verificar**

A Vercel gera automaticamente um deploy de Preview a partir do push na branch de feature em uso; o deploy de Produção (domínio final) só é ativado após o merge dessa branch em `main`. Para verificar agora, usar a URL de Preview: testar o fluxo completo — permitir localização → buscar um destino → selecionar da lista → ver a rota e o resumo → clicar em "Iniciar navegação".

- [ ] **Passo 5: Atualizar o README com o link ao vivo**

Editar `README.md`, substituir o placeholder do link de demo pela URL de Preview (ou de Produção, se o merge para `main` já tiver ocorrido).

```bash
git add README.md
git commit -m "docs: adiciona link do deploy ao vivo na Vercel"
git push
```

**Nota:** esta tarefa exige acesso às contas da Vercel e do Mapbox — passos 1 a 3 devem ser feitos pelo usuário diretamente, não por um subagente implementador.

---

## Itens Extras (Somente se o MVP Terminar Antes do Prazo)

Conforme §9 do spec, os itens abaixo só devem ser iniciados depois que todas as 17 tarefas acima estiverem concluídas, testadas e no ar:

- Instruções faladas via Web Speech API
- Recálculo automático de rota ao desviar do caminho
- Rotação do mapa seguindo a direção do usuário
- Toggle completo de modos de transporte (a pé/bicicleta)
- Modo escuro, histórico de buscas, tela de resumo da viagem

Esses itens não têm tarefas detalhadas neste plano — se sobrar tempo, um novo mini-plano deve ser escrito para cada um antes de implementá-lo.
