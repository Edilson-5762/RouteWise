import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveNavigationSnapshot,
  loadNavigationSnapshot,
  clearNavigationSnapshot,
} from './navigationPersistence';
import { initialNavigationState } from './navigationReducer';
import type { NavigationState, Route } from '../../types';

const route: Route = {
  geometry: [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
  ],
  steps: [
    {
      instruction: 'Siga em frente',
      distanceMeters: 100,
      durationSeconds: 10,
      maneuverLocation: { lat: 0, lng: 0 },
      maneuverType: 'turn',
      maneuverModifier: null,
    },
  ],
  distanceMeters: 100,
  durationSeconds: 10,
};

const navigating: NavigationState = {
  ...initialNavigationState,
  status: 'navigating',
  origin: { lat: -23.55, lng: -46.63 },
  destination: { lat: -23.56, lng: -46.65 },
  route,
  currentStepIndex: 0,
  travelProfile: 'driving',
};

describe('navigationPersistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('faz round-trip do estado de navegação e do placeName', () => {
    saveNavigationSnapshot(navigating, 'Av. Paulista');

    const loaded = loadNavigationSnapshot();

    expect(loaded).not.toBeNull();
    expect(loaded?.placeName).toBe('Av. Paulista');
    expect(loaded?.origin).toEqual({ lat: -23.55, lng: -46.63 });
    expect(loaded?.destination).toEqual({ lat: -23.56, lng: -46.65 });
    expect(loaded?.route).toEqual(route);
    expect(loaded?.currentStepIndex).toBe(0);
    expect(loaded?.travelProfile).toBe('driving');
  });

  it('não salva nada quando não está navegando', () => {
    saveNavigationSnapshot({ ...navigating, status: 'routePlanned' }, 'Av. Paulista');

    expect(loadNavigationSnapshot()).toBeNull();
  });

  it('retorna null quando não há snapshot salvo', () => {
    expect(loadNavigationSnapshot()).toBeNull();
  });

  it('ignora um snapshot com mais de 30 minutos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    saveNavigationSnapshot(navigating, 'Av. Paulista');

    vi.setSystemTime(new Date('2026-01-01T12:31:00Z'));

    expect(loadNavigationSnapshot()).toBeNull();
  });

  it('mantém um snapshot com menos de 30 minutos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    saveNavigationSnapshot(navigating, 'Av. Paulista');

    vi.setSystemTime(new Date('2026-01-01T12:20:00Z'));

    expect(loadNavigationSnapshot()).not.toBeNull();
  });

  it('clearNavigationSnapshot remove o snapshot', () => {
    saveNavigationSnapshot(navigating, 'Av. Paulista');
    clearNavigationSnapshot();

    expect(loadNavigationSnapshot()).toBeNull();
  });

  it('não quebra quando sessionStorage lança ao gravar', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => saveNavigationSnapshot(navigating, 'Av. Paulista')).not.toThrow();
  });

  it('retorna null quando sessionStorage lança ao ler', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(loadNavigationSnapshot()).toBeNull();
  });
});
