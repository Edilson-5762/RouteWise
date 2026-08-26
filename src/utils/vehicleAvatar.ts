import type { TravelProfile } from '../types';

// Avatares ilustrados (vistos de cima, na direção de deslocamento) para o
// puck do mapa — substituem os glifos de linha genéricos do Lucide usados
// antes para TODOS os modos de transporte, não só moto. O puck gira via
// `setRotation` seguindo o heading do GPS, então a frente de cada
// ilustração (farol/guidão/cabeça) aponta para cima do viewBox, alinhado com
// "sentido de viagem" antes da rotação ser aplicada. Os ícones de linha do
// Lucide continuam em uso só no seletor de modo de transporte (ver
// `TravelModeToggle.tsx`), que é um controle de UI, não um avatar no mapa.

const CAR_AVATAR_MARKUP = `
<svg data-vehicle-avatar="car" width="46" height="46" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="23" cy="38" rx="13" ry="3.4" fill="#000000" opacity="0.28"/>
  <rect x="7" y="9" width="6" height="10" rx="2" fill="#111827"/>
  <rect x="33" y="9" width="6" height="10" rx="2" fill="#111827"/>
  <rect x="7" y="26" width="6" height="10" rx="2" fill="#111827"/>
  <rect x="33" y="26" width="6" height="10" rx="2" fill="#111827"/>
  <rect x="10" y="7" width="26" height="32" rx="9" fill="#2563eb"/>
  <rect x="13.5" y="11" width="19" height="9" rx="3.5" fill="#bfdbfe"/>
  <rect x="13.5" y="25" width="19" height="8" rx="3.5" fill="#93c5fd" opacity="0.85"/>
  <rect x="15" y="21.5" width="16" height="3" rx="1.5" fill="#1e40af" opacity="0.6"/>
  <circle cx="15.5" cy="10.5" r="1.6" fill="#fde68a"/>
  <circle cx="30.5" cy="10.5" r="1.6" fill="#fde68a"/>
</svg>
`.trim();

const MOTORCYCLE_AVATAR_MARKUP = `
<svg data-vehicle-avatar="motorcycle" width="46" height="46" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="23" cy="38" rx="11" ry="3.4" fill="#000000" opacity="0.28"/>
  <rect x="19.5" y="7" width="3" height="7" rx="1.5" fill="#1f2937" transform="rotate(-18 21 10.5)"/>
  <rect x="23.5" y="7" width="3" height="7" rx="1.5" fill="#1f2937" transform="rotate(18 25 10.5)"/>
  <ellipse cx="23" cy="14.5" rx="6.4" ry="3" fill="#ffd700"/>
  <path d="M15 33c-2.4 0-4.4-2-4.4-4.4s2-4.4 4.4-4.4 4.4 2 4.4 4.4S17.4 33 15 33Z" fill="#111827"/>
  <path d="M15 30.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z" fill="#4b5563"/>
  <path d="M31 33c-2.4 0-4.4-2-4.4-4.4s2-4.4 4.4-4.4 4.4 2 4.4 4.4S33.4 33 31 33Z" fill="#111827"/>
  <path d="M31 30.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z" fill="#4b5563"/>
  <path d="M15 28.6h16M23 15v13.6" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M17.5 28.6 21 17.5h4l3.5 11.1" fill="#dc2626"/>
  <path d="M17.5 28.6 21 17.5h4l3.5 11.1" stroke="#991b1b" stroke-width="1" stroke-linejoin="round"/>
  <rect x="20" y="24" width="6" height="5.4" rx="1.4" fill="#111827"/>
  <circle cx="23" cy="15.5" r="5" fill="#111827"/>
  <path d="M18.6 14.4a4.6 4.6 0 0 1 8.8 0" stroke="#4b5563" stroke-width="1.4" fill="none"/>
  <rect x="19.6" y="16.4" width="6.8" height="2.4" rx="1.2" fill="#0ea5e9" opacity="0.85"/>
</svg>
`.trim();

const BICYCLE_AVATAR_MARKUP = `
<svg data-vehicle-avatar="bicycle" width="46" height="46" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="23" cy="38" rx="10" ry="3.2" fill="#000000" opacity="0.28"/>
  <circle cx="15" cy="30" r="6.4" fill="none" stroke="#111827" stroke-width="2"/>
  <circle cx="31" cy="30" r="6.4" fill="none" stroke="#111827" stroke-width="2"/>
  <path d="M15 30 21 18h4l6 12M21 18l-2 12h10" stroke="#374151" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M18 10h6l-2 6h-4z" fill="#4b5563"/>
  <circle cx="23" cy="13" r="5.2" fill="#111827"/>
  <path d="M18.7 12a4.5 4.5 0 0 1 8.6 0" stroke="#6b7280" stroke-width="1.3" fill="none"/>
  <path d="M17 28c1-6 3-9.5 6-11 3 1.5 5 5 6 11" fill="#16a34a"/>
  <path d="M17 28c1-6 3-9.5 6-11 3 1.5 5 5 6 11" stroke="#15803d" stroke-width="1" fill="none"/>
</svg>
`.trim();

const PEDESTRIAN_AVATAR_MARKUP = `
<svg data-vehicle-avatar="pedestrian" width="46" height="46" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="23" cy="36" rx="8" ry="3" fill="#000000" opacity="0.28"/>
  <circle cx="23" cy="12" r="5.6" fill="#f2c9a0"/>
  <path d="M13.5 24c1.5-6.5 4.5-10 9.5-10s8 3.5 9.5 10" fill="#0ea5e9"/>
  <path d="M13.5 24c1.5-6.5 4.5-10 9.5-10s8 3.5 9.5 10" stroke="#0284c7" stroke-width="1" fill="none"/>
  <path d="M15 22 9 30M31 22l6 8" stroke="#0369a1" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M19 30 14 40M27 30l5 10" stroke="#1f2937" stroke-width="2.8" stroke-linecap="round"/>
</svg>
`.trim();

const PUCK_AVATAR_MARKUP: Record<TravelProfile, string> = {
  driving: CAR_AVATAR_MARKUP,
  motorcycling: MOTORCYCLE_AVATAR_MARKUP,
  cycling: BICYCLE_AVATAR_MARKUP,
  walking: PEDESTRIAN_AVATAR_MARKUP,
};

export function getPuckIconMarkup(travelProfile: TravelProfile): string {
  return PUCK_AVATAR_MARKUP[travelProfile];
}
