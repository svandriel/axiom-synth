#include "moog_oscillator.h"
#include "moog_saw.h"

#ifdef __cplusplus
extern "C" {
#endif

void moog_oscillator_wasm_init(void) {
  moog_saw_init();
}

MoogOscillator *moog_oscillator_wasm_create(double sample_rate) {
  return moog_oscillator_create(sample_rate);
}

void moog_oscillator_wasm_destroy(MoogOscillator *osc) {
  moog_oscillator_destroy(osc);
}

void moog_oscillator_wasm_reset(MoogOscillator *osc, double phase) {
  moog_oscillator_reset(osc, phase);
}

void moog_oscillator_wasm_set_frequency(MoogOscillator *osc,
                                        float frequency_hz) {
  moog_oscillator_set_frequency(osc, frequency_hz);
}

void moog_oscillator_wasm_process(MoogOscillator *osc, const float *frequency,
                                  const float *detune, const float *sync,
                                  const float *waveform, float *output,
                                  uint32_t frames) {
  moog_oscillator_process(osc, frequency, detune, sync, waveform, output,
                          frames);
}

void moog_saw_wasm_init(void) {
  moog_saw_init();
}

MoogSaw *moog_saw_wasm_create(double sample_rate) {
  return moog_saw_create(sample_rate);
}

void moog_saw_wasm_destroy(MoogSaw *osc) {
  moog_saw_destroy(osc);
}

void moog_saw_wasm_reset(MoogSaw *osc, double phase) {
  moog_saw_reset(osc, phase);
}

void moog_saw_wasm_set_frequency(MoogSaw *osc, float frequency_hz) {
  moog_saw_set_frequency(osc, frequency_hz);
}

void moog_saw_wasm_process(MoogSaw *osc, const float *frequency,
                           const float *detune, const float *sync,
                           float *output, uint32_t frames) {
  moog_saw_process(osc, frequency, detune, sync, output, frames);
}

#ifdef __cplusplus
}
#endif
