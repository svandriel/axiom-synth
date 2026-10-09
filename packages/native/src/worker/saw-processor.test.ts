import { describe, expect, it, vi } from 'vitest';

const wasmModule = vi.hoisted(() => {
  const heap = new Float32Array(
    new SharedArrayBuffer(32 * Float32Array.BYTES_PER_ELEMENT),
  );
  let nextPointer = 4;

  return {
    HEAPF32: heap,
    _free: vi.fn(),
    _malloc: vi.fn((bytes: number) => {
      const pointer = nextPointer;
      nextPointer += bytes;
      return pointer;
    }),
    _moog_saw_wasm_create: vi.fn(() => 1),
    _moog_saw_wasm_destroy: vi.fn(),
    _moog_saw_wasm_process: vi.fn(
      (
        _handle: number,
        frequencyPointer: number,
        _syncPointer: number,
        outputPointer: number,
        frames: number,
      ) => {
        const frequencyIndex =
          frequencyPointer / Float32Array.BYTES_PER_ELEMENT;
        const outputIndex = outputPointer / Float32Array.BYTES_PER_ELEMENT;

        for (let frame = 0; frame < frames; frame++) {
          heap[outputIndex + frame] = heap[frequencyIndex + frame]! + 1;
        }
      },
    ),
  };
});

vi.mock('../../c/dist/wasm/moog_saw', () => ({
  default: vi.fn(() => Promise.resolve(wasmModule)),
}));

class FakeAudioWorkletProcessor {
  readonly port = {
    onmessage: undefined as ((event: MessageEvent) => void) | undefined,
  };
}

Object.assign(globalThis, {
  AudioWorkletProcessor: FakeAudioWorkletProcessor,
  sampleRate: 4,
  registerProcessor: vi.fn(),
});

const { SawProcessor } = await import('./saw-processor');

describe('SawProcessor', () => {
  it('registers the processor', () => {
    expect(globalThis.registerProcessor).toHaveBeenCalledWith(
      'saw-processor',
      expect.any(Function),
    );
  });
  it('exposes frequency as an a-rate parameter', () => {
    expect(SawProcessor.parameterDescriptors).toEqual([
      {
        automationRate: 'a-rate',
        defaultValue: 0,
        minValue: 0,
        name: 'frequency',
      },
    ]);
  });

  it('processes per-sample frequency through the native WASM saw', async () => {
    const processor = new SawProcessor({
      processorOptions: {
        sampleRate: 4,
        wasmModule: {} as WebAssembly.Module,
      },
    });
    await Promise.resolve();
    const output = new Float32Array(4);
    const process = processor.process.bind(processor) as (
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ) => boolean;
    const keepAlive = process([], [[output]], {
      frequency: new Float32Array([1, 1, 1, 1]),
    });

    expect(wasmModule.HEAPF32.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(wasmModule._moog_saw_wasm_process).toHaveBeenCalledWith(
      1,
      expect.any(Number),
      0,
      expect.any(Number),
      4,
    );
    expect(Array.from(output)).toEqual([2, 2, 2, 2]);
    expect(keepAlive).toBe(true);

    processor.port.onmessage?.({ data: { type: 'DESTROY' } } as MessageEvent);

    expect(wasmModule._moog_saw_wasm_destroy).toHaveBeenCalledWith(1);
    expect(wasmModule._free).toHaveBeenCalledTimes(2);
    expect(process([], [[output]], { frequency: new Float32Array([1]) })).toBe(
      false,
    );
  });

  it('frees resources when destroyed before WASM initialization', async () => {
    const destroyCalls = wasmModule._moog_saw_wasm_destroy.mock.calls.length;
    const processor = new SawProcessor({
      processorOptions: {
        sampleRate: 4,
        wasmModule: {} as WebAssembly.Module,
      },
    });

    processor.port.onmessage?.({ data: { type: 'DESTROY' } } as MessageEvent);
    await Promise.resolve();

    expect(wasmModule._moog_saw_wasm_destroy).toHaveBeenCalledTimes(
      destroyCalls + 1,
    );
  });
});
