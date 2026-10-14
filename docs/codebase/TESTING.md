# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- Primary test framework: **Vitest** for workspace JavaScript packages; native C unit tests run through the package Makefile; **Playwright** runs one browser end-to-end smoke test for the app.
- Assertion/mocking tools: Vitest assertions plus focused fake Web Audio nodes
  for engine graph tests. Do not require a real browser for deterministic graph
  lifecycle tests.
- Commands:

```bash
pnpm test                            # all tests: JS packages, native C, and Playwright E2E
pnpm --filter @axiom/app test:e2e    # Playwright browser E2E only (starts the app dev server)
pnpm --filter @axiom/native test:js  # native package JavaScript tests
make test -C packages/native/c       # native C unit tests
pnpm build                           # all workspace packages; requires emcc on PATH
pnpm lint                            # prettier --check .
```

### 2) Test Layout

- Test file placement pattern: beside the module under test —
  `packages/audio-engine/src/engine/*.test.ts` for engine modules and
  `packages/axiom-synth/src/*.test.ts` for synth modules; native JS tests live
  beside worker/node modules in `packages/native/src/`, and C tests live in
  `packages/native/c/tests/`. Browser E2E specs live in `app/e2e/*.spec.ts`
  (config `app/playwright.config.ts`).
- Naming convention: `<module>.test.ts`.
- Setup files and where they run: fake Web Audio context helpers live in the
  `@axiom/audio-testing` workspace package (`packages/audio-testing/src/`) and
  are imported by graph tests in every package.

### 3) Test Scope Matrix

| Scope       | Covered? | Typical target                                                                            | Notes                                                  |
| ----------- | -------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Unit        | yes      | engine math, synth parameter setters, native C oscillator, native JS worker/node behavior | Vitest and native C test executable                    |
| Integration | partial  | voice-to-engine wiring, synth graph wiring, Web Audio graph lifecycle                     | fake context; browser smoke tests for audible behavior |
| E2E         | partial  | keyboard note → audio graph → worklet oscillator `ENDED` (`app/e2e/`)                     | Playwright against the app dev server; one smoke spec  |

### 4) Mocking and Isolation Strategy

- Main mocking approach: instrumented fake Web Audio nodes record exact
  connections, disconnections, source stops, and manually dispatched
  `onended` events.
- Isolation guarantees: tests run without real `AudioContext`; each test owns a
  fresh fake context and restores temporary globals.
- Browser E2E (Playwright) runs the app in headless Chromium with
  `--autoplay-policy=no-user-gesture-required`. It asserts main-thread `console`
  output; worklet-scope logs are not surfaced to the page console, so the
  worklet↔wrapper bridge is observed through the wrapper's logs.
- Common failure mode in tests: forgetting exact inbound AudioParam teardown;
  assert operation history and active connections separately.

### 5) Coverage and Quality Signals

- Coverage tool + threshold: no threshold configured yet.
- Current reported coverage: not measured.
- Required rule: every new feature or behavior change adds automated tests in
  the same change. Build and lint alone are insufficient.
- Known gaps/flaky areas: audible Web Audio behavior remains browser-dependent;
  the Playwright smoke test covers worklet oscillator teardown, but stereo
  image, clicks, CPU, and performance still need manual browser checks.
  `use-audio-context.ts` constructs an `AudioContext` at module import, so avoid
  importing it in deterministic engine tests.

### 6) Evidence

- `package.json` (`test` script runs `pnpm -r --parallel test`, which fans out to
  each package; the app package's `test` runs the Playwright E2E suite)
- `packages/audio-engine/package.json`, `packages/axiom-synth/package.json`
  (Vitest test script and dependency)
- `packages/audio-testing/package.json` (shared fake Web Audio helpers)
- `packages/native/package.json`, `packages/native/c/Makefile` (native JS and C test commands; WASM build requires `emcc`)
- `app/package.json` (`test:e2e` script, `@playwright/test` dep),
  `app/playwright.config.ts`, `app/e2e/oscillator-lifecycle.spec.ts`
- `.github/workflows/test.yml` (CI builds first, installs the Playwright browser,
  then runs `pnpm test` — which includes the E2E suite — and `pnpm lint`;
  build-capable workflows install Emscripten SDK `6.0.12`)
- `AGENTS.md` (current command list and CI summary)
- `.lintstagedrc.json`, `.husky/pre-commit` (only formatting as pre-commit gate)
