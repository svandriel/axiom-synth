# Task 3 Review: Private Reusable Path Pool

## Spec compliance

**Verdict: Fail.** Core acquire/disarm state behavior and Blend mapping wiring are
present, but teardown is incomplete and required acceptance coverage is missing.

- **High:** `UnisonVoicePath.destroy()` cannot remove inbound connections from the
  shared `detuneSource`, `depthSource`, and `blendSource`. It stores none of those
  source nodes, then only calls `node.disconnect()` on path-owned nodes
  (`packages/audio-engine/src/engine/unison-voice-path.ts:116-125`). That leaves
  `source -> path.detuneScale`, `source -> path.depthScale`, and
  `source -> path.blendInput` links alive after pool destruction. This violates the
  exact teardown requirements in the approved spec, lines 262-268 and 309, and
  the repo rule in `docs/codebase/RULES.md:44-49`.
- **Medium:** Required tests for Blend remapping and reset/default gains are absent.
  The implementation sets `blendMapper.gain` to `2`, `blendOffset.offset` to `-1`,
  and resets path gain/position (`unison-voice-path.ts:43-46, 68-75`), but no test
  checks those values or that a reused path is zeroed before reattachment. The
  approved spec explicitly requires these checks at lines 240-254 and 303-304.
- **Medium:** Required exact teardown coverage is incomplete. Tests check pooled
  detune disarm and direct-path absence, but do not assert removal of the raw
  oscillator audio link, all shared-source inbound links, offset-source stop, or
  complete destruction after a disconnect failure (`unison-voice-path.test.ts:106-135,
  180-196`).
- **Low:** The approved spec calls for development counters for created/acquired/
  released/overflow-created/overflow-destroyed paths (lines 177-180). No counters
  exist in the pool.

## Code quality

**Verdict: Needs changes.** Code is formatted, typed, and compact, but lifecycle
ownership is under-specified in the implementation and comments do not meet the
approved documentation requirement.

- **Medium:** The module has no comments for the non-obvious lifecycle/math rules
  required by the spec: one-shot raw oscillators, draining-path availability,
  `(voiceCount, index)` cache roles, Blend normalization, zeroed free paths, exact
  disconnects, and temporary overflow paths. The only comment is a generic
  best-effort teardown note (`unison-voice-path.ts:137-143`).
- **Low:** `PathLease` and `UnisonVoicePath` are exported from the module
  (`unison-voice-path.ts:5, 10`) even though Task 3 requires a package-private pool
  interface and the path type does not cross a package seam. They are not exported
  from the package barrel, so this is limited to module-level API looseness.

## Tests and scope

Focused tests passed: `pnpm test -- unison-voice-path.test.ts` (3 files, 16 tests),
`pnpm --filter @axiom/audio-engine build`, `pnpm build`, and `pnpm lint`.

The range also contains unrelated README, screenshot, and UI commits. Per review
scope, those were not assessed beyond noting that they are unrelated to Task 3.

## Fix report

The review findings were fixed in the current workspace:

- Paths now retain detune, depth, and Blend source references and explicitly
  disconnect each inbound source link before owned-node teardown.
- Added regression coverage for Blend gain/offset mapping, reusable reset values,
  raw audio disconnect, all shared-source disconnects, offset-source stopping, and
  cleanup continuing after a disconnect failure.
- Added concise lifecycle/math comments and development path counters for created,
  acquired, released, overflow-created, and overflow-destroyed paths.
- Removed the unnecessary module exports from `PathLease` and `UnisonVoicePath`.
