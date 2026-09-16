# Extract Filter Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the per-voice biquad filter wiring out of `AxiomVoice` into the `Filter` class so the voice no longer touches `BiquadFilterNode` directly.

**Architecture:** A pre-authored `Filter` class (in `packages/audio-engine/src/engine/filter.ts`) already wraps a `GainNode -> BiquadFilterNode` chain and exposes its rate inputs as `AudioParam` getters. One getter (`q`) is missing and must be added, then `AxiomVoice` swaps its inline biquad for this class. The filter `Envelope` and `keyTrackGain` stay voice-owned; only their `detune` connections route through the new `filter.detune` getter. No `engine.ts` changes.

**Tech Stack:** TypeScript, Web Audio API, Vue 3 monorepo (`pnpm` workspaces).

## Global Constraints

- Working branch: `feature/extract-filter-class` (never commit to `main`).
- No test runner configured — the build is the gate. Verify every task with `pnpm build` (from repo root; runs all workspace packages) and `pnpm lint` (prettier check).
- Pre-commit hook runs `prettier --write` on staged files; keep formatting in sync to avoid churn.
- Behavior must be signal-identical to today: `waveshaper -> filter.input (gain 1) -> biquad -> ampEnvelope`. Filter type stays `lowpass` (biquad default).
- Follow existing engine patterns: `PascalCase` classes, lowercase kebab files, getters for node/param access (see `Waveshaper`, `Oscillator`).

---

### Task 1: Add `q` getter to Filter class

**Context:** `AxiomVoice` currently wires resonance via `config.filterResonance.connect(this.filter.Q)`. The `Filter` class owns the `BiquadFilterNode` privately, so it must expose the `Q` param as a getter.

**Files:**

- Modify: `packages/audio-engine/src/engine/filter.ts:25-27`

- [ ] **Step 1: Add the getter**

Insert directly below the existing `frequency` getter (line 27), keeping the same doc-free style:

```typescript
  get q(): AudioParam {
    return this.filter.Q;
  }
```

- [ ] **Step 2: Verify the build passes**

Run: `pnpm build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 3: Verify lint passes**

Run: `pnpm lint`
Expected: prettier reports no formatting issues.

- [ ] **Step 4: Commit**

```bash
git add packages/audio-engine/src/engine/filter.ts
git commit -m "feat(engine): expose filter Q param via getter"
```

---

### Task 2: Swap AxiomVoice to the Filter class

**Context:** Replace the inline `BiquadFilterNode` in the voice with the `Filter` class. The four shared sources (`filterCutoff`, `filterResonance`, `filterEnvAmount`, `filterKeyTrack`) travel unchanged through `AxiomVoiceConfig`; only the connection targets change to `Filter` getters.

**Files:**

- Modify: `packages/audio-engine/src/engine/axiom-voice.ts`
  - imports (line 9 area)
  - field declaration (line 23)
  - constructor filter wiring (lines 41-56)
  - signal chain (lines 64-65)

**Interfaces:**

- Consumes: `Filter` from `./filter` with getters `input`, `detune`, `frequency`, `q`, and `connect(destination: AudioNode)`.
- Produces: `AxiomVoice` field `filter: Filter` (was `BiquadFilterNode`). No other consumers — `this.filter` is private to the voice.

- [ ] **Step 1: Add the import**

Add `import { Filter } from './filter';` between the `./envelope` import and the `./helpers` import:

```typescript
import { Envelope } from './envelope';
import { Filter } from './filter';
import { freqOf } from './helpers';
```

- [ ] **Step 2: Change the field type**

Line 23:

```typescript
  private readonly filter: Filter;
```

(was `private readonly filter: BiquadFilterNode;`)

- [ ] **Step 3: Rework the constructor wiring**

Replace lines 41-56 (the `ctxt.createBiquadFilter()` block through the key-track block) with:

```typescript
this.filter = new Filter(ctxt);
this.filter.frequency.value = 0;

// Hook up base values
this.config.filterCutoff.connect(this.filter.frequency);
this.config.filterResonance.connect(this.filter.q);

// Filter Env Amount -> Filter Envelope -> Filter Detune
this.config.filterEnvAmount.connect(this.filterEnvelope.node);
this.filterEnvelope.node.connect(this.filter.detune);

this.keyTrackGain = ctxt.createGain();
this.keyTrackGain.gain.value = 0;
this.config.filterKeyTrack.connect(this.keyTrackGain);
this.keyTrackGain.connect(this.filter.detune);
```

Notes:

- `this.filter.type = 'lowpass'` is dropped — the biquad's default type is `lowpass`, so behavior is unchanged.
- `filterResonance` now targets `this.filter.q` instead of `this.filter.Q`.
- `filterEnvelope` and `keyTrackGain` remain voice-owned; only their `detune` target changes to the getter.

- [ ] **Step 4: Update the signal chain**

Lines 64-65:

```typescript
this.waveShaper.output.connect(this.filter.input);
this.filter.connect(this.ampEnvelope.node);
```

(was `this.waveShaper.output.connect(this.filter);` — `Filter` is not an `AudioNode`, so it connects via the `input` getter.)

- [ ] **Step 5: Verify no leftover direct biquad usage**

`destroy()` keeps `this.filter.disconnect();` (line 149) — `Filter` provides a `disconnect()` proxy, so the call is unchanged. Run:

```bash
rg "BiquadFilter" packages/audio-engine/src
```

Expected: matches only inside `filter.ts` (field type + `createBiquadFilter`), none in `axiom-voice.ts`.

- [ ] **Step 6: Verify the build passes**

Run: `pnpm build`
Expected: succeeds with no TypeScript errors (catches any missed `.Q`/direct-node references).

- [ ] **Step 7: Verify lint passes**

Run: `pnpm lint`
Expected: prettier reports no formatting issues.

- [ ] **Step 8: Commit**

```bash
git add packages/audio-engine/src/engine/axiom-voice.ts
git commit -m "refactor(engine): use Filter class in AxiomVoice"
```

---

### Task 3: Final verification

**Context:** Confirm the full workspace still builds and lints cleanly on the feature branch before the PR.

**Files:**

- None.

- [ ] **Step 1: Clean build from repo root**

Run: `pnpm build`
Expected: all workspace packages build without errors or warnings.

- [ ] **Step 2: Lint the whole repo**

Run: `pnpm lint`
Expected: prettier reports no issues.

- [ ] **Step 3: Confirm branch state**

Run: `git log --oneline --no-decorate -3`
Expected: the two commits from Tasks 1-2 at the top of `feature/extract-filter-class` (over the spec commit). If the branch is ready, hand off to the user for PR creation — do not push or open a PR unless asked.
