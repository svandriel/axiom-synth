#include "moog_oscillator.h"
#include "moog_saw.h"

#include <assert.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

void moog_oscillator_wasm_init(void);
MoogOscillator *moog_oscillator_wasm_create(double sample_rate);
void moog_oscillator_wasm_destroy(MoogOscillator *osc);
void moog_oscillator_wasm_reset(MoogOscillator *osc, double phase);
void moog_oscillator_wasm_set_frequency(MoogOscillator *osc,
                                        float frequency_hz);
void moog_oscillator_wasm_process(MoogOscillator *osc, const float *frequency,
                                  const float *detune, const float *sync,
                                  const float *waveform, float *output,
                                  uint32_t frames);

void moog_saw_wasm_init(void);
MoogSaw *moog_saw_wasm_create(double sample_rate);
void moog_saw_wasm_destroy(MoogSaw *osc);
void moog_saw_wasm_reset(MoogSaw *osc, double phase);
void moog_saw_wasm_process(MoogSaw *osc, const float *frequency,
                           const float *detune, const float *sync,
                           float *output, uint32_t frames);

static uint32_t float_bits(float value) {
  uint32_t bits;
  memcpy(&bits, &value, sizeof(bits));
  return bits;
}

static void test_generic_wasm_bridge_matches_native_processing(void) {
  // Arrange
  const double sample_rate = 48000.0;
  const float frequency[] = {440.0f, 880.0f, 220.0f, 110.0f};
  const float waveform[] = {0.0f, 2.0f, 4.0f, 5.0f};
  float actual[4];
  float expected[4];
  moog_oscillator_wasm_init();
  moog_saw_wasm_init();
  MoogOscillator *bridge = moog_oscillator_wasm_create(sample_rate);
  moog_saw_wasm_init();
  MoogOscillator *native = moog_oscillator_create(sample_rate);
  assert(bridge && native);
  moog_oscillator_wasm_reset(bridge, 0.75);
  moog_oscillator_reset(native, 0.75);

  // Act
  moog_oscillator_wasm_process(bridge, frequency, NULL, NULL, waveform, actual,
                               4);
  moog_oscillator_process(native, frequency, NULL, NULL, waveform, expected, 4);

  // Assert
  for (unsigned int i = 0; i < 4; ++i)
    assert(float_bits(actual[i]) == float_bits(expected[i]));
  assert(moog_oscillator_phase(bridge) == moog_oscillator_phase(native));
  moog_oscillator_wasm_destroy(bridge);
  moog_oscillator_destroy(native);
}

static void test_wasm_saw_compatibility_with_null_waveform(void) {
  // Arrange
  const double sample_rate = 48000.0;
  const float frequency[] = {440.0f, 441.0f, 442.0f, 443.0f};
  const float sync[] = {-1.0f, 0.25f, -0.75f, 0.5f};
  float generic_output[4];
  float legacy_output[4];
  moog_saw_wasm_init();
  MoogOscillator *generic = moog_oscillator_wasm_create(sample_rate);
  moog_saw_wasm_init();
  MoogSaw *legacy = moog_saw_wasm_create(sample_rate);
  assert(generic && legacy);
  moog_oscillator_wasm_reset(generic, 0.125);
  moog_saw_wasm_reset(legacy, 0.125);

  // Act
  moog_oscillator_wasm_process(generic, frequency, NULL, sync, NULL,
                               generic_output, 4);
  moog_saw_wasm_process(legacy, frequency, NULL, sync, legacy_output, 4);

  // Assert
  for (unsigned int i = 0; i < 4; ++i)
    assert(float_bits(generic_output[i]) == float_bits(legacy_output[i]));
  moog_oscillator_wasm_destroy(generic);
  moog_saw_wasm_destroy(legacy);
}

static void test_generic_wasm_bridge_normalizes_waveform_inputs(void) {
  // Arrange
  const double sample_rate = 48000.0;
  const float frequency[] = {110.0f, 110.0f, 110.0f, 110.0f, 110.0f};
  const float invalid_waveform[] = {NAN, -INFINITY, INFINITY, -1.0f, 6.0f};
  const float normalized_waveform[] = {2.0f, 0.0f, 5.0f, 0.0f, 5.0f};
  float actual[5];
  float expected[5];
  moog_saw_wasm_init();
  MoogOscillator *bridge = moog_oscillator_wasm_create(sample_rate);
  moog_saw_wasm_init();
  MoogOscillator *native = moog_oscillator_create(sample_rate);
  assert(bridge && native);
  moog_oscillator_wasm_reset(bridge, 0.625);
  moog_oscillator_reset(native, 0.625);

  // Act
  moog_oscillator_wasm_process(bridge, frequency, NULL, NULL, invalid_waveform,
                               actual, 5);
  moog_oscillator_process(native, frequency, NULL, NULL, normalized_waveform,
                          expected, 5);

  // Assert
  for (unsigned int i = 0; i < 5; ++i)
    assert(float_bits(actual[i]) == float_bits(expected[i]));
  moog_oscillator_wasm_destroy(bridge);
  moog_oscillator_destroy(native);
}

static void test_generic_wasm_init_preserves_saw_initial_state(void) {
  // Arrange
  const double sample_rate = 48000.0;
  const float frequency[] = {440.0f, 441.0f, 442.0f, 443.0f};
  const float saw_waveform[] = {2.0f, 2.0f, 2.0f, 2.0f};
  float generic_output[4];
  float legacy_output[4];
  moog_saw_wasm_init();
  MoogSaw *legacy = moog_saw_wasm_create(sample_rate);
  assert(legacy);
  const double expected_phase = moog_saw_phase(legacy);

  // Act
  moog_oscillator_wasm_init();
  MoogOscillator *generic = moog_oscillator_wasm_create(sample_rate);
  assert(generic);
  const double actual_phase = moog_oscillator_phase(generic);
  moog_oscillator_wasm_process(generic, frequency, NULL, NULL, saw_waveform,
                               generic_output, 4);
  moog_saw_wasm_process(legacy, frequency, NULL, NULL, legacy_output, 4);

  // Assert
  assert(actual_phase == expected_phase);
  for (unsigned int i = 0; i < 4; ++i)
    assert(float_bits(generic_output[i]) == float_bits(legacy_output[i]));
  moog_oscillator_wasm_destroy(generic);
  moog_saw_wasm_destroy(legacy);
}

int main(void) {
  test_generic_wasm_bridge_matches_native_processing();
  test_wasm_saw_compatibility_with_null_waveform();
  test_generic_wasm_bridge_normalizes_waveform_inputs();
  test_generic_wasm_init_preserves_saw_initial_state();
  puts("all oscillator WASM bridge tests passed");
  return 0;
}
