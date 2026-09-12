# Coding Conventions

## Core Sections (Required)

### 1) Naming Rules

| Item               | Rule                                                                                                                                                  | Example                                        | Evidence                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Files              | PascalCase for classes/components (`Knob.vue`, `EnvelopePanel.vue`); lowercase/hyphenated for types/utils/doc (`envelope-config.ts`, `db-display.ts`) | —                                              | `src/components/`, `src/types/`, `src/utils/`                                       |
| Functions/methods  | camelCase; `void`-returning event/key handlers named `on*`/`handle*`                                                                                  | `onPointerDown`, `noteOn`, `createOscillators` | `src/components/Knob.vue`, `src/engine/voice.ts`                                    |
| Types/interfaces   | PascalCase (`OscillatorConfig`, `WaveshaperType`, `EnvelopeCurve`)                                                                                    | —                                              | `src/types/*`, `src/engine/waveshaper-curve.ts`                                     |
| Constants/env vars | `UPPER_SNAKE` for module constants and types (`MAX_VOICES`, `OSCILLATOR_COUNT`, `CURVE_SAMPLES`); camelCase for exported config objects               | —                                              | `src/engine/engine.ts`, `src/engine/constants.ts`, `src/engine/waveshaper-curve.ts` |

### 2) Formatting and Linting

- Formatter: Prettier 3.9.6 + `prettier-plugin-tailwindcss` — `.prettierrc.yaml`
- Linter: none (ESLint not configured). Type-check acts as the static quality gate via `vue-tsc`.
- Most relevant enforced rules: `singleQuote: true`, `trailingComma: 'all'`, `arrowParens: 'avoid'`, `printWidth: 80`, and Tailwind class sorting (plugin reads `./src/style.css`).
- Run commands: `pnpm format` (`prettier --write .`), `pnpm lint` (`prettier --check .`). Pre-commit automatically runs `pnpm exec lint-staged` which prettier-formats staged `.ts/.js/.vue/.css/.md/.json/.yml/.yaml` (`.lintstagedrc.json`).

TypeScript flags (in `tsconfig.app.json`): `strict: true`, `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `erasableSyntaxOnly: true`, `noFallthroughCasesInSwitch: true`. `erasableSyntaxOnly` forbids enums and namespaces — use string-literal unions and plain aliases.

### 3) Import and Module Conventions

- Import grouping/order: no enforced grouping rule; grouped type/runtime imports per file, plain relative imports. `interface`/`type` imports are marked `import type` (required by `verbatimModuleSyntax` via `@vue/tsconfig`).
- Alias vs relative import policy: no path aliases configured (`vite.config.ts`). Imports are relative (`../types`, `./utils/observable`).
- Public exports/barrel policy: `src/types/index.ts` re-exports config + fixed-array types; `src/utils/index.ts` barrels display helpers but **not** `observable.ts`; `src/engine/index.ts` exports the engine. Files sometimes import with explicit extension (`from '../utils/db-display.ts'`) and sometimes without (`from '../utils/observable'`) — **inconsistent across the codebase**, both compile.

### 4) Error and Logging Conventions

- Error strategy by layer: heavy use of `throw new Error(`Unsupported …`)` in `Envelope` for invalid curve names (won't fire with current unions). Voice APIs return values rather than throw (e.g., `noteOff` returns `{ silentAt }`). No runtime validation framework; `console.log/error` is the logging surface.
- Logging style and required context fields: `console.log` everywhere (`AudioEngine` init, `noteOn`/`noteOff` per note incl. timestamp `[<now>] noteOn(...)`, `allNotesOff`, `AudioContext was closed`). No structured logger, no log levels, no redaction framework.
- Sensitive-data redaction rules: **none** — no credentials or PII exist in the app, so no redaction is needed.

### 5) Testing Conventions

- Test file naming/location rule: no test files exist. No `test` script, no Vitest/jest dependency (scan: "No performance testing configs detected"; `package.json` has no test script). Verification is `pnpm build` (type-check + bundling) plus the prettier pre-commit hook.
- Mocking strategy norm: n/a.
- Coverage expectation: none configured.

### 6) Evidence

- `.prettierrc.yaml`, `.lintstagedrc.json`, `.husky/pre-commit`
- `tsconfig.app.json` / `tsconfig.node.json` (strict flags, `verbatimModuleSyntax`)
- `src/engine/envelope.ts` (throw pattern), `src/utils/index.ts` (barrel), `src/types/index.ts` (barrel split)
