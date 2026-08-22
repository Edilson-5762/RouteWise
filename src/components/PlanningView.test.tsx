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
