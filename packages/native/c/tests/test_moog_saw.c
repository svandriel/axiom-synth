#include "moog_saw.h"
#include "fixtures/legacy-saw-golden.h"

#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int test_rng_enabled;
static unsigned int test_rng_index;

static const double TEST_RNG_INITIAL_PHASE = 0.0;
static const double TEST_RNG_DRIFT_SAMPLE = 0.5;
static const double test_rng_values[] = {
    TEST_RNG_INITIAL_PHASE,
    TEST_RNG_DRIFT_SAMPLE,
};

double moog_saw_test_unit_random(void)
{
    if (!test_rng_enabled)
        return (double)rand() / RAND_MAX;

    return test_rng_values[
        test_rng_index++ % (sizeof(test_rng_values) / sizeof(test_rng_values[0]))];
}

static void test_rng_begin(void)
{
    test_rng_index = 0;
    test_rng_enabled = 1;
}

static void test_rng_end(void)
{
    test_rng_enabled = 0;
}

static uint32_t float_bits(float value)
{
    uint32_t bits;
    memcpy(&bits, &value, sizeof(bits));
    return bits;
}

static void test_legacy_saw_golden_static(void)
{
    test_rng_begin();
    moog_saw_init();
    MoogSaw *osc = moog_saw_create(LEGACY_SAW_SAMPLE_RATE);
    assert(osc);

    moog_saw_reset(osc, LEGACY_SAW_STATIC_PHASE);
    moog_saw_set_frequency(osc, 440.0f);

    float output[LEGACY_SAW_STATIC_FRAMES];
    moog_saw_process(osc, NULL, NULL, NULL, output, LEGACY_SAW_STATIC_FRAMES);

    for (int i = 0; i < LEGACY_SAW_STATIC_FRAMES; ++i)
        assert(float_bits(output[i]) == legacy_saw_static_golden_bits[i]);
    assert(moog_saw_phase(osc) == LEGACY_SAW_STATIC_FINAL_PHASE);
    moog_saw_destroy(osc);
    test_rng_end();
}

static void test_legacy_saw_golden_frequency_detune(void)
{
    test_rng_begin();
    moog_saw_init();
    MoogSaw *osc = moog_saw_create(LEGACY_SAW_SAMPLE_RATE);
    assert(osc);

    moog_saw_reset(osc, LEGACY_SAW_FREQUENCY_DETUNE_PHASE);

    float output[LEGACY_SAW_FREQUENCY_DETUNE_FRAMES];
    moog_saw_process(
        osc, legacy_saw_frequency_sequence, legacy_saw_detune_sequence, NULL, output,
        LEGACY_SAW_FREQUENCY_DETUNE_FRAMES);

    for (int i = 0; i < LEGACY_SAW_FREQUENCY_DETUNE_FRAMES; ++i)
        assert(float_bits(output[i]) == legacy_saw_frequency_detune_golden_bits[i]);
    assert(moog_saw_phase(osc) == LEGACY_SAW_FREQUENCY_DETUNE_FINAL_PHASE);
    moog_saw_destroy(osc);
    test_rng_end();
}

static void test_legacy_saw_golden_fractional_sync(void)
{
    test_rng_begin();
    moog_saw_init();
    MoogSaw *osc = moog_saw_create(LEGACY_SAW_SAMPLE_RATE);
    assert(osc);

    moog_saw_reset(osc, LEGACY_SAW_FRACTIONAL_SYNC_PHASE);

    float output[LEGACY_SAW_FRACTIONAL_SYNC_FRAMES];
    moog_saw_process(
        osc, legacy_saw_sync_frequency, NULL, legacy_saw_sync_signal, output,
        LEGACY_SAW_FRACTIONAL_SYNC_FRAMES);

    for (int i = 0; i < LEGACY_SAW_FRACTIONAL_SYNC_FRAMES; ++i)
        assert(float_bits(output[i]) == legacy_saw_fractional_sync_golden_bits[i]);
    assert(moog_saw_phase(osc) == LEGACY_SAW_FRACTIONAL_SYNC_FINAL_PHASE);
    moog_saw_destroy(osc);
    test_rng_end();
}

static void test_parameter_fit(void)
{
    const float expected = 0.9924f - 0.00002151f * 440.0f;
    assert(fabsf(moog_saw_p(440.0f) - expected) < 1e-6f);
}

static void test_progression(void)
{
    test_rng_begin();
    MoogSaw *osc = moog_saw_create(48000.0);
    assert(osc);

    moog_saw_set_frequency(osc, 480.0f);

    float out[4];
    moog_saw_process(osc, NULL, NULL, NULL, out, 4);

    for (int i = 0; i < 4; ++i) assert(isfinite(out[i]));

    const double expected_phase = 4.0 * 480.0 / 48000.0;
    assert(fabs(moog_saw_phase(osc) - expected_phase) < 1e-12);
    moog_saw_destroy(osc);
    test_rng_end();
}

static void test_fractional_sync(void)
{
    test_rng_begin();
    MoogSaw *osc = moog_saw_create(48000.0);
    assert(osc);

    moog_saw_reset(osc, 0.37);

    const float sync[] = {-1.0f, 1.0f};
    const float freq[] = {480.0f, 480.0f};
    float out[2];

    moog_saw_process(osc, freq, NULL, sync, out, 2);

    /*
     * Event is half-way between samples 0 and 1. At sample 1, 0.5 sample has
     * elapsed since reset; after rendering sample 1, another one sample has
     * elapsed, hence final phase is 1.5 * increment.
     */
    const double expected = 1.5 * 480.0 / 48000.0;
    assert(fabs(moog_saw_phase(osc) - expected) < 1e-12);
    moog_saw_destroy(osc);
    test_rng_end();
}

static void test_detune(void)
{
    test_rng_begin();
    MoogSaw *osc = moog_saw_create(48000.0);
    assert(osc);

    const float freq[] = {480.0f};
    const float detune[] = {1200.0f};
    float out;

    moog_saw_process(osc, freq, detune, NULL, &out, 1);

    const double expected_phase = 2.0 * 480.0 / 48000.0;
    assert(fabs(moog_saw_phase(osc) - expected_phase) < 1e-12);
    moog_saw_destroy(osc);
    test_rng_end();
}

static void test_semitone_detune(void)
{
    test_rng_begin();
    MoogSaw *osc = moog_saw_create(48000.0);
    assert(osc);

    const float freq[] = {480.0f};
    /* +5 semitones (perfect fourth) is 500 cents. */
    const float detune[] = {500.0f};
    float out;

    moog_saw_process(osc, freq, detune, NULL, &out, 1);

    const double expected_freq = 480.0 * pow(2.0, 5.0 / 12.0);
    const double expected_phase = expected_freq / 48000.0;
    assert(fabs(moog_saw_phase(osc) - expected_phase) < 1e-9);
    moog_saw_destroy(osc);
    test_rng_end();
}

/* The ideal waveform, evaluated with libm cos, to bound any fast-trig error. */
static double reference_waveform(double phase, float p)
{
    const double pi = 3.141592653589793238462643383279502884;
    double ph = phase - floor(phase);
    if (p <= 0.0f)
        p = 1.0e-7f;
    else if (p >= 1.0f)
        p = 1.0f - 1.0e-7f;

    const double amplitude = pi - 2.0 * pi * (double)p;
    const double phi_mod =
        ph < (double)p ? amplitude * ph / (double)p
                       : amplitude * (1.0 - ph) / (1.0 - (double)p);
    return -cos(2.0 * pi * ph + phi_mod);
}

static void test_waveform_accuracy(void)
{
    const float fits[] = {0.001f, 0.05f, 0.25f, 0.5f, 0.75f, 0.95f, 0.999f};
    for (int fi = 0; fi < 7; ++fi)
    {
        for (int k = 0; k < 1000; ++k)
        {
            const double phase = (double)k / 1000.0;
            const double got = (double)moog_saw_waveform(phase, fits[fi]);
            const double want = reference_waveform(phase, fits[fi]);
            assert(fabs(got - want) < 1e-6);
        }
    }
}

static void test_explicit_event(void)
{
    test_rng_begin();
    MoogSaw *osc = moog_saw_create(48000.0);
    assert(osc);

    float out;
    moog_saw_process_sample(osc, 480.0f, 1, 0.25, &out);

    /* 0.75 sample elapsed since the event, then one sample was rendered. */
    const double expected = 1.75 * 480.0 / 48000.0;
    assert(fabs(moog_saw_phase(osc) - expected) < 1e-12);
    assert(isfinite(out));
    moog_saw_destroy(osc);
    test_rng_end();
}

int main(void)
{
    test_legacy_saw_golden_static();
    test_legacy_saw_golden_frequency_detune();
    test_legacy_saw_golden_fractional_sync();
    test_parameter_fit();
    test_progression();
    test_fractional_sync();
    test_detune();
    test_semitone_detune();
    test_waveform_accuracy();
    test_explicit_event();
    puts("all tests passed");
    return 0;
}
