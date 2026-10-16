import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LFO_COUNT,
  LFO_TARGETS,
  LFO_TARGET_COUNT,
  type FixedArray,
  type LfoIndex,
  type LfoTargetCount,
  type Oscillator,
  type OscillatorEndSubscription,
  type WaveFormType,
} from '@axiom/audio-engine';
import {
  FakeAudioContext,
  FakeAudioNode,
  FakeAudioParam,
  FakeConstantSourceNode,
  FakeOscillatorNode,
  installFakeAudioParam,
  type FakeAudioDestination,
} from '@axiom/audio-testing';
import type { NativeModule } from '@axiom/native';
import { AxiomSynth } from './axiom-synth';

vi.mock('@axiom/native', () => ({
  // Audio graph tests use a fake context without browser AudioWorklet support.
  initNativeModule: () => new Promise(() => {}),
}));

const TARGET_INDEX = {
  osc1: LFO_TARGETS.indexOf('osc1'),
  osc2: LFO_TARGETS.indexOf('osc2'),
  osc3: LFO_TARGETS.indexOf('osc3'),
  cutoff: LFO_TARGETS.indexOf('cutoff'),
  amp: LFO_TARGETS.indexOf('amp'),
  drive: LFO_TARGETS.indexOf('drive'),
} as const;

const DEPTH_SOURCE_COUNT = LFO_COUNT * LFO_TARGET_COUNT;

// The native moog oscillator needs an AudioWorklet, which the fake context
// lacks. This stub satisfies the Oscillator seam the voice graph depends on.
class FakeMoogOscillator implements Oscillator {
  private readonly node: FakeOscillatorNode;
  private readonly gainParam = new FakeAudioParam();

  constructor(ctx: FakeAudioContext) {
    this.node = ctx.createOscillator();
  }

  get waveform(): WaveFormType {
    return this.node.type as WaveFormType;
  }

  set waveform(value: WaveFormType) {
    this.node.type = value;
  }

  get frequency(): AudioParam {
    return this.node.frequency as unknown as AudioParam;
  }

  get detune(): AudioParam {
    return this.node.detune as unknown as AudioParam;
  }

  get gain(): AudioParam {
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

  start(now: number): void {
    this.node.start(now);
  }

  stop(time?: number): void {
    this.node.stop(time);
  }

  onEnded(subscriber: () => void): OscillatorEndSubscription {
    this.node.onended = subscriber;
    return {
      unsubscribe: () => {
        if (this.node.onended === subscriber) this.node.onended = null;
      },
    };
  }

  destroy(): void {
    this.node.disconnect();
  }
}

function fakeNativeModule(ctx: FakeAudioContext): NativeModule {
  return {
    createMoogOscillator: () => new FakeMoogOscillator(ctx),
  } as unknown as NativeModule;
}

async function makeSynth() {
  const ctx = new FakeAudioContext();
  const sink = new FakeAudioNode(ctx);
  const synth = await AxiomSynth.create(
    ctx as unknown as AudioContext,
    sink as unknown as AudioNode,
    {},
    fakeNativeModule(ctx),
  );
  return { ctx, synth };
}

// LFO depth constant sources are created last, so they occupy the trailing
// window of the context's source list.
function depthSources(ctx: FakeAudioContext): FakeConstantSourceNode[] {
  return ctx.constantSources.slice(-DEPTH_SOURCE_COUNT);
}

function depthOffset(ctx: FakeAudioContext, lfo: number, target: number) {
  return depthSources(ctx)[lfo * LFO_TARGET_COUNT + target]!.offset.value;
}

function allOffsets(ctx: FakeAudioContext): number[] {
  return ctx.constantSources.map(source => source.offset.value);
}

function depths(...values: number[]): FixedArray<number, LfoTargetCount> {
  return values as FixedArray<number, LfoTargetCount>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AxiomSynth LFO depth sources', () => {
  it('starts at the offsets setLfoConfiguration would produce', async () => {
    vi.useFakeTimers();
    const { ctx, synth } = await makeSynth();
    const constructed = allOffsets(ctx);

    ctx.currentTime = 1;
    for (let lfo = 0; lfo < LFO_COUNT; lfo++) {
      synth.setLfoConfiguration(lfo as LfoIndex, synth.lfoConfigs[lfo]!);
    }

    expect(allOffsets(ctx)).toEqual(constructed);

    synth.destroy();
  });

  it('scales the stock pitch and cutoff depths to audible ranges', async () => {
    vi.useFakeTimers();
    const { ctx, synth } = await makeSynth();

    expect(depthOffset(ctx, 0, TARGET_INDEX.osc1)).toBe(-12);
    expect(depthOffset(ctx, 0, TARGET_INDEX.osc2)).toBe(12);
    expect(depthOffset(ctx, 1, TARGET_INDEX.cutoff)).toBe(480);

    synth.destroy();
  });

  it('scales an updated depth into its target range', async () => {
    vi.useFakeTimers();
    const { ctx, synth } = await makeSynth();

    ctx.currentTime = 1;
    synth.setLfoConfiguration(0, {
      rateHz: synth.lfoConfigs[0]!.rateHz,
      waveform: synth.lfoConfigs[0]!.waveform,
      depths: depths(0.5, 0, 0, 0, 0, 0.25),
    });

    expect(depthOffset(ctx, 0, TARGET_INDEX.osc1)).toBe(600);
    expect(depthOffset(ctx, 0, TARGET_INDEX.drive)).toBe(1);

    synth.destroy();
  });

  it('clamps a negative drive depth to unipolar', async () => {
    vi.useFakeTimers();
    const { ctx, synth } = await makeSynth();

    ctx.currentTime = 1;
    synth.setLfoConfiguration(0, {
      rateHz: synth.lfoConfigs[0]!.rateHz,
      waveform: synth.lfoConfigs[0]!.waveform,
      depths: depths(0, 0, 0, 0, 0, -0.5),
    });

    expect(depthOffset(ctx, 0, TARGET_INDEX.drive)).toBe(0);

    synth.destroy();
  });
});

describe('AxiomVoice idle seam', () => {
  it('drops the voice amp-mod gain from the output when idle', async () => {
    vi.useFakeTimers();
    const restoreAudioParam = installFakeAudioParam();
    const { ctx, synth } = await makeSynth();

    synth.noteOn(60, 1);
    const output = synth.output as unknown as FakeAudioNode;
    const voiceAmpMod = ctx.gains.find(gain =>
      gain.connections.some(c => c.destination === output),
    );
    expect(voiceAmpMod).toBeDefined();

    synth.noteOff(60);
    vi.advanceTimersByTime(4_000);

    expect(voiceAmpMod!.connections.some(c => c.destination === output)).toBe(
      false,
    );
    synth.destroy();
    restoreAudioParam();
  });
});

describe('AxiomSynth activity forwarding', () => {
  it('activates the activity sink on noteOn', async () => {
    vi.useFakeTimers();
    const restoreAudioParam = installFakeAudioParam();
    const ctx = new FakeAudioContext();
    const sink = new FakeAudioNode(ctx);
    let activated = 0;
    const synth = await AxiomSynth.create(
      ctx as unknown as AudioContext,
      sink as unknown as AudioNode,
      {
        activity: {
          activate: () => {
            activated++;
          },
        },
      },
      fakeNativeModule(ctx),
    );

    synth.noteOn(60, 1);

    expect(activated).toBe(1);
    synth.destroy();
    restoreAudioParam();
  });
});
