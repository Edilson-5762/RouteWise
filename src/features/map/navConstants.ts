// Fração da altura do container em que o veículo fica durante a navegação,
// medida a partir do centro para baixo (0.30 ≈ 80% da altura). É usada em dois
// lugares que precisam concordar exatamente:
//  - `useMapboxMap`: o `offset` vertical do `easeTo` da câmera de condução;
//  - `MapView`: a posição na tela do ícone fixo do veículo.
// Com os dois no mesmo valor, o início da linha da rota (que a câmera centraliza
// nessa posição) cai exatamente sob o ícone — a linha "encosta" no veículo.
export const NAV_PUCK_VERTICAL_OFFSET_RATIO = 0.3;

// Tamanho (px) do ícone do veículo na navegação — bem maior que os 46px do
// avatar base, em destaque na linha como no Waze/Maps.
export const NAV_VEHICLE_ICON_PX = 88;

// --- Câmera de condução: antecipação (dead-reckoning) ---
// O GPS só entrega um fix novo a cada ~1,2 s (ver POLL_INTERVAL_MS). Entre um
// fix e outro, a câmera e a linha da rota avançam sozinhas ao longo da rota, na
// velocidade medida, para o carro do desenho representar ONDE VOCÊ ESTÁ AGORA —
// não onde estava 1–2 s atrás. Sem isso o veículo "chegava atrasado" nas curvas.

// Quantos segundos à frente a câmera/linha são projetadas ao longo da rota.
// ~1 fix inteiro: quando o próximo fix chega, o mapa já está no ponto certo.
export const NAV_CAMERA_LEAD_SECONDS = 1.1;
// Teto da antecipação (m). Se a velocidade do GPS vier alta/ruidosa, não deixa a
// câmera "furar" uma curva à frente antes de o veículo real entrar nela.
export const NAV_CAMERA_LEAD_MAX_METERS = 28;
// Abaixo desta velocidade (~7 km/h) não antecipa nada — parado/manobra lenta o
// ganho seria ruído.
export const NAV_CAMERA_LEAD_MIN_SPEED_MPS = 2;
// Duração do easeTo da câmera a cada fix, com curva de tempo LINEAR: cobre o
// intervalo inteiro entre fixes, então a câmera desliza de forma contínua em vez
// de pular para o ponto e congelar até o próximo fix.
export const NAV_CAMERA_EASE_DURATION_MS = 1150;
// Comprimento (m) da corda usada para tirar o rumo "à frente" na rota — direção
// estável nas rotatórias (ver forwardBearingAlong).
export const NAV_BEARING_SAMPLE_METERS = 25;
