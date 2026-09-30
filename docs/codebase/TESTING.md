# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- Primary test framework: **Vitest** for `@axiom/audio-engine` and `@axiom/axiom-synth`.
- Assertion/mocking tools: Vitest assertions plus focused fake Web Audio nodes
  for engine graph tests. Do not require a real browser for deterministic graph
  lifecycle tests.
- Commands:

```bash
pnpm test       # Vitest tests across all workspace packages
pnpm build      # vue-tsc -b && vite build
pnpm lint       # prettier --check .
```

### 2) Test Layout

- Test file placement pattern: beside the module under test —
  `packages/audio-engine/src/engine/*.test.ts` for engine modules and
  `packages/axiom-synth/src/*.test.ts` for synth modules.
- Naming convention: `<module>.test.ts`.
- Setup files and where they run: fake Web Audio context helpers live in the
  `@axiom/audio-testing` workspace package (`packages/audio-testing/src/`) and
  are imported by graph tests in every package.

### 3) Test Scope Matrix

| Scope       | Covered? | Typical target                                                        | Notes                                                  |
| ----------- | -------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| Unit        | yes      | engine math, cached transfer curves, synth parameter setters          | Vitest                                                 |
| Integration | partial  | voice-to-engine wiring, synth graph wiring, Web Audio graph lifecycle | fake context; browser smoke tests for audible behavior |
| E2E         | no       | UI → keyboard → audio events (`Keyboard.vue`, `Synth.vue`)            | manual browser validation                              |

### 4) Mocking and Isolation Strategy

- Main mocking approach: instrumented fake Web Audio nodes record exact
  connections, disconnections, source stops, and manually dispatched
  `onended` events.
- Isolation guarantees: tests run without real `AudioContext`; each test owns a
  fresh fake context and restores temporary globals.
- Common failure mode in tests: forgetting exact inbound AudioParam teardown;
  assert operation history and active connections separately.

### 5) Coverage and Quality Signals

- Coverage tool + threshold: no threshold configured yet.
- Current reported coverage: not measured.
- Required rule: every new feature or behavior change adds automated tests in
  the same change. Build and lint alone are insufficient.
- Known gaps/flaky areas: audible Web Audio behavior remains browser-dependent;
  use manual browser smoke tests for stereo image, clicks, CPU, and
  performance. `use-audio-context.ts` constructs an `AudioContext` at module
  import, so avoid importing it in deterministic engine tests.

### 6) Evidence

- `package.json` (`test` script runs `pnpm -r --sort test`)
- `packages/audio-engine/package.json`, `packages/axiom-synth/package.json`
  (Vitest test script and dependency)
- `packages/audio-testing/package.json` (shared fake Web Audio helpers)
- `.github/workflows/test.yml` (CI runs `pnpm test`, `pnpm build`, and
  `pnpm lint`)
- `AGENTS.md` (current command list and CI summary)
- `.lintstagedrc.json`, `.husky/pre-commit` (only formatting as pre-commit gate)
