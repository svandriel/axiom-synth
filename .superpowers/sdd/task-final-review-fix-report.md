# Final Review Fix Report

## Fixes

- Added a regression test proving that stealing voice 0 from note 60 for note
  64 removes the stale note 60 mapping. `noteOff(60)` does not release the new
  note, while `noteOff(64)` does.
- Wrapped console spy usage in the lifecycle-log test in `try/finally`, ensuring
  both spies are restored even when an assertion fails.

## Scope

Only `packages/audio-engine/src/engine/voice-manager.test.ts` and this report
were changed. VoiceManager lifecycle semantics and Axiom integration tests were
not changed.

## Verification

- `pnpm --filter @axiom/audio-engine exec vitest run src/engine/voice-manager.test.ts`: passed, 1 file and 9 tests.
- `pnpm test`: passed, 4 files and 46 tests.
- `git diff --check`: passed.
