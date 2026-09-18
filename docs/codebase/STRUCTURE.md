# Codebase Structure

## Core Sections (Required)

### 1) Top-Level Map

| Path                         | Purpose                                                                                             | Evidence                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `app/src/`                   | Vue application source: components, composables, app-only types (`NumericKeys`), display utils      | `app/src/main.ts`, `app/src/App.vue`, `app/src/types/` |
| `app/` (root files)          | App entry config: `index.html`, `vite.config.ts`, `public/`, `example/`                             | `app/vite.config.ts`, `app/public/favicon.svg`         |
| `packages/audio-engine/src/` | Engine package: `engine/`, `types/`, `utils/observable.ts`, `index.ts` barrel                       | `packages/audio-engine/src/index.ts`                   |
| `packages/axiom-synth/src/`  | Axiom synth package: `axiom-synth.ts`, `axiom-voice.ts`, `axiom-voice-config.ts`, `index.ts` barrel | `packages/axiom-synth/src/index.ts`                    |
| `pnpm-workspace.yaml`        | Workspace root (`app`, `packages/*`)                                                                | `pnpm-workspace.yaml`                                  |
| `docs/images/`               | README screenshots                                                                                  | `docs/images/axiom-ui.png`                             |
| `.github/workflows/`         | CI: PR build + Pages deploy                                                                         | `.github/workflows/build.yml`, `deploy-pages.yml`      |
| `.husky/`                    | Git hooks (pre-commit lint-staged)                                                                  | `.husky/pre-commit`                                    |
| `.vscode/`                   | Editor config (Tailwind CSS association, Volar extension rec)                                       | `.vscode/settings.json`                                |

### 2) Entry Points

- Main runtime entry: `app/index.html` → `app/src/main.ts` → `app/src/App.vue`.
- Secondary entry points: **none** (single-page client app, no worker/CLI).
- How entry is selected: Vite default `app/index.html`; `app/src/main.ts` mounts `App.vue` into `#app`.

### 3) Module Boundaries

| Boundary                            | What belongs here                                                           | What must not be here                        |
| ----------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/audio-engine/src/engine/` | Audio graph construction, voice lifecycle, parameter automation, curve math | Vue reactivity, DOM access, styling          |
| `packages/axiom-synth/src/`         | Axiom synth graph assembly, shared sources, setter ramps                    | Voice-pool bookkeeping, context/master chain |
| `app/src/components/`               | UI rendering, `defineModel` binds, canvas drawing, event wiring             | Audio graph wiring (engine-only)             |
| `app/src/composables/`              | Shared module-scope app state (engine singleton, theme)                     | Audio node logic                             |
| `app/src/types/`                    | Type-only definitions (app-only types such as `NumericKeys`)                | Runtime values/modules                       |
| `app/src/utils/`                    | Pure display/list helpers (no DOM, no engine)                               | —                                            |

### 4) Naming and Organization Rules

- File naming pattern: PascalCase for components/engine classes (`Knob.vue`, `AxiomSynth.ts`, `AxiomVoice.ts`, `WaveshaperCurve.ts`), kebab/lowercase for types & utils (`envelope-config.ts`, `db-display.ts`), kebab for docs/CI (`use-audio-context.ts`, `use-axiom-synth.ts`). Axiom classes follow the same convention and live under `packages/axiom-synth/src/` with `index.ts` as the public barrel.
- Directory organization pattern: layer-based per package (`app` = components/composables/types/utils; engine package = engine/types/utils; axiom-synth package = flat `src/`), not feature-based.
- Import aliasing or path conventions: no path aliases configured; the app imports the synth via `@axiom/axiom-synth`, and both packages import engine building blocks/types via `@axiom/audio-engine`; app-internal imports are relative (`../types`, `./utils/observable`), sometimes with explicit `.ts` extension (`import '../utils/db-display.ts'`) — alias/extension style is **inconsistent** across files. Vue templates use relative SFC imports.

### 5) Evidence

- `app/index.html`, `app/src/main.ts`, `app/src/App.vue`
- `package.json` (scripts, deps)
- `app/vite.config.ts` (no alias config), `pnpm-workspace.yaml`
- `packages/audio-engine/src/index.ts` (public barrel)
- `packages/axiom-synth/src/index.ts` (public barrel)
- `AGENTS.md` (directory responsibilities and conventions)
