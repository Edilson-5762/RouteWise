import { describe, it, expect } from 'vitest';
import {
  haversineDistanceMeters,
  findNearestPointIndex,
  bearingBetween,
  signedBearingDelta,
  polylineLengthMeters,
  projectOntoRoute,
  locateAlongRoute,
  forwardBearingAlong,
  travelBearingAlong,
  turnAngleAtPoint,
} from './distance';

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

describe('bearingBetween', () => {
  it('aponta ~90° (leste) e ~0° (norte)', () => {
    expect(bearingBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 0);
    expect(bearingBetween({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 0);
  });
});

describe('signedBearingDelta', () => {
  it('positivo quando o alvo está à direita', () => {
    expect(signedBearingDelta(90, 180)).toBeCloseTo(90);
  });

  it('negativo quando o alvo está à esquerda', () => {
    expect(signedBearingDelta(90, 0)).toBeCloseTo(-90);
  });

  it('lida com a virada dos 360°', () => {
    expect(signedBearingDelta(350, 10)).toBeCloseTo(20);
    expect(signedBearingDelta(10, 350)).toBeCloseTo(-20);
  });
});

describe('polylineLengthMeters', () => {
  it('soma o comprimento de todos os segmentos', () => {
    const line = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0, lng: 0.002 },
    ];
    const total = polylineLengthMeters(line);
    const single = haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 });
    expect(total).toBeCloseTo(single * 2, 1);
  });
});

describe('projectOntoRoute', () => {
  // Linha reta indo para leste, ~111m entre vértices consecutivos.
  const line = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
    { lat: 0, lng: 0.002 },
    { lat: 0, lng: 0.003 },
  ];

  it('mede a distância PERPENDICULAR ao segmento, não até o vértice mais próximo', () => {
    // No meio de um segmento longo e ~11m ao lado: a distância até o vértice
    // mais próximo seria ~55m, mas a perpendicular é ~11m.
    const projection = projectOntoRoute({ lat: 0.0001, lng: 0.0005 }, line);
    expect(projection.distanceMeters).toBeGreaterThan(9);
    expect(projection.distanceMeters).toBeLessThan(13);
    expect(projection.segmentIndex).toBe(0);
  });

  it('reporta a distância acumulada ao longo da rota até a projeção do ponto', () => {
    const projection = projectOntoRoute({ lat: 0, lng: 0.0015 }, line);
    const half = polylineLengthMeters(line) / 2;
    expect(projection.alongMeters).toBeCloseTo(half, 0);
  });

  it('a janela impede casar com um trecho distante de uma rota que passa perto de si mesma', () => {
    // Rota que volta rente a si mesma: o ponto está colado no trecho de volta
    // (índice ~3), mas dentro da janela inicial (0–1) o mais próximo é o trecho
    // de ida, ~22m à frente.
    const uTurn = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0.0002, lng: 0.001 },
      { lat: 0.0002, lng: 0 },
    ];
    const point = { lat: 0.0002, lng: 0.0005 };
    const semJanela = projectOntoRoute(point, uTurn);
    expect(semJanela.segmentIndex).toBe(2);

    const comJanela = projectOntoRoute(point, uTurn, { fromIndex: 0, toIndex: 1 });
    expect(comJanela.segmentIndex).toBe(0);
    expect(comJanela.distanceMeters).toBeGreaterThan(15);
  });

  // Retorno (hairpin): a perna de volta passa a poucos metros da perna de ida.
  //  P0(0,0) → P1 → P2 sobe ~55 m ao norte; P3 é a ponta; P4 → P5 desce a volta
  //  ~11 m a leste. Um fix ruidoso perto da perna de volta "pula" ~30 m à frente.
  const hairpin = [
    { lat: 0, lng: 0 },
    { lat: 0.0004, lng: 0 },
    { lat: 0.0005, lng: 0 },
    { lat: 0.00052, lng: 0.00011 },
    { lat: 0.0004, lng: 0.0001 },
    { lat: 0, lng: 0.0001 },
  ];
  // ~5 m antes da ponta na perna de IDA (along ~50 m), mas o fix caiu para o
  // lado da perna de VOLTA.
  const noisyFix = { lat: 0.00045, lng: 0.00007 };

  it('sem banda de distância-ao-longo, o fix ruidoso "pula" para a perna de volta do retorno', () => {
    const p = projectOntoRoute(noisyFix, hairpin);
    expect(p.alongMeters).toBeGreaterThan(70);
  });

  it('com banda de distância-ao-longo (aroundAlongMeters + maxAhead), não pula o retorno', () => {
    const p = projectOntoRoute(noisyFix, hairpin, {
      aroundAlongMeters: 48,
      maxAheadMeters: 12,
      maxBehindMeters: 15,
    });
    // Sem banda pularia para ~76 m (perna de volta); com banda fica na ida.
    expect(p.alongMeters).toBeLessThan(60);
  });

  it('se a banda exclui todos os segmentos, cai no melhor sem banda (não zera alongMeters)', () => {
    const p = projectOntoRoute(noisyFix, hairpin, {
      aroundAlongMeters: 500,
      maxAheadMeters: 5,
      maxBehindMeters: 5,
    });
    expect(p.alongMeters).toBeGreaterThan(0);
  });
});

describe('locateAlongRoute', () => {
  // Linha reta indo para leste, ~111m entre vértices consecutivos.
  const line = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
    { lat: 0, lng: 0.002 },
    { lat: 0, lng: 0.003 },
  ];
  const segLen = haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 });

  it('no início da rota devolve o primeiro ponto', () => {
    const loc = locateAlongRoute(line, 0);
    expect(loc.point).toEqual({ lat: 0, lng: 0 });
    expect(loc.segmentIndex).toBe(0);
  });

  it('interpola dentro do segmento na distância pedida', () => {
    const loc = locateAlongRoute(line, segLen * 1.5);
    expect(loc.segmentIndex).toBe(1);
    expect(loc.point.lng).toBeCloseTo(0.0015, 6);
    expect(loc.alongMeters).toBeCloseTo(segLen * 1.5, 1);
  });

  it('fixa no fim da rota quando a distância passa do comprimento total', () => {
    const loc = locateAlongRoute(line, segLen * 99);
    expect(loc.point).toEqual({ lat: 0, lng: 0.003 });
    expect(loc.alongMeters).toBeCloseTo(segLen * 3, 1);
  });

  it('distância negativa cai no início', () => {
    expect(locateAlongRoute(line, -50).point).toEqual({ lat: 0, lng: 0 });
  });
});

describe('forwardBearingAlong', () => {
  it('numa reta para leste, o rumo à frente é ~90°', () => {
    const line = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0, lng: 0.002 },
    ];
    expect(forwardBearingAlong(line, 0, 50)).toBeCloseTo(90, 0);
  });

  it('a corda longa "corta" o bico da curva, dando um rumo entre os dois trechos', () => {
    // Vai para o norte e depois vira para leste, curva em (0.001, 0).
    const line = [
      { lat: 0, lng: 0 },
      { lat: 0.001, lng: 0 },
      { lat: 0.001, lng: 0.001 },
    ];
    const nearCorner = polylineLengthMeters([
      { lat: 0, lng: 0 },
      { lat: 0.001, lng: 0 },
    ]);
    // Amostra longa o bastante para pegar os dois lados da curva → rumo ~45°.
    const bearing = forwardBearingAlong(line, nearCorner - 20, 60);
    expect(bearing).not.toBeNull();
    expect(bearing!).toBeGreaterThan(20);
    expect(bearing!).toBeLessThan(80);
  });

  it('perto do fim da rota, cai no último segmento real', () => {
    const line = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
    ];
    expect(forwardBearingAlong(line, 999, 50)).toBeCloseTo(90, 0);
  });

  it('linha degenerada devolve null', () => {
    expect(forwardBearingAlong([{ lat: 0, lng: 0 }], 0, 50)).toBeNull();
  });
});

describe('travelBearingAlong', () => {
  // Sobe para o norte (0→0.001 lat) e depois vira 90° para leste. Quina em
  // (0.001, 0), ~111 m do início.
  const elle = [
    { lat: 0, lng: 0 },
    { lat: 0.001, lng: 0 },
    { lat: 0.001, lng: 0.001 },
  ];
  const corner = polylineLengthMeters([
    { lat: 0, lng: 0 },
    { lat: 0.001, lng: 0 },
  ]);

  it('a ~15 m ANTES da quina do "L", a corda com viés para trás ainda aponta ~norte (não corta a curva)', () => {
    const b = travelBearingAlong(elle, corner - 15, 16, 4);
    expect(b).not.toBeNull();
    // Norte = 0°/360°. Com trás=16 (norte) e frente=4 (~na quina), fica quase norte.
    expect(Math.min(b!, 360 - b!)).toBeLessThan(20);
  });

  it('JÁ na quina, a corda começa a girar (rumo entre norte e leste)', () => {
    const b = travelBearingAlong(elle, corner + 2, 16, 4)!;
    expect(b).toBeGreaterThan(15);
    expect(b).toBeLessThan(85);
  });

  it('~16 m DEPOIS da quina, já aponta ~leste (curva concluída)', () => {
    const b = travelBearingAlong(elle, corner + 16, 16, 4)!;
    expect(b).toBeGreaterThan(80);
    expect(b).toBeLessThan(100);
  });

  it('uma corda só para a frente (o comportamento antigo) cortaria a curva bem antes', () => {
    // Mesmo ponto do 1º caso (15 m antes da quina), mas olhando 25 m à frente:
    // já aponta bem virado para leste — é exatamente o "corte" que queríamos evitar.
    const forward = travelBearingAlong(elle, corner - 15, 0, 25)!;
    expect(forward).toBeGreaterThan(30);
  });
});

describe('turnAngleAtPoint', () => {
  it('curva de 90° para a DIREITA → ângulo ~+90 (positivo = direita)', () => {
    // Sobe para o norte e vira para leste. Quina em (0, 0).
    const line = [
      { lat: -0.002, lng: 0 },
      { lat: -0.001, lng: 0 },
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0, lng: 0.002 },
    ];
    const angle = turnAngleAtPoint(line, { lat: 0, lng: 0 });
    expect(angle).not.toBeNull();
    expect(angle!).toBeGreaterThan(75);
    expect(angle!).toBeLessThan(105);
  });

  it('curva de 90° para a ESQUERDA → ângulo ~-90 (negativo = esquerda)', () => {
    const line = [
      { lat: -0.002, lng: 0 },
      { lat: -0.001, lng: 0 },
      { lat: 0, lng: 0 },
      { lat: 0, lng: -0.001 },
      { lat: 0, lng: -0.002 },
    ];
    const angle = turnAngleAtPoint(line, { lat: 0, lng: 0 });
    expect(angle).not.toBeNull();
    expect(angle!).toBeGreaterThan(-105);
    expect(angle!).toBeLessThan(-75);
  });

  it('via reta → ângulo ~0', () => {
    const line = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0, lng: 0.002 },
      { lat: 0, lng: 0.003 },
    ];
    const angle = turnAngleAtPoint(line, { lat: 0, lng: 0.0015 });
    expect(angle).not.toBeNull();
    expect(Math.abs(angle!)).toBeLessThan(10);
  });

  it('geometria insuficiente → null', () => {
    expect(turnAngleAtPoint([{ lat: 0, lng: 0 }], { lat: 0, lng: 0 })).toBeNull();
    expect(turnAngleAtPoint([], { lat: 0, lng: 0 })).toBeNull();
  });
});
