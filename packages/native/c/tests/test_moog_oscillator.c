#include "moog_oscillator.h"
#include "moog_saw.h"
#include "../src/moog_sync_series.h"
#include "../src/moog_waveforms.h"

#include <assert.h>
#include <float.h>
#include <math.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static int test_rng_enabled;

double moog_saw_test_unit_random(void) {
  return test_rng_enabled ? 0.5 : (double)rand() / RAND_MAX;
}

static uint32_t float_bits(float value) {
  uint32_t bits;
  memcpy(&bits, &value, sizeof(bits));
  return bits;
}

static void test_waveform_automation_preserves_phase(void) {
  const float frequency[] = {440.0f, 441.0f, 442.0f, 443.0f};
  const float waveform[] = {0.0f, 1.5f, 3.5f, 5.0f};
  float automated_output[4];
  float saw_output[4];
  test_rng_enabled = 1;
  MoogOscillator *automated = moog_oscillator_create(48000.0);
  MoogOscillator *saw = moog_oscillator_create(48000.0);
  assert(automated && saw);
  moog_oscillator_reset(automated, 0.125);
  moog_oscillator_reset(saw, 0.125);
  moog_oscillator_process(automated, frequency, NULL, NULL, waveform,
                          automated_output, 4);
  moog_oscillator_process(saw, frequency, NULL, NULL, NULL, saw_output, 4);
  assert(moog_oscillator_phase(automated) == moog_oscillator_phase(saw));
  moog_oscillator_destroy(automated);
  moog_oscillator_destroy(saw);
  test_rng_enabled = 0;
}

static void test_generic_instance_state_isolation(void) {
  test_rng_enabled = 1;
  MoogOscillator *first = moog_oscillator_create(48000.0);
  MoogOscillator *second = moog_oscillator_create(48000.0);
  assert(first && second);
  moog_oscillator_reset(first, 0.125);
  moog_oscillator_reset(second, 0.625);
  const float frequency[] = {480.0f};
  const float waveform[] = {2.0f};
  float output;
  moog_oscillator_process(first, frequency, NULL, NULL, waveform, &output, 1);
  assert(moog_oscillator_phase(second) == 0.625);
  assert(moog_oscillator_phase(first) != moog_oscillator_phase(second));
  moog_oscillator_destroy(first);
  moog_oscillator_destroy(second);
  test_rng_enabled = 0;
}

static void test_periodic_sync_series_harmonic_cap(void) {
  enum {
    EXPECTED_HARMONIC_CAP = 8,
    HIGH_PERIOD_SAMPLES = 100,
    LOW_PERIOD_SAMPLES = 16,
    LOW_PERIOD_HARMONICS = 7,
  };
  const float frequency_hz = 440.0f;
  const float waveform = 0.5f;
  const double phase_increment = 0.01;
  MoogSyncSeries high_period_series = {0};
  MoogSyncSeries low_period_series = {0};

  assert(moog_sync_series_prepare(&high_period_series, frequency_hz, waveform,
                                  phase_increment, HIGH_PERIOD_SAMPLES));
  assert(high_period_series.harmonic_count == EXPECTED_HARMONIC_CAP);

  assert(moog_sync_series_prepare(&low_period_series, frequency_hz, waveform,
                                  phase_increment, LOW_PERIOD_SAMPLES));
  assert(low_period_series.harmonic_count == LOW_PERIOD_HARMONICS);
}

static void test_generic_set_frequency_and_reset(void) {
  test_rng_enabled = 1;
  MoogOscillator *osc = moog_oscillator_create(48000.0);
  assert(osc);
  moog_oscillator_reset(osc, 0.25);
  moog_oscillator_set_frequency(osc, 480.0f);
  float output;
  moog_oscillator_process(osc, NULL, NULL, NULL, NULL, &output, 1);
  assert(isfinite(output));
  assert(fabs(moog_oscillator_phase(osc) - 0.26) < 1e-12);
  moog_oscillator_reset(osc, 0.75);
  assert(moog_oscillator_phase(osc) == 0.75);
  moog_oscillator_destroy(osc);
  test_rng_enabled = 0;
}

static void test_generic_process_null_waveform_uses_saw(void) {
  const float frequency[] = {440.0f, 441.0f, 442.0f, 443.0f};
  const float waveform[] = {2.0f, 2.0f, 2.0f, 2.0f};
  float null_output[4];
  float explicit_output[4];
  float legacy_output[4];
  test_rng_enabled = 1;
  MoogOscillator *null_waveform = moog_oscillator_create(48000.0);
  MoogOscillator *explicit_saw = moog_oscillator_create(48000.0);
  MoogSaw *legacy = moog_saw_create(48000.0);
  assert(null_waveform && explicit_saw && legacy);
  moog_oscillator_reset(null_waveform, 0.125);
  moog_oscillator_reset(explicit_saw, 0.125);
  moog_saw_reset(legacy, 0.125);

  moog_oscillator_process(null_waveform, frequency, NULL, NULL, NULL,
                          null_output, 4);
  moog_oscillator_process(explicit_saw, frequency, NULL, NULL, waveform,
                          explicit_output, 4);
  moog_saw_process(legacy, frequency, NULL, NULL, legacy_output, 4);

  for (unsigned int i = 0; i < 4; ++i) {
    assert(float_bits(null_output[i]) == float_bits(explicit_output[i]));
    assert(float_bits(null_output[i]) == float_bits(legacy_output[i]));
  }
  assert(moog_oscillator_phase(null_waveform) ==
         moog_oscillator_phase(explicit_saw));
  assert(moog_oscillator_phase(null_waveform) == moog_saw_phase(legacy));
  moog_oscillator_destroy(null_waveform);
  moog_oscillator_destroy(explicit_saw);
  moog_saw_destroy(legacy);

  MoogOscillator *unreset_generic = moog_oscillator_create(48000.0);
  MoogOscillator *unreset_explicit = moog_oscillator_create(48000.0);
  MoogSaw *unreset_legacy = moog_saw_create(48000.0);
  assert(unreset_generic && unreset_explicit && unreset_legacy);
  float generic_first_sample;
  float explicit_first_sample;
  float legacy_first_sample;
  moog_oscillator_process(unreset_generic, frequency, NULL, NULL, NULL,
                          &generic_first_sample, 1);
  moog_oscillator_process(unreset_explicit, frequency, NULL, NULL, waveform,
                          &explicit_first_sample, 1);
  moog_saw_process(unreset_legacy, frequency, NULL, NULL, &legacy_first_sample,
                   1);
  assert(float_bits(generic_first_sample) == float_bits(legacy_first_sample));
  assert(float_bits(explicit_first_sample) == float_bits(legacy_first_sample));
  moog_oscillator_destroy(unreset_generic);
  moog_oscillator_destroy(unreset_explicit);
  moog_saw_destroy(unreset_legacy);
  test_rng_enabled = 0;
}

static void test_uniform_saw_matches_per_sample_path_across_blocks(void) {
  // Arrange
  enum { FRAMES = 128, BLOCKS = 3 };
  const float pitches[BLOCKS] = {440.0f, 0.0f, 50000.0f};
  float frequency[FRAMES];
  float uniform_waveform[FRAMES];
  float varying_waveform[FRAMES];
  float uniform_output[FRAMES];
  float varying_output[FRAMES];
  float null_output[FRAMES];
  test_rng_enabled = 1;
  MoogOscillator *uniform = moog_oscillator_create(48000.0);
  MoogOscillator *varying = moog_oscillator_create(48000.0);
  MoogOscillator *null_waveform = moog_oscillator_create(48000.0);
  assert(uniform && varying && null_waveform);
  moog_oscillator_reset(uniform, 0.125);
  moog_oscillator_reset(varying, 0.125);
  moog_oscillator_reset(null_waveform, 0.125);
  for (unsigned int i = 0; i < FRAMES; ++i) {
    uniform_waveform[i] = 2.0f;
    varying_waveform[i] = i % 2 ? NAN : 2.0f;
  }

  // Act
  for (unsigned int block = 0; block < BLOCKS; ++block) {
    for (unsigned int i = 0; i < FRAMES; ++i)
      frequency[i] = pitches[block];
    moog_oscillator_process(uniform, frequency, NULL, NULL, uniform_waveform,
                            uniform_output, FRAMES);
    moog_oscillator_process(varying, frequency, NULL, NULL, varying_waveform,
                            varying_output, FRAMES);
    moog_oscillator_process(null_waveform, frequency, NULL, NULL, NULL,
                            null_output, FRAMES);

    // Assert
    for (unsigned int i = 0; i < FRAMES; ++i) {
      assert(float_bits(uniform_output[i]) == float_bits(varying_output[i]));
      assert(float_bits(null_output[i]) == float_bits(varying_output[i]));
    }
    assert(moog_oscillator_phase(uniform) == moog_oscillator_phase(varying));
    assert(moog_oscillator_phase(null_waveform) ==
           moog_oscillator_phase(varying));
  }
  moog_oscillator_destroy(uniform);
  moog_oscillator_destroy(varying);
  moog_oscillator_destroy(null_waveform);
  test_rng_enabled = 0;
}

static void test_out_of_band_sync_does_not_enumerate_unbounded_edges(void) {
  // Arrange
  enum { FRAMES = 2, MAX_TEST_SECONDS = 5 };
  const float out_of_band_frequency_hz = 1.0e12f;
  const float inactive_sync = -1.0f;
  const float pulse_waveform = 3.0f;
  const double sample_rate = 48000.0;
  const float frequency[FRAMES] = {out_of_band_frequency_hz,
                                   out_of_band_frequency_hz};
  const float sync[FRAMES] = {inactive_sync, inactive_sync};
  const float waveform[FRAMES] = {pulse_waveform, pulse_waveform};
  float output[FRAMES];
  MoogOscillator *osc = moog_oscillator_create(sample_rate);
  assert(osc);
  moog_oscillator_reset(osc, 0.125);

  // Act
  alarm(MAX_TEST_SECONDS);
  moog_oscillator_process(osc, frequency, NULL, sync, waveform, output, FRAMES);
  alarm(0);

  // Assert
  assert(isfinite(output[0]));
  assert(isfinite(output[1]));
  assert(isfinite(moog_oscillator_phase(osc)));
  moog_oscillator_destroy(osc);
}

static double expected_waveform_slope_one_sided(double phase,
                                                float frequency_hz,
                                                float waveform, double step) {
  const double first_value =
    moog_waveform_evaluate(phase + step, frequency_hz, waveform);
  const double second_value =
    moog_waveform_evaluate(phase + 2.0 * step, frequency_hz, waveform);
  return (second_value - first_value) / step;
}

static double
expected_post_sync_natural_edge_correction(double phase, double phase_increment,
                                           const MoogWaveformCache *cache) {
  double correction = 0.0;
  const double correction_phase_radius =
    phase_increment * MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES;
  for (unsigned int edge_index = 0; edge_index < cache->edge_count;
       ++edge_index) {
    const MoogWaveformFourierEdge *edge = &cache->edges[edge_index];
    int first_cycle = (int)ceil(phase - correction_phase_radius - edge->phase);
    const int last_cycle =
      (int)floor(phase + correction_phase_radius - edge->phase);
    if (first_cycle < 0)
      first_cycle = 0;
    for (int cycle = first_cycle; cycle <= last_cycle; ++cycle) {
      const double edge_phase = edge->phase + cycle;
      if (edge_phase == 0.0)
        continue;
      const double distance_samples = (phase - edge_phase) / phase_increment;
      const double curvature_jump =
        cache->saw_weight != 0.0 && !cache->harmonic_count_fallback &&
            cache->harmonic_count <= MOOG_WAVEFORM_CACHE_HARMONIC_COUNT
          ? 0.0
          : edge->curvature_jump;
      correction += moog_waveform_sync_edge_correction(
        distance_samples, phase_increment, edge->value_jump, edge->slope_jump,
        curvature_jump);
    }
  }
  return correction;
}

/*
 * Verify fractional phase-reset timing and delayed edge output for every
 * waveform anchor.
 */
static void test_sync_phase_reset_for_each_anchor(void) {
  // Arrange
  const float waveforms[] = {0.0f, 0.5f, 1.0f, 1.5f, 2.0f, 2.5f,
                             3.0f, 3.5f, 4.0f, 4.5f, 5.0f};
  const double event_offsets[] = {0.0, 0.25, 0.5, 0.75, 1.0};
  const double increment = 480.0 / 48000.0;
  const float sync_output_tolerance = 0.005f;
  enum {
    TEST_SYNC_FRAME_COUNT = MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES + 2,
  };
  float frequency[TEST_SYNC_FRAME_COUNT];
  float sync[TEST_SYNC_FRAME_COUNT];
  float waveform[TEST_SYNC_FRAME_COUNT];
  float output[TEST_SYNC_FRAME_COUNT];

  test_rng_enabled = 1;
  for (unsigned int waveform_index = 0;
       waveform_index < sizeof(waveforms) / sizeof(waveforms[0]);
       ++waveform_index) {
    for (unsigned int offset_index = 0;
         offset_index < sizeof(event_offsets) / sizeof(event_offsets[0]);
         ++offset_index) {
      const double requested_offset = event_offsets[offset_index];
      const float previous = (float)-requested_offset;
      const float current =
        requested_offset == 1.0 ? FLT_MIN : (float)(1.0 - requested_offset);
      for (unsigned int i = 0; i < TEST_SYNC_FRAME_COUNT; ++i) {
        frequency[i] = 480.0f;
        sync[i] = i == 0 ? previous : current;
        waveform[i] = waveforms[waveform_index];
      }
      MoogOscillator *osc = moog_oscillator_create(48000.0);
      assert(osc);
      moog_oscillator_reset(osc, 0.375);

      // Act
      moog_oscillator_process(osc, frequency, NULL, sync, waveform, output,
                              TEST_SYNC_FRAME_COUNT);

      // Assert
      const double delta = (double)current - (double)previous;
      double crossing = -(double)previous / delta;
      if (crossing < 0.0)
        crossing = 0.0;
      if (crossing > 1.0)
        crossing = 1.0;
      const double phase_at_event_sample = (1.0 - crossing) * increment;
      const double expected_final_phase =
        phase_at_event_sample + (TEST_SYNC_FRAME_COUNT - 1) * increment;
      assert(fabs(moog_oscillator_phase(osc) - expected_final_phase) < 1e-12);
      if (waveforms[waveform_index] == 2.0f) {
        assert(isfinite(output[0]));
        assert(isfinite(output[1]));
      } else {
        for (uint32_t i = 0; i < MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES;
             ++i) {
          assert(output[i] == 0.0f);
        }
        assert(isfinite(output[MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES]));
        assert(
          isfinite(output[MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES + 1]));
      }
      const double phase_before_sync = 0.375 + crossing * increment;
      MoogWaveformCache expected_cache = {0};
      moog_waveform_cache_prepare(&expected_cache, frequency[1], waveform[1],
                                  increment);
      const float expected_output =
        moog_waveform_evaluate(phase_at_event_sample, frequency[1],
                               waveform[1]) +
        moog_waveform_sync_saw_bandlimit_correction(phase_at_event_sample,
                                                    &expected_cache) +
        expected_post_sync_natural_edge_correction(phase_at_event_sample,
                                                   increment, &expected_cache);
      const double value_before_sync =
        moog_waveform_evaluate(phase_before_sync, frequency[1], waveform[1]);
      const double value_after_sync =
        moog_waveform_evaluate(0.0, frequency[1], waveform[1]);
      const double slope_before_sync = expected_waveform_slope_one_sided(
        phase_before_sync, frequency[1], waveform[1],
        -MOOG_WAVEFORM_SYNC_SLOPE_FIT_DELTA);
      const double slope_after_sync = expected_waveform_slope_one_sided(
        0.0, frequency[1], waveform[1], MOOG_WAVEFORM_SYNC_SLOPE_FIT_DELTA);
      const float expected_sync_correction =
        waveform[1] == 2.0f
          ? 0.0f
          : moog_waveform_sync_edge_correction(
              1.0 - crossing, increment, value_after_sync - value_before_sync,
              slope_after_sync - slope_before_sync, 0.0);
      const float expected_before_sync =
        moog_waveform_evaluate(0.375, frequency[0], waveform[0]) +
        moog_waveform_sync_saw_bandlimit_correction(0.375, &expected_cache) +
        (waveform[0] == 2.0f
           ? 0.0
           : expected_post_sync_natural_edge_correction(
               -crossing * increment, increment, &expected_cache)) +
        (waveform[0] == 2.0f
           ? 0.0f
           : moog_waveform_sync_edge_correction(
               -crossing, increment, value_after_sync - value_before_sync,
               slope_after_sync - slope_before_sync, 0.0));
      if (waveforms[waveform_index] == 2.0f) {
        assert(fabsf(output[0] - expected_before_sync) < sync_output_tolerance);
        assert(fabsf(output[1] - expected_output) < sync_output_tolerance);
      } else {
        assert(fabsf(output[MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES] -
                     expected_before_sync) < sync_output_tolerance);
        assert(fabsf(output[MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES + 1] -
                     (expected_output + expected_sync_correction)) <
               sync_output_tolerance);
      }
      moog_oscillator_destroy(osc);
    }
  }
  test_rng_enabled = 0;
}

static void test_integer_aligned_pulse_sync_has_no_double_step(void) {
  // Arrange
  enum {
    TEST_SYNC_EVENT_INDEX = 1,
    TEST_EXTRA_FRAMES = 4,
    TEST_FRAME_COUNT = MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES +
      TEST_EXTRA_FRAMES,
  };
  const double sample_rate = 44100.0;
  const float frequency_hz = 55.0f;
  const float wide_pulse_waveform = 4.0f;
  const float sync_step = 0.5f;
  const double start_phase = 0.5;
  const float reset_output_tolerance = 0.12f;
  const double phase_tolerance = 1e-12;
  const double increment = (double)frequency_hz / sample_rate;
  float frequency[TEST_FRAME_COUNT];
  float waveform[TEST_FRAME_COUNT];
  float sync[TEST_FRAME_COUNT];
  float output[TEST_FRAME_COUNT];
  for (unsigned int i = 0; i < TEST_FRAME_COUNT; ++i) {
    frequency[i] = frequency_hz;
    waveform[i] = wide_pulse_waveform;
    sync[i] = i < TEST_SYNC_EVENT_INDEX    ? -sync_step
              : i == TEST_SYNC_EVENT_INDEX ? 0.0f
                                           : sync_step;
  }
  test_rng_enabled = 1;
  MoogOscillator *osc = moog_oscillator_create(sample_rate);
  assert(osc);
  moog_oscillator_reset(osc, start_phase);

  // Act
  moog_oscillator_process(osc, frequency, NULL, sync, waveform, output,
                          TEST_FRAME_COUNT);

  // Assert
  const unsigned int reset_output_index =
    MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES + TEST_SYNC_EVENT_INDEX;
  assert(fabsf(output[reset_output_index]) < reset_output_tolerance);
  assert(fabs(moog_oscillator_phase(osc) -
              (TEST_FRAME_COUNT - TEST_SYNC_EVENT_INDEX) * increment) <
         phase_tolerance);
  moog_oscillator_destroy(osc);
  test_rng_enabled = 0;
}

static void test_integer_aligned_sync_is_stable_across_blocks(void) {
  // Arrange
  enum {
    TEST_FIRST_BLOCK_FRAMES = 2,
    TEST_FRAME_COUNT = MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES + 4,
  };
  const double sample_rate = 44100.0;
  const float frequency_hz = 55.0f;
  const float wide_pulse_waveform = 4.0f;
  const float sync_step = 0.5f;
  const double start_phase = 0.5;
  float frequency[TEST_FRAME_COUNT];
  float waveform[TEST_FRAME_COUNT];
  float sync[TEST_FRAME_COUNT];
  float full_output[TEST_FRAME_COUNT];
  float split_output[TEST_FRAME_COUNT];
  for (unsigned int i = 0; i < TEST_FRAME_COUNT; ++i) {
    frequency[i] = frequency_hz;
    waveform[i] = wide_pulse_waveform;
    sync[i] = i == 0 ? -sync_step : i == 1 ? 0.0f : sync_step;
  }
  test_rng_enabled = 1;
  MoogOscillator *full = moog_oscillator_create(sample_rate);
  MoogOscillator *split = moog_oscillator_create(sample_rate);
  assert(full && split);
  moog_oscillator_reset(full, start_phase);
  moog_oscillator_reset(split, start_phase);

  // Act
  moog_oscillator_process(full, frequency, NULL, sync, waveform, full_output,
                          TEST_FRAME_COUNT);
  moog_oscillator_process(split, frequency, NULL, sync, waveform, split_output,
                          TEST_FIRST_BLOCK_FRAMES);
  moog_oscillator_process(split, frequency + TEST_FIRST_BLOCK_FRAMES, NULL,
                          sync + TEST_FIRST_BLOCK_FRAMES,
                          waveform + TEST_FIRST_BLOCK_FRAMES,
                          split_output + TEST_FIRST_BLOCK_FRAMES,
                          TEST_FRAME_COUNT - TEST_FIRST_BLOCK_FRAMES);

  // Assert
  for (unsigned int i = 0; i < TEST_FRAME_COUNT; ++i)
    assert(float_bits(full_output[i]) == float_bits(split_output[i]));
  assert(moog_oscillator_phase(full) == moog_oscillator_phase(split));
  moog_oscillator_destroy(full);
  moog_oscillator_destroy(split);
  test_rng_enabled = 0;
}

static void test_sync_resumes_after_an_unsynced_block(void) {
  // Arrange
  const double sample_rate = 44100.0;
  const float frequency_hz = 55.0f;
  const float wide_pulse_waveform = 4.0f;
  const float initial_frequency[] = {frequency_hz, frequency_hz};
  const float initial_waveform[] = {wide_pulse_waveform, wide_pulse_waveform};
  const float sync_before_zero[] = {-0.5f, 0.0f};
  const float sync_after_zero[] = {0.5f};
  const double phase_increment = (double)frequency_hz / sample_rate;
  const double phase_tolerance = 1e-12;
  float output[2];
  test_rng_enabled = 1;
  MoogOscillator *osc = moog_oscillator_create(sample_rate);
  assert(osc);
  moog_oscillator_reset(osc, 0.5);

  // Act
  moog_oscillator_process(osc, initial_frequency, NULL, sync_before_zero,
                          initial_waveform, output, 2);
  moog_oscillator_process(osc, &frequency_hz, NULL, NULL, &wide_pulse_waveform,
                          output, 1);
  moog_oscillator_process(osc, &frequency_hz, NULL, sync_after_zero,
                          &wide_pulse_waveform, output, 1);

  // Assert
  assert(fabs(moog_oscillator_phase(osc) - 2.0 * phase_increment) <
         phase_tolerance);
  moog_oscillator_destroy(osc);
  test_rng_enabled = 0;
}

static void test_frequency_change_does_not_invent_a_pulse_edge(void) {
  // Arrange
  enum {
    delayed_sample = MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES + 1,
    frame_count = delayed_sample + 1,
  };
  const double sample_rate = 48000.0;
  const float slow_frequency = 48.0f;
  const float fast_frequency = 4800.0f;
  const float wide_pulse_waveform = 4.0f;
  const float negative_sync = -1.0f;
  const float stopped_frequency = 0.0f;
  const float expected_pulse_level = 1.0f;
  const float output_tolerance = 1e-5f;
  float output[frame_count];
  test_rng_enabled = 1;
  MoogOscillator *osc = moog_oscillator_create(sample_rate);
  assert(osc);
  moog_oscillator_reset(osc, 0.497);

  // Act
  moog_oscillator_process(osc, &slow_frequency, NULL, &negative_sync,
                          &wide_pulse_waveform, output, 1);
  moog_oscillator_process(osc, &fast_frequency, NULL, &negative_sync,
                          &wide_pulse_waveform, output + 1, 1);
  for (unsigned int i = 2; i < frame_count; ++i)
    moog_oscillator_process(osc, &stopped_frequency, NULL, &negative_sync,
                            &wide_pulse_waveform, output + i, 1);

  // Assert
  assert(fabsf(output[delayed_sample] - expected_pulse_level) <
         output_tolerance);
  moog_oscillator_destroy(osc);
  test_rng_enabled = 0;
}

static void test_unsynced_waveforms_start_at_the_requested_phase(void) {
  // Arrange
  const double sample_rate = 48000.0;
  const double initial_phase = 0.75;
  const float frequency[] = {55.0f, 55.0f};
  const float uniform_waveform[] = {4.0f, 4.0f};
  const float changing_waveform[] = {4.0f, 3.0f};
  const float minimum_positive_level = 0.5f;
  float uniform_output[2];
  float changing_output[2];
  test_rng_enabled = 1;
  MoogOscillator *uniform = moog_oscillator_create(sample_rate);
  MoogOscillator *changing = moog_oscillator_create(sample_rate);
  assert(uniform && changing);
  moog_oscillator_reset(uniform, initial_phase);
  moog_oscillator_reset(changing, initial_phase);

  // Act
  moog_oscillator_process(uniform, frequency, NULL, NULL, uniform_waveform,
                          uniform_output, 2);
  moog_oscillator_process(changing, frequency, NULL, NULL, changing_waveform,
                          changing_output, 2);

  // Assert
  assert(uniform_output[0] > minimum_positive_level);
  assert(changing_output[0] > minimum_positive_level);
  moog_oscillator_destroy(uniform);
  moog_oscillator_destroy(changing);
  test_rng_enabled = 0;
}

static void test_generic_saw_sync_matches_legacy_bits(void) {
  // Arrange
  const float frequency[] = {440.0f, 441.0f, 442.0f, 443.0f, 444.0f};
  const float waveform[] = {2.0f, 2.0f, 2.0f, 2.0f, 2.0f};
  const float sync[] = {-1.0f, 0.5f, -0.75f, 0.25f, 0.875f};
  float generic_output[5];
  float legacy_output[5];
  test_rng_enabled = 1;
  MoogOscillator *generic = moog_oscillator_create(48000.0);
  MoogSaw *legacy = moog_saw_create(48000.0);
  assert(generic && legacy);
  moog_oscillator_reset(generic, 0.125);
  moog_saw_reset(legacy, 0.125);

  // Act
  moog_oscillator_process(generic, frequency, NULL, sync, waveform,
                          generic_output, 5);
  moog_saw_process(legacy, frequency, NULL, sync, legacy_output, 5);

  // Assert
  for (unsigned int i = 0; i < 5; ++i)
    assert(float_bits(generic_output[i]) == float_bits(legacy_output[i]));
  assert(moog_oscillator_phase(generic) == moog_saw_phase(legacy));
  moog_oscillator_destroy(generic);
  moog_saw_destroy(legacy);

  generic = moog_oscillator_create(48000.0);
  legacy = moog_saw_create(48000.0);
  assert(generic && legacy);
  moog_oscillator_reset(generic, 0.125);
  moog_saw_reset(legacy, 0.125);

  // Act
  moog_oscillator_process(generic, frequency, NULL, sync, NULL, generic_output,
                          5);
  moog_saw_process(legacy, frequency, NULL, sync, legacy_output, 5);

  // Assert
  double expected_phase = 0.125;
  float previous_sync = 0.0f;
  for (unsigned int i = 0; i < 5; ++i) {
    assert(float_bits(generic_output[i]) == float_bits(legacy_output[i]));
    const double increment = (double)frequency[i] / 48000.0;
    if (previous_sync <= 0.0f && sync[i] > 0.0f) {
      const double crossing =
        -(double)previous_sync / ((double)sync[i] - (double)previous_sync);
      expected_phase = (1.0 - crossing) * increment;
    }
    const float expected_output =
      moog_waveform_evaluate(expected_phase, frequency[i], 2.0f);
    assert(fabsf(generic_output[i] - expected_output) < 1e-6f);
    previous_sync = sync[i];
    expected_phase += increment;
    if (expected_phase >= 1.0)
      expected_phase -= 1.0;
  }
  assert(moog_oscillator_phase(generic) == moog_saw_phase(legacy));
  moog_oscillator_destroy(generic);
  moog_saw_destroy(legacy);
  test_rng_enabled = 0;
}

static void expected_periodic_sync_coefficients(
  float frequency_hz, float waveform, double phase_increment,
  double period_samples, double *dc, double *cosine_coefficient,
  double *sine_coefficient) {
  enum { INTEGRATION_STEPS = 16384 };
  const double two_pi = 2.0 * acos(-1.0);
  double dc_sum = 0.0;
  double cosine_sum = 0.0;
  double sine_sum = 0.0;
  for (unsigned int i = 0; i < INTEGRATION_STEPS; ++i) {
    const double time = period_samples * ((double)i + 0.5) / INTEGRATION_STEPS;
    const double angle = two_pi * time / period_samples;
    const double value =
      moog_waveform_evaluate(time * phase_increment, frequency_hz, waveform);
    dc_sum += value;
    cosine_sum += value * cos(angle);
    sine_sum += value * sin(angle);
  }
  *dc = dc_sum / INTEGRATION_STEPS;
  *cosine_coefficient = cosine_sum / INTEGRATION_STEPS;
  *sine_coefficient = sine_sum / INTEGRATION_STEPS;
}

static void test_periodic_fractional_sync_morph_rejects_folded_harmonics(void) {
  // Arrange
  enum {
    FRAMES = 512,
    FIRST_SAMPLE = -100,
    SYNC_DELAY = MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES,
  };
  const double sample_rate = 96000.0;
  const float pitch = 43200.0f;
  const double period_samples = 1.5 * sample_rate / pitch;
  const double offset_samples = 0.25;
  const double maximum_rms_error = 0.01;
  const double maximum_peak_error = 0.05;
  float frequency[FRAMES], sync[FRAMES], waveform[FRAMES], output[FRAMES];
  double initial_time = fmod(FIRST_SAMPLE - offset_samples, period_samples);
  if (initial_time < 0.0)
    initial_time += period_samples;
  test_rng_enabled = 1;
  MoogOscillator *osc = moog_oscillator_create(sample_rate);
  assert(osc);
  moog_oscillator_reset(osc, initial_time * pitch / sample_rate);
  for (unsigned int i = 0; i < FRAMES; ++i) {
    const double position = (double)FIRST_SAMPLE + i;
    double cycle = (position - offset_samples) / period_samples + 0.5;
    cycle -= floor(cycle);
    frequency[i] = pitch;
    waveform[i] = 2.5f;
    sync[i] = (float)(2.0 * cycle - 1.0);
  }

  // Act
  moog_oscillator_process(osc, frequency, NULL, sync, waveform, output, FRAMES);

  // Assert
  double dc;
  double cosine_coefficient;
  double sine_coefficient;
  expected_periodic_sync_coefficients(pitch, 2.5f, pitch / sample_rate,
                                      period_samples, &dc, &cosine_coefficient,
                                      &sine_coefficient);
  double sum_squared_error = 0.0;
  double peak_error = 0.0;
  for (unsigned int i = FRAMES / 2; i < FRAMES; ++i) {
    const double position = (double)FIRST_SAMPLE + i - SYNC_DELAY;
    const double angle =
      2.0 * acos(-1.0) * (position - offset_samples) / period_samples;
    const double expected = dc + 2.0 * (cosine_coefficient * cos(angle) +
                                        sine_coefficient * sin(angle));
    const double error = fabs(output[i] - expected);
    sum_squared_error += error * error;
    if (error > peak_error)
      peak_error = error;
  }
  assert(sqrt(sum_squared_error / (FRAMES / 2)) < maximum_rms_error);
  assert(peak_error < maximum_peak_error);
  moog_oscillator_destroy(osc);
  test_rng_enabled = 0;
}

static void test_periodic_sync_stops_predicting_after_sync_disappears(void) {
  // Arrange
  enum {
    TRAIN_FRAMES = 128,
    FOLLOW_FRAMES = 256,
    COMPARE_PENDING_FROM = 16,
    COMPARE_PENDING_TO = 64,
    COMPARE_AFTER = 2 * MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES,
  };
  const double sample_rate = 96000.0;
  const float pitch = 43200.0f;
  const double period_samples = 1.5 * sample_rate / pitch;
  const float shape = 2.5f;
  const float control_morph_delta = 0.00001f;
  float frequency[TRAIN_FRAMES], waveform[TRAIN_FRAMES], sync[TRAIN_FRAMES];
  float control_waveform[TRAIN_FRAMES];
  float trained_output[TRAIN_FRAMES], control_training_output[TRAIN_FRAMES];
  float continued_output[FOLLOW_FRAMES], fresh_output[FOLLOW_FRAMES];
  float control_output[FOLLOW_FRAMES];
  float follow_frequency[FOLLOW_FRAMES], follow_waveform[FOLLOW_FRAMES];
  float inactive_sync[FOLLOW_FRAMES];
  test_rng_enabled = 1;
  MoogOscillator *trained = moog_oscillator_create(sample_rate);
  MoogOscillator *fresh = moog_oscillator_create(sample_rate);
  MoogOscillator *control = moog_oscillator_create(sample_rate);
  assert(trained && fresh && control);
  moog_oscillator_reset(trained, 0.0);
  moog_oscillator_reset(control, 0.0);
  for (unsigned int i = 0; i < TRAIN_FRAMES; ++i) {
    double cycle = ((double)i - 0.25) / period_samples + 0.5;
    cycle -= floor(cycle);
    frequency[i] = pitch;
    waveform[i] = shape;
    // Tiny automation prevents cadence caching without changing the reference
    // shape.
    control_waveform[i] = shape + (i % 2 == 0 ? 0.0f : control_morph_delta);
    sync[i] = (float)(2.0 * cycle - 1.0);
  }
  for (unsigned int i = 0; i < FOLLOW_FRAMES; ++i) {
    follow_frequency[i] = pitch;
    follow_waveform[i] = shape;
    inactive_sync[i] = -1.0f;
  }
  moog_oscillator_process(trained, frequency, NULL, sync, waveform,
                          trained_output, TRAIN_FRAMES);
  moog_oscillator_process(control, frequency, NULL, sync, control_waveform,
                          control_training_output, TRAIN_FRAMES);
  moog_oscillator_reset(fresh, moog_oscillator_phase(trained));

  // Act
  moog_oscillator_process(trained, follow_frequency, NULL, inactive_sync,
                          follow_waveform, continued_output, FOLLOW_FRAMES);
  moog_oscillator_process(fresh, follow_frequency, NULL, inactive_sync,
                          follow_waveform, fresh_output, FOLLOW_FRAMES);
  moog_oscillator_process(control, follow_frequency, NULL, inactive_sync,
                          follow_waveform, control_output, FOLLOW_FRAMES);

  // Assert
  for (unsigned int i = COMPARE_PENDING_FROM; i < COMPARE_PENDING_TO; ++i)
    assert(fabsf(continued_output[i] - control_output[i]) < 0.01f);
  for (unsigned int i = COMPARE_AFTER; i < FOLLOW_FRAMES; ++i)
    assert(fabsf(continued_output[i] - fresh_output[i]) < 0.01f);
  moog_oscillator_destroy(trained);
  moog_oscillator_destroy(fresh);
  moog_oscillator_destroy(control);
  test_rng_enabled = 0;
}

int main(void) {
  test_waveform_automation_preserves_phase();
  test_generic_instance_state_isolation();
  test_periodic_sync_series_harmonic_cap();
  test_generic_set_frequency_and_reset();
  test_generic_process_null_waveform_uses_saw();
  test_uniform_saw_matches_per_sample_path_across_blocks();
  test_out_of_band_sync_does_not_enumerate_unbounded_edges();
  test_sync_phase_reset_for_each_anchor();
  test_integer_aligned_pulse_sync_has_no_double_step();
  test_integer_aligned_sync_is_stable_across_blocks();
  test_sync_resumes_after_an_unsynced_block();
  test_frequency_change_does_not_invent_a_pulse_edge();
  test_unsynced_waveforms_start_at_the_requested_phase();
  test_generic_saw_sync_matches_legacy_bits();
  test_periodic_fractional_sync_morph_rejects_folded_harmonics();
  test_periodic_sync_stops_predicting_after_sync_disappears();
  puts("all generic oscillator tests passed");
  return 0;
}
