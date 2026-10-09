import { SawProcessor } from './saw-processor';

/**
 * Vite rewrites parts of the Emscripten loader to use `location.href` when
 * resolving the wasm asset URL. In AudioWorkletGlobalScope, `location` may be
 * missing, which causes a runtime crash before the processor can initialize.
 * Provide a minimal fallback so URL resolution succeeds in worklet contexts.
 */
if (typeof globalThis.location?.href !== 'string') {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { href: 'https://worklet.invalid/' },
    writable: true,
  });
}
registerProcessor('saw-processor', SawProcessor);
