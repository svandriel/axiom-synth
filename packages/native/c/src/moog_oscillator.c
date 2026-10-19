#include "moog_oscillator.h"
#include "moog_oscillator_internal.h"
#include "moog_oscillator_math.h"
#include "moog_waveforms.h"

#include <math.h>
#include <stdlib.h>

#define MOOG_OSC_DRIFT 0.0005
#define MOOG_OSC_DEFAULT_FREQUENCY_HZ 440.0f
#define MOOG_OSC_SAW_WAVEFORM 2.0f

struct MoogOscillator
{
    double phase;
    double sample_rate;
    float frequency_hz;
    float previous_sync;
    float drift_ratio;
};

static double phase_increment(float frequency_hz, double sample_rate)
{
    if (!isfinite((double)frequency_hz) || frequency_hz <= 0.0f ||
        !isfinite(sample_rate) || sample_rate <= 0.0)
    {
        return 0.0;
    }
    return (double)frequency_hz / sample_rate;
}

MoogOscillator *moog_oscillator_create(double sample_rate)
{
    if (!isfinite(sample_rate) || sample_rate <= 0.0)
    {
        return NULL;
    }

    MoogOscillator *osc = (MoogOscillator *)calloc(1, sizeof(*osc));
    if (!osc)
    {
        return NULL;
    }

    osc->sample_rate = sample_rate;
    osc->phase = MOOG_OSC_TWO_PI * unit_random();
    osc->drift_ratio = (float)range_random(1.0 - MOOG_OSC_DRIFT, 1.0 + MOOG_OSC_DRIFT);
    osc->frequency_hz = MOOG_OSC_DEFAULT_FREQUENCY_HZ;
    osc->previous_sync = 0.0f;
    return osc;
}

void moog_oscillator_destroy(MoogOscillator *osc)
{
    free(osc);
}

void moog_oscillator_reset(MoogOscillator *osc, double phase)
{
    if (!osc)
        return;
    osc->phase = wrap_phase(phase);
    osc->previous_sync = 0.0f;
}

void moog_oscillator_set_frequency(MoogOscillator *osc, float frequency_hz)
{
    if (!osc)
        return;
    osc->frequency_hz = frequency_hz;
}

double moog_oscillator_phase(const MoogOscillator *osc)
{
    return osc ? osc->phase : 0.0;
}

static int block_is_uniform(const float *values, uint32_t frames)
{
    for (uint32_t i = 1; i < frames; ++i)
    {
        if (values[i] != values[0])
            return 0;
    }
    return 1;
}

static inline float detune_ratio(
    const float *detune, uint32_t i, float uniform_ratio)
{
    if (detune == NULL)
        return uniform_ratio;

    const float cents = detune[i];
    return cents != 0.0f ? cents_to_ratio(cents) : 1.0f;
}

static void render_block(
    MoogOscillator *osc,
    const float *frequency,
    const float *detune,
    float uniform_ratio,
    const float *sync,
    const float *waveform,
    float *output,
    uint32_t frames)
{
    const double inv_sample_rate = 1.0 / osc->sample_rate;
    double phase = osc->phase;
    float prev_sync = osc->previous_sync;

    for (uint32_t i = 0; i < frames; ++i)
    {
        const float f = (frequency ? frequency[i] : osc->frequency_hz) *
                        detune_ratio(detune, i, uniform_ratio) * osc->drift_ratio;
        const double inc = (f > 0.0f && isfinite((double)f))
                               ? (double)f * inv_sample_rate
                               : 0.0;

        if (sync)
        {
            const float current_sync = sync[i];

            if (prev_sync <= 0.0f && current_sync > 0.0f)
            {
                const double delta = (double)current_sync - (double)prev_sync;
                double u = delta != 0.0 ? -(double)prev_sync / delta : 0.0;
                if (u < 0.0)
                    u = 0.0;
                if (u > 1.0)
                    u = 1.0;

                const double samples_after_sync = 1.0 - u;
                phase = wrap_phase(samples_after_sync * inc);
            }

            prev_sync = current_sync;
        }

        const float waveform_value = waveform ? waveform[i] : MOOG_OSC_SAW_WAVEFORM;
        output[i] = !waveform || waveform_value == MOOG_OSC_SAW_WAVEFORM ||
                            isnan(waveform_value)
                        ? moog_waveform_saw_unwrapped(phase, moog_waveform_p(f))
                        : moog_waveform_evaluate(phase, f, waveform_value);
        phase = wrap_phase(phase + inc);
    }

    osc->phase = phase;
    osc->previous_sync = prev_sync;
}

void moog_oscillator_process(
    MoogOscillator *osc,
    const float *frequency,
    const float *detune,
    const float *sync,
    const float *waveform,
    float *output,
    uint32_t frames)
{
    if (!osc || !output || frames == 0)
        return;

    const int uniform_detune =
        detune != NULL && detune[0] != 0.0f && block_is_uniform(detune, frames);

    if (uniform_detune)
    {
        const float ratio = cents_to_ratio(detune[0]);
        render_block(osc, frequency, NULL, ratio, sync, waveform, output, frames);
    }
    else
    {
        render_block(osc, frequency, detune, 1.0f, sync, waveform, output, frames);
    }
}

void moog_oscillator_process_sample_sync(
    MoogOscillator *osc,
    float frequency_hz,
    int sync_event,
    double event_offset_samples,
    float *output)
{
    if (!osc || !output)
        return;

    const double inc = phase_increment(frequency_hz, osc->sample_rate);

    if (sync_event)
    {
        if (!isfinite(event_offset_samples))
            event_offset_samples = 0.0;
        if (event_offset_samples < 0.0)
            event_offset_samples = 0.0;
        if (event_offset_samples > 1.0)
            event_offset_samples = 1.0;

        const double samples_after_sync = 1.0 - event_offset_samples;
        osc->phase = wrap_phase(samples_after_sync * inc);
    }

    *output = moog_waveform_saw(osc->phase, moog_waveform_p(frequency_hz));
    osc->phase = wrap_phase(osc->phase + inc);
}
