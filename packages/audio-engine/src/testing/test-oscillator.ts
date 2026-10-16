import {
  FakeAudioContext,
  FakeAudioParam,
  type FakeAudioDestination,
  type FakeOscillatorNode,
} from '@axiom/audio-testing';
import type { Oscillator } from '../engine/oscillator';

export class TestOscillator implements Oscillator {
  private readonly node: FakeOscillatorNode;
  private readonly gainParam = new FakeAudioParam();
  throwOnStart = false;
  endSynchronouslyOnStart = false;
  unsubscribeCalls = 0;

  set throwOnStop(value: boolean) {
    this.node.throwOnStop = value;
  }

  constructor(context: FakeAudioContext) {
    this.node = context.createOscillator();
  }

  get waveform() {
    return this.node.type as Oscillator['waveform'];
  }

  set waveform(value: Oscillator['waveform']) {
    this.node.type = value;
  }

  get frequency() {
    return this.node.frequency as unknown as AudioParam;
  }

  get detune() {
    return this.node.detune as unknown as AudioParam;
  }

  get gain() {
    return this.gainParam as unknown as AudioParam;
  }

  connect(destination: AudioNode | AudioParam): void {
    this.node.connect(destination as unknown as FakeAudioDestination);
  }

  disconnect(destination?: AudioNode | AudioParam | null): void {
    this.node.disconnect(
      destination as unknown as FakeAudioDestination | undefined,
    );
  }

  start(_noteHz: number, now: number): void {
    if (this.throwOnStart) throw new Error('TestOscillator start failed');
    this.node.start(now);
    if (this.endSynchronouslyOnStart) this.node.end();
  }

  stop(time?: number): void {
    this.node.stop(time);
  }

  onEnded(subscriber: () => void) {
    this.node.onended = subscriber;
    return {
      unsubscribe: () => {
        this.unsubscribeCalls++;
        if (this.node.onended === subscriber) this.node.onended = null;
      },
    };
  }

  destroy(): void {
    this.node.disconnect();
  }
}

export const createTestOscillator = (context: FakeAudioContext) =>
  new TestOscillator(context);
