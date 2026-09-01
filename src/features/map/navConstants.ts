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
