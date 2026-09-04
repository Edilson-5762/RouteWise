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
        {
          triggerDistanceMeters: 800,
          primaryText: 'longe',
          secondaryText: null,
          maneuverType: 'turn',
          maneuverModifier: 'left',
          roundaboutDegrees: null,
          lanes: [],
        },
        {
          triggerDistanceMeters: 200,
          primaryText: 'perto',
          secondaryText: null,
          maneuverType: 'turn',
          maneuverModifier: 'left',
          roundaboutDegrees: null,
          lanes: [],
        },
      ],
    });
    const r = route([step(), upcoming]);
    expect(selectGuidance(r, 0, 500)?.primaryText).toBe('longe'); // 200 ainda não ativou
    expect(selectGuidance(r, 0, 150)?.primaryText).toBe('perto'); // 200 já ativou
    expect(selectGuidance(r, 0, null)?.primaryText).toBe('longe'); // distância nula → o primeiro
  });

  it('sem banners, cai para a instruction e o tipo do passo', () => {
    const r = route([
      step(),
      step({
        instruction: 'Vire à esquerda',
        maneuverType: 'turn',
        maneuverModifier: 'left',
        banners: [],
      }),
    ]);
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
        {
          triggerDistanceMeters: 900,
          primaryText: 'x',
          secondaryText: null,
          maneuverType: 'turn',
          maneuverModifier: 'right',
          roundaboutDegrees: null,
          lanes: [],
        },
        {
          triggerDistanceMeters: 500,
          primaryText: 'x',
          secondaryText: null,
          maneuverType: 'turn',
          maneuverModifier: 'right',
          roundaboutDegrees: null,
          lanes,
        },
      ],
    });
    const r = route([step(), upcoming]);
    expect(selectGuidance(r, 0, 600)?.lanes).toEqual([]); // banner ativo é o de 900, sem faixa
    expect(selectGuidance(r, 0, 400)?.lanes).toEqual(lanes); // banner ativo é o de 500, com faixa, e 400 <= 450
  });

  it('faixas: vazias se o banner ativo não tem faixa, mesmo perto', () => {
    const upcoming = step({
      distanceMeters: 300,
      banners: [
        {
          triggerDistanceMeters: 300,
          primaryText: 'x',
          secondaryText: null,
          maneuverType: 'turn',
          maneuverModifier: 'right',
          roundaboutDegrees: null,
          lanes: [],
        },
      ],
    });
    expect(selectGuidance(route([step(), upcoming]), 0, 100)?.lanes).toEqual([]);
  });

  it('then: null quando a manobra seguinte está longe; preenchido quando <= 400 m; null quando não há passo depois', () => {
    const mkNext = (dist: number) =>
      route([
        step(),
        step({
          instruction: 'Vire à direita',
          maneuverType: 'turn',
          maneuverModifier: 'right',
          distanceMeters: dist,
        }),
        step({ instruction: 'Vire à esquerda', maneuverType: 'turn', maneuverModifier: 'left' }),
      ]);
    expect(selectGuidance(mkNext(900), 0, 500)?.then).toBeNull();
    const then = selectGuidance(mkNext(250), 0, 500)?.then;
    expect(then?.text).toBe('Vire à esquerda');
    expect(then?.maneuverType).toBe('turn');
    expect(then?.maneuverModifier).toBe('left');
    // próximo passo é o último → sem "then"
    const r2 = route([
      step(),
      step({ instruction: 'Chegou', maneuverType: 'arrive', distanceMeters: 100 }),
    ]);
    expect(selectGuidance(r2, 0, 300)?.then).toBeNull();
  });

  it('currentRoadName vem do passo sendo percorrido; vazio quando ausente ou fora do range', () => {
    const r = route([
      step({ roadName: '2ª Avenida Norte' }),
      step({ instruction: 'Vire', maneuverType: 'turn', maneuverModifier: 'right' }),
    ]);
    expect(selectGuidance(r, 0, 300)?.currentRoadName).toBe('2ª Avenida Norte');
    expect(selectGuidance(route([step({ roadName: '' }), step()]), 0, 300)?.currentRoadName).toBe(
      '',
    );
    expect(selectGuidance(r, 9, 300)?.currentRoadName).toBe('');
  });

  it('repassa roundaboutDegrees do banner e roundaboutExit do passo; distância cai para a do passo quando nula', () => {
    const upcoming = step({
      distanceMeters: 700,
      roundaboutExit: 3,
      banners: [
        {
          triggerDistanceMeters: 700,
          primaryText: 'Rotatória',
          secondaryText: null,
          maneuverType: 'roundabout',
          maneuverModifier: 'right',
          roundaboutDegrees: 240,
          lanes: [],
        },
      ],
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
