import { type MainModule } from '../../c/dist/wasm/moog_oscillator';
import type { WasmWorkletOptions } from '../shared/wasm-worklet-options';
import type {
  ReportRenderTimeMessage,
  WorkletMessage,
} from '../shared/worklet-messages';
import { initializeMainModule } from './initiate-module';
import { Statistics } from './stats';

const WASM_POINTER_SHIFT = 2;
const DEFAULT_RENDER_QUANTUM_SIZE = 128;
const WEBAUDIO_BLOCK_SIZE =
  globalThis.renderQuantumSize ?? DEFAULT_RENDER_QUANTUM_SIZE;
const STATS_SAMPLE_INTERVAL = 5_000;
const OUTPUT_AND_SYNC_BUFFER_COUNT = 2;
const DEFAULT_WAVEFORM = 0;
const MAX_WAVEFORM = 5;
const MIN_WAVEFORM = 0;

function copyAudioParam(
  values: Float32Array,
  buffer: Float32Array,
  frames: number,
): void {
  if (values.length === 1) {
    buffer.fill(values[0]!, 0, frames);
    return;
  }
  if (values.length < frames) {
    throw new RangeError('AudioParam buffer is shorter than the output block');
  }
  if (values.length > frames) {
    throw new RangeError('AudioParam buffer is longer than the output block');
  }
  buffer.set(values, 0);
}

export class MoogOscillatorProcessor extends AudioWorkletProcessor {
  private destroyed = false;
  private started = false;
  private startTime = 0;
  private stopTime: number | undefined;
  private mainModule: MainModule | undefined;
  private oscillatorHandle: number | undefined;
  private frequencyPointer: number | undefined;
  private detunePointer: number | undefined;
  private waveformPointer: number | undefined;
  private outputPointer: number | undefined;
  private syncPointer: number | undefined;
  private frequencyBuffer: Float32Array | undefined;
  private detuneBuffer: Float32Array | undefined;
  private waveformBuffer: Float32Array | undefined;
  private outputBuffer: Float32Array | undefined;
  private syncBuffer: Float32Array | undefined;

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
      {
        automationRate: 'a-rate',
        defaultValue: DEFAULT_WAVEFORM,
        minValue: MIN_WAVEFORM,
        maxValue: MAX_WAVEFORM,
        name: 'waveform',
      },
    ];
  }

  constructor(options: WasmWorkletOptions) {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      switch (event.data.type) {
        case 'START':
          this.started = true;
          this.startTime = event.data.when;
          break;
        case 'STOP':
          this.stopTime = event.data.when;
          // A node that has been disconnected from the destination is no longer
          // pulled through `process()`, so a due stop must tear down here.
          if (currentTime >= this.stopTime) {
            this.emitEnded();
          }
          break;
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
      this.oscillatorHandle =
        this.mainModule._moog_oscillator_wasm_create(sampleRate);
      const blockSizeBytes =
        WEBAUDIO_BLOCK_SIZE * Float32Array.BYTES_PER_ELEMENT;
      this.frequencyPointer = mainModule._malloc(blockSizeBytes);
      this.detunePointer = mainModule._malloc(blockSizeBytes);
      this.waveformPointer = mainModule._malloc(blockSizeBytes);
      this.outputPointer = mainModule._malloc(
        blockSizeBytes * OUTPUT_AND_SYNC_BUFFER_COUNT,
      );
      this.syncPointer = this.outputPointer + blockSizeBytes;
      this.frequencyBuffer = mainModule.HEAPF32.subarray(
        this.frequencyPointer >>> WASM_POINTER_SHIFT,
        (this.frequencyPointer >>> WASM_POINTER_SHIFT) + WEBAUDIO_BLOCK_SIZE,
      );
      this.detuneBuffer = mainModule.HEAPF32.subarray(
        this.detunePointer >>> WASM_POINTER_SHIFT,
        (this.detunePointer >>> WASM_POINTER_SHIFT) + WEBAUDIO_BLOCK_SIZE,
      );
      this.waveformBuffer = mainModule.HEAPF32.subarray(
        this.waveformPointer >>> WASM_POINTER_SHIFT,
        (this.waveformPointer >>> WASM_POINTER_SHIFT) + WEBAUDIO_BLOCK_SIZE,
      );
      this.outputBuffer = mainModule.HEAPF32.subarray(
        this.outputPointer >>> WASM_POINTER_SHIFT,
        (this.outputPointer >>> WASM_POINTER_SHIFT) + WEBAUDIO_BLOCK_SIZE,
      );
      if (this.syncPointer !== undefined) {
        this.syncBuffer = mainModule.HEAPF32.subarray(
          this.syncPointer >>> WASM_POINTER_SHIFT,
          (this.syncPointer >>> WASM_POINTER_SHIFT) + WEBAUDIO_BLOCK_SIZE,
        );
      }

      console.log('MoogOscillator created');
    });
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const startTime = Date.now();
    const output = outputs[0]?.[0];
    const mainModule = this.mainModule;
    const oscillatorHandle = this.oscillatorHandle;

    if (this.destroyed) {
      return false;
    }

    if (this.stopTime !== undefined && currentTime >= this.stopTime) {
      this.emitEnded();
      return false;
    }

    if (!output || !mainModule || oscillatorHandle === undefined) {
      return true;
    }

    if (!this.started || currentTime < this.startTime) {
      output.fill(0);
      return true;
    }

    const frequencyValues = parameters.frequency!;
    const detuneValues = parameters.detune!;
    const waveformValues = parameters.waveform!;
    const frequencyPointer = this.frequencyPointer;
    const detunePointer = this.detunePointer;
    const waveformPointer = this.waveformPointer;
    const outputPointer = this.outputPointer;
    const syncPointer = this.syncPointer;
    const syncBuffer = this.syncBuffer;

    if (
      frequencyPointer === undefined ||
      outputPointer === undefined ||
      detunePointer === undefined ||
      waveformPointer === undefined
    ) {
      return true;
    }

    const frequencyBuffer = this.frequencyBuffer;
    const detuneBuffer = this.detuneBuffer;
    const waveformBuffer = this.waveformBuffer;
    const outputBuffer = this.outputBuffer;

    if (!frequencyBuffer || !outputBuffer || !detuneBuffer || !waveformBuffer) {
      return true;
    }

    copyAudioParam(frequencyValues, frequencyBuffer, output.length);
    copyAudioParam(detuneValues, detuneBuffer, output.length);
    copyAudioParam(waveformValues, waveformBuffer, output.length);

    const syncInput = inputs[0]?.[0];
    let syncInputPointer = 0;
    if (syncInput && syncBuffer && syncPointer !== undefined) {
      copyAudioParam(syncInput, syncBuffer, output.length);
      syncInputPointer = syncPointer;
    }

    mainModule._moog_oscillator_wasm_process(
      oscillatorHandle,
      frequencyPointer,
      detunePointer,
      syncInputPointer,
      waveformPointer,
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

  /**
   * Free WASM resources and tell the wrapper the generation has ended. Guarded
   * so the message is emitted exactly once, whether the stop is observed in the
   * port handler (disconnected node) or in `process` (still-connected node).
   */
  private emitEnded(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyResources();
    this.port.postMessage({ type: 'ENDED' });
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

    if (this.oscillatorHandle !== undefined) {
      mainModule._moog_oscillator_wasm_destroy(this.oscillatorHandle);
    }
    if (this.frequencyPointer !== undefined) {
      mainModule._free(this.frequencyPointer);
    }
    if (this.detunePointer !== undefined) {
      mainModule._free(this.detunePointer);
    }
    if (this.waveformPointer !== undefined) {
      mainModule._free(this.waveformPointer);
    }
    if (this.outputPointer !== undefined) {
      mainModule._free(this.outputPointer);
    }
    this.oscillatorHandle = undefined;
    this.frequencyPointer = undefined;
    this.detunePointer = undefined;
    this.waveformPointer = undefined;
    this.outputPointer = undefined;
    this.syncPointer = undefined;
    this.frequencyBuffer = undefined;
    this.detuneBuffer = undefined;
    this.waveformBuffer = undefined;
    this.outputBuffer = undefined;
    this.syncBuffer = undefined;
    this.mainModule = undefined;
  }
}
