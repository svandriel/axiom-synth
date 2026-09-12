# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- Primary test framework: **none**. There is no test runner, no `test` script, and no testing dependency (Vitest/Jest/Playwright not present) — confirmed by `package.json` and the scan.
- Assertion/mocking tools: none.
- Commands:

```bash
# No tests. Verification is the build (type-check + bundle) and formatting:
pnpm build      # vue-tsc -b && vite build
pnpm lint       # prettier --check . (handled by pre-commit; not run manually)
```

### 2) Test Layout

- Test file placement pattern: n/a (no tests).
- Naming convention: n/a.
- Setup files and where they run: none.

### 3) Test Scope Matrix

| Scope       | Covered? | Typical target                                                                          | Notes                                               |
| ----------- | -------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Unit        | no       | engine math would be the target (`waveshaper-curve.ts`, `envelope.ts`, `db-display.ts`) | none; pure functions are unit-testable but untested |
| Integration | no       | voice-to-engine wiring (`axiom-voice.ts`, `engine.ts`)                                  | none                                                |
| E2E         | no       | UI → keyboard → audio events (`Keyboard.vue`, `Synth.vue`)                              | none                                                |

### 4) Mocking and Isolation Strategy

- Main mocking approach: n/a.
- Isolation guarantees: n/a.
- Common failure mode in tests: n/a.

### 5) Coverage and Quality Signals

- Coverage tool + threshold: none (TODO — no coverage tooling configured).
- Current reported coverage: 0% (no tests).
- Known gaps/flaky areas: the Web Audio engine is inherently browser-dependent; any future tests must use an `AudioContext` mock or headless browser. `use-audio-context.ts` constructs an `AudioContext` at module import, which would run in any test importing the engine.

### 6) Evidence

- `package.json` (no `test` script / no testing deps)
- `AGENTS.md` ("There is no test runner configured.")
- `.lintstagedrc.json`, `.husky/pre-commit` (only formatting as pre-commit gate)
