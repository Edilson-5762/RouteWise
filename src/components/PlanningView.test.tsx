import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  beforeEach(() => {
    localStorage.clear();
  });

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
        onToggleTheme={vi.fn()}
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
        onToggleTheme={vi.fn()}
        headingDegrees={null}
      />,
    );

    fireEvent.click(screen.getByText('Iniciar navegação'));

    expect(onStartNavigation).toHaveBeenCalled();
  });

  it('chama onToggleTheme ao clicar no botão de alternar tema', () => {
    const onToggleTheme = vi.fn();

    render(
      <PlanningView
        state={initialNavigationState}
        placeName={null}
        routeError={null}
        isRouteLoading={false}
        onDestinationSelected={vi.fn()}
        onTravelProfileChange={vi.fn()}
        onStartNavigation={vi.fn()}
        onRetryRoute={vi.fn()}
        theme="light"
        onToggleTheme={onToggleTheme}
        headingDegrees={null}
      />,
    );

    fireEvent.click(screen.getByLabelText('Ativar modo escuro'));

    expect(onToggleTheme).toHaveBeenCalled();
  });

  it('pede um nome ao salvar um local e usa a resposta como rótulo', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Casa');
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
        onStartNavigation={vi.fn()}
        onRetryRoute={vi.fn()}
        theme="light"
        onToggleTheme={vi.fn()}
        headingDegrees={null}
      />,
    );

    fireEvent.click(screen.getByText('Salvar'));

    expect(promptSpy).toHaveBeenCalledWith('Nome para este local', 'Av. Paulista, São Paulo');
    // O botão de salvar reflete o estado "salvo" assim que o local persistido
    // bate com o destino atual, confirmando que savePlace foi chamado com o
    // rótulo digitado no prompt (e não com o endereço geocodificado).
    expect(await screen.findByText('Salvo')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('routewise-saved-places') ?? '[]')).toEqual([
      expect.objectContaining({ label: 'Casa' }),
    ]);

    promptSpy.mockRestore();
  });

  it('não salva o local quando o prompt de nome é cancelado', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
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
        onStartNavigation={vi.fn()}
        onRetryRoute={vi.fn()}
        theme="light"
        onToggleTheme={vi.fn()}
        headingDegrees={null}
      />,
    );

    fireEvent.click(screen.getByText('Salvar'));

    expect(promptSpy).toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();

    promptSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it('foca o campo de busca ao clicar em "Novo" nos atalhos de locais salvos', () => {
    render(
      <PlanningView
        state={initialNavigationState}
        placeName={null}
        routeError={null}
        isRouteLoading={false}
        onDestinationSelected={vi.fn()}
        onTravelProfileChange={vi.fn()}
        onStartNavigation={vi.fn()}
        onRetryRoute={vi.fn()}
        theme="light"
        onToggleTheme={vi.fn()}
        headingDegrees={null}
      />,
    );

    fireEvent.click(screen.getByText('Novo'));

    expect(screen.getByLabelText('Buscar destino')).toHaveFocus();
  });
});
