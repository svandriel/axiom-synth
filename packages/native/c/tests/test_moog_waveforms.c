#include "moog_waveforms.h"

#include <assert.h>
#include <math.h>
#include <stdio.h>

static const float TEST_FREQUENCY_HZ = 440.0f;
static const float TEST_PHASE_FIT = 0.5f;
static const unsigned int TEST_SAMPLE_COUNT = 4096;
static const float TEST_TOLERANCE = 2e-6f;

static void test_waveform_anchor_values(void)
{
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

static void test_waveform_periodicity_and_level(void)
{
    float minimum[4] = {INFINITY, INFINITY, INFINITY, INFINITY};
    float maximum[4] = {-INFINITY, -INFINITY, -INFINITY, -INFINITY};
    double sum[4] = {0.0, 0.0, 0.0, 0.0};
    const float expected_dc[4] = {0.0f, 0.0f, 0.0f, 0.5f};

    for (unsigned int i = 0; i < TEST_SAMPLE_COUNT; ++i)
    {
        const double phase = (double)i / TEST_SAMPLE_COUNT;
        const float values[] = {
            moog_waveform_triangle(phase, TEST_PHASE_FIT),
            moog_waveform_sharktooth(phase, TEST_PHASE_FIT),
            moog_waveform_saw(phase, TEST_PHASE_FIT),
            moog_waveform_pulse(phase, TEST_PHASE_FIT, 0.75f),
        };

        for (unsigned int shape = 0; shape < 4; ++shape)
        {
            assert(isfinite(values[shape]));
            assert(fabsf(values[shape] -
                         (shape == 0
                              ? moog_waveform_triangle(phase + 1.0, TEST_PHASE_FIT)
                              : shape == 1
                                    ? moog_waveform_sharktooth(phase + 1.0, TEST_PHASE_FIT)
                                    : shape == 2
                                          ? moog_waveform_saw(phase + 1.0, TEST_PHASE_FIT)
                                          : moog_waveform_pulse(phase + 1.0, TEST_PHASE_FIT, 0.75f))) <
                   TEST_TOLERANCE);
            assert(fabsf(values[shape] -
                         (shape == 0
                              ? moog_waveform_triangle(phase - 1.0, TEST_PHASE_FIT)
                              : shape == 1
                                    ? moog_waveform_sharktooth(phase - 1.0, TEST_PHASE_FIT)
                                    : shape == 2
                                          ? moog_waveform_saw(phase - 1.0, TEST_PHASE_FIT)
                                          : moog_waveform_pulse(phase - 1.0, TEST_PHASE_FIT, 0.75f))) <
                   TEST_TOLERANCE);
            if (values[shape] < minimum[shape])
                minimum[shape] = values[shape];
            if (values[shape] > maximum[shape])
                maximum[shape] = values[shape];
            sum[shape] += values[shape];
        }
    }

    for (unsigned int shape = 0; shape < 4; ++shape)
    {
        assert(fabsf(minimum[shape] + 1.0f) < TEST_TOLERANCE);
        assert(fabsf(maximum[shape] - 1.0f) < TEST_TOLERANCE);
        assert(fabs(sum[shape] / TEST_SAMPLE_COUNT - expected_dc[shape]) <= 2e-4);
    }
}

static void test_pulse_duty_cycles(void)
{
    const float duties[] = {0.5f, 0.75f, 0.25f};
    for (unsigned int duty_index = 0; duty_index < 3; ++duty_index)
    {
        unsigned int positive_samples = 0;
        for (unsigned int i = 0; i < TEST_SAMPLE_COUNT; ++i)
        {
            const double phase = (double)i / TEST_SAMPLE_COUNT;
            if (moog_waveform_pulse(phase, TEST_PHASE_FIT, duties[duty_index]) > 0.0f)
                ++positive_samples;
        }
        const float measured = (float)positive_samples / TEST_SAMPLE_COUNT;
        assert(fabsf(measured - duties[duty_index]) <= 1.0f / TEST_SAMPLE_COUNT);
    }
}

static void test_waveform_value_sanitization(void)
{
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

static void test_morph_endpoints_and_pulse_midpoints(void)
{
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
    for (unsigned int i = 0; i < TEST_SAMPLE_COUNT; ++i)
    {
        const double phase_at_sample = (double)i / TEST_SAMPLE_COUNT;
        if (moog_waveform_morph_square_wide(
                phase_at_sample, TEST_PHASE_FIT, 0.5f) > 0.0f)
            ++wide_midpoint_positive;
        if (moog_waveform_morph_wide_narrow(
                phase_at_sample, TEST_PHASE_FIT, 0.5f) > 0.0f)
            ++narrow_midpoint_positive;
    }
    assert(wide_midpoint_positive == TEST_SAMPLE_COUNT * 5 / 8);
    assert(narrow_midpoint_positive == TEST_SAMPLE_COUNT / 2);
}

static void test_new_shapes_are_finite_near_nyquist(void)
{
    const float frequencies[] = {19845.0f, 21600.0f, 43200.0f};
    const float waveforms[] = {0.0f, 0.5f, 1.0f, 1.5f, 2.5f,
                               3.0f, 3.5f, 4.0f, 4.5f, 5.0f};

    for (unsigned int frequency_index = 0;
         frequency_index < sizeof(frequencies) / sizeof(frequencies[0]);
         ++frequency_index)
    {
        for (unsigned int waveform_index = 0;
             waveform_index < sizeof(waveforms) / sizeof(waveforms[0]);
             ++waveform_index)
        {
            for (unsigned int sample = 0; sample < TEST_SAMPLE_COUNT; ++sample)
            {
                const double phase = (double)sample / TEST_SAMPLE_COUNT;
                const float output = moog_waveform_evaluate(
                    phase, frequencies[frequency_index], waveforms[waveform_index]);
                assert(isfinite(output));
                assert(output >= -1.000002f && output <= 1.000002f);
            }
        }
    }
}

int main(void)
{
    test_waveform_anchor_values();
    test_waveform_periodicity_and_level();
    test_pulse_duty_cycles();
    test_waveform_value_sanitization();
    test_morph_endpoints_and_pulse_midpoints();
    test_new_shapes_are_finite_near_nyquist();
    puts("all waveform tests passed");
    return 0;
}
