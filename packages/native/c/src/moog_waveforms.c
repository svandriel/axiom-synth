#include "moog_waveforms.h"
#include "moog_oscillator_math.h"

#include <float.h>
#include <math.h>
#include <stdbool.h>
#include <stdatomic.h>

#define MOOG_WAVEFORM_P_EPSILON 1.0e-7f
#define MOOG_WAVEFORM_P_FIT_OFFSET 0.9924f
#define MOOG_WAVEFORM_P_FIT_SLOPE 0.00002151f
#define MOOG_WAVEFORM_MIN 0.0f
#define MOOG_WAVEFORM_MAX 5.0f
#define MOOG_WAVEFORM_SAW 2.0f
#define MOOG_WAVEFORM_ANCHOR_SHARKTOOTH 1.0f
#define MOOG_WAVEFORM_ANCHOR_SQUARE 3.0f
#define MOOG_WAVEFORM_ANCHOR_WIDE_PULSE 4.0f
#define MOOG_WAVEFORM_WIDE_PULSE_DUTY 0.75f
#define MOOG_WAVEFORM_NARROW_PULSE_DUTY 0.25f
#define MOOG_WAVEFORM_SQUARE_DUTY 0.5f
#define MOOG_WAVEFORM_DUTY_RANGE 0.5f
#define MOOG_WAVEFORM_TRIANGLE_MIDPOINT 0.5
#define MOOG_WAVEFORM_TRIANGLE_SLOPE 4.0
#define MOOG_WAVEFORM_TRIANGLE_DESCENDING_INTERCEPT 3.0
#define MOOG_WAVEFORM_SHARKTOOTH_PEAK 0.75
#define MOOG_WAVEFORM_SHAPE_AMPLITUDE 2.0
#define MOOG_WAVEFORM_CYCLE_LENGTH 1.0
#define MOOG_WAVEFORM_HALF 0.5
#define MOOG_WAVEFORM_DUTY_INCREMENT 0.25f
#define MOOG_WAVEFORM_HIGH_ACCURACY_DIRECT_MAX_HARMONICS 64U
#define MOOG_WAVEFORM_MORPH_TRIANGLE_SHARKTOOTH 1.0f
#define MOOG_WAVEFORM_MORPH_SHARK_SAW_MIDPOINT 1.5f
#define MOOG_WAVEFORM_MORPH_SAW_SQUARE_MIDPOINT 2.5f
#define MOOG_WAVEFORM_MORPH_SQUARE_WIDE_MIDPOINT 3.5f
#define MOOG_WAVEFORM_MORPH_SQUARE_WIDE_END 4.0f
#define MOOG_WAVEFORM_MORPH_WIDE_NARROW_MIDPOINT 4.5f
#define MOOG_WAVEFORM_FOURIER_MAX_HARMONICS 8192U
#define MOOG_WAVEFORM_FOURIER_SINGULAR_TOLERANCE 1e-6
#define MOOG_WAVEFORM_SINE_INTEGRAL_SERIES_LIMIT 16.0
#ifndef MOOG_WAVEFORM_EDGE_WINDOW_KAISER_BETA
#define MOOG_WAVEFORM_EDGE_WINDOW_KAISER_BETA 0.0
#endif
#define MOOG_WAVEFORM_EDGE_CORRECTION_RADIUS_SAMPLES \
    MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES

enum
{
    MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_RESOLUTION = 16,
    MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_LENGTH =
        MOOG_WAVEFORM_EDGE_CORRECTION_RADIUS_SAMPLES *
            MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_RESOLUTION +
        1,
};

#define MOOG_WAVEFORM_SHARKTOOTH_FALL_LENGTH \
    (MOOG_WAVEFORM_CYCLE_LENGTH - MOOG_WAVEFORM_SHARKTOOTH_PEAK)

static double step_residual_table[MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_LENGTH];
static double slope_residual_table[MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_LENGTH];
static double curvature_residual_table[
    MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_LENGTH];
static atomic_flag edge_table_initialization_lock = ATOMIC_FLAG_INIT;
static atomic_bool edge_tables_initialized;

enum
{
    MOOG_WAVEFORM_TRIANGLE_INDEX = 0,
    MOOG_WAVEFORM_SHARKTOOTH_INDEX = 1,
    MOOG_WAVEFORM_SAW_INDEX = 2,
    MOOG_WAVEFORM_SQUARE_INDEX = 3,
    MOOG_WAVEFORM_WIDE_PULSE_INDEX = 4,
    MOOG_WAVEFORM_NARROW_PULSE_INDEX = 5,
};

static float clamp_p(float p)
{
    if (p <= 0.0f)
        return MOOG_WAVEFORM_P_EPSILON;
    if (p >= 1.0f)
        return 1.0f - MOOG_WAVEFORM_P_EPSILON;
    return p;
}

static double waveform_coordinate(double phase, float p)
{
    phase = wrap_phase(phase);
    p = clamp_p(p);

    const double pd_amplitude = MOOG_OSC_PI - MOOG_OSC_TWO_PI * (double)p;
    double phi_mod;

    if (phase < (double)p)
    {
        phi_mod = pd_amplitude * phase / (double)p;
    }
    else
    {
        phi_mod = pd_amplitude * (1.0 - phase) / (1.0 - (double)p);
    }

    double q = (MOOG_OSC_TWO_PI * phase + phi_mod) / MOOG_OSC_TWO_PI;
    if (q >= 1.0)
        q = 0.0;
    return q;
}

float moog_waveform_p(float frequency_hz)
{
    if (!isfinite((double)frequency_hz))
        return 0.9924f;

    float p = MOOG_WAVEFORM_P_FIT_OFFSET -
              MOOG_WAVEFORM_P_FIT_SLOPE * frequency_hz;
    if (p < 0.0f)
        p = 0.0f;
    if (p > 1.0f)
        p = 1.0f;
    return p;
}

float moog_waveform_saw_unwrapped(double phase, float p)
{
    p = clamp_p(p);

    const double pd_amplitude = MOOG_OSC_PI - MOOG_OSC_TWO_PI * (double)p;
    double phi_mod;

    if (phase < (double)p)
    {
        phi_mod = pd_amplitude * phase / (double)p;
    }
    else
    {
        phi_mod = pd_amplitude * (1.0 - phase) / (1.0 - (double)p);
    }

    return (float)(-quadrant_cos(MOOG_OSC_TWO_PI * phase + phi_mod));
}

float moog_waveform_saw(double phase, float p)
{
    return moog_waveform_saw_unwrapped(wrap_phase(phase), p);
}

float moog_waveform_triangle(double phase, float p)
{
    const double q = waveform_coordinate(phase, p);
    return (float)(q < MOOG_WAVEFORM_TRIANGLE_MIDPOINT
                       ? -1.0 + MOOG_WAVEFORM_TRIANGLE_SLOPE * q
                       : MOOG_WAVEFORM_TRIANGLE_DESCENDING_INTERCEPT -
                             MOOG_WAVEFORM_TRIANGLE_SLOPE * q);
}

float moog_waveform_sharktooth(double phase, float p)
{
    const double q = waveform_coordinate(phase, p);
    const double peak_position = MOOG_WAVEFORM_SHARKTOOTH_PEAK;
    return (float)(q < peak_position
                       ? -1.0 + MOOG_WAVEFORM_SHAPE_AMPLITUDE * q / peak_position
                       : 1.0 - MOOG_WAVEFORM_SHAPE_AMPLITUDE * (q - peak_position) /
                                   (MOOG_WAVEFORM_CYCLE_LENGTH - peak_position));
}

float moog_waveform_pulse(double phase, float p, float duty)
{
    const double q = waveform_coordinate(phase, p);
    return q < MOOG_WAVEFORM_CYCLE_LENGTH - (double)duty ? -1.0f : 1.0f;
}

static float crossfade(float start, float end, float t)
{
    return (1.0f - t) * start + t * end;
}

float moog_waveform_morph_triangle_shark(double phase, float p, float t)
{
    if (t == 0.0f)
        return moog_waveform_triangle(phase, p);
    if (t == 1.0f)
        return moog_waveform_sharktooth(phase, p);
    return crossfade(
        moog_waveform_triangle(phase, p),
        moog_waveform_sharktooth(phase, p),
        t);
}

float moog_waveform_morph_shark_saw(double phase, float p, float t)
{
    if (t == 0.0f)
        return moog_waveform_sharktooth(phase, p);
    if (t == 1.0f)
        return moog_waveform_saw(phase, p);
    return crossfade(
        moog_waveform_sharktooth(phase, p),
        moog_waveform_saw(phase, p),
        t);
}

float moog_waveform_morph_saw_square(double phase, float p, float t)
{
    if (t == 0.0f)
        return moog_waveform_saw(phase, p);
    if (t == 1.0f)
        return moog_waveform_pulse(phase, p, MOOG_WAVEFORM_SQUARE_DUTY);
    return crossfade(
        moog_waveform_saw(phase, p),
        moog_waveform_pulse(phase, p, MOOG_WAVEFORM_SQUARE_DUTY),
        t);
}

float moog_waveform_morph_square_wide(double phase, float p, float t)
{
    if (t == 0.0f)
        return moog_waveform_pulse(phase, p, MOOG_WAVEFORM_SQUARE_DUTY);
    if (t == 1.0f)
        return moog_waveform_pulse(phase, p, MOOG_WAVEFORM_WIDE_PULSE_DUTY);
    const float duty = MOOG_WAVEFORM_SQUARE_DUTY + MOOG_WAVEFORM_DUTY_INCREMENT * t;
    return moog_waveform_pulse(phase, p, duty);
}

float moog_waveform_morph_wide_narrow(double phase, float p, float t)
{
    if (t == 0.0f)
        return moog_waveform_pulse(phase, p, MOOG_WAVEFORM_WIDE_PULSE_DUTY);
    if (t == 1.0f)
        return moog_waveform_pulse(phase, p, MOOG_WAVEFORM_NARROW_PULSE_DUTY);
    const float duty = MOOG_WAVEFORM_WIDE_PULSE_DUTY - MOOG_WAVEFORM_DUTY_RANGE * t;
    return moog_waveform_pulse(phase, p, duty);
}

static float evaluate_anchor(double phase, float p, float waveform)
{
    switch ((int)waveform)
    {
    case MOOG_WAVEFORM_TRIANGLE_INDEX:
        return moog_waveform_triangle(phase, p);
    case MOOG_WAVEFORM_SHARKTOOTH_INDEX:
        return moog_waveform_sharktooth(phase, p);
    case MOOG_WAVEFORM_SAW_INDEX:
        return moog_waveform_saw(phase, p);
    case MOOG_WAVEFORM_SQUARE_INDEX:
        return moog_waveform_pulse(phase, p, MOOG_WAVEFORM_SQUARE_DUTY);
    case MOOG_WAVEFORM_WIDE_PULSE_INDEX:
        return moog_waveform_pulse(phase, p, MOOG_WAVEFORM_WIDE_PULSE_DUTY);
    default:
        return moog_waveform_pulse(phase, p, MOOG_WAVEFORM_NARROW_PULSE_DUTY);
    }
}

static float evaluate_bandlimited_raw(double phase, float p, float waveform)
{
    if (phase < 0.0 || phase >= MOOG_WAVEFORM_CYCLE_LENGTH)
        phase = wrap_phase(phase);
    const double pd_amplitude = MOOG_OSC_PI - MOOG_OSC_TWO_PI * (double)p;
    const double phi_mod =
        phase < (double)p
            ? pd_amplitude * phase / (double)p
            : pd_amplitude * (1.0 - phase) / (1.0 - (double)p);
    double q = (MOOG_OSC_TWO_PI * phase + phi_mod) / MOOG_OSC_TWO_PI;
    if (q >= MOOG_WAVEFORM_CYCLE_LENGTH)
        q = 0.0;

    const int interval =
        waveform >= MOOG_WAVEFORM_MAX ? MOOG_WAVEFORM_WIDE_PULSE_INDEX
                                      : (int)waveform;
    const float t = waveform - (float)interval;

    switch (interval)
    {
    case MOOG_WAVEFORM_TRIANGLE_INDEX:
    {
        const double triangle =
            q < MOOG_WAVEFORM_TRIANGLE_MIDPOINT
                ? -1.0 + MOOG_WAVEFORM_TRIANGLE_SLOPE * q
                : MOOG_WAVEFORM_TRIANGLE_DESCENDING_INTERCEPT -
                      MOOG_WAVEFORM_TRIANGLE_SLOPE * q;
        const double sharktooth =
            q < MOOG_WAVEFORM_SHARKTOOTH_PEAK
                ? -1.0 + MOOG_WAVEFORM_SHAPE_AMPLITUDE * q /
                             MOOG_WAVEFORM_SHARKTOOTH_PEAK
                : 1.0 - MOOG_WAVEFORM_SHAPE_AMPLITUDE *
                            (q - MOOG_WAVEFORM_SHARKTOOTH_PEAK) /
                            MOOG_WAVEFORM_SHARKTOOTH_FALL_LENGTH;
        return crossfade((float)triangle, (float)sharktooth, t);
    }
    case MOOG_WAVEFORM_SHARKTOOTH_INDEX:
    {
        const double sharktooth =
            q < MOOG_WAVEFORM_SHARKTOOTH_PEAK
                ? -1.0 + MOOG_WAVEFORM_SHAPE_AMPLITUDE * q /
                             MOOG_WAVEFORM_SHARKTOOTH_PEAK
                : 1.0 - MOOG_WAVEFORM_SHAPE_AMPLITUDE *
                            (q - MOOG_WAVEFORM_SHARKTOOTH_PEAK) /
                            MOOG_WAVEFORM_SHARKTOOTH_FALL_LENGTH;
        const float saw = (float)-quadrant_cos(MOOG_OSC_TWO_PI * q);
        return crossfade((float)sharktooth, saw, t);
    }
    case MOOG_WAVEFORM_SAW_INDEX:
    {
        const float saw = (float)-quadrant_cos(MOOG_OSC_TWO_PI * q);
        const float square =
            q < MOOG_WAVEFORM_CYCLE_LENGTH - MOOG_WAVEFORM_SQUARE_DUTY
                ? -1.0f
                : 1.0f;
        return crossfade(saw, square, t);
    }
    case MOOG_WAVEFORM_SQUARE_INDEX:
    {
        const float duty =
            MOOG_WAVEFORM_SQUARE_DUTY + MOOG_WAVEFORM_DUTY_INCREMENT * t;
        return q < MOOG_WAVEFORM_CYCLE_LENGTH - (double)duty ? -1.0f : 1.0f;
    }
    default:
    {
        const float duty =
            MOOG_WAVEFORM_WIDE_PULSE_DUTY - MOOG_WAVEFORM_DUTY_RANGE * t;
        return q < MOOG_WAVEFORM_CYCLE_LENGTH - (double)duty ? -1.0f : 1.0f;
    }
    }
}

float moog_waveform_evaluate(double phase, float frequency_hz, float waveform)
{
    if (isnan(waveform))
        waveform = MOOG_WAVEFORM_SAW;
    else if (waveform < 0.0f)
        waveform = 0.0f;
    else if (waveform > MOOG_WAVEFORM_MAX)
        waveform = MOOG_WAVEFORM_MAX;

    const float p = moog_waveform_p(frequency_hz);
    if (waveform == MOOG_WAVEFORM_SAW)
        return moog_waveform_saw(phase, p);

    if (waveform == MOOG_WAVEFORM_MIN ||
        waveform == MOOG_WAVEFORM_ANCHOR_SHARKTOOTH ||
        waveform == MOOG_WAVEFORM_ANCHOR_SQUARE ||
        waveform == MOOG_WAVEFORM_ANCHOR_WIDE_PULSE ||
        waveform == MOOG_WAVEFORM_MAX)
    {
        return evaluate_anchor(phase, p, waveform);
    }

    const int interval = (int)waveform;
    const float t = waveform - (float)interval;
    switch (interval)
    {
    case MOOG_WAVEFORM_TRIANGLE_INDEX:
        return moog_waveform_morph_triangle_shark(phase, p, t);
    case MOOG_WAVEFORM_SHARKTOOTH_INDEX:
        return moog_waveform_morph_shark_saw(phase, p, t);
    case MOOG_WAVEFORM_SAW_INDEX:
        return moog_waveform_morph_saw_square(phase, p, t);
    case MOOG_WAVEFORM_SQUARE_INDEX:
        return moog_waveform_morph_square_wide(phase, p, t);
    default:
        return moog_waveform_morph_wide_narrow(phase, p, t);
    }
}

static double waveform_phase_for_coordinate(double q, float p)
{
    if (q < MOOG_WAVEFORM_TRIANGLE_MIDPOINT)
        return 2.0 * (double)p * q;
    return 2.0 * (1.0 - (double)p) * q + 2.0 * (double)p - 1.0;
}

static void add_fourier_edge(
    MoogWaveformCache *shape,
    double phase,
    double slope_jump,
    double value_jump)
{
    for (unsigned int i = 0; i < shape->edge_count; ++i)
    {
        if (shape->edges[i].phase == phase)
        {
            shape->edges[i].slope_jump += slope_jump;
            shape->edges[i].value_jump += value_jump;
            return;
        }
    }

    if (shape->edge_count < sizeof(shape->edges) / sizeof(shape->edges[0]))
    {
        MoogWaveformFourierEdge *edge = &shape->edges[shape->edge_count++];
        edge->phase = phase;
        edge->curvature_jump = 0.0;
        edge->slope_jump = slope_jump;
        edge->value_jump = value_jump;
    }
}

static void add_fourier_curvature_jump(
    MoogWaveformCache *shape, double phase, double curvature_jump)
{
    for (unsigned int i = 0; i < shape->edge_count; ++i)
    {
        if (shape->edges[i].phase == phase)
        {
            shape->edges[i].curvature_jump += curvature_jump;
            return;
        }
    }

    if (shape->edge_count < sizeof(shape->edges) / sizeof(shape->edges[0]))
    {
        MoogWaveformFourierEdge *edge = &shape->edges[shape->edge_count++];
        edge->phase = phase;
        edge->curvature_jump = curvature_jump;
        edge->slope_jump = 0.0;
        edge->value_jump = 0.0;
    }
}

static void add_triangle_edges(
    MoogWaveformCache *shape, float p, double weight)
{
    const double slope_jump =
        MOOG_WAVEFORM_TRIANGLE_SLOPE *
        (1.0 / (double)p + 1.0 / (1.0 - (double)p)) *
        MOOG_WAVEFORM_HALF;
    add_fourier_edge(shape, 0.0, weight * slope_jump, 0.0);
    add_fourier_edge(shape, (double)p, -weight * slope_jump, 0.0);
}

static void add_sharktooth_edges(
    MoogWaveformCache *shape, float p, double weight)
{
    const double first_slope =
        MOOG_WAVEFORM_SHAPE_AMPLITUDE /
        (MOOG_WAVEFORM_SHARKTOOTH_PEAK * 2.0 * (double)p);
    const double second_slope =
        MOOG_WAVEFORM_SHAPE_AMPLITUDE /
        (MOOG_WAVEFORM_SHARKTOOTH_PEAK * 2.0 * (1.0 - (double)p));
    const double last_slope =
        -MOOG_WAVEFORM_SHAPE_AMPLITUDE /
        (MOOG_WAVEFORM_SHARKTOOTH_FALL_LENGTH * 2.0 * (1.0 - (double)p));
    const double peak_phase =
        waveform_phase_for_coordinate(MOOG_WAVEFORM_SHARKTOOTH_PEAK, p);
    const double wrap_jump = first_slope - last_slope;
    const double phase_fit_jump = second_slope - first_slope;
    const double peak_jump = last_slope - second_slope;

    shape->dc += weight * (1.0 - 2.0 * (double)p) / 3.0;
    add_fourier_edge(shape, 0.0, weight * wrap_jump, 0.0);
    add_fourier_edge(shape, (double)p, weight * phase_fit_jump, 0.0);
    add_fourier_edge(shape, peak_phase, weight * peak_jump, 0.0);
}

static void build_fourier_shape(
    MoogWaveformCache *shape, float p, float waveform)
{
    double triangle_weight = 0.0;
    double sharktooth_weight = 0.0;
    double pulse_weight = 0.0;
    double duty = MOOG_WAVEFORM_SQUARE_DUTY;

    if (waveform < MOOG_WAVEFORM_ANCHOR_SHARKTOOTH)
    {
        const double t = (double)waveform;
        triangle_weight = 1.0 - t;
        sharktooth_weight = t;
    }
    else if (waveform < MOOG_WAVEFORM_SAW)
    {
        const double t = (double)waveform - MOOG_WAVEFORM_ANCHOR_SHARKTOOTH;
        sharktooth_weight = 1.0 - t;
        shape->saw_weight = t;
    }
    else if (waveform < MOOG_WAVEFORM_ANCHOR_SQUARE)
    {
        const double t = (double)waveform - MOOG_WAVEFORM_SAW;
        shape->saw_weight = 1.0 - t;
        pulse_weight = t;
    }
    else if (waveform < MOOG_WAVEFORM_ANCHOR_WIDE_PULSE)
    {
        pulse_weight = 1.0;
        duty = (double)MOOG_WAVEFORM_SQUARE_DUTY +
               (double)MOOG_WAVEFORM_DUTY_INCREMENT *
                   ((double)waveform - MOOG_WAVEFORM_ANCHOR_SQUARE);
    }
    else
    {
        pulse_weight = 1.0;
        duty = (double)MOOG_WAVEFORM_WIDE_PULSE_DUTY -
               (double)MOOG_WAVEFORM_DUTY_RANGE *
                   ((double)waveform - MOOG_WAVEFORM_ANCHOR_WIDE_PULSE);
    }

    if (triangle_weight != 0.0)
        add_triangle_edges(shape, p, triangle_weight);
    if (sharktooth_weight != 0.0)
        add_sharktooth_edges(shape, p, sharktooth_weight);

    if (shape->saw_weight != 0.0)
    {
        const double second_coordinate_slope =
            MOOG_WAVEFORM_HALF / (1.0 - (double)p);
        const double first_coordinate_slope =
            MOOG_WAVEFORM_HALF / (double)p;
        const double saw_curvature_jump =
            MOOG_OSC_TWO_PI * MOOG_OSC_TWO_PI *
            (first_coordinate_slope * first_coordinate_slope -
             second_coordinate_slope * second_coordinate_slope) *
            shape->saw_weight;
        add_fourier_curvature_jump(shape, 0.0, saw_curvature_jump);
        add_fourier_curvature_jump(shape, (double)p, saw_curvature_jump);
    }

    if (pulse_weight != 0.0)
    {
        const double edge_phase = waveform_phase_for_coordinate(1.0 - duty, p);
        shape->dc += pulse_weight * (1.0 - 2.0 * edge_phase);
        add_fourier_edge(shape, 0.0, 0.0, -2.0 * pulse_weight);
        add_fourier_edge(shape, edge_phase, 0.0, 2.0 * pulse_weight);
    }
}

static void build_fourier_coefficients(MoogWaveformCache *shape)
{
    for (unsigned int harmonic = 1;
         harmonic <= shape->harmonic_count;
         ++harmonic)
    {
        const double omega = MOOG_OSC_TWO_PI * (double)harmonic;
        double cosine_coefficient = 0.0;
        double sine_coefficient = 0.0;

        for (unsigned int edge_index = 0;
             edge_index < shape->edge_count;
             ++edge_index)
        {
            const MoogWaveformFourierEdge *edge = &shape->edges[edge_index];
            const double angle = omega * edge->phase;
            const double edge_cosine = cos(angle);
            const double edge_sine = sin(angle);
            cosine_coefficient -=
                2.0 * edge->slope_jump * edge_cosine / (omega * omega);
            sine_coefficient -=
                2.0 * edge->slope_jump * edge_sine / (omega * omega);
            cosine_coefficient -=
                2.0 * edge->value_jump * edge_sine / omega;
            sine_coefficient +=
                2.0 * edge->value_jump * edge_cosine / omega;
        }

        shape->cosine_coefficients[harmonic - 1] = cosine_coefficient;
        shape->sine_coefficients[harmonic - 1] = sine_coefficient;
    }
}

static void build_saw_half_angle(MoogWaveformCache *shape, float p)
{
    const double angle = MOOG_OSC_PI * (double)p;
    shape->saw_half_cosine = quadrant_cos(angle);
    shape->saw_half_sine = quadrant_cos(angle - MOOG_OSC_HALF_PI);
}

static int requires_high_accuracy_fourier(float waveform)
{
    return waveform == MOOG_WAVEFORM_MORPH_TRIANGLE_SHARKTOOTH ||
           waveform == MOOG_WAVEFORM_MORPH_SHARK_SAW_MIDPOINT ||
           waveform == MOOG_WAVEFORM_MORPH_SAW_SQUARE_MIDPOINT ||
           waveform == MOOG_WAVEFORM_MORPH_SQUARE_WIDE_MIDPOINT ||
           waveform == MOOG_WAVEFORM_ANCHOR_SQUARE ||
           waveform == MOOG_WAVEFORM_MORPH_SQUARE_WIDE_END ||
           waveform == MOOG_WAVEFORM_MORPH_WIDE_NARROW_MIDPOINT ||
           waveform == MOOG_WAVEFORM_MAX;
}

static int uses_direct_fourier(const MoogWaveformCache *cache)
{
    return cache->harmonic_count <= MOOG_WAVEFORM_DIRECT_HARMONIC_LIMIT ||
           (cache->harmonic_count <=
                MOOG_WAVEFORM_HIGH_ACCURACY_DIRECT_MAX_HARMONICS &&
            requires_high_accuracy_fourier(cache->waveform));
}

static double saw_harmonic(
    float p,
    unsigned int harmonic,
    double phase_sine,
    double half_phase_cosine)
{
    const double k = (double)harmonic;
    const double first_slope = 1.0 / (2.0 * (double)p);
    const double second_slope = 1.0 / (2.0 * (1.0 - (double)p));
    const double first_denominator = first_slope * first_slope - k * k;
    const double second_denominator = second_slope * second_slope - k * k;
    double first_ratio;
    double second_ratio;

    if (fabs(first_slope - k) <=
        MOOG_WAVEFORM_FOURIER_SINGULAR_TOLERANCE * fmax(first_slope, k))
    {
        first_ratio = MOOG_OSC_PI / (4.0 * k * k);
    }
    else
    {
        first_ratio = half_phase_cosine / first_denominator;
    }

    if (fabs(second_slope - k) <=
        MOOG_WAVEFORM_FOURIER_SINGULAR_TOLERANCE * fmax(second_slope, k))
    {
        const double parity = (harmonic & 1U) == 0U ? 1.0 : -1.0;
        second_ratio = parity * MOOG_OSC_PI / (4.0 * k * k);
    }
    else
    {
        second_ratio = half_phase_cosine / second_denominator;
    }

    return (2.0 * k / MOOG_OSC_PI) * phase_sine *
           (first_ratio - second_ratio);
}

float moog_waveform_sync_saw_bandlimit_correction(
    double phase, const MoogWaveformCache *cache)
{
    if (cache == NULL || !cache->initialized ||
        !cache->harmonic_count_initialized || cache->saw_weight == 0.0 ||
        cache->harmonic_count_fallback ||
        cache->harmonic_count > MOOG_WAVEFORM_CACHE_HARMONIC_COUNT)
    {
        return 0.0f;
    }

    const double normalized_phase =
        phase < 0.0 || phase >= MOOG_WAVEFORM_CYCLE_LENGTH
            ? wrap_phase(phase)
            : phase;
    const double phase_angle =
        MOOG_OSC_TWO_PI * normalized_phase -
        MOOG_OSC_PI * (double)cache->p;
    double phase_cosine_step;
    double phase_sine_step;
    quadrant_sincos(
        phase_angle, &phase_cosine_step, &phase_sine_step);

    double phase_cosine = 1.0;
    double phase_sine = 0.0;
    double half_cosine_step = cache->saw_half_cosine;
    double half_sine_step = cache->saw_half_sine;
    double half_cosine = 1.0;
    double half_sine = 0.0;
    double bandlimited_saw = 0.0;

    for (unsigned int harmonic = 1;
         harmonic <= cache->harmonic_count;
         ++harmonic)
    {
        const double previous_phase_cosine = phase_cosine;
        const double previous_phase_sine = phase_sine;
        phase_cosine =
            previous_phase_cosine * phase_cosine_step -
            previous_phase_sine * phase_sine_step;
        phase_sine =
            previous_phase_sine * phase_cosine_step +
            previous_phase_cosine * phase_sine_step;

        const double previous_half_cosine = half_cosine;
        const double previous_half_sine = half_sine;
        half_cosine =
            previous_half_cosine * half_cosine_step -
            previous_half_sine * half_sine_step;
        half_sine =
            previous_half_sine * half_cosine_step +
            previous_half_cosine * half_sine_step;

        bandlimited_saw += saw_harmonic(
            cache->p, harmonic, phase_sine, half_cosine);
    }

    const double q = waveform_coordinate(normalized_phase, cache->p);
    const double raw_saw = -quadrant_cos(MOOG_OSC_TWO_PI * q);
    return (float)(cache->saw_weight *
                   (bandlimited_saw - raw_saw));
}

static double sine_integral(double value)
{
    const double sign = value < 0.0 ? -1.0 : 1.0;
    const double z = fabs(value);
    if (z == 0.0)
        return 0.0;

    if (z <= MOOG_WAVEFORM_SINE_INTEGRAL_SERIES_LIMIT)
    {
        double term = z;
        double sum = term;
        for (unsigned int n = 1; n < 128; ++n)
        {
            const double order = (double)n;
            term *= -z * z * (2.0 * order - 1.0) /
                    (2.0 * order * (2.0 * order + 1.0) *
                     (2.0 * order + 1.0));
            sum += term;
            if (fabs(term) <= DBL_EPSILON * fabs(sum))
                break;
        }
        return sign * sum;
    }

    const double inverse_square = 1.0 / (z * z);
    double even_term = 1.0;
    double odd_term = 1.0;
    double even_sum = even_term;
    double odd_sum = odd_term;

    for (unsigned int n = 1; n < 128; ++n)
    {
        const double order = (double)n;
        const double next_even =
            even_term * -(2.0 * order) * (2.0 * order - 1.0) *
            inverse_square;
        if (fabs(next_even) > fabs(even_term))
            break;
        even_term = next_even;
        even_sum += even_term;

        const double next_odd =
            odd_term * -(2.0 * order + 1.0) * (2.0 * order) *
            inverse_square;
        if (fabs(next_odd) > fabs(odd_term))
            break;
        odd_term = next_odd;
        odd_sum += odd_term;
    }

    return sign * (MOOG_OSC_PI * MOOG_WAVEFORM_HALF -
                   cos(z) * even_sum / z -
                   sin(z) * odd_sum * inverse_square);
}

static double modified_bessel_i0(double value)
{
    const double quarter_square = value * value * 0.25;
    double term = 1.0;
    double sum = term;
    for (unsigned int order = 1; order < 64; ++order)
    {
        const double divisor = (double)order;
        term *= quarter_square / (divisor * divisor);
        sum += term;
        if (term <= DBL_EPSILON * sum)
            break;
    }
    return sum;
}

static double edge_correction_window(double distance_samples)
{
    const double normalized_distance =
        distance_samples / MOOG_WAVEFORM_EDGE_CORRECTION_RADIUS_SAMPLES;
    const double kaiser_argument =
        MOOG_WAVEFORM_EDGE_WINDOW_KAISER_BETA *
        sqrt(fmax(0.0, 1.0 - normalized_distance * normalized_distance));
    return modified_bessel_i0(kaiser_argument) /
           modified_bessel_i0(MOOG_WAVEFORM_EDGE_WINDOW_KAISER_BETA);
}

static double calculate_step_residual(double distance_samples)
{
    const double angular_cutoff =
        MOOG_OSC_TWO_PI * MOOG_WAVEFORM_FOURIER_CUTOFF;
    const double residual =
        sine_integral(angular_cutoff * distance_samples) / MOOG_OSC_PI -
        MOOG_WAVEFORM_HALF;
    return residual * edge_correction_window(distance_samples);
}

static double calculate_slope_residual(double distance_samples)
{
    const double angular_cutoff =
        MOOG_OSC_TWO_PI * MOOG_WAVEFORM_FOURIER_CUTOFF;
    const double sine_integral_value =
        sine_integral(angular_cutoff * distance_samples);
    const double primitive =
        -MOOG_WAVEFORM_HALF * distance_samples +
        (distance_samples * sine_integral_value +
         cos(angular_cutoff * distance_samples) / angular_cutoff) /
            MOOG_OSC_PI;
    return primitive * edge_correction_window(distance_samples);
}

void moog_waveform_initialize(void)
{
    if (atomic_load_explicit(&edge_tables_initialized, memory_order_acquire))
        return;

    while (atomic_flag_test_and_set_explicit(
        &edge_table_initialization_lock, memory_order_acquire))
    {
    }

    if (!atomic_load_explicit(&edge_tables_initialized, memory_order_relaxed))
    {
        for (unsigned int index = 0;
             index < MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_LENGTH;
             ++index)
        {
            const double distance =
                (double)index / MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_RESOLUTION;
            step_residual_table[index] = calculate_step_residual(distance);
            slope_residual_table[index] = calculate_slope_residual(distance);
        }
        curvature_residual_table[
            MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_LENGTH - 1] = 0.0;
        const double table_step =
            1.0 / MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_RESOLUTION;
        for (unsigned int index =
                 MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_LENGTH - 1;
             index > 0;
             --index)
        {
            const double area =
                (slope_residual_table[index] +
                 slope_residual_table[index - 1]) *
                MOOG_WAVEFORM_HALF * table_step;
            curvature_residual_table[index - 1] =
                curvature_residual_table[index] - area;
        }
        atomic_store_explicit(&edge_tables_initialized, true, memory_order_release);
    }

    atomic_flag_clear_explicit(
        &edge_table_initialization_lock, memory_order_release);
}

static double interpolate_residual(
    double distance_samples, const double *table)
{
    const double distance = fabs(distance_samples);
    if (distance >= MOOG_WAVEFORM_EDGE_CORRECTION_RADIUS_SAMPLES)
        return 0.0;

    const double position =
        distance * MOOG_WAVEFORM_EDGE_CORRECTION_TABLE_RESOLUTION;
    const unsigned int index = (unsigned int)position;
    const double fraction = position - index;
    return table[index] + fraction * (table[index + 1] - table[index]);
}

static double bandlimit_step_residual(double distance_samples)
{
    const double residual =
        interpolate_residual(distance_samples, step_residual_table);
    return distance_samples < 0.0 ? -residual : residual;
}

static double bandlimit_slope_residual(double distance_samples)
{
    return interpolate_residual(distance_samples, slope_residual_table);
}

static double bandlimit_curvature_residual(double distance_samples)
{
    const double residual =
        interpolate_residual(distance_samples, curvature_residual_table);
    return distance_samples < 0.0 ? -residual : residual;
}

float moog_waveform_sync_edge_correction(
    double distance_samples,
    double phase_increment,
    double value_jump,
    double slope_jump,
    double curvature_jump)
{
    return (float)(
        value_jump * bandlimit_step_residual(distance_samples) +
        slope_jump * phase_increment *
            bandlimit_slope_residual(distance_samples) +
        curvature_jump * phase_increment * phase_increment *
            bandlimit_curvature_residual(distance_samples));
}

static double edge_bandlimit_correction(
    double phase, const MoogWaveformCache *shape)
{
    double correction = 0.0;

    for (unsigned int edge_index = 0; edge_index < shape->edge_count; ++edge_index)
    {
        const double base_phase_distance =
            phase - shape->edges[edge_index].phase;
        const int first_cycle = (int)ceil(
            -shape->correction_phase_radius - base_phase_distance);
        const int last_cycle = (int)floor(
            shape->correction_phase_radius - base_phase_distance);
        for (int cycle = first_cycle; cycle <= last_cycle; ++cycle)
        {
            const double phase_distance =
                base_phase_distance + cycle * MOOG_WAVEFORM_CYCLE_LENGTH;
            const double distance_samples =
                phase_distance * shape->inverse_phase_increment;

            if (shape->edges[edge_index].value_jump != 0.0)
            {
                correction += shape->edges[edge_index].value_jump *
                              bandlimit_step_residual(distance_samples);
            }
            if (shape->edges[edge_index].slope_jump != 0.0)
            {
                correction += shape->edges[edge_index].slope_jump *
                              shape->phase_increment *
                              bandlimit_slope_residual(distance_samples);
            }
            if (shape->edges[edge_index].curvature_jump != 0.0)
            {
                correction += shape->edges[edge_index].curvature_jump *
                              shape->phase_increment *
                              shape->phase_increment *
                              bandlimit_curvature_residual(distance_samples);
            }
        }
    }
    return correction;
}

void moog_waveform_cache_prepare(
    MoogWaveformCache *cache,
    float frequency_hz,
    float waveform,
    double phase_increment)
{
    if (cache == NULL || isnan(waveform) ||
        waveform == MOOG_WAVEFORM_SAW ||
        !isfinite(phase_increment) || phase_increment <= 0.0)
    {
        return;
    }

    if (waveform < MOOG_WAVEFORM_MIN)
        waveform = MOOG_WAVEFORM_MIN;
    else if (waveform > MOOG_WAVEFORM_MAX)
        waveform = MOOG_WAVEFORM_MAX;

    const int shape_changed =
        !cache->initialized || cache->frequency_hz != frequency_hz ||
        cache->waveform != waveform;
    if (shape_changed)
    {
        const float p = clamp_p(moog_waveform_p(frequency_hz));
        cache->dc = 0.0;
        cache->saw_weight = 0.0;
        cache->edge_count = 0;
        build_fourier_shape(cache, p, waveform);
        build_saw_half_angle(cache, p);
        cache->p = p;
        cache->frequency_hz = frequency_hz;
        cache->waveform = waveform;
        cache->initialized = 1;
    }

    const int increment_changed =
        !cache->harmonic_count_initialized ||
        cache->phase_increment != phase_increment;
    if (increment_changed)
    {
        const double harmonic_limit =
            floor(MOOG_WAVEFORM_FOURIER_CUTOFF / phase_increment);
        cache->harmonic_count_fallback =
            !isfinite(harmonic_limit) ||
            harmonic_limit > MOOG_WAVEFORM_FOURIER_MAX_HARMONICS;
        cache->harmonic_count =
            !cache->harmonic_count_fallback && harmonic_limit > 0.0
                ? (unsigned int)harmonic_limit
                : 0;
        cache->phase_increment = phase_increment;
        cache->inverse_phase_increment = 1.0 / phase_increment;
        cache->correction_phase_radius =
            MOOG_WAVEFORM_EDGE_CORRECTION_RADIUS_SAMPLES * phase_increment;
        cache->harmonic_count_initialized = 1;
    }
    if ((shape_changed || increment_changed) &&
        !cache->harmonic_count_fallback &&
        cache->harmonic_count <= MOOG_WAVEFORM_CACHE_HARMONIC_COUNT &&
        uses_direct_fourier(cache))
    {
        build_fourier_coefficients(cache);
    }
}

float moog_waveform_evaluate_prepared(
    double phase, const MoogWaveformCache *cache)
{
    if (cache == NULL || !cache->initialized ||
        !cache->harmonic_count_initialized)
    {
        return 0.0f;
    }

    const float frequency_hz = cache->frequency_hz;
    const float waveform = cache->waveform;
    const float p = cache->p;
    const unsigned int harmonic_count = cache->harmonic_count;
    if (cache->harmonic_count_fallback)
        return moog_waveform_evaluate(phase, frequency_hz, waveform);
    if (harmonic_count == 0)
        return (float)cache->dc;

    const int use_fourier = uses_direct_fourier(cache);
    if (!use_fourier ||
        harmonic_count > MOOG_WAVEFORM_CACHE_HARMONIC_COUNT)
    {
        return evaluate_bandlimited_raw(phase, p, waveform) +
               (float)edge_bandlimit_correction(phase, cache);
    }

    const double normalized_phase =
        phase < 0.0 || phase >= MOOG_WAVEFORM_CYCLE_LENGTH
            ? wrap_phase(phase)
            : phase;
    const double phase_angle = MOOG_OSC_TWO_PI * normalized_phase;
    double phase_cosine_step;
    double phase_sine_step;
    quadrant_sincos(
        phase_angle, &phase_cosine_step, &phase_sine_step);
    double phase_cosine = 1.0;
    double phase_sine = 0.0;

    double saw_phase_cosine_step = 0.0;
    double saw_phase_sine_step = 0.0;
    double saw_half_cosine_step = 0.0;
    double saw_half_sine_step = 0.0;
    if (cache->saw_weight != 0.0)
    {
        const double saw_phase_angle =
            phase_angle - MOOG_OSC_PI * (double)p;
        quadrant_sincos(
            saw_phase_angle, &saw_phase_cosine_step, &saw_phase_sine_step);
        saw_half_cosine_step = cache->saw_half_cosine;
        saw_half_sine_step = cache->saw_half_sine;
    }
    double saw_phase_cosine = 1.0;
    double saw_phase_sine = 0.0;
    double saw_half_cosine = 1.0;
    double saw_half_sine = 0.0;
    double output = cache->dc;

    for (unsigned int harmonic = 1; harmonic <= harmonic_count; ++harmonic)
    {
        const double previous_phase_cosine = phase_cosine;
        const double previous_phase_sine = phase_sine;
        phase_cosine =
            previous_phase_cosine * phase_cosine_step -
            previous_phase_sine * phase_sine_step;
        phase_sine =
            previous_phase_sine * phase_cosine_step +
            previous_phase_cosine * phase_sine_step;
        output += cache->cosine_coefficients[harmonic - 1] * phase_cosine +
                  cache->sine_coefficients[harmonic - 1] * phase_sine;

        if (cache->saw_weight != 0.0)
        {
            const double previous_saw_phase_cosine = saw_phase_cosine;
            const double previous_saw_phase_sine = saw_phase_sine;
            const double previous_saw_half_cosine = saw_half_cosine;
            const double previous_saw_half_sine = saw_half_sine;
            saw_phase_cosine =
                previous_saw_phase_cosine * saw_phase_cosine_step -
                previous_saw_phase_sine * saw_phase_sine_step;
            saw_phase_sine =
                previous_saw_phase_sine * saw_phase_cosine_step +
                previous_saw_phase_cosine * saw_phase_sine_step;
            saw_half_cosine =
                previous_saw_half_cosine * saw_half_cosine_step -
                previous_saw_half_sine * saw_half_sine_step;
            saw_half_sine =
                previous_saw_half_sine * saw_half_cosine_step +
                previous_saw_half_cosine * saw_half_sine_step;
            output += cache->saw_weight * saw_harmonic(
                                             p,
                                             harmonic,
                                             saw_phase_sine,
                                             saw_half_cosine);
        }
    }
    return (float)output;
}

float moog_waveform_evaluate_bandlimited_cached(
    double phase,
    float frequency_hz,
    float waveform,
    double phase_increment,
    MoogWaveformCache *cache)
{
    if (isnan(waveform))
        return moog_waveform_evaluate(phase, frequency_hz, waveform);

    if (waveform < MOOG_WAVEFORM_MIN)
        waveform = MOOG_WAVEFORM_MIN;
    else if (waveform > MOOG_WAVEFORM_MAX)
        waveform = MOOG_WAVEFORM_MAX;

    if (waveform == MOOG_WAVEFORM_SAW || !isfinite(phase_increment) ||
        phase_increment <= 0.0 || cache == NULL)
    {
        return moog_waveform_evaluate(phase, frequency_hz, waveform);
    }

    moog_waveform_cache_prepare(
        cache, frequency_hz, waveform, phase_increment);
    return moog_waveform_evaluate_prepared(phase, cache);
}

float moog_waveform_evaluate_bandlimited(
    double phase,
    float frequency_hz,
    float waveform,
    double phase_increment)
{
    MoogWaveformCache cache = {0};
    moog_waveform_initialize();
    return moog_waveform_evaluate_bandlimited_cached(
        phase, frequency_hz, waveform, phase_increment, &cache);
}
