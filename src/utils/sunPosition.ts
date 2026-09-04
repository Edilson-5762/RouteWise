import type { Coordinates } from '../types';

// Ângulo (graus) abaixo do horizonte que marca o nascer/pôr do sol
// convencional — soma a refração atmosférica (~34') com o raio aparente
// do sol (~16'). É a mesma definição usada por calculadoras solares.
const SUNRISE_SUNSET_ELEVATION_DEG = -0.833;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;
const normalizeDeg = (deg: number) => ((deg % 360) + 360) % 360;

// Posição solar de baixa precisão (fórmula compacta, erro ~0,01° em
// longitude eclíptica) — o bastante para decidir dia/noite; não serve
// para instrumentos de precisão.
function solarElevationDeg(date: Date, coordinates: Coordinates): number {
  const daysSinceJ2000 = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;

  const meanLongitude = normalizeDeg(280.46 + 0.9856474 * daysSinceJ2000);
  const meanAnomaly = normalizeDeg(357.528 + 0.9856003 * daysSinceJ2000);
  const eclipticLongitude = normalizeDeg(
    meanLongitude + 1.915 * Math.sin(toRad(meanAnomaly)) + 0.02 * Math.sin(toRad(2 * meanAnomaly)),
  );
  const obliquity = 23.439 - 0.0000004 * daysSinceJ2000;

  const rightAscension = toDeg(
    Math.atan2(
      Math.cos(toRad(obliquity)) * Math.sin(toRad(eclipticLongitude)),
      Math.cos(toRad(eclipticLongitude)),
    ),
  );
  const declination = toDeg(
    Math.asin(Math.sin(toRad(obliquity)) * Math.sin(toRad(eclipticLongitude))),
  );

  const greenwichMeanSiderealTime = normalizeDeg(280.46061837 + 360.98564736629 * daysSinceJ2000);
  const hourAngle =
    normalizeDeg(greenwichMeanSiderealTime + coordinates.lng - rightAscension + 180) - 180;

  const sinElevation =
    Math.sin(toRad(coordinates.lat)) * Math.sin(toRad(declination)) +
    Math.cos(toRad(coordinates.lat)) * Math.cos(toRad(declination)) * Math.cos(toRad(hourAngle));

  return toDeg(Math.asin(sinElevation));
}

export function isNight(date: Date, coordinates: Coordinates): boolean {
  return solarElevationDeg(date, coordinates) < SUNRISE_SUNSET_ELEVATION_DEG;
}
