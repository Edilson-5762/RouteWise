# RouteWise — Interactive GPS Navigation Web App

**Date:** 2026-08-22
**Status:** Approved for planning
**Deadline:** Presentation on 2026-08-25 (3 days from design approval)

## 1. Purpose and Context

RouteWise is an interactive, Waze/Google Maps-style GPS navigation web application. The user searches for a destination, picks it from a list of suggestions, and the app plans and displays a route from the user's current location, then guides them live as they move.

This project is being built as a portfolio piece to be formally evaluated as part of a job application, and will also be published on GitHub/LinkedIn to attract recruiters. The evaluation is explicitly said to weigh **visual/frontend quality**, **code security**, **governance**, and **project structure** heavily — not just whether the feature works. This spec and the resulting implementation plan treat security hygiene, CI, tests, and documentation as first-class deliverables, not polish added at the end.

Given the 3-day deadline, scope is split into an **MVP** (must ship, fully polished) and **stretch differentiators** (added only if the MVP is done early, without compromising MVP quality).

## 2. Goals / Non-Goals

**Goals:**
- A working, deployed, visually polished live-navigation web app
- Demonstrably secure handling of API credentials
- Demonstrably good project governance (CI, linting, tests, docs)
- A clean, deliberate project structure that reads well to a reviewer

**Non-goals (explicitly out of scope):**
- User accounts, authentication, or any backend/database
- Saving routes or history server-side (client-only `localStorage` is enough)
- Offline map support
- Mobile native app packaging
- Public production-scale traffic handling (this is a demo/portfolio app)

## 3. Architecture

- **Build tool / framework:** Vite + React + TypeScript (`strict` mode enabled)
- **Styling:** Tailwind CSS
- **Map & routing:** Mapbox GL JS used directly (no `react-map-gl` wrapper), encapsulated in custom React hooks for full control over camera behavior (needed for the map-rotation stretch feature) and to demonstrate direct API fluency
- **State management:** No external state library. Local component state plus a `useReducer`-based navigation state machine (`idle → routePlanned → navigating`) for the core navigation flow
- **Hosting:** 100% client-side SPA, no backend. Deployed to Vercel (free tier), auto-deploy from the `main` branch on GitHub
- **Repository:** https://github.com/Edilson-5762/RouteWise

### Project structure (feature-based)

```
src/
  components/         # Presentational UI: SearchBar, MapView, RouteInstructions,
                       # TravelModeToggle, ErrorBanner, etc.
  features/
    map/               # Mapbox hooks (useMap) and map config
    routing/           # Directions API client, route/step matching logic
    geolocation/        # useGeolocation hook (current position + watch)
    search/             # Geocoding/autocomplete logic and hook
  services/            # mapboxClient.ts — typed fetch wrapper for Mapbox REST APIs
  types/               # Shared TypeScript types (Route, Step, Coordinates, ...)
  utils/               # Pure helper functions (distance calc, formatting) — unit-tested
  App.tsx
  main.tsx
.github/
  workflows/ci.yml      # lint -> typecheck -> test -> build
.env.example
vercel.json             # security headers
```

Tests are colocated with the code they cover (`Component.test.tsx` next to `Component.tsx`, `utils/distance.test.ts` next to `utils/distance.ts`).

## 4. Data Flow

1. **On load:** request geolocation permission via the browser Geolocation API. On success, center the map on the current position and place an origin marker. On denial/failure, show a dedicated error state with a retry action (see §6) — the app cannot proceed without an origin, since origin is always "current location" (no manual origin entry, by design).
2. **Destination search:** as the user types in the search box, debounced (300ms) calls go to the Mapbox Geocoding API once the query is 3+ characters. Suggestions render in a dropdown list; selecting one sets the destination coordinates and places a destination marker.
3. **Route planning:** once origin and destination are set, call the Mapbox Directions API (default travel mode: driving) to get the route geometry (GeoJSON), the list of turn-by-turn steps, and total distance/duration. Draw the route line on the map, populate the instructions panel, and show a distance/ETA summary.
4. **Live navigation:** pressing "Start navigation" transitions the state machine to `navigating` and starts `watchPosition`. On each position update: recenter the map on the user, determine progress against the route's steps (nearest-point-on-route matching), advance the current instruction when a step is completed, and update remaining distance/ETA.
5. **Stretch behaviors (§9):** if enabled and time allows — automatic reroute on route deviation, spoken instructions via the Web Speech API, and map rotation to follow the user's heading.

## 5. Travel Modes

The Mapbox Directions API supports driving, walking, and cycling through the same endpoint (different `profile` parameter). The MVP ships with driving mode only. The `TravelModeToggle` component (letting the user switch to walking/cycling, re-requesting the route on change) is a stretch item per §9 — the routing service and reducer are designed to accept a `profile` parameter from the start, so adding the toggle later is a small, purely additive change.

## 6. Error Handling

| Scenario | Behavior |
|---|---|
| Geolocation permission denied or unsupported browser | Dedicated full-panel error state explaining why the app needs location access, with a "try again" action |
| Mapbox API network failure or rate limit | Non-blocking error banner with a retry action; does not crash the app |
| No route found for the chosen mode/destination | Specific message ("no route found for this travel mode"), not a generic error |
| Search query under 3 characters | No API call is made (avoids unnecessary quota usage) |

## 7. Security

- The Mapbox access token is read from `VITE_MAPBOX_TOKEN` at build time and is **never committed**. `.env` is git-ignored; `.env.example` is committed with a placeholder value and setup instructions in the README.
- The token is restricted by domain in the Mapbox account dashboard (production domain + `localhost` for development) — documented step-by-step in the README so a reviewer can verify the practice even though they can't see the dashboard.
- No `dangerouslySetInnerHTML` or other unsafe DOM injection.
- Basic security headers (CSP, `X-Content-Type-Options`, etc.) are set via `vercel.json`.
- CI runs `npm audit --audit-level=high` as a pipeline step.

## 8. Testing & Governance

- **Testing:** Vitest + React Testing Library. Coverage is intentionally focused rather than exhaustive: pure logic (distance calculations, step-matching, the navigation reducer's state transitions) and a small number of component tests (search shows suggestions, instructions panel renders steps), with the Mapbox client mocked.
- **CI:** `.github/workflows/ci.yml` runs on every push/PR: install → lint (ESLint) → typecheck (`tsc --noEmit`) → test → build. A red pipeline blocks merging — this is the primary "governance" signal for reviewers.
- **Lint/format:** ESLint + Prettier configured and enforced in CI.
- **Repo hygiene:** MIT `LICENSE`, correct `.gitignore`, commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, ...).
- **README:** overview, screenshots/GIF of the app in action, live deploy link, architecture explanation, environment variable table, local setup steps.

## 9. Scope: MVP vs. Stretch

Given the 2026-08-25 deadline, the implementation plan must sequence work so the MVP is complete and polished before any stretch item is started.

**MVP (required):**
- Clean, documented project structure as in §3
- Map with current-location detection
- Destination search with autocomplete
- Route calculation and display (line + step list)
- Live position tracking that advances instructions
- Security hygiene per §7
- README with setup, architecture, screenshots, live link
- Focused test suite + CI pipeline per §8
- Working Vercel deployment

**Stretch (only if MVP finishes early):**
- Spoken (voice) instructions via Web Speech API
- Automatic reroute on deviation from the planned route
- Map rotation following the user's direction of travel
- Full driving/walking/cycling mode toggle (vs. driving-only default)
- Dark mode, search history, trip-summary screen

## 10. Open Questions / Assumptions

- Assumes the evaluators will review the live Vercel deployment and the GitHub repository, not just a local run.
- Assumes no specific tech stack was mandated by the job posting (user confirmed no such constraint was raised); React/TypeScript/Tailwind was chosen as the strongest general-purpose signal for a frontend-leaning evaluation.
