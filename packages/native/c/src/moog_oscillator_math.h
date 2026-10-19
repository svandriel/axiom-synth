#ifndef MOOG_OSCILLATOR_MATH_H
#define MOOG_OSCILLATOR_MATH_H

#include <math.h>
#include <stdint.h>
#include <stdlib.h>

#define MOOG_OSC_PI 3.141592653589793238462643383279502884
#define MOOG_OSC_TWO_PI (2.0 * MOOG_OSC_PI)
#define MOOG_OSC_HALF_PI (0.5 * MOOG_OSC_PI)
#define MOOG_OSC_TWO_OVER_PI (2.0 / MOOG_OSC_PI)

/* Detune is expressed in cents; one octave spans this many cents. */
#define MOOG_OSC_CENTS_PER_OCTAVE 1200.0

/*
 * These helpers are pure math and are kept `static inline` so the compiler
 * inlines them into the render loop (a plain .c unit would not inline across
 * translation units without LTO, which would cost realtime headroom).
 */

/* Wrap an arbitrary phase into [0, 1). */
static inline double wrap_phase(double phase)
{
    phase -= floor(phase);
    if (phase >= 1.0)
    {
        phase = 0.0;
    }
    else if (phase < 0.0)
    {
        phase += 1.0;
    }
    return phase;
}

#ifdef MOOG_SAW_TEST_RNG
double moog_saw_test_unit_random(void);
#endif

static inline double unit_random(void)
{
#ifdef MOOG_SAW_TEST_RNG
    return moog_saw_test_unit_random();
#else
    return (double)rand() / RAND_MAX;
#endif
}

static inline double range_random(double min, double max)
{
    return min + (max - min) * unit_random();
}

/* cos on [-pi/4, pi/4]; Taylor has a < 3e-8 remainder over that range. */
static inline double cos_poly(double r)
{
    const double r2 = r * r;
    double c = 1.0 / 40320.0;
    c = c * r2 - 1.0 / 720.0;
    c = c * r2 + 1.0 / 24.0;
    c = c * r2 - 0.5;
    return c * r2 + 1.0;
}

/* sin on [-pi/4, pi/4]; Taylor has a < 2e-9 remainder over that range. */
static inline double sin_poly(double r)
{
    const double r2 = r * r;
    double s = 1.0 / 362880.0;
    s = s * r2 - 1.0 / 5040.0;
    s = s * r2 + 1.0 / 120.0;
    s = s * r2 - 1.0 / 6.0;
    return (s * r2 + 1.0) * r;
}

/*
 * cos(t) via quadrant reduction to [-pi/4, pi/4]. Avoids the imported libm
 * cos, which is a JS Math.cos call in the WASM worklet build.
 */
static inline double quadrant_cos(double t)
{
    const double x = t * MOOG_OSC_TWO_OVER_PI;
    const double n = floor(x + 0.5);
    const double r = (x - n) * MOOG_OSC_HALF_PI;

    switch (((int)n) & 3)
    {
    case 0:
        return cos_poly(r);
    case 1:
        return -sin_poly(r);
    case 2:
        return -cos_poly(r);
    default:
        return sin_poly(r);
    }
}

/* Frequency ratio for a detune in cents (e.g. +1200 cents -> 2.0). */
static inline float cents_to_ratio(float cents)
{
    return exp2f(cents / (float)MOOG_OSC_CENTS_PER_OCTAVE);
}

#endif
