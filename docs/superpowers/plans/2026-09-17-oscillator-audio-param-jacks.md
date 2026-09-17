# Oscillator Audio Param Jacks + Modulation Router — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `Oscillator` into a self-contained unit generator exposing `frequency`/`detune`/`gain` AudioParam jacks, with static modulation patching moved into a new `ModulationRouter`; delete `OscillatorConfigSource`.

**Architecture:** `Oscillator` becomes LFO/engine-agnostic. Its three jacks are backed by unit-owned `ConstantSourceNode.offset` (frequency, detune) and the output `GainNode.gain` (gain); per-note `OscillatorNode`s fan in from those jacks additively. `AxiomVoice` registers all static node → AudioParam modulations once in `ModulationRouter`, whose `destroy()` tears them down symmetrically before any child unit destroys.

**Tech Stack:** TypeScript, Web Audio API (`AudioContext`, `OscillatorNode`, `ConstantSourceNode`, `GainNode`), pnpm workspaces.

## Global Constraints

- No test runner exists (`CONVENTIONS.md`, `TESTING.md`). The gate is `pnpm build` (tsc + vue-tsc + vite) and `pnpm lint` (prettier --check .). Run both at every task end.
- Prettier: `singleQuote: true`, `trailingComma: 'all'`, `arrowParens: 'avoid'`, `printWidth: 80`. Pre-commit hook formats staged files.
- TypeScript: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (type imports must use `import type`), `erasableSyntaxOnly` (no enums).
- Never commit to `main`; work on `feature/oscillator-audio-param-jacks`.
- Architecture rules in `docs/codebase/RULES.md` apply — especially: units expose AudioParam jacks (R1), static patching lives in `ModulationRouter` (R2), unit-own ConstantSources are zeroed + started before patching (R3), per-note `onended` must detach inbound source→param connections (R4), router destroys before children (R5), no barrel export of internals (R6).
- `Oscillator` and `ModulationRouter` are engine internals — do NOT add them to `packages/audio-engine/src/index.ts` or `packages/audio-engine/src/engine/index.ts`.
- Code comments: only the two required by the spec (the modulation-input-only invariant in `Oscillator`, and the "intentionally not patched" marker in `AxiomVoice`). No other new comments.
- Design spec: `docs/superpowers/specs/2026-09-17-oscillator-audio-param-jacks-design.md`.

---

### Task 1: Add `ModulationRouter`

**Files:**

- Create: `packages/audio-engine/src/engine/modulation-router.ts`
- Test: no test runner — gate is `pnpm build` + `pnpm lint`

**Interfaces:**

- Consumes: `Destroyable` from `./destroyable`.
- Produces: `class ModulationRouter implements Destroyable` with:
  - `patch(source: AudioNode, target: AudioParam): void` — idempotent; no-op if `(source, target)` already registered.
  - `unpatch(source: AudioNode, target: AudioParam): void` — removes and disconnects if registered; tolerant of already-gone connections.
  - `destroy(): void` — idempotent; disconnects every registered pair defensively (try/catch), clears registry.
  - Static node → AudioParam only. Per-note targets and audio-path wires do not belong here.

- [ ] **Step 1: Write the file**

```ts
import type { Destroyable } from './destroyable';

interface ModulationConnection {
  source: AudioNode;
  target: AudioParam;
}

export class ModulationRouter implements Destroyable {
  private readonly connections: ModulationConnection[] = [];
  private destroyed = false;

  patch(source: AudioNode, target: AudioParam): void {
    if (this.destroyed) {
      return;
    }
    if (
      this.connections.some(
        conn => conn.source === source && conn.target === target,
      )
    ) {
      return;
    }
    source.connect(target);
    this.connections.push({ source, target });
  }

  unpatch(source: AudioNode, target: AudioParam): void {
    this.removeConnection({ source, target });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.connections.forEach(({ source, target }) => {
      try {
        source.disconnect(target);
      } catch {
        // Already torn down elsewhere; teardown is best-effort.
      }
    });
    this.connections.length = 0;
  }

  private removeConnection(conn: ModulationConnection): void {
    const found = this.connections.find(
      candidate =>
        candidate.source === conn.source && candidate.target === conn.target,
    );
    if (!found) {
      return;
    }
    try {
      found.source.disconnect(found.target);
    } catch {
      // Already torn down elsewhere; teardown is best-effort.
    }
    this.connections.splice(this.connections.indexOf(found), 1);
  }
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: green (file is unused so far, but must typecheck).

- [ ] **Step 3: Verify lint**

Run: `pnpm lint`
Expected: no format failures.

- [ ] **Step 4: Commit**

```bash
git add packages/audio-engine/src/engine/modulation-router.ts
git commit -m "feat(engine): add ModulationRouter patch registry"
```

---

### Task 2: Rewrite `Oscillator` and rewire `AxiomVoice`

The `Oscillator` API change breaks `AxiomVoice` at compile time (it passes an
`OscillatorConfigSource`). Both files and the config-source deletion land in one
task so every commit stays green.

**Files:**

- Rewrite: `packages/audio-engine/src/engine/oscillator.ts`
- Modify: `packages/audio-engine/src/engine/axiom-voice.ts`
- Delete: `packages/audio-engine/src/engine/oscillator-config-source.ts`

**Interfaces:**

- Consumes:
  - `ModulationRouter` from Task 1: `patch(source, target)`.
  - `Observable` (`packages/audio-engine/src/utils/observable.ts`): `subscribe(cb)` returns `{ unsubscribe: () => void }`.
  - `AxiomVoiceConfig` fields unchanged: `oscillatorDetuneSources`, `oscillatorGainSources`, `oscillatorWaveForms`, `filterCutoff`, `filterKeyTrack`, `filterEnvAmount`, `waveshaperDrive`.
- Produces:
  - `class Oscillator implements Destroyable`:
    - `constructor(ctxt: AudioContext)`
    - `set waveform(w: WaveFormType)` — caches value, fans to all live nodes.
    - `get frequency(): AudioParam`, `get detune(): AudioParam`, `get gain(): AudioParam`
    - `start(noteHz: number, now: number)`, `stop(): void`, `stop(time: number): void`
    - `connect(destination: AudioNode | AudioParam): void`, `disconnect(destination?: null | AudioNode | AudioParam): void`
    - `destroy(): void`

- [ ] **Step 1: Rewrite `oscillator.ts`**

Full file replacement:

```ts
import type { WaveFormType } from '../types';
import type { Destroyable } from './destroyable';

export class Oscillator implements Destroyable {
  private readonly ctxt: AudioContext;
  private readonly outputGain: GainNode;
  private readonly frequencySource: ConstantSourceNode;
  private readonly detuneSource: ConstantSourceNode;
  private readonly activeNodes: Set<OscillatorNode> = new Set();
  private readonly stoppedNodes: Set<OscillatorNode> = new Set();
  private current: OscillatorNode | null = null;
  private wave: WaveFormType = 'sawtooth';
  private destroyed = false;

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;

    this.outputGain = ctxt.createGain();
    this.outputGain.gain.setValueAtTime(0, ctxt.currentTime);

    this.frequencySource = ctxt.createConstantSource();
    this.frequencySource.offset.setValueAtTime(0, ctxt.currentTime);
    this.frequencySource.start();

    this.detuneSource = ctxt.createConstantSource();
    this.detuneSource.offset.setValueAtTime(0, ctxt.currentTime);
    this.detuneSource.start();
  }

  set waveform(w: WaveFormType) {
    this.wave = w;
    this.activeNodes.forEach(node => {
      node.type = w;
    });
    this.stoppedNodes.forEach(node => {
      node.type = w;
    });
  }

  /** Modulation-input jack only; never schedule on it directly. Engine ramps
   *  live on engine-owned sources, which flow a-rate through this offset. */
  get frequency(): AudioParam {
    return this.frequencySource.offset;
  }

  /** Modulation-input jack only; never schedule on it directly. */
  get detune(): AudioParam {
    return this.detuneSource.offset;
  }

  /** Modulation-input jack only; never schedule on it directly. */
  get gain(): AudioParam {
    return this.outputGain.gain;
  }

  connect(destination: AudioNode | AudioParam) {
    this.outputGain.connect(destination);
  }

  disconnect(destination: null | AudioNode | AudioParam = null) {
    if (destination === null) {
      this.outputGain.disconnect();
    } else {
      this.outputGain.disconnect(destination);
    }
  }

  start(noteHz: number, now: number) {
    if (this.current) {
      this.stop();
    }
    this.createVoiceNodes(noteHz, now);
  }

  /**
   * Stop the oscillator. With no argument it stops immediately; with a time it
   * stops silently at that time (used when a voice is stolen so the old note
   * can ring through the choke fade). Either way the node detaches itself from
   * the graph in onended.
   */
  stop(): void;
  stop(time: number): void;
  stop(time?: number) {
    if (!this.current) {
      return;
    }
    const osc = this.current;
    this.current = null;
    if (this.stoppedNodes.has(osc)) {
      return;
    }
    this.stoppedNodes.add(osc);
    if (time === undefined) {
      osc.stop();
    } else {
      osc.stop(time);
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.activeNodes.forEach(osc => {
      osc.onended = null;
      if (!this.stoppedNodes.has(osc)) {
        osc.stop();
      }
    });
    this.activeNodes.forEach(osc => this.detachNode(osc));
    this.activeNodes.clear();
    this.stoppedNodes.clear();
    this.current = null;
    this.frequencySource.disconnect();
    this.frequencySource.stop();
    this.detuneSource.disconnect();
    this.detuneSource.stop();
    this.outputGain.disconnect();
  }

  /**
   * Builds the per-note oscillator node(s) and returns them. Unison will later
   * loop here, applying a per-voice detune intrinsic on each node.
   */
  private createVoiceNodes(noteHz: number, now: number): OscillatorNode[] {
    const osc = this.ctxt.createOscillator();
    osc.type = this.wave;
    osc.frequency.setValueAtTime(noteHz, now);
    this.frequencySource.connect(osc.frequency);
    this.detuneSource.connect(osc.detune);
    osc.onended = () => {
      this.frequencySource.disconnect(osc.frequency);
      this.detuneSource.disconnect(osc.detune);
      this.activeNodes.delete(osc);
      this.stoppedNodes.delete(osc);
      osc.disconnect();
    };
    osc.connect(this.outputGain);
    osc.start(now);
    this.activeNodes.add(osc);
    this.current = osc;
    return [osc];
  }

  private detachNode(osc: OscillatorNode): void {
    this.frequencySource.disconnect(osc.frequency);
    this.detuneSource.disconnect(osc.detune);
    osc.disconnect();
  }
}
```

Notes for the implementer:

- Rule R3: both `ConstantSourceNode`s are zeroed with `setValueAtTime(0, ...)` then `start()`ed before `AxiomVoice` patches in (constructor runs before patching).
- Rule R4: `onended` and `destroy` both detach the two inbound source→param connections (`frequencySource.disconnect(osc.frequency)`, `detuneSource.disconnect(osc.detune)`) before/at node death — `osc.disconnect()` alone would leak the inbound links.
- `destroy` iterates `activeNodes` once to null `onended` + stop, then once to detach — no node is detached twice (ring-out nodes sitting in both sets are covered by the single `activeNodes` pass).
- The `frequency`/`detune` getter comments document the modulation-input-only invariant (spec section "Safety / invariants").

- [ ] **Step 2: Typecheck the new Oscillator alone**

This step is expected to FAIL — `axiom-voice.ts` still calls the old constructor.

Run: `pnpm build`
Expected: type errors in `packages/audio-engine/src/engine/axiom-voice.ts` (e.g. `Argument of type 'OscillatorConfigSource' is not assignable to parameter of type 'AudioContext'`). This is the red phase; the next step turns it green.

- [ ] **Step 3: Rewire `axiom-voice.ts`**

Field changes (replace the current field block, lines ~22-35):

- Delete `private readonly waveformUnsubscribers: Array<() => void> = [];`
- Add:
  ```ts
  private readonly modulationRouter: ModulationRouter;
  private oscillatorWaveformSubscription: { unsubscribe: () => void } | null = null;
  ```
- Add `import { ModulationRouter } from './modulation-router';`
- Remove `import { Observable } from '../utils/observable';` (no longer used).

Constructor changes, in order:

1. At the top of the constructor body, before `this.filter` is created, create the router:
   ```ts
   this.modulationRouter = new ModulationRouter();
   ```
2. Replace these manual connects with router patches:

   ```ts
   this.config.filterCutoff.connect(this.filter.cutoff);
   ```

   becomes

   ```ts
   this.modulationRouter.patch(this.config.filterCutoff, this.filter.cutoff);
   ```

   (That patch still occurs right after `this.filter = new Filter(...)`, line ~50-55.)

3. Keep `this.config.filterEnvAmount.connect(this.filterEnvelope.node);` (line ~58) exactly as-is — static node → node signal wire, intentionally not in the router (per spec section 3). Comment it:

   ```ts
   // filterEnvAmount -> filterEnvelope.node is a node-to-node signal wire,
   // intentionally not patched (ModulationRouter is node-to-param only).
   this.config.filterEnvAmount.connect(this.filterEnvelope.node);
   ```

4. Replace `this.config.filterKeyTrack.connect(this.filter.keytrack);` (line ~61) with:

   ```ts
   this.modulationRouter.patch(
     this.config.filterKeyTrack,
     this.filter.keytrack,
   );
   ```

5. Delete the `oscModInputs` block (lines ~86-94) that collects per-osc LFO depth gains — per-osc LFO patches move to the router after the oscillators array exists.

6. Replace the LFO non-osc target wiring (lines ~102-106):

   ```ts
   for (const lfo of this.lfos) {
     this.modulationRouter.patch(
       lfo.targetOutput(LFO_TARGET_INDEX.cutoff),
       this.filter.detune,
     );
     this.modulationRouter.patch(
       lfo.targetOutput(LFO_TARGET_INDEX.amp),
       this.ampModGain.gain,
     );
     this.modulationRouter.patch(
       lfo.targetOutput(LFO_TARGET_INDEX.drive),
       this.waveShaper.drive,
     );
   }
   ```

7. Replace the `this.oscillators = …` construction block (lines ~108-130) with:

   ```ts
   this.oscillators = new Array(OSCILLATOR_COUNT)
     .fill(null)
     .map((_value, index) => {
       const osc = new Oscillator(ctxt);
       this.modulationRouter.patch(
         this.config.oscillatorDetuneSources[index as OscillatorIndex],
         osc.detune,
       );
       this.modulationRouter.patch(
         this.config.oscillatorGainSources[index as OscillatorIndex],
         osc.gain,
       );
       osc.connect(oscillatorAudioSink);
       return osc;
     }) as FixedArray<Oscillator, OscillatorCount>;
   ```

   (`config.oscillatorGainSources[index].offset` holds the per-osc gain — the `osc.gain` jack is the output `GainNode.gain`, which starts at 0, so engine source + jack = config `gain`.)

8. After the oscillators array is built, add the per-osc LFO patches and the single waveform subscription:

   ```ts
   // LFO oscN depth outputs patch into each oscillator's detune jack.
   for (const lfo of this.lfos) {
     this.modulationRouter.patch(
       lfo.targetOutput(LFO_TARGET_INDEX.osc1),
       this.oscillators[0]!.detune,
     );
     this.modulationRouter.patch(
       lfo.targetOutput(LFO_TARGET_INDEX.osc2),
       this.oscillators[1]!.detune,
     );
     this.modulationRouter.patch(
       lfo.targetOutput(LFO_TARGET_INDEX.osc3),
       this.oscillators[2]!.detune,
     );
   }

   this.oscillatorWaveformSubscription =
     this.config.oscillatorWaveForms.subscribe(newValue => {
       this.oscillators.forEach((osc, index) => {
         osc.waveform = newValue[index as OscillatorIndex];
       });
     });
   ```

9. `destroy()` (lines ~191-212): call `this.modulationRouter.destroy()` FIRST (order-pinned, rule R5), drop the manual filter/waveshaper disconnects and the `waveformUnsubscribers` loop, and unsubscribe the single waveform subscription. New body after `this.onSoundStop();`:

   ```ts
   this.modulationRouter.destroy();
   this.config.filterEnvAmount.disconnect(this.filterEnvelope.node);
   this.oscillatorWaveformSubscription?.unsubscribe();
   this.ampEnvelope.destroy();
   this.filter.destroy();
   this.filterEnvelope.destroy();
   this.oscillatorNormalizeGain.disconnect();
   this.oscillators.forEach(osc => osc.destroy());
   this.lfos.forEach(lfo => lfo.destroy());
   this.ampModGain.disconnect();
   this.waveShaper.destroy();
   super.destroy();
   ```

   Removed from the old destroy: `config.filterCutoff.disconnect(...)`, `config.filterKeyTrack.disconnect(...)`, `config.waveshaperDrive.disconnect(...)`, and the `waveformUnsubscribers` teardown (all owned by the router / single subscription now).

10. Delete the field `private readonly waveformUnsubscribers` and any now-unused imports (`Observable`).

- [ ] **Step 4: Delete the config source**

```bash
git rm packages/audio-engine/src/engine/oscillator-config-source.ts
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: green. No `OscillatorConfigSource` references remain in `packages/audio-engine/src/`.

- [ ] **Step 6: Verify lint**

Run: `pnpm lint`
Expected: no format failures.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(engine): Oscillator AudioParam jacks + ModulationRouter patching"
```

---

### Task 3: Gate, docs sync, manual smoke

**Files:**

- Modify: `docs/codebase/RULES.md`
- Test: `pnpm build` + `pnpm lint` + manual dev-server smoke

**Interfaces:**

- Consumes: nothing new — Task 1 + Task 2 output.

- [ ] **Step 1: Manual smoke check**

Run: `pnpm dev` (port 4000).

Play several notes (keyboard + sustained chords + hold a note and flip each oscillator's waveform toggle live, drag detune/gain/octave/semi/osc-gain knobs). Verify:

- Same sound as before (equal node count, same depth scales).
- Waveform change applies to currently ringing notes (voice-stolen ring-out too).
- Engine setters still ramp live (`setOscillatorConfiguration` paths).
- Voice stealing: hold a chord past 16 notes; steal still chokes over ~3ms with no click/cut artifacts.
- Dev console: only the existing `console.log` telemetry; no `Disconnect the destination if...` / `NotFoundError` / `InvalidAccessError` warnings from the router or oscillator teardown.

Then `Ctrl+C`.

- [ ] **Step 2: Mark the designed rules as implemented in RULES.md**

In `docs/codebase/RULES.md`, rules 1-6 are now in effect; update the reference in rule 1 to the implemented files and remove the "(post-refactor ...)" wording:

Edit rule 1 reference line to:

```
Reference: `Filter.cutoff`/`drive`/`keytrack`/`detune`
(`packages/audio-engine/src/engine/filter.ts`), `Oscillator.frequency`/`detune`/
`gain` (`packages/audio-engine/src/engine/oscillator.ts`).
Design: `docs/superpowers/specs/2026-09-17-oscillator-audio-param-jacks-design.md`.
```

- [ ] **Step 3: Verify lint on docs**

Run: `pnpm lint`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add docs/codebase/RULES.md
git commit -m "docs: mark AudioParam jacks + ModulationRouter rules as implemented"
```

- [ ] **Step 5: Final full gate**

Run: `pnpm build && pnpm lint`
Expected: both green. Feature branch `feature/oscillator-audio-param-jacks` is ready for PR to `main`.
