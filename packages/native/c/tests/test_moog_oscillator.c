#include "moog_oscillator.h"
#include "moog_saw.h"
#include "../src/moog_waveforms.h"

#include <assert.h>
#include <float.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int test_rng_enabled;

double moog_saw_test_unit_random(void)
{
    return test_rng_enabled ? 0.5 : (double)rand() / RAND_MAX;
}

static uint32_t float_bits(float value)
{
    uint32_t bits;
    memcpy(&bits, &value, sizeof(bits));
    return bits;
}

static void test_waveform_automation_preserves_phase(void)
{
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
    moog_oscillator_process(automated, frequency, NULL, NULL, waveform, automated_output, 4);
    moog_oscillator_process(saw, frequency, NULL, NULL, NULL, saw_output, 4);
    assert(moog_oscillator_phase(automated) == moog_oscillator_phase(saw));
    moog_oscillator_destroy(automated);
    moog_oscillator_destroy(saw);
    test_rng_enabled = 0;
}

static void test_generic_instance_state_isolation(void)
{
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

static void test_generic_set_frequency_and_reset(void)
{
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

static void test_generic_process_null_waveform_uses_saw(void)
{
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

    moog_oscillator_process(null_waveform, frequency, NULL, NULL, NULL, null_output, 4);
    moog_oscillator_process(explicit_saw, frequency, NULL, NULL, waveform, explicit_output, 4);
    moog_saw_process(legacy, frequency, NULL, NULL, legacy_output, 4);

    for (unsigned int i = 0; i < 4; ++i)
    {
        assert(float_bits(null_output[i]) == float_bits(explicit_output[i]));
        assert(float_bits(null_output[i]) == float_bits(legacy_output[i]));
    }
    assert(moog_oscillator_phase(null_waveform) == moog_oscillator_phase(explicit_saw));
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
    moog_oscillator_process(
        unreset_generic, frequency, NULL, NULL, NULL, &generic_first_sample, 1);
    moog_oscillator_process(
        unreset_explicit, frequency, NULL, NULL, waveform, &explicit_first_sample, 1);
    moog_saw_process(unreset_legacy, frequency, NULL, NULL, &legacy_first_sample, 1);
    assert(float_bits(generic_first_sample) == float_bits(legacy_first_sample));
    assert(float_bits(explicit_first_sample) == float_bits(legacy_first_sample));
    moog_oscillator_destroy(unreset_generic);
    moog_oscillator_destroy(unreset_explicit);
    moog_saw_destroy(unreset_legacy);
    test_rng_enabled = 0;
}

static void test_sync_phase_reset_for_each_anchor(void)
{
    const float waveforms[] = {0.0f, 0.5f, 1.0f, 1.5f, 2.0f, 2.5f,
                               3.0f, 3.5f, 4.0f, 4.5f, 5.0f};
    const double event_offsets[] = {0.0, 0.25, 0.5, 0.75, 1.0};
    const float frequency[] = {480.0f, 480.0f};
    const double increment = 480.0 / 48000.0;

    test_rng_enabled = 1;
    for (unsigned int waveform_index = 0;
         waveform_index < sizeof(waveforms) / sizeof(waveforms[0]);
         ++waveform_index)
    {
        for (unsigned int offset_index = 0;
             offset_index < sizeof(event_offsets) / sizeof(event_offsets[0]);
             ++offset_index)
        {
            const double requested_offset = event_offsets[offset_index];
            const float previous = (float)-requested_offset;
            const float current =
                requested_offset == 1.0 ? FLT_MIN : (float)(1.0 - requested_offset);
            const float sync[] = {previous, current};
            const float waveform[] = {waveforms[waveform_index],
                                      waveforms[waveform_index]};
            float output[2];
            MoogOscillator *osc = moog_oscillator_create(48000.0);
            assert(osc);
            moog_oscillator_reset(osc, 0.375);
            moog_oscillator_process(
                osc, frequency, NULL, sync, waveform, output, 2);

            const double delta = (double)current - (double)previous;
            double crossing = -(double)previous / delta;
            if (crossing < 0.0)
                crossing = 0.0;
            if (crossing > 1.0)
                crossing = 1.0;
            const double phase_at_event_sample = (1.0 - crossing) * increment;
            const double expected_final_phase = phase_at_event_sample + increment;
            assert(fabs(moog_oscillator_phase(osc) - expected_final_phase) < 1e-12);
            assert(isfinite(output[1]));
            const float expected_output = moog_waveform_evaluate(
                phase_at_event_sample, frequency[1], waveform[1]);
            assert(fabsf(output[1] - expected_output) < 1e-6f);
            moog_oscillator_destroy(osc);
        }
    }
    test_rng_enabled = 0;
}

static void test_generic_saw_sync_matches_legacy_bits(void)
{
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
    moog_oscillator_process(
        generic, frequency, NULL, sync, waveform, generic_output, 5);
    moog_saw_process(legacy, frequency, NULL, sync, legacy_output, 5);
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
    moog_oscillator_process(generic, frequency, NULL, sync, NULL, generic_output, 5);
    moog_saw_process(legacy, frequency, NULL, sync, legacy_output, 5);
    double expected_phase = 0.125;
    float previous_sync = 0.0f;
    for (unsigned int i = 0; i < 5; ++i)
    {
        assert(float_bits(generic_output[i]) == float_bits(legacy_output[i]));
        const double increment = (double)frequency[i] / 48000.0;
        if (previous_sync <= 0.0f && sync[i] > 0.0f)
        {
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

int main(void)
{
    test_waveform_automation_preserves_phase();
    test_generic_instance_state_isolation();
    test_generic_set_frequency_and_reset();
    test_generic_process_null_waveform_uses_saw();
    test_sync_phase_reset_for_each_anchor();
    test_generic_saw_sync_matches_legacy_bits();
    puts("all generic oscillator tests passed");
    return 0;
}
