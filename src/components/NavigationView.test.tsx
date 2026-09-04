import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavigationView } from './NavigationView';
import { initialNavigationState } from '../features/routing/navigationReducer';
import type { NavigationState } from '../types';

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
        isRecalculating={false}
        routeError={null}
        onRetryRecalc={vi.fn()}
        onExit={vi.fn()}
        onArrivalDone={vi.fn()}
        onExitApp={vi.fn()}
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
        isRecalculating={false}
        routeError={null}
        onRetryRecalc={vi.fn()}
        onExit={vi.fn()}
        onArrivalDone={vi.fn()}
        onExitApp={vi.fn()}
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
        isRecalculating
        routeError={null}
        onRetryRecalc={vi.fn()}
        onExit={vi.fn()}
        onArrivalDone={vi.fn()}
        onExitApp={vi.fn()}
      />,
    );

    expect(screen.getByText('Recalculando a rota…')).toBeInTheDocument();
  });

  it('mostra o erro de recálculo quando routeError está presente e não está recalculando', () => {
    render(
      <NavigationView
        state={navigatingState}
        placeName="Av. Paulista, São Paulo"
        speedMetersPerSecond={null}
        isRecalculating={false}
        routeError="Erro ao recalcular a rota."
        onRetryRecalc={vi.fn()}
        onExit={vi.fn()}
        onArrivalDone={vi.fn()}
        onExitApp={vi.fn()}
      />,
    );

    expect(screen.getByText('Erro ao recalcular a rota.')).toBeInTheDocument();
    expect(screen.queryByText('Recalculando a rota…')).not.toBeInTheDocument();
  });

  it('mostra uma tela de fallback com saída quando a rota/passo está ausente durante a navegação', () => {
    const onExit = vi.fn();
    render(
      <NavigationView
        state={{ ...navigatingState, route: null }}
        placeName="Av. Paulista, São Paulo"
        speedMetersPerSecond={null}
        isRecalculating={false}
        routeError={null}
        onRetryRecalc={vi.fn()}
        onExit={onExit}
        onArrivalDone={vi.fn()}
        onExitApp={vi.fn()}
      />,
    );

    expect(screen.getByText('Não foi possível carregar a navegação.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tentar novamente'));
    expect(onExit).toHaveBeenCalled();
  });

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

  it('pede a trava de tela (wake lock) enquanto está navegando', async () => {
    const request = vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(globalThis.navigator, 'wakeLock', {
      value: { request },
      configurable: true,
    });

    render(
      <NavigationView
        state={navigatingState}
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
    await Promise.resolve();

    expect(request).toHaveBeenCalledWith('screen');

    Object.defineProperty(globalThis.navigator, 'wakeLock', {
      value: undefined,
      configurable: true,
    });
  });
});
