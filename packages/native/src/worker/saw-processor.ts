import { type MainModule } from '../../c/dist/wasm/moog_saw';
import type { SawProcessorOptions } from '../shared/processor-options';
import type {
  ReportRenderTimeMessage,
  WorkletMessage,
} from '../shared/worklet-messages';
import { initializeMainModule } from './initiate-module';
import { Statistics } from './stats';

const WASM_POINTER_SHIFT = 2;
const SYNC_POINTER = 0;
const DEFAULT_RENDER_QUANTUM_SIZE = 128;
const WEBAUDIO_BLOCK_SIZE =
  globalThis.renderQuantumSize ?? DEFAULT_RENDER_QUANTUM_SIZE;
const STATS_SAMPLE_INTERVAL = 5_000;

export class SawProcessor extends AudioWorkletProcessor {
  private destroyed = false;
  private mainModule: MainModule | undefined;
  private sawHandle: number | undefined;
  private frequencyPointer: number | undefined;
  private detunePointer: number | undefined;
  private outputPointer: number | undefined;
  private frequencyBuffer: Float32Array | undefined;
  private detuneBuffer: Float32Array | undefined;
  private outputBuffer: Float32Array | undefined;

  private renderTimes: Statistics = new Statistics();

  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      {
        automationRate: 'a-rate',
        defaultValue: 0,
        minValue: 0,
        name: 'frequency',
      },
      {
        automationRate: 'a-rate',
        defaultValue: 0,
        minValue: -1200 * 10, // 10 octaves
        maxValue: 1200 * 10, // 10 octaves
        name: 'detune',
      },
    ];
  }

  constructor(options: SawProcessorOptions) {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      switch (event.data.type) {
        case 'DESTROY':
          this.destroyResources();
          break;
        default:
          console.warn(`Unrecognized message: ${event.data.type} `);
      }
    };

    const wasmModule = options.processorOptions.wasmModule;

    initializeMainModule(wasmModule).then(mainModule => {
      if (this.destroyed) {
        return;
      }

      this.mainModule = mainModule;
      this.sawHandle = this.mainModule._moog_saw_wasm_create(sampleRate);
      const blockSizeBytes =
        WEBAUDIO_BLOCK_SIZE * Float32Array.BYTES_PER_ELEMENT;
      this.frequencyPointer = mainModule._malloc(blockSizeBytes);
      this.detunePointer = mainModule._malloc(blockSizeBytes);
      this.outputPointer = mainModule._malloc(blockSizeBytes);
      this.frequencyBuffer = mainModule.HEAPF32.subarray(
        this.frequencyPointer >>> WASM_POINTER_SHIFT,
        (this.frequencyPointer >>> WASM_POINTER_SHIFT) + WEBAUDIO_BLOCK_SIZE,
      );
      this.detuneBuffer = mainModule.HEAPF32.subarray(
        this.detunePointer >>> WASM_POINTER_SHIFT,
        (this.detunePointer >>> WASM_POINTER_SHIFT) + WEBAUDIO_BLOCK_SIZE,
      );
      this.outputBuffer = mainModule.HEAPF32.subarray(
        this.outputPointer >>> WASM_POINTER_SHIFT,
        (this.outputPointer >>> WASM_POINTER_SHIFT) + WEBAUDIO_BLOCK_SIZE,
      );
    });
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const startTime = Date.now();
    const output = outputs[0]?.[0];
    const mainModule = this.mainModule;
    const sawHandle = this.sawHandle;

    if (this.destroyed) {
      return false;
    }

    if (!output || !mainModule || sawHandle === undefined) {
      return true;
    }

    const frequencyValues = parameters.frequency!;
    const detuneValues = parameters.detune!;
    const frequencyPointer = this.frequencyPointer;
    const detunePointer = this.detunePointer;
    const outputPointer = this.outputPointer;

    if (
      frequencyPointer === undefined ||
      outputPointer === undefined ||
      detunePointer === undefined
    ) {
      return true;
    }

    const frequencyBuffer = this.frequencyBuffer;
    const detuneBuffer = this.detuneBuffer;
    const outputBuffer = this.outputBuffer;

    if (!frequencyBuffer || !outputBuffer || !detuneBuffer) {
      return true;
    }

    if (frequencyValues.length === 1) {
      frequencyBuffer.fill(frequencyValues[0]!, 0, output.length);
    } else {
      frequencyBuffer.set(frequencyValues);
    }

    if (detuneValues.length === 1) {
      detuneBuffer.fill(detuneValues[0]!, 0, output.length);
    } else {
      detuneBuffer.set(detuneValues);
    }

    mainModule._moog_saw_wasm_process(
      sawHandle,
      frequencyPointer,
      detunePointer,
      SYNC_POINTER,
      outputPointer,
      output.length,
    );

    if (outputBuffer.length === output.length) {
      output.set(outputBuffer);
    } else {
      for (let sampleIndex = 0; sampleIndex < output.length; sampleIndex++) {
        output[sampleIndex] = outputBuffer[sampleIndex] ?? 0;
      }
    }

    const endTime = Date.now();
    this.renderTimes.addSample(endTime - startTime);

    if (this.renderTimes.count > STATS_SAMPLE_INTERVAL) {
      this.port.postMessage({
        type: 'REPORT_RENDER_TIME',
        renderTimeMs: this.renderTimes.average,
      } as ReportRenderTimeMessage);
      this.renderTimes.clear();
    }

    return true;
  }

  private destroyResources(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    const mainModule = this.mainModule;
    if (!mainModule) {
      return;
    }

    if (this.sawHandle !== undefined) {
      mainModule._moog_saw_wasm_destroy(this.sawHandle);
    }
    if (this.frequencyPointer !== undefined) {
      mainModule._free(this.frequencyPointer);
    }
    if (this.detunePointer !== undefined) {
      mainModule._free(this.detunePointer);
    }
    if (this.outputPointer !== undefined) {
      mainModule._free(this.outputPointer);
    }

    this.sawHandle = undefined;
    this.frequencyPointer = undefined;
    this.detunePointer = undefined;
    this.outputPointer = undefined;
    this.frequencyBuffer = undefined;
    this.outputBuffer = undefined;
    this.mainModule = undefined;
  }
}
