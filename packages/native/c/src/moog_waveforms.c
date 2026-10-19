#include "moog_waveforms.h"
#include "moog_oscillator_math.h"

#include <math.h>

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
#define MOOG_WAVEFORM_DUTY_INCREMENT 0.25f

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
