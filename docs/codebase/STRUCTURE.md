# Codebase Structure

## Core Sections (Required)

### 1) Top-Level Map

| Path                 | Purpose                                                                                  | Evidence                                                 |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/`               | All application source                                                                   | `src/main.ts`, `src/App.vue`                             |
| `src/engine/`        | Web Audio engine: `AudioEngine`, voice pool, envelopes, waveshaper/curve provider        | `src/engine/engine.ts`, `src/engine/waveshaper-curve.ts` |
| `src/components/`    | Vue UI components (panels, knob, keyboard, scope, header)                                | `src/components/Synth.vue`                               |
| `src/composables/`   | Vue composables: `useAudioEngine` (module-singleton engine), `useThemeMode`              | `src/composables/use-audio-context.ts`                   |
| `src/types/`         | Config interfaces + type utilities (`FixedArray`, `NumericKeys`)                         | `src/types/index.ts`                                     |
| `src/utils/`         | Display helpers (dB, fractions, semitones, time) + `Observable` not exported from barrel | `src/utils/index.ts`, `src/utils/observable.ts`          |
| `public/`            | Static assets (favicon, `index.html` reference)                                          | `public/favicon.svg`                                     |
| `docs/images/`       | README screenshots                                                                       | `docs/images/axiom-ui.png`                               |
| `.github/workflows/` | CI: PR build + Pages deploy                                                              | `.github/workflows/build.yml`, `deploy-pages.yml`        |
| `.husky/`            | Git hooks (pre-commit lint-staged)                                                       | `.husky/pre-commit`                                      |
| `.vscode/`           | Editor config (Tailwind CSS association, Volar extension rec)                            | `.vscode/settings.json`                                  |
| `example/`           | Early UI prototype (neumorphic button, standalone HTML) — not part of the app build      | `example/osc1-neumorphic-button.html`                    |

### 2) Entry Points

- Main runtime entry: `index.html` → `src/main.ts` → `src/App.vue`.
- Secondary entry points: **none** (single-page client app, no worker/CLI).
- How entry is selected: Vite default `index.html`; `src/main.ts` mounts `App.vue` into `#app`.

### 3) Module Boundaries

| Boundary           | What belongs here                                                           | What must not be here               |
| ------------------ | --------------------------------------------------------------------------- | ----------------------------------- |
| `src/engine/`      | Audio graph construction, voice lifecycle, parameter automation, curve math | Vue reactivity, DOM access, styling |
| `src/components/`  | UI rendering, `defineModel` binds, canvas drawing, event wiring             | Audio graph wiring (engine-only)    |
| `src/composables/` | Shared module-scope app state (engine singleton, theme)                     | Audio node logic                    |
| `src/types/`       | Type-only definitions                                                       | Runtime values/modules              |
| `src/utils/`       | Pure display/list helpers (no DOM, no engine)                               | —                                   |

### 4) Naming and Organization Rules

- File naming pattern: PascalCase for components/engine classes (`Knob.vue`, `AxiomVoice.ts`, `WaveshaperCurve.ts`), kebab/lowercase for types & utils (`envelope-config.ts`, `db-display.ts`), kebab for docs/CI (`use-audio-context.ts`).
- Directory organization pattern: layer-based (`engine` / `components` / `composables` / `types` / `utils`), not feature-based.
- Import aliasing or path conventions: no path aliases configured; imports are relative (`../types`, `./utils/observable`), sometimes with explicit `.ts` extension (`import '../utils/db-display.ts'`) — alias/extension style is **inconsistent** across files. Vue templates use relative SFC imports.

### 5) Evidence

- `index.html`, `src/main.ts`, `src/App.vue`
- `package.json` (scripts, deps)
- `vite.config.ts` (no alias config)
- `AGENTS.md` (directory responsibilities and conventions)
