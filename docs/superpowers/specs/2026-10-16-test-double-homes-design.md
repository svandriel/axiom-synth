# Test Double Homes Design

## Goal

Give every test double one unambiguous home. `@axiom/audio-testing` holds doubles
for the Web Audio API only; doubles for a package's own modules live beside that
package under `src/testing/`. Establish the convention on `@axiom/audio-engine`,
the only package on `main` that still inlines module-own doubles in its test
files.

## Rule

Two clauses, added to `docs/codebase/RULES.md`:

1. `@axiom/audio-testing` contains doubles for the Web Audio API only
   (`AudioContext`, audio nodes, `AudioParam`, `AudioWorklet` globals). It may use
   Vitest spies and fns. It never imports `@axiom/audio-engine`,
   `@axiom/axiom-synth`, or `@axiom/native`, so it stays a dependency leaf.
2. A package's doubles for its own modules live under `<package>/src/testing/`.
   They are never exported from the package barrel and never imported by
   production code.

## Non-shipping guarantee

Four properties keep `src/testing/` out of any production bundle:

- Vitest collects only `*.test.*` / `*.spec.*`, so helper files are not tests.
- Helper files are not referenced by a package `index.ts` barrel.
- No production module imports them.
- A package `build` is `tsc --noEmit` (no output), and the app bundles from
  `app/src` through the barrels, so helper files are never walked.

## Current doubles (`@axiom/audio-engine`)

| Test file                   | Inlined double                                                                 |
| --------------------------- | ------------------------------------------------------------------------------ |
| `unison-oscillator.test.ts` | `TestOscillator implements Oscillator` (node-backed, rich flags)               |
| `unison-voice-path.test.ts` | `createOscillator` factory (minimal `Oscillator` with a local connection list) |
| `synth.test.ts`             | `TestVoice` / `TestSynth` (record the base class's `internal*` hooks)          |
| `voice-manager.test.ts`     | `TestVoice` / `TestSynth` (override the public methods and spy)                |

## Target layout

`packages/audio-engine/src/testing/`:

- `test-oscillator.ts` — `TestOscillator` plus a `createTestOscillator` factory.
  Unifies the two oscillator doubles.
- `test-voice.ts`, `test-synth.ts` — the `synth.test.ts` variant: a `Voice`
  whose protected `internalNoteOn`/`internalNoteOff`/`internalFastChoke` hooks
  record calls, leaving real base-class state and cleanup timers intact.
- `spy-voice.ts`, `spy-synth.ts` — the `voice-manager.test.ts` variant: a
  `Voice` whose public `noteOn`/`noteOff`/`fastChoke`/`destroy` are overridden
  and spied, so `VoiceManager` delegation is observed directly.

The two `Voice` doubles are **not** duplicates. One exercises the base `Voice`
through its hooks (real state, timers); the other replaces the public surface to
isolate `VoiceManager`. Merging them would erase what each test measures, so they
stay separate helpers.

The oscillator doubles **are** duplicates and unify. `TestOscillator` gains a
`connections` getter that delegates to its backing node, and its
`connect`/`disconnect` delegate to that node (recording into the node and the
context) instead of the inline factory's private array. `unison-voice-path.test.ts`
drops its local factory for the shared one.

## `@axiom/audio-testing`

No change for this scope. Its current contents (`FakeAudioContext` and the fake
nodes) are already Web Audio API doubles. Worklet doubles are **not** added here:
`main` has no `native` package, and unused exports violate rule 7. They arrive
with the native work under the same rule.

## Documentation

- `docs/codebase/RULES.md`: add a `Testing` section with the two-clause rule
  (rule 10).
- `docs/codebase/TESTING.md`: §2 Test Layout gains the `src/testing/` location
  for module-own doubles; §4 Mocking states the split between Web Audio fakes
  (`@axiom/audio-testing`) and module doubles (`src/testing/`).

## Scope

In: relocate and unify the `@axiom/audio-engine` doubles; update the two docs.

Out: native/worklet doubles, `@axiom/axiom-synth` native doubles, any production,
DSP, public-API, configuration, UI, or CI change. No barrel export changes.

## Verification

`pnpm test`, `pnpm build`, and `pnpm lint` all pass in the worktree, with the
audio-engine suite count unchanged.
