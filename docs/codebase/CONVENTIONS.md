# Coding Conventions

## Core Sections (Required)

### 1) Naming Rules

| Item               | Rule                                                                                                                                                  | Example                                      | Evidence                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files              | PascalCase for classes/components (`Knob.vue`, `EnvelopePanel.vue`); lowercase/hyphenated for types/utils/doc (`envelope-config.ts`, `db-display.ts`) | —                                            | `app/src/components/`, `packages/audio-engine/src/types/`, `app/src/utils/`                                                                           |
| Functions/methods  | camelCase; `void`-returning event/key handlers named `on*`/`handle*`                                                                                  | `onPointerDown`, `onSoundStart`, `osc.start` | `app/src/components/Knob.vue`, `packages/audio-engine/src/engine/voice.ts`, `packages/audio-engine/src/engine/oscillator.ts`                          |
| Types/interfaces   | PascalCase (`OscillatorConfig`, `WaveshaperType`, `EnvelopeCurve`)                                                                                    | —                                            | `packages/audio-engine/src/types/*`, `packages/audio-engine/src/engine/waveshaper-curve.ts`                                                           |
| Constants/env vars | `UPPER_SNAKE` for module constants and types (`MAX_VOICES`, `OSCILLATOR_COUNT`, `CURVE_SAMPLES`); camelCase for exported config objects               | —                                            | `packages/audio-engine/src/engine/engine.ts`, `packages/audio-engine/src/engine/constants.ts`, `packages/audio-engine/src/engine/waveshaper-curve.ts` |
| Packages           | `@axiom/*` scoped workspace packages (`@axiom/app`, `@axiom/audio-engine`)                                                                            | —                                            | `pnpm-workspace.yaml`, root `package.json`                                                                                                            |

### 2) Formatting and Linting

- Formatter: Prettier 3.9.6 + `prettier-plugin-tailwindcss` — `.prettierrc.yaml`
- Tooling scope: prettier/husky/lint-staged are **root-only** (root `package.json`); packages ship no prettier config or deps.
- Linter: none (ESLint not configured). Type-check acts as the static quality gate via `vue-tsc`.
- Most relevant enforced rules: `singleQuote: true`, `trailingComma: 'all'`, `arrowParens: 'avoid'`, `printWidth: 80`, and Tailwind class sorting (plugin reads `./app/src/style.css`).
- Run commands: `pnpm format` (`prettier --write .`), `pnpm lint` (`prettier --check .`). Pre-commit automatically runs `pnpm exec lint-staged` which prettier-formats staged `.ts/.js/.vue/.css/.md/.json/.yml/.yaml` (`.lintstagedrc.json`).

TypeScript flags (in `app/tsconfig.app.json`): `strict: true`, `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `erasableSyntaxOnly: true`, `noFallthroughCasesInSwitch: true`. `erasableSyntaxOnly` forbids enums and namespaces — use string-literal unions and plain aliases.

### 3) Import and Module Conventions

- Import grouping/order: no enforced grouping rule; grouped type/runtime imports per file, plain relative imports within a package. `interface`/`type` imports are marked `import type` (required by `verbatimModuleSyntax` via `@vue/tsconfig`).
- Alias vs relative import policy: no path aliases configured; cross-package imports use the workspace package name — the app imports the engine via `@axiom/audio-engine` (e.g. `import { AudioEngine } from '@axiom/audio-engine'`, `import type { EnvelopeConfig } from '@axiom/audio-engine'`). App-internal imports are relative (`../types`, `./utils/observable`).
- Public exports/barrel policy: `@axiom/audio-engine` exposes source directly via `exports` → `./src/index.ts` (no build artifacts); the package barrel exports the engine facade + config types (`AudioEngine`, `EnvelopeConfig`, `FilterConfig`, `OscillatorConfig`, `FixedArray`, `WaveFormType`, `WaveshaperConfig`, `WaveshaperType`). `Observable` (`packages/audio-engine/src/utils/observable.ts`) is internal — not exported from the barrel. In-app barrels: `app/src/types/index.ts` re-exports app types (`NumericKeys`), `app/src/utils/index.ts` barrels display helpers. Files sometimes import with explicit extension (`from '../utils/db-display.ts'`) and sometimes without (`from '../utils/observable'`) — **inconsistent across the codebase**, both compile.

### 4) Error and Logging Conventions

- Error strategy by layer: heavy use of `throw new Error(`Unsupported …`)` in `Envelope` for invalid curve names (won't fire with current unions). Voice APIs return values rather than throw (e.g., `noteOff` returns `{ silentAt }`). No runtime validation framework; `console.log/error` is the logging surface.
- Logging style and required context fields: `console.log` everywhere (`AudioEngine` init, per-note `noteOn`/`noteOff` timestamped and voice-keyed as `Voice <id>: noteOn(...)`, `connecting`/`disconnecting` markers when a voice joins/leaves the mixer, `allNotesOff`, `AudioContext was closed`). No structured logger, no log levels, no redaction framework.
- Sensitive-data redaction rules: **none** — no credentials or PII exist in the app, so no redaction is needed.

### 5) Testing Conventions

- Test file naming/location rule: no test files exist. No `test` script, no Vitest/jest dependency (scan: "No performance testing configs detected"; `package.json` has no test script). Verification is `pnpm build` (type-check + bundling) plus the prettier pre-commit hook.
- Mocking strategy norm: n/a.
- Coverage expectation: none configured.

### 6) Evidence

- `.prettierrc.yaml`, `.lintstagedrc.json`, `.husky/pre-commit` (root-only tooling)
- `app/tsconfig.app.json` / `app/tsconfig.node.json` (strict flags, `verbatimModuleSyntax`)
- `packages/audio-engine/package.json` (`exports` → `./src/index.ts`), `packages/audio-engine/src/index.ts` (barrel)
- `packages/audio-engine/src/engine/envelope.ts` (throw pattern), `app/src/utils/index.ts` (barrel), `app/src/types/index.ts` (barrel)
