import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LFO_COUNT,
  LFO_TARGETS,
  LFO_TARGET_COUNT,
  type FixedArray,
  type LfoIndex,
  type LfoTargetCount,
} from '@axiom/audio-engine';
import {
  FakeAudioContext,
  FakeAudioNode,
  FakeConstantSourceNode,
} from '@axiom/audio-testing';
import { AxiomSynth } from './axiom-synth';

const TARGET_INDEX = {
  osc1: LFO_TARGETS.indexOf('osc1'),
  osc2: LFO_TARGETS.indexOf('osc2'),
  osc3: LFO_TARGETS.indexOf('osc3'),
  cutoff: LFO_TARGETS.indexOf('cutoff'),
  amp: LFO_TARGETS.indexOf('amp'),
  drive: LFO_TARGETS.indexOf('drive'),
} as const;

const DEPTH_SOURCE_COUNT = LFO_COUNT * LFO_TARGET_COUNT;

function makeSynth() {
  const ctx = new FakeAudioContext();
  const sink = new FakeAudioNode(ctx);
  const synth = new AxiomSynth(
    ctx as unknown as AudioContext,
    sink as unknown as AudioNode,
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
  it('starts at the offsets setLfoConfiguration would produce', () => {
    vi.useFakeTimers();
    const { ctx, synth } = makeSynth();
    const constructed = allOffsets(ctx);

    ctx.currentTime = 1;
    for (let lfo = 0; lfo < LFO_COUNT; lfo++) {
      synth.setLfoConfiguration(lfo as LfoIndex, synth.lfoConfigs[lfo]!);
    }

    expect(allOffsets(ctx)).toEqual(constructed);

    synth.destroy();
  });

  it('scales the stock pitch and cutoff depths to audible ranges', () => {
    vi.useFakeTimers();
    const { ctx, synth } = makeSynth();

    expect(depthOffset(ctx, 0, TARGET_INDEX.osc1)).toBe(-132);
    expect(depthOffset(ctx, 0, TARGET_INDEX.osc2)).toBe(108);
    expect(depthOffset(ctx, 1, TARGET_INDEX.cutoff)).toBe(480);

    synth.destroy();
  });

  it('scales an updated depth into its target range', () => {
    vi.useFakeTimers();
    const { ctx, synth } = makeSynth();

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

  it('clamps a negative drive depth to unipolar', () => {
    vi.useFakeTimers();
    const { ctx, synth } = makeSynth();

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
