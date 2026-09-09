# Lazy Oscillator Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `OscillatorNode`s lazy — created only when a voice starts sounding, destroyed after release completes.

**Architecture:** The `Voice` object and its `ampEnv` GainNode persist; oscillators are created on `noteOn`, stopped/disconnected on a timer after `noteOff`. All lifecycle handling lives in `Voice`, with no changes to `AudioEngine`. A `cleanupTimer` and `oscillatorsActive` flag track oscillator state.

**Tech Stack:** TypeScript, Web Audio API, Vue 3.

**Spec:** `docs/superpowers/specs/2026-09-09-lazy-oscillators-design.md`

## Global Constraints

- TypeScript strict mode, `erasableSyntaxOnly`
- No semicolons, single quotes, 80-char width, trailing commas (Prettier)
- No test runner configured — verify with `pnpm build` (type-check + build)
- Voice pool stays at 16 voices; oscillator config stays hardcoded (2× saw, 1× triangle)
- Existing JSdoc-style comments preserved; do not add new comments unless the task specifies them

---

### Task 1: Make oscillators lazy in Voice

**Files:**

- Modify: `src/engine/voice.ts`

**Interfaces:**

- Produces: `Voice` with new private fields `oscillatorsActive: boolean` and `cleanupTimer: ReturnType<typeof setTimeout> | null`; updated `noteOn`, `noteOff`, `destroy`; unchanged `isAvailable`, `fastChoke`, `currentNote`, `endTime`, `lastUsed`, `freqOf`.

- [ ] **Step 1: Read the current Voice implementation**

Read `src/engine/voice.ts` to confirm the current state.

- [ ] **Step 2: Add oscillator lifecycle state fields**

Add these two private fields to the class, near the top where `oscillators` is declared (currently lines 8–9):

```typescript
private readonly oscillators: OscillatorNode[] = [];
public currentNote: number | null = null;
public endTime = 0;
public lastUsed = 0;
```

Replace the `private readonly oscillators` declaration line with:

```typescript
private oscillators: OscillatorNode[] = [];
private oscillatorsActive = false;
private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
```

The existing lines `public currentNote`, `public endTime`, `public lastUsed` stay unchanged. The `oscillators` field loses `readonly` because it is reassigned to `[]` during cleanup.

- [ ] **Step 3: Remove oscillator creation from constructor**

In the constructor, delete everything from the comment `const osc1 = this.ctxt.createOscillator();` through the `start`/`connect` loop, so the constructor body ends after `this.ampEnv.gain.setValueAtTime(0, this.ctxt.currentTime);` and the `ampEnv.connect(this.audioSink);` line. The constructor becomes:

```typescript
constructor(ctxt: AudioContext, audioSink: AudioNode) {
  this.ctxt = ctxt;
  this.audioSink = audioSink;

  this.ampEnv = this.ctxt.createGain();
  this.ampEnv.gain.setValueAtTime(0, this.ctxt.currentTime);

  this.ampEnv.connect(this.audioSink);
}
```

- [ ] **Step 4: Update `noteOn` to create oscillators lazily**

Replace the entire `noteOn` body with:

```typescript
noteOn(
  noteNumber: number,
  velocity: number,
  ampEnvelope: EnvelopeConfig,
  startTimeOffset: number,
) {
  const now = this.ctxt.currentTime + startTimeOffset;

  this.currentNote = noteNumber;
  this.lastUsed = this.ctxt.currentTime + startTimeOffset;

  console.log(`[${now.toFixed(4)}] noteOn(${noteNumber})`);

  if (this.cleanupTimer !== null) {
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  if (this.oscillatorsActive) {
    this.oscillators.forEach(osc => osc.stop());
    this.oscillators.forEach(osc => osc.disconnect());
    this.oscillators = [];
  }

  this.createOscillators(now);

  const frequency = freqOf(noteNumber);
  const targetVolume = (velocity / 127) * this.maxVolume;

  this.ampEnv.gain.cancelScheduledValues(now);

  this.oscillators.forEach(osc => {
    osc.frequency.setValueAtTime(frequency, now);
  });

  this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
  this.ampEnv.gain.setTargetAtTime(
    targetVolume,
    now,
    ampEnvelope.attackSeconds / 3,
  );

  const decayStartTime = now + ampEnvelope.attackSeconds;
  const sustainVolume = targetVolume * ampEnvelope.sustainLevel;
  this.ampEnv.gain.setTargetAtTime(
    sustainVolume,
    decayStartTime,
    ampEnvelope.decaySeconds / 3,
  );

  this.oscillatorsActive = true;
  this.endTime = Infinity;
}
```

Note: the original `noteOn` also called `this.filter.frequency.cancelScheduledValues(now);` and set filter env values in commented code — those are already commented out and are not preserved.

- [ ] **Step 5: Add the private `createOscillators` helper**

Add this private method after `noteOn`. It takes the start time so oscillators start at the correct scheduled time:

```typescript
private createOscillators(now: number): void {
  const osc1 = this.ctxt.createOscillator();
  osc1.type = 'sawtooth';
  osc1.detune.value = -12;

  const osc2 = this.ctxt.createOscillator();
  osc2.type = 'sawtooth';
  osc2.detune.value = 0;

  const osc3 = this.ctxt.createOscillator();
  osc3.type = 'triangle';
  osc3.detune.value = 11;

  this.oscillators.push(osc1);
  this.oscillators.push(osc2);
  this.oscillators.push(osc3);

  this.oscillators.forEach(osc => osc.connect(this.ampEnv));
  this.oscillators.forEach(osc => osc.start(now));
}
```

The `noteOn` call site already passes `now` (Step 4).

- [ ] **Step 6: Update `noteOff` to schedule cleanup**

Replace the `noteOff` body with:

```typescript
noteOff(ampEnvelope: EnvelopeConfig) {
  const now = this.ctxt.currentTime;
  console.log(`[${now.toFixed(4)}] noteOff()`);

  this.ampEnv.gain.cancelScheduledValues(now);
  this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
  this.ampEnv.gain.setTargetAtTime(0, now, ampEnvelope.releaseSeconds / 3);

  // 5 time-constants completely flattens setTargetAtTime
  this.endTime = now + ampEnvelope.releaseSeconds * 5;

  this.cleanupTimer = setTimeout(() => {
    if (!this.oscillatorsActive) return;
    this.oscillators.forEach(osc => osc.stop());
    this.oscillators.forEach(osc => osc.disconnect());
    this.oscillators = [];
    this.oscillatorsActive = false;
    this.currentNote = null;
    this.cleanupTimer = null;
  }, ampEnvelope.releaseSeconds * 5 * 1000);
}
```

Note: the original `noteOff` also had commented-out filter frequency code — not preserved.

- [ ] **Step 7: Update `destroy` to cancel the timer and guard oscillator stop**

Replace the `destroy` body with:

```typescript
destroy() {
  if (this.cleanupTimer !== null) {
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
  }
  if (this.oscillatorsActive) {
    this.oscillators.forEach(osc => osc.stop());
    this.oscillators.forEach(osc => osc.disconnect());
    this.oscillators = [];
    this.oscillatorsActive = false;
  }
  this.ampEnv.disconnect();
}
```

- [ ] **Step 8: Type-check and build**

Run: `pnpm build`

Expected: exit 0, no type errors. The pre-commit hook will handle formatting later.

- [ ] **Step 9: Review the final file against the spec**

Read `src/engine/voice.ts`. Verify:

- Constructor contains no oscillator creation
- `noteOn` cancels pending `cleanupTimer`, stops old oscs if `oscillatorsActive`, then creates fresh oscs
- `noteOff` schedules cleanup at `releaseSeconds * 5` seconds, resetting `oscillatorsActive`, `oscillators`, `currentNote`, `cleanupTimer`
- `destroy` cancels the timer and guards on `oscillatorsActive`
- `isAvailable` and `fastChoke` are unchanged
- All four call sites (`AudioEngine.noteOn`, `AudioEngine.noteOff`, `AudioEngine.allNotesOff`, `AudioEngine.destroy`) still compile — they call `Voice` methods whose signatures did not change

- [ ] **Step 10: Commit**

```bash
git add src/engine/voice.ts
git commit -m "feat: make oscillator nodes lazy in Voice"
```

---

## Self-Review Checklist (run before handoff)

- **Spec coverage:** Constructor no longer creates oscs ✓ (Task 1 Step 3); `noteOn` cancels timer + creates oscs ✓ (Step 4/5); `noteOff` schedules cleanup ✓ (Step 6); `destroy` cancels timer ✓ (Step 7); `currentNote` reset ✓ (Step 6). All spec sections covered.
- **Placeholder scan:** No TBD/TODO. Every code block is complete.
- **Type consistency:** `createOscillators(now: number)` is called with `now` in both places. `cleanupTimer` and `oscillatorsActive` names consistent across all methods. `oscillators` dropped `readonly` consistently.
