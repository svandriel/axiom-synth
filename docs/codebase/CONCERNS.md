# Codebase Concerns

## Core Sections (Required)

### 1) Top Risks (Prioritized)

| Severity | Concern                                                                                                                                 | Evidence                                                                              | Impact                                                                                              | Suggested action                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| high     | No test runner or test suite — only `pnpm build` (typecheck) + prettier as gates                                                        | `package.json` (no `test` script), `AGENTS.md` ("There is no test runner configured") | Any curve-math/envelope change can break audio behavior silently                                    | Add Vitest + unit tests for pure engine modules (`waveshaper-curve.ts`, `envelope.ts`, `helpers.ts`) |
| med      | `new AudioContext()` constructed at module import in `use-audio-context.ts` (eager, pre-gesture)                                        | `src/composables/use-audio-context.ts:4`                                              | Autoplay policy may start suspended; `ensureStarted()` mitigates but no user-visible re-create path | Consider lazy context creation on first note/user gesture                                            |
| med      | Waveshaper curve visualization exists only on branch `feature/shaper-curve-viz` (unmerged); main's `WaveshaperPanel` has no curve graph | branch diff, `src/components/WaveshaperPanel.vue` (main)                              | Feature lives on an orphan branch; risk of drift/conflict                                           | [ASK USER] merge viz branch or document as planned                                                   |
| low      | Redundant duplicated canvas `fit()`/grid/glow code across `EnvelopePanel.vue` and `ScopePanel.vue`                                      | `src/components/EnvelopePanel.vue:116-204`, `src/components/ScopePanel.vue:59-70`     | Style drift; similar drawing logic re-implemented                                                   | Extract shared canvas helper                                                                         |
| low      | No lint beyond Prettier (no ESLint); formatting only                                                                                    | `.prettierrc.yaml` alone                                                              | Unused/loose code (`var timeData` in `ScopePanel.vue:29`) slips through                             | Consider ESLint or at least `var` audit                                                              |

### 2) Technical Debt

| Debt item                                                                               | Why it exists                          | Where                                                                         | Risk if ignored                          | Suggested fix                                |
| --------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| Inconsistent import style (`.ts` extension vs bare)                                     | Progressive refactor without a rule    | `src/components/EnvelopePanel.vue:69` vs `src/components/Keyboard.vue:56`     | Confusion, noisy diffs                   | Standardize (Vite/TS allow either; pick one) |
| `console.log` telemetry on every note on/off/init                                       | Debug leftovers                        | `src/engine/engine.ts:116,322,332,340`, `src/engine/voice.ts:42,62`           | Log spam in prod; perf cost per keypress | Gate behind a debug flag or remove           |
| Duplicated `fit()` canvas sizing                                                        | Copies from first scope implementation | `src/components/ScopePanel.vue`, `src/components/EnvelopePanel.vue`           | Divergence (e.g. dpr caps)               | Extract shared canvas utils                  |
| `var` declarations in components                                                        | Legacy code                            | `src/components/ScopePanel.vue:29`, `src/components/Knob.vue:160`             | Inconsistent with codebase style         | Convert to `let`/`const`                     |
| Magic formula/constant values (curve `k` factors, master `0.5`, dry `0.2`, knob `270°`) | Designed inline, not documented        | `src/engine/waveshaper-curve.ts:69-97`, `engine.ts:119,124`, `Knob.vue:80-81` | Tuning changes are unsettling to make    | Extract named constants + comments           |

### 3) Security Concerns

| Risk                                                                                                | OWASP category (if applicable) | Evidence                                          | Current mitigation                                         | Gap |
| --------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------- | ---------------------------------------------------------- | --- |
| None significant — static client-only app, no network egress in-app, no user HTML, no server inputs | N/A                            | `src/` has no fetches, no `innerHTML`, no secrets | localStorage used only for theme key (`use-theme-mode.ts`) | n/a |

### 4) Performance and Scaling Concerns

| Concern                                                           | Evidence                                         | Current symptom                                                                    | Scaling risk                           | Suggested improvement                       |
| ----------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| Scope renders 2048-point analyser buffer every animation frame    | `ScopePanel.vue:94-125`                          | High CPU under continuous rAF even when idle                                       | Grows with tab count/dpi               | Pause rAF when tab hidden; cap sample count |
| 16-voice fixed pool + 3ms steal delay on exhaustion               | `engine.ts:17,335-363`                           | Chord clusters >16 notes get 3ms-lagged retrigger                                  | Ugly polyphony ceiling                 | Dynamic pool sizing or lower choke          |
| Curve recompute is 16× under old design; now 1× (WaveshaperCurve) | `engine.ts:171-180`, `waveshaper-curve.ts:64-99` | Improved — but still full 1024-sample recompute synchronous in `Observable` setter | Blocks during knob drags at high rates | Throttle or decimate recompute              |

### 5) Fragile/High-Churn Areas

| Area                                          | Why fragile                                                        | Churn signal                      | Safe change strategy                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/engine/engine.ts`                        | Single cohesive class owns sources, pool, all setters, destroy     | 27 commits (highest churn)        | Add unit tests first; make per-parameter adapter (Observable/ConstantSource) seams explicit |
| `src/components/Synth.vue`                    | Watch-bridge for every v-model; any engine API change ripples here | 22 commits                        | Keep engine setter API stable; move watch mapping into composable                           |
| `src/engine/waveshaper-curve.ts`              | Curve math central to timbre; formula constants are sensitive      | Recent feature branch (wave/type) | Cover each `switch` branch with unit tests; keep 1024-sample buffer stable                  |
| Voice lifecycle (`voice.ts`/`axiom-voice.ts`) | Timer-based cleanup + stealing interplay                           | 13-14 commits                     | Preserve `isAvailable`/`endTime` invariants; add tests if introduced                        |

### 6) [ASK USER] Questions

1. [ASK USER] The waveshaper curve visualization lives on unmerged branch `feature/shaper-curve-viz`. Is it intended to be merged to `main` soon (affects how docs describe the feature set), or should it be documented as planned/future work?
2. [ASK USER] There is no test runner. Should we introduce one (e.g. Vitest) for the pure engine modules, or keep build-only verification?

### 7) Evidence

- `package.json` — scripts/deps (no test script)
- `AGENTS.md` — stated conventions and "no test runner" note
- `src/components/ScopePanel.vue` / `src/components/EnvelopePanel.vue` — duplicated canvas code
- `src/engine/engine.ts`, `src/engine/waveshaper-curve.ts` — high-churn, curve constants
