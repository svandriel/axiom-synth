import { describe, expect, it, vi } from 'vitest';

const wasmModule = vi.hoisted(() => {
  const DEFAULT_RENDER_QUANTUM_SIZE = 128;
  const WASM_HEAP_FLOAT_COUNT = DEFAULT_RENDER_QUANTUM_SIZE * 3 + 1;
  const heap = new Float32Array(
    new SharedArrayBuffer(
      WASM_HEAP_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT,
    ),
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
        _detunePointer: number,
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
await import('./worker');

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
      {
        automationRate: 'a-rate',
        defaultValue: 0,
        minValue: -12000,
        maxValue: 12000,
        name: 'detune',
      },
    ]);
  });

  it('processes per-sample frequency and detune through the native WASM saw', async () => {
    const processor = new SawProcessor({
      processorOptions: {
        wasmModule: {} as WebAssembly.Module,
      },
    });
    await vi.waitFor(() => {
      expect(wasmModule._moog_saw_wasm_create).toHaveBeenCalled();
    });
    const output = new Float32Array(4);
    const process = processor.process.bind(processor) as (
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ) => boolean;
    const keepAlive = process([], [[output]], {
      frequency: new Float32Array([1, 1, 1, 1]),
      detune: new Float32Array([100, 200, 300, 400]),
    });

    expect(wasmModule.HEAPF32.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(wasmModule._moog_saw_wasm_process).toHaveBeenCalledWith(
      1,
      expect.any(Number),
      expect.any(Number),
      0,
      expect.any(Number),
      4,
    );
    const detunePointer = wasmModule._moog_saw_wasm_process.mock.calls[0]![2];
    const detuneIndex = detunePointer / Float32Array.BYTES_PER_ELEMENT;
    expect(
      Array.from(wasmModule.HEAPF32.slice(detuneIndex, detuneIndex + 4)),
    ).toEqual([100, 200, 300, 400]);
    expect(Array.from(output)).toEqual([2, 2, 2, 2]);
    expect(keepAlive).toBe(true);

    processor.port.onmessage?.({ data: { type: 'DESTROY' } } as MessageEvent);

    expect(wasmModule._moog_saw_wasm_destroy).toHaveBeenCalledWith(1);
    expect(wasmModule._free).toHaveBeenCalledTimes(3);
    expect(
      process([], [[output]], {
        frequency: new Float32Array([1]),
        detune: new Float32Array([0]),
      }),
    ).toBe(false);
  });

  it('does not initialize WASM when destroyed before initialization', async () => {
    const createCalls = wasmModule._moog_saw_wasm_create.mock.calls.length;
    const destroyCalls = wasmModule._moog_saw_wasm_destroy.mock.calls.length;
    const mallocCalls = wasmModule._malloc.mock.calls.length;
    const processor = new SawProcessor({
      processorOptions: {
        wasmModule: {} as WebAssembly.Module,
      },
    });

    processor.port.onmessage?.({ data: { type: 'DESTROY' } } as MessageEvent);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(wasmModule._moog_saw_wasm_create).toHaveBeenCalledTimes(createCalls);
    expect(wasmModule._malloc).toHaveBeenCalledTimes(mallocCalls);
    expect(wasmModule._moog_saw_wasm_destroy).toHaveBeenCalledTimes(
      destroyCalls,
    );
  });
});
