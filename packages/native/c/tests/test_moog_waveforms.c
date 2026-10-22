#include "moog_waveforms.h"

#include <assert.h>
#include <math.h>
#include <stdio.h>

static const float TEST_FREQUENCY_HZ = 440.0f;
static const float TEST_PHASE_FIT = 0.5f;
static const unsigned int TEST_SAMPLE_COUNT = 4096;
static const float TEST_TOLERANCE = 2e-6f;
static const float TEST_FOURIER_FREQUENCY_HZ = (0.9924f - 0.5f) / 0.00002151f;
static const double TEST_FOURIER_PHASE_INCREMENT = 0.2;
static const double TEST_FOURIER_TWO_PI = 6.28318530717958647692;
static const double TEST_FOURIER_PI = 3.14159265358979323846;
static const double TEST_EDGE_CORRECTION_FOURIER_TOLERANCE = 0.01;

static void test_waveform_anchor_values(void) {
  assert(moog_waveform_triangle(0.0, TEST_PHASE_FIT) == -1.0f);
  assert(moog_waveform_triangle(0.25, TEST_PHASE_FIT) == 0.0f);
  assert(moog_waveform_triangle(0.5, TEST_PHASE_FIT) == 1.0f);
  assert(moog_waveform_triangle(0.75, TEST_PHASE_FIT) == 0.0f);

  assert(moog_waveform_sharktooth(0.0, TEST_PHASE_FIT) == -1.0f);
  assert(moog_waveform_sharktooth(0.375, TEST_PHASE_FIT) == 0.0f);
  assert(moog_waveform_sharktooth(0.75, TEST_PHASE_FIT) == 1.0f);
  assert(moog_waveform_sharktooth(0.875, TEST_PHASE_FIT) == 0.0f);

  assert(moog_waveform_pulse(0.0, TEST_PHASE_FIT, 0.5f) == -1.0f);
  assert(moog_waveform_pulse(0.5, TEST_PHASE_FIT, 0.5f) == 1.0f);
  assert(moog_waveform_pulse(0.0, TEST_PHASE_FIT, 0.75f) == -1.0f);
  assert(moog_waveform_pulse(0.25, TEST_PHASE_FIT, 0.75f) == 1.0f);
  assert(moog_waveform_pulse(0.0, TEST_PHASE_FIT, 0.25f) == -1.0f);
  assert(moog_waveform_pulse(0.75, TEST_PHASE_FIT, 0.25f) == 1.0f);

  const float evaluator_fit = moog_waveform_p(TEST_FREQUENCY_HZ);
  assert(moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 0.0f) ==
         moog_waveform_triangle(0.37, evaluator_fit));
  assert(moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 1.0f) ==
         moog_waveform_sharktooth(0.37, evaluator_fit));
  assert(moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 2.0f) ==
         moog_waveform_saw(0.37, evaluator_fit));
  assert(moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 3.0f) ==
         moog_waveform_pulse(0.37, evaluator_fit, 0.5f));
  assert(moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 4.0f) ==
         moog_waveform_pulse(0.37, evaluator_fit, 0.75f));
  assert(moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 5.0f) ==
         moog_waveform_pulse(0.37, evaluator_fit, 0.25f));
}

static void test_saw_clamps_p_away_from_zero(void) {
  const float near_zero_p = 0.5e-7f;
  const float minimum_p = 1.0e-7f;
  const double phase = 0.5e-7;

  assert(moog_waveform_saw_unwrapped(phase, near_zero_p) ==
         moog_waveform_saw_unwrapped(phase, minimum_p));
}

static void test_waveform_periodicity_and_level(void) {
  float minimum[4] = {INFINITY, INFINITY, INFINITY, INFINITY};
  float maximum[4] = {-INFINITY, -INFINITY, -INFINITY, -INFINITY};
  double sum[4] = {0.0, 0.0, 0.0, 0.0};
  const float expected_dc[4] = {0.0f, 0.0f, 0.0f, 0.5f};

  for (unsigned int i = 0; i < TEST_SAMPLE_COUNT; ++i) {
    const double phase = (double)i / TEST_SAMPLE_COUNT;
    const float values[] = {
      moog_waveform_triangle(phase, TEST_PHASE_FIT),
      moog_waveform_sharktooth(phase, TEST_PHASE_FIT),
      moog_waveform_saw(phase, TEST_PHASE_FIT),
      moog_waveform_pulse(phase, TEST_PHASE_FIT, 0.75f),
    };

    for (unsigned int shape = 0; shape < 4; ++shape) {
      assert(isfinite(values[shape]));
      assert(
        fabsf(values[shape] -
              (shape == 0 ? moog_waveform_triangle(phase + 1.0, TEST_PHASE_FIT)
               : shape == 1
                 ? moog_waveform_sharktooth(phase + 1.0, TEST_PHASE_FIT)
               : shape == 2 ? moog_waveform_saw(phase + 1.0, TEST_PHASE_FIT)
                            : moog_waveform_pulse(phase + 1.0, TEST_PHASE_FIT,
                                                  0.75f))) < TEST_TOLERANCE);
      assert(
        fabsf(values[shape] -
              (shape == 0 ? moog_waveform_triangle(phase - 1.0, TEST_PHASE_FIT)
               : shape == 1
                 ? moog_waveform_sharktooth(phase - 1.0, TEST_PHASE_FIT)
               : shape == 2 ? moog_waveform_saw(phase - 1.0, TEST_PHASE_FIT)
                            : moog_waveform_pulse(phase - 1.0, TEST_PHASE_FIT,
                                                  0.75f))) < TEST_TOLERANCE);
      if (values[shape] < minimum[shape])
        minimum[shape] = values[shape];
      if (values[shape] > maximum[shape])
        maximum[shape] = values[shape];
      sum[shape] += values[shape];
    }
  }

  for (unsigned int shape = 0; shape < 4; ++shape) {
    assert(fabsf(minimum[shape] + 1.0f) < TEST_TOLERANCE);
    assert(fabsf(maximum[shape] - 1.0f) < TEST_TOLERANCE);
    assert(fabs(sum[shape] / TEST_SAMPLE_COUNT - expected_dc[shape]) <= 2e-4);
  }
}

static void test_pulse_duty_cycles(void) {
  const float duties[] = {0.5f, 0.75f, 0.25f};
  for (unsigned int duty_index = 0; duty_index < 3; ++duty_index) {
    unsigned int positive_samples = 0;
    for (unsigned int i = 0; i < TEST_SAMPLE_COUNT; ++i) {
      const double phase = (double)i / TEST_SAMPLE_COUNT;
      if (moog_waveform_pulse(phase, TEST_PHASE_FIT, duties[duty_index]) > 0.0f)
        ++positive_samples;
    }
    const float measured = (float)positive_samples / TEST_SAMPLE_COUNT;
    assert(fabsf(measured - duties[duty_index]) <= 1.0f / TEST_SAMPLE_COUNT);
  }
}

static void test_waveform_value_sanitization(void) {
  const float saw = moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 2.0f);
  assert(moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, NAN) == saw);
  assert(moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, -INFINITY) ==
         moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 0.0f));
  assert(moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, INFINITY) ==
         moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 5.0f));
  assert(moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, -2.0f) ==
         moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 0.0f));
  assert(moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 8.0f) ==
         moog_waveform_evaluate(0.37, TEST_FREQUENCY_HZ, 5.0f));
}

static void test_morph_endpoints_and_pulse_midpoints(void) {
  const double phase = 0.37;
  assert(moog_waveform_morph_triangle_shark(phase, TEST_PHASE_FIT, 0.0f) ==
         moog_waveform_triangle(phase, TEST_PHASE_FIT));
  assert(moog_waveform_morph_triangle_shark(phase, TEST_PHASE_FIT, 1.0f) ==
         moog_waveform_sharktooth(phase, TEST_PHASE_FIT));
  assert(moog_waveform_morph_shark_saw(phase, TEST_PHASE_FIT, 0.0f) ==
         moog_waveform_sharktooth(phase, TEST_PHASE_FIT));
  assert(moog_waveform_morph_shark_saw(phase, TEST_PHASE_FIT, 1.0f) ==
         moog_waveform_saw(phase, TEST_PHASE_FIT));
  assert(moog_waveform_morph_saw_square(phase, TEST_PHASE_FIT, 0.0f) ==
         moog_waveform_saw(phase, TEST_PHASE_FIT));
  assert(moog_waveform_morph_saw_square(phase, TEST_PHASE_FIT, 1.0f) ==
         moog_waveform_pulse(phase, TEST_PHASE_FIT, 0.5f));
  assert(moog_waveform_morph_square_wide(phase, TEST_PHASE_FIT, 0.0f) ==
         moog_waveform_pulse(phase, TEST_PHASE_FIT, 0.5f));
  assert(moog_waveform_morph_square_wide(phase, TEST_PHASE_FIT, 1.0f) ==
         moog_waveform_pulse(phase, TEST_PHASE_FIT, 0.75f));
  assert(moog_waveform_morph_wide_narrow(phase, TEST_PHASE_FIT, 0.0f) ==
         moog_waveform_pulse(phase, TEST_PHASE_FIT, 0.75f));
  assert(moog_waveform_morph_wide_narrow(phase, TEST_PHASE_FIT, 1.0f) ==
         moog_waveform_pulse(phase, TEST_PHASE_FIT, 0.25f));

  unsigned int wide_midpoint_positive = 0;
  unsigned int narrow_midpoint_positive = 0;
  for (unsigned int i = 0; i < TEST_SAMPLE_COUNT; ++i) {
    const double phase_at_sample = (double)i / TEST_SAMPLE_COUNT;
    if (moog_waveform_morph_square_wide(phase_at_sample, TEST_PHASE_FIT, 0.5f) >
        0.0f)
      ++wide_midpoint_positive;
    if (moog_waveform_morph_wide_narrow(phase_at_sample, TEST_PHASE_FIT, 0.5f) >
        0.0f)
      ++narrow_midpoint_positive;
  }
  assert(wide_midpoint_positive == TEST_SAMPLE_COUNT * 5 / 8);
  assert(narrow_midpoint_positive == TEST_SAMPLE_COUNT / 2);
}

static void test_new_shapes_are_finite_near_nyquist(void) {
  const float frequencies[] = {19845.0f, 21600.0f, 43200.0f};
  const float sample_rates[] = {44100.0f, 48000.0f, 96000.0f};
  const float waveforms[] = {0.0f, 0.5f, 1.0f, 1.5f, 2.5f,
                             3.0f, 3.5f, 4.0f, 4.5f, 5.0f};

  for (unsigned int frequency_index = 0;
       frequency_index < sizeof(frequencies) / sizeof(frequencies[0]);
       ++frequency_index) {
    for (unsigned int waveform_index = 0;
         waveform_index < sizeof(waveforms) / sizeof(waveforms[0]);
         ++waveform_index) {
      for (unsigned int sample = 0; sample < TEST_SAMPLE_COUNT; ++sample) {
        const double phase = (double)sample / TEST_SAMPLE_COUNT;
        const float output = moog_waveform_evaluate(
          phase, frequencies[frequency_index], waveforms[waveform_index]);
        const float bandlimited_output = moog_waveform_evaluate_bandlimited(
          phase, frequencies[frequency_index], waveforms[waveform_index],
          frequencies[frequency_index] / sample_rates[frequency_index]);
        assert(isfinite(output));
        assert(output >= -1.000002f && output <= 1.000002f);
        assert(isfinite(bandlimited_output));
        if (waveforms[waveform_index] == 2.0f)
          assert(bandlimited_output == output);
      }
    }
  }
}

static void test_frequency_sweep_rebuilds_only_saw_dependent_shape_data(void) {
  const float start_frequency = 440.0f;
  const float next_frequency = 880.0f;
  const double phase_increment = 0.01;
  const float frequency_independent_waveforms[] = {
    0.0f, 0.5f, 1.0f, 3.0f, 3.5f, 4.0f, 4.5f, 5.0f,
  };
  const double phases[] = {0.01, 0.17, 0.5, 0.73};

  for (unsigned int waveform_index = 0;
       waveform_index < sizeof(frequency_independent_waveforms) /
                          sizeof(frequency_independent_waveforms[0]);
       ++waveform_index) {
    const float waveform = frequency_independent_waveforms[waveform_index];
    MoogWaveformCache cache = {0};
    MoogWaveformCache reference = {0};
    moog_waveform_cache_prepare(&cache, start_frequency, waveform,
                                phase_increment);

    const float cached_p = cache.p;
    const double cached_half_cosine = cache.saw_half_cosine;
    const double cached_half_sine = cache.saw_half_sine;
    moog_waveform_cache_prepare(&cache, next_frequency, waveform,
                                phase_increment);

    assert(cache.p == cached_p);
    assert(cache.saw_half_cosine == cached_half_cosine);
    assert(cache.saw_half_sine == cached_half_sine);
    moog_waveform_cache_prepare(&reference, next_frequency, waveform,
                                phase_increment);
    for (unsigned int phase_index = 0;
         phase_index < sizeof(phases) / sizeof(phases[0]); ++phase_index) {
      const float actual =
        moog_waveform_evaluate_prepared(phases[phase_index], &cache);
      const float expected =
        moog_waveform_evaluate_prepared(phases[phase_index], &reference);
      assert(fabsf(actual - expected) < TEST_TOLERANCE);
    }
  }

  MoogWaveformCache saw_cache = {0};
  moog_waveform_cache_prepare(&saw_cache, start_frequency, 1.5f,
                              phase_increment);
  const float start_p = saw_cache.p;
  moog_waveform_cache_prepare(&saw_cache, next_frequency, 1.5f,
                              phase_increment);
  assert(saw_cache.p == moog_waveform_p(next_frequency));
  assert(saw_cache.p != start_p);
}

static double expected_bandlimited_pulse(double phase, double duty) {
  const double edge_phase = 1.0 - duty;
  double expected = 2.0 * duty - 1.0;

  for (unsigned int harmonic = 1; harmonic <= 2; ++harmonic) {
    const double omega = TEST_FOURIER_TWO_PI * harmonic;
    expected +=
      2.0 / omega *
      (-2.0 * sin(omega * phase) + 2.0 * sin(omega * (phase - edge_phase)));
  }
  return expected;
}

static void test_edge_correction_approximates_low_harmonic_waveforms(void) {
  const double phases[] = {0.0, 0.071, 0.25, 0.371, 0.5, 0.75, 0.937};
  const float waveforms[] = {0.0f, 3.0f, 4.0f, 5.0f};
  const double duties[] = {0.0, 0.5, 0.75, 0.25};
  const float phase_fit = moog_waveform_p(TEST_FOURIER_FREQUENCY_HZ);
  assert(fabsf(phase_fit - 0.5f) < 1e-6f);

  for (unsigned int phase_index = 0;
       phase_index < sizeof(phases) / sizeof(phases[0]); ++phase_index) {
    const double phase = phases[phase_index];
    const double expected_triangle = -8.0 /
                                     (TEST_FOURIER_PI * TEST_FOURIER_PI) *
                                     cos(TEST_FOURIER_TWO_PI * phase);
    const float triangle = moog_waveform_evaluate_bandlimited(
      phase, TEST_FOURIER_FREQUENCY_HZ, waveforms[0],
      TEST_FOURIER_PHASE_INCREMENT);
    assert(fabs((double)triangle - expected_triangle) <
           TEST_EDGE_CORRECTION_FOURIER_TOLERANCE);

    for (unsigned int waveform_index = 1;
         waveform_index < sizeof(waveforms) / sizeof(waveforms[0]);
         ++waveform_index) {
      const float actual = moog_waveform_evaluate_bandlimited(
        phase, TEST_FOURIER_FREQUENCY_HZ, waveforms[waveform_index],
        TEST_FOURIER_PHASE_INCREMENT);
      const double expected =
        expected_bandlimited_pulse(phase, duties[waveform_index]);
      assert(fabs((double)actual - expected) <
             TEST_EDGE_CORRECTION_FOURIER_TOLERANCE);
    }
  }
}

static void test_sync_curvature_correction_symmetry_and_scaling(void) {
  // Arrange
  const double distance_samples = 0.5;
  const double phase_increment = 0.01;
  const double curvature_jump = -100.0;
  moog_waveform_initialize();

  // Act
  const float positive_distance = moog_waveform_sync_edge_correction(
    distance_samples, phase_increment, 0.0, 0.0, curvature_jump);
  const float negative_distance = moog_waveform_sync_edge_correction(
    -distance_samples, phase_increment, 0.0, 0.0, curvature_jump);
  const float doubled_jump = moog_waveform_sync_edge_correction(
    distance_samples, phase_increment, 0.0, 0.0, 2.0 * curvature_jump);

  // Assert
  assert(isfinite(positive_distance));
  assert(fabsf(positive_distance + negative_distance) < 1e-6f);
  assert(fabsf(doubled_jump - 2.0f * positive_distance) < 1e-6f);
}

int main(void) {
  test_waveform_anchor_values();
  test_saw_clamps_p_away_from_zero();
  test_waveform_periodicity_and_level();
  test_pulse_duty_cycles();
  test_waveform_value_sanitization();
  test_morph_endpoints_and_pulse_midpoints();
  test_new_shapes_are_finite_near_nyquist();
  test_frequency_sweep_rebuilds_only_saw_dependent_shape_data();
  test_edge_correction_approximates_low_harmonic_waveforms();
  test_sync_curvature_correction_symmetry_and_scaling();
  puts("all waveform tests passed");
  return 0;
}
