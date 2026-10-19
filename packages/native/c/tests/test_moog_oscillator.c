#include "moog_oscillator.h"
#include "moog_saw.h"

#include <assert.h>
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

int main(void)
{
    test_waveform_automation_preserves_phase();
    test_generic_instance_state_isolation();
    test_generic_set_frequency_and_reset();
    test_generic_process_null_waveform_uses_saw();
    puts("all generic oscillator tests passed");
    return 0;
}
