# Oscillator Abstraction Design

## Goal

Make `UnisonOscillator` depend on an oscillator abstraction rather than on
`OscillatorNode`, so future implementations can use custom sources such as
AudioWorklet nodes.

## Architecture

Rename the current concrete `Oscillator` class to `WebAudioOscillator`.
Export an `Oscillator` interface from the audio-engine package. The interface
owns one note source at a time and exposes the control and output contract that
unison needs:

```ts
export interface Oscillator extends Destroyable {
  readonly frequency: AudioParam;
  readonly detune: AudioParam;
  readonly gain: AudioParam;
  connect(destination: AudioNode | AudioParam): void;
  disconnect(destination?: AudioNode | AudioParam | null): void;
  start(noteHz: number, now: number): void;
  stop(time?: number): void;
  onEnded(subscriber: () => void): { unsubscribe: () => void };
}
```

`WebAudioOscillator` keeps its internal `OscillatorNode` private. It creates a
fresh node on `start()` and destroys that node after completion. Calling
`start()` while a source is active stops the old source first. `onEnded()`
subscribers receive one notification per completed source. Unsubscribing is
idempotent, and `destroy()` removes all subscriptions and owned graph nodes.

`UnisonOscillator` creates every subvoice through an oscillator factory. The
default factory constructs `WebAudioOscillator`; the factory is injectable so
custom implementations can replace it later. Neither `UnisonOscillator` nor
`UnisonVoicePath` stores or manipulates an `OscillatorNode`.

## Per-Note Lifecycle

Each direct or pooled unison source is an `Oscillator`. `UnisonOscillator`
subscribes to its `onEnded()` event and stores the returned unsubscribe handle
with the bundle/source record.

Timed `stop()` calls leave the source and pooled path reserved until the
completion event. Direct sources detach on completion. Pooled sources disarm
their path on completion; the path lease is released after every sibling has
completed.

If `stop()` throws, unison unsubscribes the source, detaches it, and releases
its direct or pooled ownership immediately. Destroy also unsubscribes before
tearing down sources and paths. Late callbacks cannot affect a newer bundle.

## Testing

Add focused `WebAudioOscillator` tests covering lazy source creation, fresh
source creation after restart, one completion notification per source,
unsubscribe behavior, and idempotent destruction.

Update unison tests to verify that direct and pooled sources use the oscillator
factory, delayed stops retain paths until completion, cleanup unsubscribes all
listeners, rollback handles setup failures, and late completion cannot detach a
newer bundle.

Keep existing graph, path reuse, waveform, modulation, and teardown coverage.
Use the fake Web Audio context. Do not require a browser for lifecycle tests.

## Scope

This change renames the current concrete implementation and introduces the
abstraction boundary. It does not add an AudioWorklet implementation or change
unison DSP, path pooling policy, public synth configuration, or UI behavior.
