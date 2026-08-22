import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
        routeError={null}
        onRetryRecalc={vi.fn()}
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
        routeError={null}
        onRetryRecalc={vi.fn()}
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
        routeError={null}
        onRetryRecalc={vi.fn()}
        onExit={vi.fn()}
        onArrivalDone={vi.fn()}
      />,
    );

    expect(screen.getByText('Recalculando rota...')).toBeInTheDocument();
  });

  it('mostra o erro de recálculo quando routeError está presente e não está recalculando', () => {
    render(
      <NavigationView
        state={navigatingState}
        placeName="Av. Paulista, São Paulo"
        speedMetersPerSecond={null}
        headingDegrees={null}
        theme="light"
        isRecalculating={false}
        routeError="Erro ao recalcular a rota."
        onRetryRecalc={vi.fn()}
        onExit={vi.fn()}
        onArrivalDone={vi.fn()}
      />,
    );

    expect(screen.getByText('Erro ao recalcular a rota.')).toBeInTheDocument();
    expect(screen.queryByText('Recalculando rota...')).not.toBeInTheDocument();
  });

  it('mostra uma tela de fallback com saída quando a rota/passo está ausente durante a navegação', () => {
    const onExit = vi.fn();
    render(
      <NavigationView
        state={{ ...navigatingState, route: null }}
        placeName="Av. Paulista, São Paulo"
        speedMetersPerSecond={null}
        headingDegrees={null}
        theme="light"
        isRecalculating={false}
        routeError={null}
        onRetryRecalc={vi.fn()}
        onExit={onExit}
        onArrivalDone={vi.fn()}
      />,
    );

    expect(screen.getByText('Não foi possível carregar a navegação.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tentar novamente'));
    expect(onExit).toHaveBeenCalled();
  });
});
