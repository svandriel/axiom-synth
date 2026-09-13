# External Integrations

## Core Sections (Required)

### 1) Integration Inventory

The application itself has **no external service integrations** — it is a fully client-side browser app. The only external interactions are build/deploy-time and runtime Web Audio (browser-native, no network).

| System                         | Type (API/DB/Queue/etc)                   | Purpose                                                                                     | Auth model                                      | Criticality         | Evidence                                                                      |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| GitHub Actions (build + Pages) | CI/CD                                     | `pnpm install --frozen-lockfile` + lint + build on PR; Pages deploy on `main` push          | GitHub token (Pages `id-token` for OIDC deploy) | high (release path) | `.github/workflows/build.yml`, `.github/workflows/deploy-pages.yml`           |
| GitHub Pages                   | Static hosting                            | Serves built `app/dist` at `https://svandriel.github.io/axiom-synth/`                       | OIDC via `actions/deploy-pages@v5`              | high (live demo)    | `deploy-pages.yml`, `app/vite.config.ts` (`build:pages --base=/axiom-synth/`) |
| Web Audio API                  | Browser-native API (not a remote service) | Oscillators, `WaveShaperNode`, `BiquadFilterNode`, `DynamicsCompressorNode`, `AnalyserNode` | n/a                                             | high (core)         | `packages/audio-engine/src/engine/*`                                          |
| Local storage                  | Browser storage                           | Persist dark/light theme preference                                                         | n/a                                             | low                 | `app/src/composables/use-theme-mode.ts`                                       |

### 2) Data Stores

| Store                                | Role                     | Access layer                                                          | Key risk                                                                                                 | Evidence                                |
| ------------------------------------ | ------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `localStorage`                       | Persist `themeMode` only | `use-theme-mode.ts` (`fetchFromLocalStorage` / `storeInLocalStorage`) | Key name not namespaced (`'themeMode'`) could collide across sites on same origin; no validation on read | `app/src/composables/use-theme-mode.ts` |
| (none — no DB, no server-side store) | —                        | —                                                                     | —                                                                                                        | —                                       |

### 3) Secrets and Credentials Handling

- Credential sources: **none** — no secrets, API keys, or tokens are stored or read by the app. No `.env*` files. The only token usage is GitHub Actions managed OIDC for Pages deploy.
- Hardcoding checks: none needed; scan found no env-var reads.
- Rotation or lifecycle notes: n/a.

### 4) Reliability and Failure Behavior

- Retry/backoff behavior: none — no network calls to retry.
- Timeout policy: none — no fetched resources except the app bundle itself (browser-native).
- Circuit-breaker or fallback behavior: the optional `scope`/`override` in `useAudioEngine` (`app/src/composables/use-audio-context.ts`) re-creates the engine if the `AudioContext` was closed (`onMounted`). Keyboard notes are clamped to valid octave range (`Math.max(0,…)`, `Math.min(8,…)`), no silent-failure path.

### 5) Observability for Integrations

- Logging around external calls: n/a — only `console.log` telemetry for audio events (see CONVENTIONS).
- Metrics/tracing coverage: none (no RUM, no error tracking).
- Missing visibility gaps: no error tracking for runtime exceptions; console-only.

### 6) Evidence

- `.github/workflows/build.yml`, `.github/workflows/deploy-pages.yml`
- `app/src/composables/use-theme-mode.ts` (theme persistence)
- `app/src/composables/use-audio-context.ts` (engine lifecycle)
