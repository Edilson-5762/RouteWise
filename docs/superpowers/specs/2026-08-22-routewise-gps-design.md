# RouteWise — App Web de GPS e Navegação Interativa

**Data:** 22/08/2026
**Status:** Aprovado para planejamento
**Prazo:** Apresentação em 25/08/2026 (3 dias a partir da aprovação do design)

## 1. Propósito e Contexto

RouteWise é um app web de navegação GPS interativa, no estilo Waze/Google Maps. O usuário busca um destino, escolhe entre as sugestões, e o app calcula e exibe uma rota a partir da localização atual, guiando o usuário ao vivo enquanto ele se movimenta.

Esse projeto está sendo construído como peça de portfólio para ser formalmente avaliado como parte de um processo seletivo, e também será publicado no GitHub/LinkedIn para atrair recrutadores. A avaliação foi explicitamente descrita como pesando fortemente **qualidade visual/front-end**, **segurança do código**, **governança** e **estrutura do projeto** — não só se a funcionalidade funciona. Este spec e o plano de implementação resultante tratam higiene de segurança, CI, testes e documentação como entregáveis de primeira classe, não como polimento de última hora.

Dado o prazo de 3 dias, o escopo foi dividido em um **MVP** (obrigatório, totalmente polido) e **diferenciais extras** (adicionados só se o MVP terminar cedo, sem comprometer a qualidade do MVP).

## 2. Objetivos / Não-Objetivos

**Objetivos:**
- Um app de navegação ao vivo funcional, implantado (deploy) e visualmente polido
- Tratamento de credenciais de API comprovadamente seguro
- Boa governança de projeto comprovável (CI, lint, testes, documentação)
- Estrutura de projeto limpa e deliberada, que se apresenta bem a um avaliador

**Não-objetivos (fora de escopo, explicitamente):**
- Contas de usuário, autenticação ou qualquer backend/banco de dados
- Salvar rotas ou histórico no servidor (usar `localStorage` no navegador é suficiente)
- Suporte a mapas offline
- Empacotamento como app mobile nativo
- Suportar tráfego de produção em escala pública (é um app de demonstração/portfólio)

## 3. Arquitetura

- **Ferramenta de build / framework:** Vite + React + TypeScript (modo `strict` ativado)
- **Estilo:** Tailwind CSS
- **Mapa e rotas:** Mapbox GL JS usado diretamente (sem o wrapper `react-map-gl`), encapsulado em hooks React customizados, para ter controle total sobre o comportamento da câmera (necessário para o diferencial de rotação do mapa) e demonstrar fluência com a API real
- **Gerenciamento de estado:** Sem biblioteca externa de estado. Estado local de componente mais uma máquina de estados via `useReducer` (`idle → routePlanned → navigating`) para o fluxo principal de navegação
- **Hospedagem:** SPA 100% client-side, sem backend. Deploy na Vercel (plano gratuito), com deploy automático a partir da branch `main` no GitHub
- **Repositório:** https://github.com/Edilson-5762/RouteWise

### Estrutura de pastas (organizada por feature)

```
src/
  components/         # UI de apresentação: SearchBar, MapView, RouteInstructions,
                       # TravelModeToggle, ErrorBanner, etc.
  features/
    map/               # hooks do Mapbox (useMap) e configuração do mapa
    routing/           # cliente da Directions API, lógica de matching de rota/passos
    geolocation/        # hook useGeolocation (posição atual + watch)
    search/             # lógica e hook de geocoding/autocomplete
  services/            # mapboxClient.ts — wrapper tipado de fetch para as APIs do Mapbox
  types/               # tipos TypeScript compartilhados (Route, Step, Coordinates, ...)
  utils/               # funções puras (cálculo de distância, formatação) — testadas
  App.tsx
  main.tsx
.github/
  workflows/ci.yml      # lint -> typecheck -> test -> build
.env.example
vercel.json             # headers de segurança
```

Os testes ficam junto do código que testam (`Componente.test.tsx` ao lado de `Componente.tsx`, `utils/distance.test.ts` ao lado de `utils/distance.ts`).

## 4. Fluxo de Dados

1. **Ao carregar:** pede permissão de geolocalização pela Geolocation API do navegador. Em caso de sucesso, centraliza o mapa na posição atual e marca a origem. Em caso de negação/falha, mostra um estado de erro dedicado com ação de "tentar novamente" (ver §6) — o app não pode continuar sem uma origem, já que a origem é sempre a "localização atual" (sem entrada manual de origem, por design).
2. **Busca de destino:** conforme o usuário digita no campo de busca, chamadas *debounced* (300ms) são feitas à Mapbox Geocoding API assim que a busca tem 3+ caracteres. As sugestões aparecem em uma lista suspensa; ao selecionar uma, define as coordenadas do destino e marca no mapa.
3. **Planejamento da rota:** com origem e destino definidos, chama a Mapbox Directions API (modo padrão: carro) para obter a geometria da rota (GeoJSON), a lista de passos com instruções, e distância/duração totais. Desenha a linha da rota no mapa, popula o painel de instruções, e mostra um resumo de distância/ETA.
4. **Navegação ao vivo:** ao clicar em "Iniciar navegação", a máquina de estados transiciona para `navigating` e inicia o `watchPosition`. A cada atualização de posição: recentraliza o mapa no usuário, calcula o progresso em relação aos passos da rota (encontrando o ponto mais próximo na rota), avança a instrução atual quando um passo é concluído, e atualiza a distância restante/ETA.
5. **Comportamentos extras (§9):** se habilitados e houver tempo — recálculo automático de rota em caso de desvio, instruções faladas via Web Speech API, e rotação do mapa seguindo a direção do usuário.

## 5. Modos de Transporte

A Mapbox Directions API suporta carro, a pé e bicicleta pelo mesmo endpoint (parâmetro `profile` diferente). O MVP entrega apenas o modo carro. O componente `TravelModeToggle` (permitindo trocar para a pé/bicicleta, recalculando a rota na troca) é um item extra conforme §9 — o serviço de rotas e o reducer já são projetados para aceitar um parâmetro `profile` desde o início, então adicionar o toggle depois é uma mudança pequena e puramente aditiva.

## 6. Tratamento de Erros

| Cenário | Comportamento |
|---|---|
| Permissão de geolocalização negada ou navegador sem suporte | Estado de erro dedicado explicando por que o app precisa de acesso à localização, com ação "tentar novamente" |
| Falha de rede ou limite de requisições na API do Mapbox | Aviso não bloqueante com ação de tentar novamente; não derruba o app |
| Nenhuma rota encontrada para o modo/destino escolhido | Mensagem específica ("nenhuma rota encontrada para este modo de transporte"), não um erro genérico |
| Busca com menos de 3 caracteres | Nenhuma chamada de API é feita (evita gasto de cota desnecessário) |

## 7. Segurança

- O token de acesso do Mapbox é lido de `VITE_MAPBOX_TOKEN` em tempo de build e **nunca é commitado**. `.env` está no `.gitignore`; `.env.example` é commitado com um valor de exemplo e instruções de configuração no README.
- O token é restrito por domínio no painel do Mapbox (domínio de produção + `localhost` para desenvolvimento) — documentado passo a passo no README para que um avaliador possa verificar a prática mesmo sem acesso ao painel.
- Sem `dangerouslySetInnerHTML` nem outra manipulação insegura do DOM.
- Headers básicos de segurança (CSP, `X-Content-Type-Options`, etc.) configurados via `vercel.json`.
- O CI roda `npm audit --audit-level=high` como etapa do pipeline.

## 8. Testes e Governança

- **Testes:** Vitest + React Testing Library. A cobertura é intencionalmente focada, não exaustiva: lógica pura (cálculo de distância, matching de passos, transições do reducer de navegação) e alguns testes de componente (busca mostra sugestões, painel de instruções renderiza os passos), com o cliente Mapbox mockado.
- **CI:** `.github/workflows/ci.yml` roda a cada push/PR: instalar → lint (ESLint) → typecheck (`tsc --noEmit`) → testes → build. Um pipeline quebrado bloqueia o merge — esse é o principal sinal de "governança" para os avaliadores.
- **Lint/formatação:** ESLint + Prettier configurados e obrigatórios no CI.
- **Higiene do repositório:** `LICENSE` MIT, `.gitignore` correto, mensagens de commit seguindo Conventional Commits (`feat:`, `fix:`, `chore:`, ...).
- **README:** visão geral, prints/GIF do app funcionando, link do deploy ao vivo, explicação da arquitetura, tabela de variáveis de ambiente, passo a passo de setup local.

## 9. Escopo: MVP vs. Extras

Dado o prazo de 25/08/2026, o plano de implementação precisa sequenciar o trabalho de forma que o MVP fique completo e polido antes de qualquer item extra ser iniciado.

**MVP (obrigatório):**
- Estrutura de projeto limpa e documentada, conforme §3
- Mapa com detecção da localização atual
- Busca de destino com autocomplete
- Cálculo e exibição da rota (linha no mapa + lista de passos)
- Rastreamento de posição ao vivo que avança as instruções
- Higiene de segurança conforme §7
- README com setup, arquitetura, prints, link ao vivo
- Suíte de testes focada + pipeline de CI conforme §8
- Deploy funcionando na Vercel

**Extras (só se o MVP terminar cedo):**
- Instruções faladas (voz) via Web Speech API
- Recálculo automático de rota ao desviar do caminho planejado
- Rotação do mapa seguindo a direção do usuário
- Toggle completo de modos carro/a pé/bicicleta (em vez de só carro)
- Modo escuro, histórico de buscas, tela de resumo da viagem

## 10. Perguntas Abertas / Premissas

- Assume que os avaliadores vão revisar o deploy ao vivo na Vercel e o repositório no GitHub, não só uma execução local.
- Assume que nenhuma stack técnica específica foi exigida pela vaga (o usuário confirmou que nenhuma restrição desse tipo foi informada); React/TypeScript/Tailwind foi escolhido como o sinal mais forte e geral para uma avaliação com viés front-end.
