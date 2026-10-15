import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeGainNode } from '@axiom/audio-testing';
import {
  IDLE_DEBOUNCE_SECONDS,
  IdleGate,
  SILENCE_POLL_INTERVAL_MS,
} from './idle-gate';

function makeGate() {
  const ctx = new FakeAudioContext();
  const destination = ctx.createGain();
  const gate = new IdleGate(ctx as unknown as AudioContext);
  gate.connect(destination as unknown as AudioNode);

  const analyser = ctx.analysers[0]!;
  const input = gate.input as unknown as FakeGainNode;
  const output = ctx.gains.find(gain =>
    gain.connections.some(connection => connection.destination === destination),
  )!;
  const isOpen = () =>
    input.connections.some(connection => connection.destination === output);
  const tapsAnalyser = () =>
    input.connections.some(connection => connection.destination === analyser);
  const ticks = (ms: number) => vi.advanceTimersByTime(ms);
  return { gate, analyser, input, isOpen, tapsAnalyser, ticks };
}

describe('IdleGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts open and taps its own input', () => {
    const { isOpen, tapsAnalyser } = makeGate();
    expect(isOpen()).toBe(true);
    expect(tapsAnalyser()).toBe(true);
  });

  it('closes after the debounce of silence', () => {
    const { analyser, isOpen, ticks } = makeGate();
    analyser.timeDomainData = new Float32Array([0, 0, 0]);

    ticks(IDLE_DEBOUNCE_SECONDS * 1000 - SILENCE_POLL_INTERVAL_MS);
    expect(isOpen()).toBe(true);

    ticks(SILENCE_POLL_INTERVAL_MS);
    expect(isOpen()).toBe(false);
  });

  it('reopens when activity resumes while closed', () => {
    const { analyser, isOpen, ticks } = makeGate();
    analyser.timeDomainData = new Float32Array([0, 0, 0]);
    ticks(IDLE_DEBOUNCE_SECONDS * 1000 + SILENCE_POLL_INTERVAL_MS);
    expect(isOpen()).toBe(false);

    analyser.timeDomainData = new Float32Array([0.5, 0, 0]);
    ticks(SILENCE_POLL_INTERVAL_MS);
    expect(isOpen()).toBe(true);
  });

  it('never closes while the input carries signal', () => {
    const { analyser, isOpen, ticks } = makeGate();
    analyser.timeDomainData = new Float32Array([0.5, 0.5, 0.5]);
    ticks(SILENCE_POLL_INTERVAL_MS * 10);
    expect(isOpen()).toBe(true);
  });

  it('activate() reopens immediately', () => {
    const { gate, analyser, isOpen, ticks } = makeGate();
    analyser.timeDomainData = new Float32Array([0, 0, 0]);
    ticks(IDLE_DEBOUNCE_SECONDS * 1000 + SILENCE_POLL_INTERVAL_MS);
    expect(isOpen()).toBe(false);

    gate.activate();

    expect(isOpen()).toBe(true);
  });

  it('destroy() stops polling and detaches the analyser tap', () => {
    const { gate, analyser, tapsAnalyser, ticks } = makeGate();
    analyser.timeDomainData = new Float32Array([0, 0, 0]);
    gate.destroy();

    expect(tapsAnalyser()).toBe(false);
    expect(() => ticks(SILENCE_POLL_INTERVAL_MS * 8)).not.toThrow();
  });
});
