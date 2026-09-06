// Fração da altura do container em que o veículo fica durante a navegação,
// medida a partir do centro para baixo (0.30 ≈ 80% da altura). É usada em dois
// lugares que precisam concordar exatamente:
//  - `useMapboxMap`: deriva o `padding.top` do `jumpTo` da câmera de condução
//    (padding.top = 2 · ratio · altura → o centro cai a (0.5 + ratio) da altura);
//  - `MapView`: a posição na tela do ícone fixo do veículo.
// Com os dois no mesmo valor, o ponto do veículo (início da linha da rota) cai
// exatamente sob o ícone — a linha "encosta" no veículo em qualquer rotação.
export const NAV_PUCK_VERTICAL_OFFSET_RATIO = 0.3;

// Tamanho (px) do ícone do veículo na navegação — bem maior que os 46px do
// avatar base, em destaque na linha como no Waze/Maps.
export const NAV_VEHICLE_ICON_PX = 88;

// --- Câmera de condução: seguimento quadro a quadro (rAF) ---
// O GPS só entrega um fix novo a cada ~1,2 s (ver POLL_INTERVAL_MS), e um
// `easeTo` por fix nunca terminava a tempo no celular (dropava frames) — o
// veículo do desenho ficava atrás e, nas curvas, saía da linha durante a
// rotação. Agora um laço de requestAnimationFrame avança sozinho, a cada quadro,
// um "ponto renderizado" ao longo da rota, na velocidade medida, e chama
// `jumpTo` — a câmera acompanha o veículo real em tempo real e faz a curva
// grudada na linha.

// Teto do avanço por conta própria (dead-reckoning) desde o último fix. Se o GPS
// travar, o ponto renderizado para de correr depois disso em vez de "voar".
export const NAV_DR_MAX_SECONDS = 2.5;
// Abaixo desta velocidade trata como parado — não deixa o ponto renderizado
// escorregar para frente por ruído de velocidade quando o veículo está imóvel.
export const NAV_DR_MIN_SPEED_MPS = 0.5;
// Suavização por quadro do ponto renderizado em direção ao alvo (dead-reckoning):
// quando um fix novo reposiciona a âncora, o ponto caminha até lá em vez de
// saltar. ~0.18/quadro ≈ acompanha em ~0,2 s a 60 fps.
export const NAV_POSITION_SMOOTHING = 0.18;
// Suavização por quadro da rotação da câmera até o rumo-alvo. ~0.09/quadro ≈
// assenta em ~0,5 s a 60 fps — curva vira giro gradual, sem tranco, e continua
// assentando mesmo com o veículo parado (o laço rAF não para).
export const NAV_BEARING_SMOOTHING_PER_FRAME = 0.09;
// Comprimento (m) da corda usada para tirar o rumo "à frente" na rota — direção
// estável nas rotatórias (ver forwardBearingAlong).
export const NAV_BEARING_SAMPLE_METERS = 25;
// Se o heading do GPS diverge tanto assim do rumo da rota, o usuário
// provavelmente saiu da pista — aí a câmera respeita o GPS.
export const NAV_OFF_ROUTE_HEADING_DIVERGENCE_DEGREES = 65;
// Duração do easeTo pontual usado só na ENTRADA da navegação e no botão
// "Centralizar" (o seguimento contínuo é o laço rAF, não este).
export const NAV_CAMERA_ENTRY_EASE_MS = 600;
