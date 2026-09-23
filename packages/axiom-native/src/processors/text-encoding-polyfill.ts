/**
 * Worklet-scope polyfill for `TextDecoder`/`TextEncoder`.
 *
 * `AudioWorkletGlobalScope` does not provide these globals, but the
 * wasm-bindgen glue (`pkg/axiom_native.js`) instantiates `new TextDecoder(...)`
 * at module top level. Without this file the glue throws, `registerProcessor`
 * never runs, and `new AudioWorkletNode('saw-processor')` fails with
 * "not defined in AudioWorkletGlobalScope".
 *
 * The wasm module never passes strings in the audio thread (pure DSP), so a
 * functional-but-minimal UTF-8 implementation is enough; the shims also make
 * wasm panic messages readable if they ever surface here.
 *
 * Upstream context: AudioWorkletGlobalScope lacks TextEncoder/TextDecoder —
 * https://github.com/rustwasm/wasm-bindgen/issues/2367 — which regressed the
 * official example in wasm-bindgen 0.2.104
 * (https://github.com/rustwasm/wasm-bindgen/issues/4883). The official
 * workaround is exactly this kind of polyfill; see PRs
 * https://github.com/rustwasm/wasm-bindgen/pull/4703 and
 * https://github.com/rustwasm/wasm-bindgen/pull/4933.
 *
 * Requirements:
 * - Self-contained: must not rely on `TextDecoder`/`TextEncoder` themselves,
 *   since this runs in a scope that lacks them.
 * - Import order: this module must be imported BEFORE the wasm-bindgen glue in
 *   the worklet entry (ESM evaluates dependencies in import order).
 */
function decodeUtf8(bytes: Uint8Array): string {
  const out: string[] = [];
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i]!;
    let codePoint: number;
    let length: number;
    if (first < 0x80) {
      codePoint = first;
      length = 1;
    } else if ((first & 0xe0) === 0xc0) {
      codePoint = first & 0x1f;
      length = 2;
    } else if ((first & 0xf0) === 0xe0) {
      codePoint = first & 0x0f;
      length = 3;
    } else if ((first & 0xf8) === 0xf0) {
      codePoint = first & 0x07;
      length = 4;
    } else {
      out.push('\ufffd');
      i += 1;
      continue;
    }
    if (i + length > bytes.length) {
      out.push('\ufffd');
      break;
    }
    let valid = true;
    for (let j = 1; j < length; j += 1) {
      const b = bytes[i + j]!;
      if ((b & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      codePoint = (codePoint << 6) | (b & 0x3f);
    }
    if (!valid) {
      out.push('\ufffd');
      i += 1;
      continue;
    }
    if (
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      (length === 3 && codePoint < 0x800) ||
      (length === 4 && codePoint < 0x10000)
    ) {
      out.push('\ufffd');
      i += 1;
      continue;
    }
    out.push(String.fromCodePoint(codePoint));
    i += length;
  }
  return out.join('');
}

function encodeUtf8(input: string): Uint8Array {
  const bytes = new Uint8Array(input.length * 3);
  let offset = 0;
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes[offset++] = code;
    } else if (code < 0x800) {
      bytes[offset++] = 0xc0 | (code >> 6);
      bytes[offset++] = 0x80 | (code & 0x3f);
    } else if (code < 0x10000) {
      bytes[offset++] = 0xe0 | (code >> 12);
      bytes[offset++] = 0x80 | ((code >> 6) & 0x3f);
      bytes[offset++] = 0x80 | (code & 0x3f);
    } else {
      bytes[offset++] = 0xf0 | (code >> 18);
      bytes[offset++] = 0x80 | ((code >> 12) & 0x3f);
      bytes[offset++] = 0x80 | ((code >> 6) & 0x3f);
      bytes[offset++] = 0x80 | (code & 0x3f);
    }
  }
  return bytes.slice(0, offset);
}

// `typeof x === 'undefined'` guards keep the polyfill harmless on runtimes
// that DO expose these (e.g. Safari's worklet scope).
if (typeof TextDecoder === 'undefined') {
  class WorkletTextDecoder {
    private readonly label: string;

    constructor(label = 'utf-8', _options?: TextDecoderOptions) {
      this.label = label;
    }

    get encoding(): string {
      return this.label;
    }

    get fatal(): boolean {
      return false;
    }

    get ignoreBOM(): boolean {
      return false;
    }

    decode(input?: AllowSharedBufferSource): string {
      if (input === undefined || input === null) {
        return '';
      }
      if (ArrayBuffer.isView(input)) {
        return decodeUtf8(
          new Uint8Array(input.buffer, input.byteOffset, input.byteLength),
        );
      }
      return decodeUtf8(new Uint8Array(input));
    }
  }

  globalThis.TextDecoder = WorkletTextDecoder as typeof TextDecoder;
}

if (typeof TextEncoder === 'undefined') {
  class WorkletTextEncoder {
    readonly encoding = 'utf-8';

    encode(input = ''): Uint8Array {
      return encodeUtf8(input);
    }
  }

  globalThis.TextEncoder = WorkletTextEncoder as typeof TextEncoder;
}
