# Task 3 Report: ClampNode and Unison Control Clamps

## Status

Complete.

## Files

- Created `packages/audio-engine/src/engine/clamp-node.ts`.
- Modified `packages/audio-engine/src/engine/index.ts`.
- Modified `packages/audio-engine/src/engine/unison-oscillator.ts`.

## Decisions

`ClampNode` extends `CurveNode` with an identity curve and caller-supplied input
bounds. `CurveNode` maps those bounds to the `WaveShaperNode` domain, whose
endpoint behavior clamps out-of-range source values.

Each unison note bundle creates three clamps: detune `[0, 50]`, depth `[0, 1]`,
and blend `[0, 1]`. Existing source-to-clamp connections, clamp output routing,
and source-to-clamp teardown already matched the required graph. The change
replaces the repeated inline identity `CurveNode` construction with `ClampNode`
and narrows the bundle types accordingly.

No methods, fields, or teardown behavior were added to `ClampNode`. The engine
barrel exports it as public API.

## Checks

No test runner is configured in this repository. `pnpm exec vitest --version`
confirmed `vitest` is unavailable, so a test-first cycle was not possible.

Ran before commit:

```text
pnpm build && pnpm lint && git diff --check
```

Result: exit code 0. `packages/audio-engine` and `packages/axiom-synth` passed
`tsc --noEmit`; app passed `vue-tsc -b && vite build`; Prettier reported all
matched files formatted; `git diff --check` reported no whitespace errors.

The commit hook ran Prettier on staged TypeScript files and passed.

## Commit

`d1e2335 feat(engine): clamp unison control signals`

## Self-review

- `ClampNode` uses exactly the specified identity `CurveNode` specialization.
- All three continuous unison sources feed per-note clamps before distribution
  and gain-normalization graphs.
- Clamp outputs continue to feed detune, depth, and blend paths.
- Persistent sources explicitly disconnect from every clamp input before each
  clamp is destroyed.
- Production changes are limited to the three task files.
