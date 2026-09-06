import { describe, it, expect } from 'vitest';
import { computeDriveStep, type DriveAnchor } from './driveCamera';
import { polylineLengthMeters } from '../../utils/distance';
import type { Coordinates } from '../../types';

// Reta para o norte, ~111 m entre vértices.
const straight: Coordinates[] = [
  { lat: 0, lng: 0 },
  { lat: 0.001, lng: 0 },
  { lat: 0.002, lng: 0 },
  { lat: 0.003, lng: 0 },
];
const straightLen = polylineLengthMeters(straight);

function anchor(over: Partial<DriveAnchor> = {}): DriveAnchor {
  return { alongMeters: 100, atMs: 1000, speedMps: 10, ...over };
}

describe('computeDriveStep', () => {
  it('no 1º quadro encaixa direto no ponto do dead-reckoning (sem suavizar de null)', () => {
    const step = computeDriveStep({
      geometry: straight,
      routeLengthMeters: straightLen,
      anchor: anchor({ alongMeters: 100, atMs: 1000, speedMps: 10 }),
      nowMs: 1000, // 0 s de avanço
      renderedAlongMeters: null,
      smoothedBearingDegrees: null,
      headingDegrees: null,
      clientHeightPx: 800,
    });
    expect(step).not.toBeNull();
    // 100 m ao longo de uma reta para o norte → ainda no segmento 0.
    expect(step!.lineProjection.alongMeters).toBeCloseTo(100, 0);
    // Rumo ~norte.
    expect(step!.bearingDegrees).toBeCloseTo(0, 0);
  });

  it('avança o ponto pela velocidade × tempo desde a âncora', () => {
    const step = computeDriveStep({
      geometry: straight,
      routeLengthMeters: straightLen,
      anchor: anchor({ alongMeters: 100, atMs: 1000, speedMps: 10 }),
      nowMs: 2000, // +1 s → +10 m
      renderedAlongMeters: 100,
      smoothedBearingDegrees: 0,
      headingDegrees: null,
      clientHeightPx: 800,
    });
    // Suavização 0.18: 100 + (110 - 100) * 0.18 = 101.8
    expect(step!.renderedAlongMeters).toBeCloseTo(101.8, 1);
  });

  it('GPS quieto por muito tempo: o avanço extrapolado RECOLHE de volta ao ponto da âncora', () => {
    // Logo após a janela de extrapolação (1,2 s), ainda há avanço.
    const mid = computeDriveStep({
      geometry: straight,
      routeLengthMeters: straightLen,
      anchor: anchor({ alongMeters: 100, atMs: 1000, speedMps: 10 }),
      nowMs: 1000 + 1500,
      renderedAlongMeters: null,
      smoothedBearingDegrees: 0,
      headingDegrees: null,
      clientHeightPx: 800,
    });
    expect(mid!.renderedAlongMeters).toBeGreaterThan(100);

    // Bem depois (GPS travado): o avanço já decaiu a zero → volta ao ponto real.
    const settled = computeDriveStep({
      geometry: straight,
      routeLengthMeters: straightLen,
      anchor: anchor({ alongMeters: 100, atMs: 1000, speedMps: 10 }),
      nowMs: 1000 + 60_000,
      renderedAlongMeters: null,
      smoothedBearingDegrees: 0,
      headingDegrees: null,
      clientHeightPx: 800,
    });
    expect(settled!.renderedAlongMeters).toBeCloseTo(100, 5);
  });

  it('blinda contra estimativa de velocidade absurda com o teto de avanço (NAV_DR_MAX_CREEP_METERS)', () => {
    const step = computeDriveStep({
      geometry: straight,
      routeLengthMeters: straightLen,
      anchor: anchor({ alongMeters: 100, atMs: 1000, speedMps: 999 }),
      nowMs: 1000 + 1000,
      renderedAlongMeters: null,
      smoothedBearingDegrees: 0,
      headingDegrees: null,
      clientHeightPx: 800,
    });
    // 999 m/s daria centenas de metros — o teto segura em +30 m.
    expect(step!.renderedAlongMeters).toBeLessThanOrEqual(100 + 30 + 0.01);
  });

  it('parado (velocidade abaixo do piso) não escorrega para frente', () => {
    const step = computeDriveStep({
      geometry: straight,
      routeLengthMeters: straightLen,
      anchor: anchor({ alongMeters: 100, atMs: 1000, speedMps: 0.1 }),
      nowMs: 5000,
      renderedAlongMeters: 100,
      smoothedBearingDegrees: 0,
      headingDegrees: null,
      clientHeightPx: 800,
    });
    expect(step!.renderedAlongMeters).toBeCloseTo(100, 5);
  });

  it('gira o rumo aos poucos em direção ao alvo (sem tranco)', () => {
    // Rota que vira 90° para leste na metade.
    const turning: Coordinates[] = [
      { lat: 0, lng: 0 },
      { lat: 0.001, lng: 0 },
      { lat: 0.001, lng: 0.001 },
      { lat: 0.001, lng: 0.002 },
    ];
    const step = computeDriveStep({
      geometry: turning,
      routeLengthMeters: polylineLengthMeters(turning),
      anchor: { alongMeters: polylineLengthMeters(turning) - 40, atMs: 1000, speedMps: 8 },
      nowMs: 1000,
      renderedAlongMeters: polylineLengthMeters(turning) - 40,
      smoothedBearingDegrees: 0, // ainda apontando norte
      headingDegrees: null,
      clientHeightPx: 800,
    });
    // Alvo é ~90° (leste), mas num quadro só caminha ~9% do caminho.
    expect(step!.bearingDegrees).toBeGreaterThan(0);
    expect(step!.bearingDegrees).toBeLessThan(20);
  });

  it('deriva o padding.top da altura da tela para o centro cair a 80% (ratio 0.3)', () => {
    const step = computeDriveStep({
      geometry: straight,
      routeLengthMeters: straightLen,
      anchor: anchor(),
      nowMs: 1000,
      renderedAlongMeters: null,
      smoothedBearingDegrees: null,
      headingDegrees: null,
      clientHeightPx: 1000,
    });
    // padding.top = 2 * 0.3 * 1000 = 600 → box [600..1000], centro em 800 = 80%.
    expect(step!.paddingTopPx).toBeCloseTo(600, 5);
  });

  it('segue o heading do GPS quando ele diverge muito do rumo da rota (fora da pista)', () => {
    const step = computeDriveStep({
      geometry: straight, // rota aponta norte (0°)
      routeLengthMeters: straightLen,
      anchor: anchor({ speedMps: 5 }),
      nowMs: 1000,
      renderedAlongMeters: 100,
      smoothedBearingDegrees: 180,
      headingDegrees: 180, // andando para o sul → divergência de 180°
      clientHeightPx: 800,
    });
    // Alvo passa a ser 180 (heading), e já estava em 180 → continua ~180.
    expect(step!.bearingDegrees).toBeCloseTo(180, 0);
  });

  it('geometria degenerada devolve null', () => {
    expect(
      computeDriveStep({
        geometry: [{ lat: 0, lng: 0 }],
        routeLengthMeters: 0,
        anchor: anchor(),
        nowMs: 1000,
        renderedAlongMeters: null,
        smoothedBearingDegrees: null,
        headingDegrees: null,
        clientHeightPx: 800,
      }),
    ).toBeNull();
  });
});
