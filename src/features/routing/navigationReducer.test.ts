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
      maneuverType: 'turn',
      maneuverModifier: null,
    },
    {
      instruction: 'Vire à direita',
      distanceMeters: 1000,
      durationSeconds: 60,
      maneuverLocation: { lat: 0, lng: 2 },
      maneuverType: 'turn',
      maneuverModifier: null,
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

  it('transiciona para arrived quando a posição fica junto ao pino do destino', () => {
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

  it('transiciona para arrived ao completar a rota mesmo com o GPS a algumas dezenas de metros do pino', () => {
    // O sintoma relatado: a navegação "finaliza no meio da rua" quando o GPS
    // não bate no ponto exato do pino. Agora, se já percorreu a rota inteira e
    // está na região do destino, conta como chegada.
    const planned = navigationReducer(
      { ...initialNavigationState, destination: { lat: 0, lng: 3.0005 } },
      { type: 'ROUTE_PLANNED', route: sampleRoute },
    );
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });

    const chegou = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 3 },
    });

    expect(chegou.status).toBe('arrived');
  });

  it('define arrivalSide conforme a direção de chegada vs. a direção do pino', () => {
    const base = navigationReducer(initialNavigationState, {
      type: 'SET_ORIGIN',
      origin: { lat: 0, lng: 2.99 },
    });
    const comDireita = navigationReducer(
      { ...base, destination: { lat: -0.0001, lng: 3 } }, // pino ao sul, chegando a leste → direita
      { type: 'ROUTE_PLANNED', route: sampleRoute },
    );
    const navDireita = navigationReducer(comDireita, { type: 'START_NAVIGATION' });
    const chegouDireita = navigationReducer(navDireita, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 3 },
    });
    expect(chegouDireita.status).toBe('arrived');
    expect(chegouDireita.arrivalSide).toBe('right');

    const comEsquerda = navigationReducer(
      { ...base, destination: { lat: 0.0001, lng: 3 } }, // pino ao norte → esquerda
      { type: 'ROUTE_PLANNED', route: sampleRoute },
    );
    const navEsquerda = navigationReducer(comEsquerda, { type: 'START_NAVIGATION' });
    const chegouEsquerda = navigationReducer(navEsquerda, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 3 },
    });
    expect(chegouEsquerda.arrivalSide).toBe('left');
  });

  it('antecipa o painel com a velocidade: mesma posição, com velocidade a distância até a manobra é menor', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });

    const parado = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 1.4 },
      speedMetersPerSecond: 0,
    });
    const emMovimento = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 1.4 },
      speedMetersPerSecond: 30,
    });

    // Mesma posição crua, mas o ponto antecipado ~1 s à frente encurta o que
    // falta até a manobra (e faz o painel trocar de passo mais cedo).
    expect(emMovimento.distanceToManeuverMeters).toBeLessThan(
      parado.distanceToManeuverMeters as number,
    );
    // Antecipação limitada a PANEL_LEAD_MAX_METERS (35 m).
    expect(
      (parado.distanceToManeuverMeters as number) -
        (emMovimento.distanceToManeuverMeters as number),
    ).toBeLessThanOrEqual(35 + 0.01);
  });

  it('parado (velocidade 0) não antecipa — sem `speedMetersPerSecond` o comportamento é o de antes', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });
    const semCampo = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 1.4 },
    });
    const zero = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 1.4 },
      speedMetersPerSecond: 0,
    });
    expect(semCampo.distanceToManeuverMeters).toBe(zero.distanceToManeuverMeters);
  });

  it('reporta distanceToManeuverMeters e ele diminui conforme você se aproxima da manobra', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });

    const longe = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 0.5 },
    });
    const perto = navigationReducer(longe, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 0.9 },
    });

    expect(longe.distanceToManeuverMeters).toBeGreaterThan(0);
    expect(perto.distanceToManeuverMeters).toBeLessThan(longe.distanceToManeuverMeters as number);
  });

  it('marca routeDeviated quando a posição fica bem longe da rota', () => {
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

  it('só limpa routeDeviated abaixo do limite de "de volta" — na zona morta mantém o estado (histérese)', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });
    const desviado = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0.01, lng: 1 }, // ~1100m: bem fora da rota
    });
    expect(desviado.routeDeviated).toBe(true);

    const naFaixa = navigationReducer(desviado, {
      type: 'POSITION_UPDATED',
      position: { lat: 0.0003, lng: 1 }, // ~33m: ainda não conta como "de volta"
    });
    expect(naFaixa.routeDeviated).toBe(true);

    const deVolta = navigationReducer(naFaixa, {
      type: 'POSITION_UPDATED',
      position: { lat: 0.0001, lng: 1 }, // ~11m: de volta à rota
    });
    expect(deVolta.routeDeviated).toBe(false);
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

  it('num retorno (hairpin) um fix ruidoso não "pula" o progresso para a perna de volta', () => {
    // Sobe ~55 m, ponta, e volta ~11 m a leste — a perna de volta passa a
    // poucos metros da de ida. Sem a banda de distância-ao-longo, um fix
    // ruidoso projetava lá e o progresso (monotônico) travava no salto: no
    // mapa a linha da rota sumia e o veículo teleportava para dentro do retorno.
    const hairpin: Route = {
      geometry: [
        { lat: 0, lng: 0 },
        { lat: 0.0004, lng: 0 },
        { lat: 0.0005, lng: 0 },
        { lat: 0.00052, lng: 0.00011 },
        { lat: 0.0004, lng: 0.0001 },
        { lat: 0, lng: 0.0001 },
      ],
      steps: [
        {
          instruction: 'Siga',
          distanceMeters: 55,
          durationSeconds: 8,
          maneuverLocation: { lat: 0, lng: 0 },
          maneuverType: 'depart',
          maneuverModifier: null,
        },
        {
          instruction: 'Faça o retorno',
          distanceMeters: 26,
          durationSeconds: 5,
          maneuverLocation: { lat: 0.00052, lng: 0.00011 },
          maneuverType: 'turn',
          maneuverModifier: 'uturn',
        },
        {
          instruction: 'Siga',
          distanceMeters: 44,
          durationSeconds: 6,
          maneuverLocation: { lat: 0.0004, lng: 0.0001 },
          maneuverType: 'continue',
          maneuverModifier: 'straight',
        },
      ],
      distanceMeters: 125,
      durationSeconds: 19,
    };
    const navigating = navigationReducer(
      navigationReducer(initialNavigationState, { type: 'ROUTE_PLANNED', route: hairpin }),
      { type: 'START_NAVIGATION' },
    );
    // 1º fix: na perna de IDA, ~46 m — estabelece o centro da banda. Devagar
    // (entrando no retorno), a banda à frente fica curta.
    const ida = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0.00042, lng: 0.000003 },
      speedMetersPerSecond: 1,
    });
    expect(ida.routeAlongMeters).toBeGreaterThan(35);
    expect(ida.routeAlongMeters).toBeLessThan(55);

    // 2º fix ruidoso: caiu para o lado da perna de VOLTA (projetaria a ~76 m),
    // mas o veículo ainda está antes da ponta. A banda segura o progresso perto
    // da ponta.
    const ruidoso = navigationReducer(ida, {
      type: 'POSITION_UPDATED',
      position: { lat: 0.00045, lng: 0.00007 },
      speedMetersPerSecond: 1,
    });
    expect(ruidoso.routeAlongMeters).toBeLessThan(70);
    expect(ruidoso.routeProgressIndex).toBeLessThanOrEqual(3);
  });

  it('RESET mantém a origem (GPS) conhecida em vez de zerá-la', () => {
    // Sem isso, sair da navegação (botão "X") zera `origin` para null; como o
    // efeito em App.tsx que repõe `origin` só reage a uma MUDANÇA de
    // referência em `geolocation.position` (não a `state.origin` em si), e o
    // hook de geolocalização mantém a mesma referência enquanto o
    // dispositivo está parado (deadband de ruído), `origin` ficava preso em
    // null indefinidamente — e sem origem, o efeito que chama `planRoute`
    // nunca dispara, então escolher um novo destino não fazia nada
    // (sintoma relatado: "depois do X, não consigo pesquisar de novo").
    const withOrigin = navigationReducer(initialNavigationState, {
      type: 'SET_ORIGIN',
      origin: { lat: -15.79, lng: -47.88 },
    });
    const planned = navigationReducer(withOrigin, { type: 'ROUTE_PLANNED', route: sampleRoute });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });

    const reset = navigationReducer(navigating, { type: 'RESET' });

    expect(reset.origin).toEqual({ lat: -15.79, lng: -47.88 });
    expect(reset.destination).toBeNull();
    expect(reset.route).toBeNull();
    expect(reset.status).toBe('idle');
  });
});
