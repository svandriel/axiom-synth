# Lazy Oscillator Nodes

## Goal

Make `OscillatorNode`s lazy: created only when a voice starts sounding, destroyed when it finishes. Currently all 16 voices create 3 oscillators at construction time, meaning 48 oscillators run perpetually even when silent.

## Scope

- Voice object (`ampEnv` GainNode) persists — only OscillatorNodes are lazy
- Oscillator configuration stays hardcoded (2× saw, 1× triangle, fixed detune) — UI wiring deferred
- Voice pool size stays fixed at 16

## Voice Lifecycle

### States

```
IDLE → noteOn → ACTIVE → noteOff → RELEASING → cleanup → IDLE
                          ↑                      ↓
                          ←── steal (fastChoke) ←┘
```

### `noteOn(noteNumber, velocity, ampEnvelope, startTimeOffset)`

1. If `cleanupTimer` is pending, cancel it (voice was stolen during release — prevent old timer from killing new oscillators)
2. If `oscillatorsActive` is true (voice stolen while still sounding):
   - Stop existing oscillators, disconnect them, clear the array
3. Create 3 `OscillatorNode`s with hardcoded config:
   - osc1: sawtooth, detune -12
   - osc2: sawtooth, detune 0
   - osc3: triangle, detune +11
4. Connect each oscillator to `this.ampEnv`
5. Set `frequency` on all oscillators to `freqOf(noteNumber)`
6. Start all oscillators: `osc.start(now)`
7. Set `oscillatorsActive = true`
8. Schedule ADSR envelope via `setTargetAtTime` (unchanged)

### `fastChoke(time)` (voice stealing)

Unchanged — ramps gain to 0 in 3ms. Oscillators stay connected for the brief ramp. `endTime` set to `time + 0.003`.

### `noteOff(ampEnvelope)`

1. `cancelScheduledValues(now)`
2. `setValueAtTime(currentGain, now)`
3. `setTargetAtTime(0, now, releaseSeconds / 3)` — exponential release, kept as-is
4. `endTime = now + releaseSeconds * 5`
5. Schedule cleanup, storing the timer ID for later cancellation:
   ```
   this.cleanupTimer = setTimeout(() => {
     if (!this.oscillatorsActive) return;  // stolen/cleaned already
     this.oscillators.forEach(osc => { osc.stop(); osc.disconnect() })
     this.oscillators = []
     this.oscillatorsActive = false
     this.currentNote = null
     this.cleanupTimer = null
   }, releaseSeconds * 5 * 1000)
   ```

### `destroy()`

Stop and disconnect oscillators only if `oscillatorsActive` is true. Disconnect `ampEnv`. **Cancel any pending `cleanupTimer`** — otherwise the timer fires after `AudioEngine.destroy()` closes the context, and calling `osc.stop()`/`osc.disconnect()` on oscillators belonging to a closed `AudioContext` throws.

## AudioEngine Changes

None. Voice selection, stealing, and `noteOff` delegation are unchanged. The Voice class manages its own oscillator lifecycle internally.

## Voice State Additions

- `oscillatorsActive: boolean` — whether OscillatorNodes currently exist
- `cleanupTimer: ReturnType<typeof setTimeout> | null` — pending release cleanup

## Edge Cases

| Scenario                              | What happens                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Steal during attack/decay/sustain** | `fastChoke` ramps gain to 0. Then `noteOn` stops old oscs, creates new ones at new frequency. 3ms choke prevents pops.                                                                                                                                                                |
| **Steal during release**              | `isAvailable()` returns false (endTime not reached). Voice is not normally allocated. Only explicit stealing (oldest lastUsed) can pick it. `fastChoke` + `noteOn` replaces oscs and cancels the pending cleanup timer — otherwise the old timer would stop the freshly created oscs. |
| **Rapid re-trigger**                  | Same note retriggered while active → `noteOn` called on active voice. Old oscs stopped, new ones created. Clean slate.                                                                                                                                                                |
| **`allNotesOff()`**                   | Iterates all voices, calls `noteOff()`. Each voice's release + cleanup runs independently.                                                                                                                                                                                            |
| **Voice with no oscs gets noteOn**    | `oscillatorsActive` is false → skips step 1 (no old oscs to stop), creates fresh oscs.                                                                                                                                                                                                |
| **`destroy()` with pending timer**    | Timer cancelled. Without this, the timer fires after `ctxt.close()` and Web Audio throws on a closed context.                                                                                                                                                                         |
| **Cleanup state reset**               | Cleanup timer also resets `currentNote` to null, keeping state consistent with `isAvailable()`'s `currentNote === null` clause.                                                                                                                                                       |

## Signal Path (unchanged)

```
Oscillators → Voice.ampEnv (GainNode) → AudioEngine.filter → dry → master → comp → analyser → destination
```
