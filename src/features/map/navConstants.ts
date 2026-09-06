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

// Por quanto tempo, desde o último fix, o ponto renderizado é extrapolado à
// frente na velocidade medida (~1 intervalo de GPS: prevê onde o veículo estará
// no próximo fix, cancelando o atraso). Passado isso, o GPS ficou quieto
// (parado, ou fix suprimido pelo deadband) e o avanço RECOLHE de volta ao ponto
// real da âncora ao longo de NAV_DR_DECAY_SECONDS — sem isso o puck ficava
// cravado ~1 s de viagem à frente sempre que o veículo parava.
export const NAV_DR_EXTRAPOLATE_SECONDS = 1.2;
export const NAV_DR_DECAY_SECONDS = 1;
// Teto ABSOLUTO do avanço extrapolado, em metros — blinda contra uma estimativa
// de velocidade ruim (ex.: derivada de um recálculo de rota) atirar o puck longe.
export const NAV_DR_MAX_CREEP_METERS = 30;
// Abaixo desta velocidade trata como parado — não deixa o ponto renderizado
// escorregar para frente por ruído de velocidade quando o veículo está imóvel.
export const NAV_DR_MIN_SPEED_MPS = 0.5;
// Teto da velocidade DERIVADA de dois fixes (usada só quando o GPS não reporta
// `coords.speed`) — acima disso é salto de recálculo/ruído, não movimento real.
export const NAV_DR_MAX_DERIVED_SPEED_MPS = 45;
// Suavização por quadro do ponto renderizado em direção ao alvo (dead-reckoning):
// quando um fix novo reposiciona a âncora, o ponto caminha até lá em vez de
// saltar. ~0.18/quadro ≈ acompanha em ~0,2 s a 60 fps.
export const NAV_POSITION_SMOOTHING = 0.18;
// Suavização por quadro da rotação da câmera até o rumo-alvo. ~0.09/quadro ≈
// assenta em ~0,5 s a 60 fps — curva vira giro gradual, sem tranco, e continua
// assentando mesmo com o veículo parado (o laço rAF não para).
export const NAV_BEARING_SMOOTHING_PER_FRAME = 0.09;
// Corda usada para tirar o rumo do veículo na rota (ver travelBearingAlong):
// predominantemente PARA TRÁS, para o carro/câmera manterem a direção da perna
// atual e só girarem ao atravessar o vértice — numa curva fechada em "L" o carro
// acompanha até a ponta e só então vira, em vez de cortar a curva. O trecho à
// frente (pequeno) tira o tremor perto do vértice. Total ~20 m = estável em
// rotatória.
export const NAV_BEARING_TRAIL_METERS = 16;
export const NAV_BEARING_LOOKAHEAD_METERS = 4;
// Se o heading do GPS diverge tanto assim do rumo da rota, o usuário
// provavelmente saiu da pista — aí a câmera respeita o GPS. Alto (100°, era 65)
// para uma curva fechada legítima — em que o heading do GPS chega a girar 90° em
// poucos metros — não fazer a câmera "pular" para o heading cru no meio da
// curva. Só um retorno / entrada em contramão (135°+) troca a referência.
export const NAV_OFF_ROUTE_HEADING_DIVERGENCE_DEGREES = 100;
// Duração do easeTo pontual usado só na ENTRADA da navegação e no botão
// "Centralizar" (o seguimento contínuo é o laço rAF, não este).
export const NAV_CAMERA_ENTRY_EASE_MS = 600;

// O laço rAF roda a cada quadro, mas só APLICA a câmera nesta cadência (~30 fps):
// cada `jumpTo` dispara uma cascata de eventos do Mapbox (movestart/move/
// rotate/moveend) e a 60 fps isso, somado ao redesenho da linha, travava a UI
// (os botões de sair/centralizar paravam de responder). 30 fps é suave e leve.
export const NAV_CAMERA_APPLY_MIN_MS = 33;
// Cadência máxima do redesenho da LINHA da rota no laço (mais caro que o jumpTo:
// re-serializa o GeoJSON e re-tesela). ~8 fps é imperceptível para a linha.
export const NAV_LINE_UPDATE_MIN_MS = 120;
// Abaixo destes deltas desde o último `jumpTo` aplicado, o quadro é pulado — com
// o veículo parado a câmera assenta e o laço para de emitir eventos, liberando a
// UI (é isto que mantém os botões responsivos parado no semáforo).
export const NAV_CAMERA_MIN_MOVE_METERS = 0.15;
export const NAV_CAMERA_MIN_TURN_DEGREES = 0.05;
