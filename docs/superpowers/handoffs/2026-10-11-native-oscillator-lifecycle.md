# Handoff — Native Oscillator Lifecycle (MoogOscillator)

Date: 2026-10-11
Branch: `feature/native`
Status: Subagent-driven execution, Task 2 of 4 reviewed clean, **not yet marked complete**. Execution paused by user request.

## Read first

- `AGENTS.md` — this repo is caveman-ultra communication mode; work on a feature
  branch; never commit under `.superpowers/`.
- Spec: `docs/superpowers/specs/2026-10-11-native-oscillator-lifecycle-design.md`
  (committed `04dd4d7`).
- Plan: `docs/superpowers/plans/2026-10-11-native-oscillator-lifecycle.md`
  (committed `1b7c972`). Tasks 1-4, each fully specified with exact code.
- SDD ledger (git-ignored, recovery map):
  `.superpowers/sdd/2026-10-11-native-oscillator-lifecycle/progress.md`.
  Also there: `task-1-brief.md`, `task-1-report.md`, `task-2-brief.md`,
  `task-2-report.md`, and `review-*.diff` packages. Do not commit this dir.

## Goal

`MoogOscillator` (`packages/native/src/nodes/moog-oscillator.ts`) was copied
from `WebAudioOscillator` but drives an `AudioWorkletNode`. Give it a working
`start`/`stop` lifecycle that destroys the worklet node + WASM processor on
`stop(time)`, confirmed back over the message port. Approach: main→processor
`START {when}` / `STOP {when}` messages; processor gates silence until `start`,
and at stop time frees WASM, posts `ENDED`, returns `false`; wrapper re-exposes
`start`/`stop`/`onended`/`disconnect`; `MoogOscillator` drops `osc.type` and
delegates stop.

## Commits so far (branch `feature/native`)

- `04dd4d7` docs: spec
- `1b7c972` docs: plan
- `0886f6d` Task 1 — processor START/STOP/ENDED — review clean
- `11cf180` Task 2 — MoogOscillatorWorkletNode start/stop/onended/disconnect —
  review clean

## Exact state / next action

Tasks 1 and 2 are implemented, tested, and reviewed clean (both: Spec ✅,
quality Approved, no Critical/Important). **Task 2's completion bookkeeping was
not performed before pausing.** Resume at the start of the subagent-driven task
loop:

1. Append to the ledger:
   `Task 2: complete (commits 0886f6d..11cf180, review clean — 3 minors deferred)`
   plus its three deferred-minor lines (below).
2. Mark Task 2 todo complete, Task 3 in_progress.
3. Run `scripts/task-brief <plan> 3`; record `BASE = 11cf180`. Dispatch the
   Task 3 implementer (MoogOscillator wiring + new `moog-oscillator.test.ts`).

- Task 3 BASE is `11cf180`. Task 4 is verification only (build/test/lint).
- After Task 4: final whole-branch review (`requesting-code-review` skill,
  merge-base `main`..HEAD package), one fix wave if needed, then
  `finishing-a-development-branch`, then delete the SDD workspace.

## Deferred minors (for final-review triage)

Task 1:

- `WorkletEndedMessage` is outbound-only yet sits in the inbound `WorkletMessage`
  union; processor has no `ENDED` case (brief-mandated).
- Fake `_malloc` wraps to `FIRST_POINTER`, aliasing buffers across processors.
- Start gate sits after the `!output || !mainModule` guard, so an unstarted
  pre-init processor returns `true` without an explicit `fill(0)` (plan-mandated
  ordering; AudioWorklet zero-fills each quantum).

Task 2:

- `moog-oscillator-worklet-node.ts` public `disconnect` overloads omit `null`
  even though the impl handles it; `node.disconnect(null)` fails overload
  resolution (plan-mandated).
- `does not fire onended after destroy` test passes via `destroy()` nulling
  `onmessage`, not independently via the `ended` guard (plan-mandated test).
- `started`/`stopped` latched before `postMessage`; a throw would suppress retry
  (very low risk).

## Decisions already locked (do not relitigate)

- `start(now)` gates processor output until `now` via a `START` message (chosen
  over relying on the amp envelope).
- `waveform` stays stored-only; `osc.type = this.wave` dropped (worklet saw-only).
- `stop()` with no time delegates `osc.stop(ctxt.currentTime)`.
- `MoogOscillator.detachNode` calls `osc.destroy()` (DESTROY + disconnect), not a
  bare disconnect.
- Task 1 test deviations are reviewer-approved: existing per-sample test sends
  `START when:0`; new tests await a fresh `_moog_saw_wasm_create`; fake
  `_malloc` wraps.

## Task 3 gotchas

- Test file `packages/native/src/nodes/moog-oscillator.test.ts` is new; the plan
  already accounts for shared `createdNodes` with a `beforeEach` reset.
- `erasableSyntaxOnly`: no constructor parameter properties in the fake.
- Strict TS + DOM lib; run
  `pnpm --filter @axiom/native test:js -- src/nodes/moog-oscillator.test.ts`.

## Suggested skills for the next agent

Call the Skill tool for: `subagent-driven-development` (resume the Task 1-4 loop
exactly as written) — and `caveman` (repo requires ultra mode). Later:
`requesting-code-review` (final whole-branch review) and
`finishing-a-development-branch`. `verification-before-completion` gates any
"done" claim.
