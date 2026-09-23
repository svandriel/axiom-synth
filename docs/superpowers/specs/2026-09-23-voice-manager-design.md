# Voice manager extraction

## Goal

Extract generic voice allocation and deallocation from `Synth` into a public
`VoiceManager` building block. Preserve the current note behavior.

## Scope

Add `VoiceManager<V extends Voice>` in
`packages/audio-engine/src/engine/voice-manager.ts`. It receives an
`AudioContext`, maximum voice count, and callback that creates a voice.

`VoiceManager` owns:

- Lazy fixed-size voice-pool creation.
- Active-note-to-voice mapping.
- Duplicate-note release before retriggering.
- First available voice selection.
- Oldest-voice stealing, map cleanup, choke, and start delay.
- Note release, all-notes release, and voice destruction.

`Synth` keeps its `AudioContext`, output sink, destroyed guard, and abstract
`createVoice()` method. It creates the manager with `createVoice`, and its
public `noteOn`, `noteOff`, `allNotesOff`, and `destroy` methods delegate to
the manager. `Synth.destroy()` marks itself destroyed before it destroys the
manager.

`VoiceManager` will be exported from the engine barrel and the package barrel.
It is a generic engine building block, not an Axiom-specific class.

## Behavior

The extraction preserves current scheduling and logs:

- `noteOn` resumes suspended audio contexts before allocation.
- Repeated `noteOn` for an active note releases its mapped voice first.
- Available voices are selected before stealing.
- When no voice is available, manager selects the lowest `lastUsed` voice,
  removes all mappings to it, calls `fastChoke(now)`, and schedules the new
  note after `chokeDuration`.
- `noteOff` releases and removes only its mapped voice.
- `allNotesOff` releases every mapped voice and clears mappings.
- `destroy` clears mappings and destroys all lazily-created voices.

`Synth` retains its destroyed guard, so public calls after destruction remain
no-ops. `VoiceManager` does not add a second external lifecycle API.

## Tests

Add `voice-manager.test.ts` beside its module. Use fake voices and the existing
`FakeAudioContext` test helper to test lazy pool creation, note assignment,
retriggering, release, oldest-voice stealing with choke delay, all-notes
release, and destruction.

Existing `Synth` behavior remains covered through delegation. Build, test, and
format checks must pass.

## Non-goals

- Change voice-stealing policy or timing.
- Change `Voice` lifecycle behavior.
- Change Axiom voice graph wiring or configuration.
- Add a new public allocation API on `AxiomSynth`.
