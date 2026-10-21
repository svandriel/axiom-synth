#include "moog_oscillator.h"
#include "moog_oscillator_internal.h"
#include "moog_oscillator_math.h"
#include "moog_sync_series.h"
#include "moog_waveforms.h"

#include <math.h>
#include <stdlib.h>

#define MOOG_OSC_DRIFT 0.0005
#define MOOG_OSC_DEFAULT_FREQUENCY_HZ 440.0f
#define MOOG_OSC_SAW_WAVEFORM 2.0f
#define MOOG_OSC_PHASE_CYCLE 1.0
#define MOOG_OSC_SYNC_CURVATURE_MAX_PHASE_INCREMENT 0.02
#define MOOG_OSC_SYNC_PERIOD_TOLERANCE_SAMPLES 0.001
enum
{
    MOOG_OSC_SYNC_OUTPUT_DELAY_SAMPLES =
        MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES,
    MOOG_OSC_SYNC_OUTPUT_BUFFER_LENGTH =
        MOOG_OSC_SYNC_OUTPUT_DELAY_SAMPLES + 1,
    MOOG_OSC_SYNC_CORRECTION_BUFFER_LENGTH =
        MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES * 2 + 1,
};

struct MoogOscillator
{
    double phase;
    double sample_rate;
    float frequency_hz;
    float previous_sync;
    double previous_increment;
    int zero_sync_edge_handled;
    float drift_ratio;
    MoogWaveformCache waveform_cache;
    MoogSyncSeries sync_series;
    float sync_tracking_frequency;
    float sync_tracking_waveform;
    double first_sync_event_time;
    double last_sync_event_time;
    double previous_sync_period;
    uint64_t sync_sample_count;
    int sync_tracking;
    int sync_event_seen;
    int sync_series_active;
    float sync_output_buffer[MOOG_OSC_SYNC_OUTPUT_BUFFER_LENGTH];
    float sync_correction_buffer[
        MOOG_OSC_SYNC_CORRECTION_BUFFER_LENGTH];
    uint32_t sync_output_index;
    uint32_t sync_correction_index;
    uint32_t sync_output_samples_processed;
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

    moog_waveform_initialize();

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
    osc->previous_increment = 0.0;
    osc->zero_sync_edge_handled = 0;
    osc->sync_tracking = 0;
    osc->sync_event_seen = 0;
    osc->sync_series_active = 0;
    osc->sync_sample_count = 0;
    osc->previous_sync_period = 0.0;
    for (uint32_t i = 0; i < MOOG_OSC_SYNC_OUTPUT_BUFFER_LENGTH; ++i)
    {
        osc->sync_output_buffer[i] = 0.0f;
    }
    for (uint32_t i = 0; i < MOOG_OSC_SYNC_CORRECTION_BUFFER_LENGTH; ++i)
        osc->sync_correction_buffer[i] = 0.0f;
    osc->sync_output_index = 0;
    osc->sync_correction_index = 0;
    osc->sync_output_samples_processed = 0;
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

static void clear_sync_delay(MoogOscillator *osc)
{
    for (uint32_t i = 0; i < MOOG_OSC_SYNC_OUTPUT_BUFFER_LENGTH; ++i)
        osc->sync_output_buffer[i] = 0.0f;
    for (uint32_t i = 0; i < MOOG_OSC_SYNC_CORRECTION_BUFFER_LENGTH; ++i)
        osc->sync_correction_buffer[i] = 0.0f;
    osc->sync_output_index = 0;
    osc->sync_correction_index = 0;
    osc->sync_output_samples_processed = 0;
}

static float process_sync_delayed_sample(
    MoogOscillator *osc, float current_output)
{
    const uint32_t output_read_index =
        (osc->sync_output_index + 1) % MOOG_OSC_SYNC_OUTPUT_BUFFER_LENGTH;
    const uint32_t correction_read_index =
        (osc->sync_correction_index +
         MOOG_OSC_SYNC_CORRECTION_BUFFER_LENGTH -
         MOOG_OSC_SYNC_OUTPUT_DELAY_SAMPLES) %
        MOOG_OSC_SYNC_CORRECTION_BUFFER_LENGTH;
    const float delayed_output =
        osc->sync_output_samples_processed >=
                MOOG_OSC_SYNC_OUTPUT_DELAY_SAMPLES
            ? (osc->sync_series_active
                   ? moog_sync_series_evaluate(
                         &osc->sync_series,
                         (double)osc->sync_sample_count -
                             MOOG_OSC_SYNC_OUTPUT_DELAY_SAMPLES -
                             osc->last_sync_event_time)
                   : osc->sync_output_buffer[output_read_index] +
                         osc->sync_correction_buffer[correction_read_index])
            : 0.0f;

    osc->sync_output_buffer[osc->sync_output_index] = current_output;
    osc->sync_correction_buffer[correction_read_index] = 0.0f;
    osc->sync_output_index = output_read_index;
    osc->sync_correction_index =
        (osc->sync_correction_index + 1) %
        MOOG_OSC_SYNC_CORRECTION_BUFFER_LENGTH;
    if (osc->sync_output_samples_processed <
        MOOG_OSC_SYNC_OUTPUT_DELAY_SAMPLES + 1)
    {
        ++osc->sync_output_samples_processed;
    }
    return delayed_output;
}

static void track_sync_event(
    MoogOscillator *osc,
    float frequency_hz,
    float waveform,
    double phase_increment,
    double samples_after_sync)
{
    const double event_time =
        (double)osc->sync_sample_count - samples_after_sync;
    if (osc->sync_event_seen)
    {
        const double period = event_time - osc->last_sync_event_time;
        if (osc->previous_sync_period > 0.0 &&
            fabs(period - osc->previous_sync_period) <=
                MOOG_OSC_SYNC_PERIOD_TOLERANCE_SAMPLES &&
            !osc->sync_series_active &&
            event_time - osc->first_sync_event_time >=
                MOOG_OSC_SYNC_OUTPUT_DELAY_SAMPLES &&
            moog_sync_series_prepare(
                &osc->sync_series,
                frequency_hz,
                waveform,
                phase_increment,
                period))
        {
            osc->sync_series_active = 1;
        }
        else if (osc->previous_sync_period > 0.0 &&
                 fabs(period - osc->previous_sync_period) >
                     MOOG_OSC_SYNC_PERIOD_TOLERANCE_SAMPLES)
        {
            osc->sync_series_active = 0;
            osc->first_sync_event_time = event_time;
            osc->previous_sync_period = 0.0;
        }
        else
        {
            osc->previous_sync_period = period;
        }
    }
    else
    {
        osc->first_sync_event_time = event_time;
        osc->sync_event_seen = 1;
    }
    osc->last_sync_event_time = event_time;
}

static void enqueue_edge_correction(
    MoogOscillator *osc,
    double event_distance_from_current,
    double phase_increment,
    double value_jump,
    double slope_jump,
    double curvature_jump)
{
    const double stable_curvature_jump =
        phase_increment < MOOG_OSC_SYNC_CURVATURE_MAX_PHASE_INCREMENT
            ? curvature_jump
            : 0.0;
    for (int32_t offset =
            -(int32_t)MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES;
         offset <= (int32_t)MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES;
         ++offset)
    {
        int32_t index =
            (int32_t)osc->sync_correction_index + offset;
        if (index < 0)
            index += MOOG_OSC_SYNC_CORRECTION_BUFFER_LENGTH;
        else if (index >= MOOG_OSC_SYNC_CORRECTION_BUFFER_LENGTH)
            index -= MOOG_OSC_SYNC_CORRECTION_BUFFER_LENGTH;
        const double distance_samples = offset - event_distance_from_current;
        const double correction = moog_waveform_sync_edge_correction(
            distance_samples,
            phase_increment,
            value_jump,
            slope_jump,
            stable_curvature_jump);
        osc->sync_correction_buffer[index] += (float)correction;
    }
}

static void enqueue_natural_edges(
    MoogOscillator *osc,
    double phase_start,
    double phase_end,
    double interval_end_distance,
    double phase_increment)
{
    if (phase_increment <= 0.0 || phase_increment >= MOOG_OSC_PHASE_CYCLE ||
        !isfinite(phase_increment) || phase_end <= phase_start)
        return;

    for (unsigned int i = 0; i < osc->waveform_cache.edge_count; ++i)
    {
        const MoogWaveformFourierEdge *edge = &osc->waveform_cache.edges[i];
        const int first_cycle =
            (int)floor(phase_start - edge->phase) + 1;
        const int last_cycle =
            (int)floor(phase_end - edge->phase);
        for (int cycle = first_cycle; cycle <= last_cycle; ++cycle)
        {
            const double edge_phase =
                edge->phase + cycle * MOOG_OSC_PHASE_CYCLE;
            const double event_distance_from_current =
                interval_end_distance -
                (phase_end - edge_phase) / phase_increment;
            const double curvature_jump =
                osc->waveform_cache.saw_weight != 0.0 &&
                        !osc->waveform_cache.harmonic_count_fallback &&
                        osc->waveform_cache.harmonic_count <=
                            MOOG_WAVEFORM_CACHE_HARMONIC_COUNT
                    ? 0.0
                    : edge->curvature_jump;
            enqueue_edge_correction(
                osc,
                event_distance_from_current,
                phase_increment,
                edge->value_jump,
                edge->slope_jump,
                curvature_jump);
        }
    }
}

static int render_uniform_block(
    MoogOscillator *osc,
    const float *frequency,
    const float *detune,
    float uniform_ratio,
    const float *waveform,
    float *output,
    uint32_t frames)
{
    if ((waveform != NULL && !block_is_uniform(waveform, frames)) ||
        (frequency != NULL && !block_is_uniform(frequency, frames)) ||
        (detune != NULL && !block_is_uniform(detune, frames)))
    {
        return 0;
    }

    const float waveform_value =
        waveform ? waveform[0] : MOOG_OSC_SAW_WAVEFORM;
    if (isnan(waveform_value))
        return 0;

    const float frequency_value =
        frequency ? frequency[0] : osc->frequency_hz;
    const float f = frequency_value * detune_ratio(detune, 0, uniform_ratio) *
                    osc->drift_ratio;
    if (waveform_value == MOOG_OSC_SAW_WAVEFORM)
    {
        const double increment =
            f > 0.0f && isfinite((double)f)
                ? (double)f * (1.0 / osc->sample_rate)
                : 0.0;
        const float p = moog_waveform_p(f);
        double phase = osc->phase;
        for (uint32_t i = 0; i < frames; ++i)
        {
            output[i] = moog_waveform_saw_unwrapped(phase, p);
            phase = wrap_phase(phase + increment);
        }
        osc->phase = phase;
        osc->previous_increment = increment;
        return 1;
    }

    const double phase_increment =
        f > 0.0f && isfinite((double)f)
            ? (double)f / osc->sample_rate
            : 0.0;
    if (phase_increment <= 0.0 || phase_increment >= 1.0)
        return 0;

    moog_waveform_cache_prepare(
        &osc->waveform_cache, f, waveform_value, phase_increment);
    double phase = wrap_phase(osc->phase);
    for (uint32_t i = 0; i < frames; ++i)
    {
        output[i] = moog_waveform_evaluate_prepared(phase, &osc->waveform_cache);
        phase += phase_increment;
        if (phase >= MOOG_OSC_PHASE_CYCLE)
            phase -= MOOG_OSC_PHASE_CYCLE;
    }
    osc->phase = phase;
    osc->previous_increment = phase_increment;
    return 1;
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
    if (sync == NULL)
    {
        osc->zero_sync_edge_handled = 0;
        osc->sync_tracking = 0;
        osc->sync_event_seen = 0;
        osc->sync_series_active = 0;
        if (osc->sync_output_samples_processed != 0)
            clear_sync_delay(osc);
    }
    if (sync == NULL &&
        render_uniform_block(
            osc,
            frequency,
            detune,
            uniform_ratio,
            waveform,
            output,
            frames))
    {
        return;
    }
    double phase = osc->phase;
    float prev_sync = osc->previous_sync;
    double previous_increment = osc->previous_increment;

    for (uint32_t i = 0; i < frames; ++i)
    {
        const float f = (frequency ? frequency[i] : osc->frequency_hz) *
                        detune_ratio(detune, i, uniform_ratio) * osc->drift_ratio;
        const double inc = (f > 0.0f && isfinite((double)f))
                               ? (double)f * inv_sample_rate
                               : 0.0;
        const float waveform_value =
            waveform ? waveform[i] : MOOG_OSC_SAW_WAVEFORM;

        const int new_waveform =
            waveform && waveform_value != MOOG_OSC_SAW_WAVEFORM &&
            !isnan(waveform_value);
        const double phase_start = wrap_phase(phase - previous_increment);

        if (sync)
        {
            if (!new_waveform || !osc->sync_tracking ||
                osc->sync_tracking_frequency != f ||
                osc->sync_tracking_waveform != waveform_value)
            {
                osc->sync_tracking = new_waveform;
                osc->sync_tracking_frequency = f;
                osc->sync_tracking_waveform = waveform_value;
                osc->sync_event_seen = 0;
                osc->sync_series_active = 0;
                osc->previous_sync_period = 0.0;
            }
            const float current_sync = sync[i];
            // New shapes consume an exact-zero edge here; legacy saw waits for positive sync.
            const int aligned_new_waveform_edge =
                new_waveform && prev_sync < 0.0f && current_sync == 0.0f;
            const int positive_sync_edge =
                prev_sync <= 0.0f && current_sync > 0.0f &&
                (!new_waveform || !osc->zero_sync_edge_handled);

            if (aligned_new_waveform_edge || positive_sync_edge)
            {
                const double delta = (double)current_sync - (double)prev_sync;
                double u = delta != 0.0 ? -(double)prev_sync / delta : 0.0;
                if (u < 0.0)
                    u = 0.0;
                if (u > 1.0)
                    u = 1.0;

                const double samples_after_sync = 1.0 - u;
                if (new_waveform)
                {
                    track_sync_event(
                        osc, f, waveform_value, inc, samples_after_sync);
                    moog_waveform_cache_prepare(
                        &osc->waveform_cache, f, waveform_value, inc);
                    const double phase_at_sync =
                        phase_start + u * previous_increment;
                    enqueue_natural_edges(
                        osc,
                        phase_start,
                        phase_at_sync,
                        -samples_after_sync,
                        previous_increment);
                    enqueue_natural_edges(
                        osc,
                        0.0,
                        samples_after_sync * inc,
                        0.0,
                        inc);

                    const double wrapped_phase_at_sync =
                        wrap_phase(phase_at_sync);
                    const double before_value = moog_waveform_evaluate(
                        wrapped_phase_at_sync, f, waveform_value);
                    const double after_value =
                        moog_waveform_evaluate(0.0, f, waveform_value);
                    const double before_slope =
                        (before_value -
                         moog_waveform_evaluate(
                             wrapped_phase_at_sync -
                                 MOOG_WAVEFORM_SYNC_SLOPE_FIT_DELTA,
                             f,
                             waveform_value)) /
                        MOOG_WAVEFORM_SYNC_SLOPE_FIT_DELTA;
                    const double after_slope =
                        (moog_waveform_evaluate(
                             MOOG_WAVEFORM_SYNC_SLOPE_FIT_DELTA,
                             f,
                             waveform_value) -
                         after_value) /
                        MOOG_WAVEFORM_SYNC_SLOPE_FIT_DELTA;
                    enqueue_edge_correction(
                        osc,
                        -samples_after_sync,
                        inc,
                        after_value - before_value,
                        after_slope - before_slope,
                        0.0);
                }
                phase = wrap_phase(samples_after_sync * inc);
            }
            else
            {
                if (osc->sync_series_active &&
                    (double)osc->sync_sample_count -
                            osc->last_sync_event_time >
                        osc->sync_series.period_samples +
                            MOOG_OSC_SYNC_PERIOD_TOLERANCE_SAMPLES)
                {
                    osc->sync_series_active = 0;
                    osc->sync_event_seen = 0;
                    osc->previous_sync_period = 0.0;
                }
                if (new_waveform)
                {
                    moog_waveform_cache_prepare(
                        &osc->waveform_cache, f, waveform_value, inc);
                    enqueue_natural_edges(
                        osc, phase_start, phase_start + previous_increment, 0.0,
                        previous_increment);
                }
            }

            if (!new_waveform || current_sync != 0.0f)
                osc->zero_sync_edge_handled = 0;
            else if (aligned_new_waveform_edge)
                osc->zero_sync_edge_handled = 1;
            prev_sync = current_sync;
        }
        else if (new_waveform)
        {
            moog_waveform_cache_prepare(
                &osc->waveform_cache, f, waveform_value, inc);
        }

        if (!waveform || waveform_value == MOOG_OSC_SAW_WAVEFORM ||
            isnan(waveform_value))
        {
            output[i] =
                moog_waveform_saw_unwrapped(phase, moog_waveform_p(f));
            if (osc->sync_output_samples_processed != 0)
                clear_sync_delay(osc);
        }
        else
        {
            const float waveform_output =
                sync ? moog_waveform_evaluate(phase, f, waveform_value) +
                           moog_waveform_sync_saw_bandlimit_correction(
                               phase, &osc->waveform_cache)
                     : moog_waveform_evaluate_bandlimited_cached(
                           phase, f, waveform_value, inc, &osc->waveform_cache);
            output[i] = sync
                            ? process_sync_delayed_sample(osc, waveform_output)
                            : waveform_output;
        }
        phase = wrap_phase(phase + inc);
        previous_increment = inc;
        if (sync)
            ++osc->sync_sample_count;
    }

    osc->phase = phase;
    osc->previous_sync = prev_sync;
    osc->previous_increment = previous_increment;
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
