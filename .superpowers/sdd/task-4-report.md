# Task 4 Report: Integrate Pool Into UnisonOscillator

## Status

Complete.

## Implementation

- Replaced per-note pooled processing graph allocation with
  `UnisonVoicePathPool` leases for `voices > 1`.
- Preserved the direct oscillator-to-output path for `voices === 1`.
- Configures and arms every pooled path before starting any one-shot source.
- Rolls back armed paths and created sources if setup or source start fails.
- Uses bundle membership and exact `(path, oscillator)` identity guards for
  stale and out-of-order `onended` callbacks.
- Keeps draining paths unavailable until their matching oscillator ends.
- Preserves all public controls and a-rate shared `AudioParam` connections.
- Makes destruction defensive and idempotent while sources are draining.
- Added required comments for one-shot source allocation and cached
  `(voices, index)` blend-curve roles.

## Tests

Extended fake-context integration coverage for:

- warmed path reuse with fresh oscillator sources;
- direct `voices === 1` allocation without pool nodes;
- draining-path reuse rules;
- stale callback identity safety;
- direct and pooled inbound connection teardown;
- transactional setup rollback;
- idempotent destruction during drain.

## Verification

- `pnpm test`: passed, 3 files and 27 tests.
- `pnpm --filter @axiom/audio-engine build`: passed.
- `pnpm build`: passed for audio-engine, axiom-synth, and app.
- `pnpm lint`: passed.
- `git diff --check`: passed.

## Unrelated worktree changes

The pre-existing changes in `app/src/components/FilterPanel.vue` and
`app/src/utils/hz-display.ts` were not modified or staged.

## Commit

To be recorded as `perf(engine): reuse unison processing paths`.
