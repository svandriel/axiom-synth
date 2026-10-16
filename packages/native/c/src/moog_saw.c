#include "moog_saw.h"
#include "moog_saw_math.h"

#include <math.h>
#include <stdlib.h>

/* Clamp margin that keeps the two-segment waveform denominator non-zero. */
#define MOOG_SAW_P_EPSILON 1.0e-7f
#define MOOG_SAW_OSC_DRIFT 0.002

struct MoogSaw
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

float moog_saw_p(float frequency_hz)
{
    /* Pekonen et al., equation (6). */
    if (!isfinite((double)frequency_hz))
    {
        return 0.9924f;
    }

    float p = 0.9924f - 0.00002151f * frequency_hz;
    if (p < 0.0f)
        p = 0.0f;
    if (p > 1.0f)
        p = 1.0f;
    return p;
}

/* Evaluate the waveform for a phase already known to lie in [0, 1). */
static float waveform_unwrapped(double phase, float p)
{
    /* The fitted operating range has 0 < P < 1. */
    if (p <= 0.0f)
    {
        p = MOOG_SAW_P_EPSILON;
    }
    else if (p >= 1.0f)
    {
        p = 1.0f - MOOG_SAW_P_EPSILON;
    }

    const double pd_amplitude = MOOG_SAW_PI - MOOG_SAW_TWO_PI * (double)p;
    double phi_mod;

    if (phase < (double)p)
    {
        phi_mod = pd_amplitude * phase / (double)p;
    }
    else
    {
        phi_mod = pd_amplitude * (1.0 - phase) / (1.0 - (double)p);
    }

    /* Equation (4). */
    return (float)(-quadrant_cos(MOOG_SAW_TWO_PI * phase + phi_mod));
}

float moog_saw_waveform(double phase, float p)
{
    return waveform_unwrapped(wrap_phase(phase), p);
}

void moog_saw_init(void)
{
    srand((unsigned int)0);
}

MoogSaw *moog_saw_create(double sample_rate)
{
    if (!isfinite(sample_rate) || sample_rate <= 0.0)
    {
        return NULL;
    }

    MoogSaw *osc = (MoogSaw *)calloc(1, sizeof(*osc));
    if (!osc)
    {
        return NULL;
    }

    osc->sample_rate = sample_rate;
    osc->phase = MOOG_SAW_TWO_PI * unit_random();

    osc->drift_ratio = (float)range_random(1.0 - MOOG_SAW_OSC_DRIFT, 1.0 + MOOG_SAW_OSC_DRIFT);
    osc->frequency_hz = 440.0f;
    osc->previous_sync = 0.0f;
    return osc;
}

void moog_saw_destroy(MoogSaw *osc)
{
    free(osc);
}

void moog_saw_reset(MoogSaw *osc, double phase)
{
    if (!osc)
        return;
    osc->phase = wrap_phase(phase);
    osc->previous_sync = 0.0f;
}

void moog_saw_set_frequency(MoogSaw *osc, float frequency_hz)
{
    if (!osc)
        return;
    osc->frequency_hz = frequency_hz;
}

double moog_saw_phase(const MoogSaw *osc)
{
    return osc ? osc->phase : 0.0;
}

/* True when every one of the first `frames` values equals values[0]. */
static int block_is_uniform(const float *values, uint32_t frames)
{
    for (uint32_t i = 1; i < frames; ++i)
    {
        if (values[i] != values[0])
            return 0;
    }
    return 1;
}

/*
 * Frequency ratio for one sample. A NULL detune pointer means the block's
 * detune is a single value, already folded into uniform_ratio; otherwise the
 * per-sample cents are looked up and a zero detune skips exp2f.
 */
static inline float detune_ratio(
    const float *detune, uint32_t i, float uniform_ratio)
{
    if (detune == NULL)
        return uniform_ratio;

    const float cents = detune[i];
    return cents != 0.0f ? cents_to_ratio(cents) : 1.0f;
}

static void render_block(
    MoogSaw *osc,
    const float *frequency,
    const float *detune,
    float uniform_ratio,
    const float *sync,
    float *output,
    uint32_t frames)
{
    /* The sample rate is validated at creation, so a reciprocal is safe and
     * replaces one division per sample with one multiplication. */
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
                /* Linear interpolation of the zero crossing. */
                const double delta = (double)current_sync - (double)prev_sync;
                double u = delta != 0.0 ? -(double)prev_sync / delta : 0.0;
                if (u < 0.0)
                    u = 0.0;
                if (u > 1.0)
                    u = 1.0;

                /*
                 * u is the fraction from sample i-1 to i. The sync event is
                 * therefore (1-u) samples before the current sample.
                 * Reset at the event, then advance to the current sample.
                 */
                const double samples_after_sync = 1.0 - u;
                phase = wrap_phase(samples_after_sync * inc);
            }

            prev_sync = current_sync;
        }

        output[i] = waveform_unwrapped(phase, moog_saw_p(f));
        phase = wrap_phase(phase + inc);
    }

    osc->phase = phase;
    osc->previous_sync = prev_sync;
}

void moog_saw_process(
    MoogSaw *osc,
    const float *frequency,
    const float *detune, // in cents
    const float *sync,
    float *output,
    uint32_t frames)
{
    if (!osc || !output || frames == 0)
        return;

    /*
     * A block whose detune is a single non-zero value (e.g. a fine-tune with
     * no per-sample modulation) folds exp2f into one ratio, leaving the loop
     * with no detune lookup. A uniform zero block is already cheap in the
     * general path, so it is not special-cased.
     */
    const int uniform_detune =
        detune != NULL && detune[0] != 0.0f && block_is_uniform(detune, frames);

    if (uniform_detune)
    {
        const float ratio = cents_to_ratio(detune[0]);
        render_block(osc, frequency, NULL, ratio, sync, output, frames);
    }
    else
    {
        render_block(osc, frequency, detune, 1.0f, sync, output, frames);
    }
}

void moog_saw_process_sample(
    MoogSaw *osc,
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

    *output = moog_saw_waveform(osc->phase, moog_saw_p(frequency_hz));
    osc->phase = wrap_phase(osc->phase + inc);
}
