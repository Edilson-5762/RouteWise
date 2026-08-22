# RouteWise — Experiência de Navegação Estilo Waze

**Data:** 22/08/2026
**Status:** Aprovado para planejamento
**Prazo:** Aberto — prioridade em qualidade sobre velocidade
**Relação com spec anterior:** Estende [2026-08-22-routewise-gps-design.md](./2026-08-22-routewise-gps-design.md). O MVP ali descrito já está implementado e funcionando (branch `feature/routewise-mvp`). Este documento substitui a divisão "MVP vs. Extras" do §9 daquele spec — como o prazo deixou de ser uma restrição, os itens antes marcados como "extras condicionais" (voz, recálculo automático, rotação do mapa, toggle completo de modo) passam a ser escopo obrigatório deste ciclo, junto de funcionalidades novas descritas aqui. Os não-objetivos (§2 do spec anterior) continuam valendo integralmente.

## 1. Propósito e Contexto

O MVP entregue cobre o fluxo básico de navegação (busca, rota, instruções em lista, rastreamento de posição), mas está visualmente e funcionalmente distante de referências reais de navegação como Waze/Google Maps — não há seta de manobra em destaque, seletor de modo de transporte, voz, ou uma tela de navegação imersiva.

Este documento define uma experiência de navegação que reproduz os **padrões funcionais** desses apps (seta de manobra, velocímetro, seletor de modo, voz, câmera de condução) com uma **identidade visual própria e profissional**, deliberadamente **sem** os elementos gamificados/colaborativos do Waze (mascotes animados, ícones de perigo reportados por usuários, sistema de pontos) — esses dependem de dados colaborativos em tempo real de uma base de usuários e exigiriam backend, o que é um não-objetivo explícito do projeto (§2 do spec anterior) e, simulados com dado fake, pesariam contra a avaliação técnica de "segurança de código e governança" que este projeto de portfólio será submetido.

Onde uma referência visual mostra um dado que o projeto não tem como obter honestamente (ex: nota/telefone de estabelecimento, que a Mapbox Geocoding API não retorna), o campo é omitido em vez de simulado.

## 2. Objetivos / Não-Objetivos

**Objetivos:**
- Tela de navegação em tela cheia, no padrão real de apps de GPS: câmera em modo condução, banner de manobra, barra de status inferior
- Seletor de modo de transporte (carro / a pé / bicicleta) funcional antes de iniciar a navegação
- Instruções faladas via Web Speech API, com mudo persistente
- Recálculo automático de rota ao desviar do trajeto planejado
- Locais salvos (Casa/Trabalho/outros) via `localStorage`
- Sistema de design (tipografia, paleta, modo escuro, iconografia) coerente e atual, auto-hospedado (sem dependências de CDN externas que abram a CSP)

**Não-objetivos (herdados do spec anterior + novos, explícitos):**
- Tudo que já era não-objetivo no spec anterior (§2): contas, backend, mapas offline, app nativo, tráfego em produção
- Mascotes/personagens animados
- Ícones de perigo/trânsito ou qualquer dado "reportado por outros usuários" (real ou simulado)
- Nota, telefone ou qualquer metadado de estabelecimento que a Mapbox Geocoding API não forneça
- Troca de modo de transporte **durante** a navegação (só antes de iniciar)
- Busca por voz (entrada) — está fora deste ciclo; o escopo de voz aqui é só saída (instruções faladas)

## 3. Arquitetura

**Decisão principal:** `App.tsx` passa a compor duas telas por estado, em vez de um único layout condicional:
- `PlanningView` — estados `idle` e `routePlanned`
- `NavigationView` — estado `navigating` (tela cheia, substitui totalmente o layout de planejamento)

Motivo: é como apps de navegação reais funcionam (a busca desaparece durante a condução), e mantém cada tela isolada e testável, evitando que `App.tsx` acumule lógica de UI de dois modos completamente diferentes.

### Estrutura de pastas (adições sobre a existente)

```
src/
  components/
    PlanningView.tsx           # composição da tela de planejamento
    NavigationView.tsx         # composição da tela de navegação
    DestinationCard.tsx        # cartão de destino (nome, endereço, ETA, ações)
    SavedPlacesShortcuts.tsx   # atalhos Casa/Trabalho/Novo
    TravelModeToggle.tsx       # carro/a pé/bicicleta
    ManeuverBanner.tsx         # seta + instrução + distância (topo da NavigationView)
    NavigationStatusBar.tsx    # ETA/distância/velocidade/voz/sair (rodapé da NavigationView)
    ArrivalScreen.tsx          # tela breve de chegada
  features/
    voice/
      useVoiceGuidance.ts      # Web Speech API
    places/
      useSavedPlaces.ts        # localStorage: locais salvos
    theme/
      useTheme.ts              # modo claro/escuro
  utils/
    maneuverIcon.ts            # maneuverType/modifier -> ícone Lucide (função pura, testada)
```

## 4. Camada de Dados (fundação)

- `RouteStep` (`types/index.ts`) ganha `maneuverType: string` e `maneuverModifier: string | null`, populados em `mapboxClient.ts` a partir de `step.maneuver.type`/`step.maneuver.modifier`, hoje descartados.
- `useGeolocation` expõe `speedMetersPerSecond: number | null` e `headingDegrees: number | null`, lidos de `coords.speed`/`coords.heading` no callback de `watchPosition`. `null` quando o navegador/GPS não fornece — tratado como estado neutro na UI, não erro.
- `navigationReducer` ganha:
  - Um status terminal `arrived` (`NavigationStatus` passa a ser `'idle' | 'routePlanned' | 'navigating' | 'arrived'`), disparado quando a distância até o destino cai abaixo de um limiar (~30m) durante `POSITION_UPDATED`.
  - Uma flag/contador de desvio de rota, usada pelo hook de recálculo automático (Seção 6) para saber quando disparar uma nova busca de rota sem duplicar chamadas a cada tick de GPS.

## 5. Sistema de Design

- **Tipografia:** Inter (variável), via `@fontsource-variable/inter` (pacote npm, auto-hospedado — sem alterar `font-src` da CSP em `vercel.json`).
- **Ícones:** `lucide-react` (pacote npm, sem CDN — `script-src 'self'` continua intacto).
- **Paleta:** paleta própria definida como variáveis CSS + `darkMode: 'class'` no `tailwind.config.js`, substituindo o uso ad hoc de `blue-600`/etc. espalhado no MVP. Cores semânticas (sucesso/aviso/erro) reaproveitadas pelo `ErrorBanner` existente.
- **Modo escuro:** primeira classe, seguindo `prefers-color-scheme` por padrão com override manual persistido em `localStorage` (`useTheme`). O estilo do mapa Mapbox troca junto: `navigation-day-v1` / `navigation-night-v1` (estilos feitos pela própria Mapbox para apps de navegação) no lugar do `streets-v12` genérico usado hoje.
- **Superfícies:** cantos arredondados grandes (`rounded-2xl`), sombra suave, alvos de toque mínimos de 44px — padrão mobile-first.

## 6. `PlanningView` (estados `idle` / `routePlanned`)

1. **Antes do destino:** campo de busca "Para onde?" (reaproveita `SearchBar`/`useGeocodingSearch`, restilizado) + atalhos "Casa" / "Trabalho" / "+ Novo" de `useSavedPlaces`. Tocar em um atalho já configurado preenche o destino direto; a primeira configuração abre o fluxo normal de busca.
2. **Depois do destino** (rota já calculada — o efeito existente em `App.tsx` que dispara `planRoute` ao selecionar um destino é mantido): `DestinationCard` mostra nome, endereço formatado, distância e ETA reais — sem nota/telefone (Seção 1 da conversa de design). Ações: **Salvar** (`useSavedPlaces`), **Compartilhar** (`navigator.share`, com fallback de copiar para a área de transferência se não suportado), `TravelModeToggle` (troca reconsulta a rota e atualiza o ETA), e o botão "Iniciar navegação".

## 7. `NavigationView` (estado `navigating`)

- **Câmera de condução:** mapa em tela cheia, segue a posição do usuário, gira conforme `headingDegrees`, `pitch` ~60° e zoom mais próximo que no planejamento. Um botão flutuante de recentralizar aparece se o usuário arrastar o mapa para fora do modo de acompanhamento.
- **`ManeuverBanner`** (topo, fixo): ícone de seta (via `maneuverIcon.ts`, mapeando `maneuverType`/`maneuverModifier` para ícones do Lucide, com seta reta como fallback para combinações não mapeadas), nome da via, distância até a manobra contando regressivamente.
- **`NavigationStatusBar`** (rodapé, fixo): tempo restante, horário estimado de chegada, distância restante, badge de velocidade (quando `speedMetersPerSecond` disponível), toggle de voz, botão de sair (encerra a navegação e volta à `PlanningView`).
- **Chegada:** ao atingir o status `arrived` (Seção 4), transiciona para `ArrivalScreen` — confirmação breve com opção de concluir (volta ao estado `idle`).

## 8. Voz e Recálculo Automático

- **`useVoiceGuidance`:** `SpeechSynthesisUtterance` em pt-BR, dispara quando `currentStepIndex` muda durante `navigating`, falando o texto de instrução já retornado pela Directions API. Toggle de mudo com preferência persistida em `localStorage`. Se `window.speechSynthesis` não existir, o toggle não é renderizado.
- **Recálculo automático:** a cada `POSITION_UPDATED` durante a navegação, calcula a distância até o ponto mais próximo da rota (`findNearestPointIndex`, já existente). Acima de ~50m, marca desvio e dispara uma nova chamada a `getDirections` da posição atual ao mesmo destino, substituindo a rota — com guard para disparar uma vez por desvio (mesmo padrão de referência-por-identidade já usado em `App.tsx` para `planRoute`). Mostra aviso não bloqueante "Recalculando rota..." durante a chamada; se falhar, mantém guiando pela última rota válida.

## 9. Tratamento de Erros (adições sobre §6 do spec anterior)

| Cenário | Comportamento |
|---|---|
| GPS sem `speed`/`heading` | Badge de velocidade/rotação neutros, não é erro |
| `speechSynthesis` não suportado | Toggle de voz não renderiza |
| Recálculo de rota falha | Mantém última rota válida, aviso não bloqueante |
| `navigator.share` não suportado | Fallback: copiar link para a área de transferência |
| Dado corrompido em `localStorage` (locais salvos) | Trata como lista vazia |

## 10. Testes

Mantendo o padrão focado (não exaustivo) do §8 do spec anterior:
- Lógica pura: `maneuverIcon.ts`, limiar de desvio de rota, limiar de chegada (junto de `utils/distance.test.ts`)
- Reducer: transições `arrived` e de gatilho de recálculo, seguindo o padrão de `navigationReducer.test.ts`
- Componentes: `DestinationCard` (só renderiza campos reais), `NavigationView`/`ManeuverBanner` (muda com o passo atual), toggle de voz (`speechSynthesis` mockado), `useSavedPlaces` (leitura/escrita e fallback com dado corrompido)
- Mocks seguindo o padrão já usado para o cliente Mapbox, estendido para Web Speech API e `coords.speed`/`heading`

## 11. Segurança

Nenhuma mudança nas práticas já definidas no spec anterior (§7): token via `VITE_MAPBOX_TOKEN`, nunca commitado, restrito por domínio. As adições desta fase (fontes, ícones) são pacotes npm empacotados no build, não origens externas novas — a CSP em `vercel.json` não precisa mudar.

## 12. Perguntas Abertas / Premissas

- Assume que a avaliação técnica valoriza decisões de escopo defensáveis (omitir dado fake) mais do que semelhança visual literal com a referência.
- Assume que o limiar de desvio (~50m) e de chegada (~30m) são pontos de partida razoáveis, ajustáveis durante a implementação se o comportamento em teste real de GPS pedir calibração.
