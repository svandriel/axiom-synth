#include "moog_saw.h"
#include "moog_oscillator.h"
#include "moog_oscillator_internal.h"
#include "moog_waveforms.h"

#include <stdlib.h>

struct MoogSaw
{
    MoogOscillator *oscillator;
};

void moog_saw_init(void)
{
    srand((unsigned int)0);
}

MoogSaw *moog_saw_create(double sample_rate)
{
    MoogOscillator *oscillator = moog_oscillator_create(sample_rate);
    if (!oscillator)
        return NULL;

    MoogSaw *osc = (MoogSaw *)malloc(sizeof(*osc));
    if (!osc)
    {
        moog_oscillator_destroy(oscillator);
        return NULL;
    }

    osc->oscillator = oscillator;
    return osc;
}

void moog_saw_destroy(MoogSaw *osc)
{
    if (!osc)
        return;
    moog_oscillator_destroy(osc->oscillator);
    free(osc);
}

void moog_saw_reset(MoogSaw *osc, double phase)
{
    if (!osc)
        return;
    moog_oscillator_reset(osc->oscillator, phase);
}

void moog_saw_set_frequency(MoogSaw *osc, float frequency_hz)
{
    if (!osc)
        return;
    moog_oscillator_set_frequency(osc->oscillator, frequency_hz);
}

double moog_saw_phase(const MoogSaw *osc)
{
    return osc ? moog_oscillator_phase(osc->oscillator) : 0.0;
}

float moog_saw_p(float frequency_hz)
{
    return moog_waveform_p(frequency_hz);
}

float moog_saw_waveform(double phase, float p)
{
    return moog_waveform_saw(phase, p);
}

void moog_saw_process(
    MoogSaw *osc,
    const float *frequency,
    const float *detune,
    const float *sync,
    float *output,
    uint32_t frames)
{
    if (!osc)
        return;
    moog_oscillator_process(
        osc->oscillator, frequency, detune, sync, NULL, output, frames);
}

void moog_saw_process_sample(
    MoogSaw *osc,
    float frequency_hz,
    int sync_event,
    double event_offset_samples,
    float *output)
{
    if (!osc)
        return;
    moog_oscillator_process_sample_sync(
        osc->oscillator, frequency_hz, sync_event, event_offset_samples, output);
}
