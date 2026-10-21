#include "moog_sync_series.h"
#include "moog_oscillator_math.h"
#include "moog_waveforms.h"

#include <math.h>

#define MOOG_SYNC_SERIES_MAX_PERIOD_SAMPLES \
    (2.0 * MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES)
#define MOOG_SYNC_SERIES_MAX_PHASE_CYCLES 2.0
#define MOOG_SYNC_SERIES_MIN_PERIOD_SAMPLES 1.0
#define MOOG_SYNC_SERIES_SAW_WAVEFORM 2.0f

enum
{
    MOOG_SYNC_SERIES_QUADRATURE_POINTS = 32,
    MOOG_SYNC_SERIES_MAX_BREAKPOINTS = 16,
    MOOG_SYNC_SERIES_MIN_INTERVALS_PER_PERIOD = 16,
};

static const double quadrature_nodes[MOOG_SYNC_SERIES_QUADRATURE_POINTS] = {
    -0.99726386184948157, -0.98561151154526827, -0.96476225558750639,
    -0.93490607593773967, -0.89632115576605209, -0.84936761373256997,
    -0.79448379596794239, -0.73218211874028971, -0.66304426693021523,
    -0.5877157572407623, -0.50689990893222936, -0.42135127613063533,
    -0.33186860228212767, -0.23928736225213706, -0.14447196158279652,
    -0.048307665687738324, 0.048307665687738324, 0.14447196158279652,
    0.23928736225213706, 0.33186860228212767, 0.42135127613063533,
    0.50689990893222936, 0.5877157572407623, 0.66304426693021523,
    0.73218211874028971, 0.79448379596794239, 0.84936761373256997,
    0.89632115576605209, 0.93490607593773967, 0.96476225558750639,
    0.98561151154526827, 0.99726386184948157,
};

static const double quadrature_weights[MOOG_SYNC_SERIES_QUADRATURE_POINTS] = {
    0.0070186100094691405, 0.016274394730906284, 0.02539206530926193,
    0.034273862913021563, 0.042835898022226898, 0.050998059262376265,
    0.058684093478535621, 0.065822222776361697, 0.072345794108848435,
    0.078193895787070269, 0.08331192422694686, 0.087652093004403894,
    0.091173878695763919, 0.093844399080804483, 0.095638720079274847,
    0.096540088514727854, 0.096540088514727854, 0.095638720079274847,
    0.093844399080804483, 0.091173878695763919, 0.087652093004403894,
    0.08331192422694686, 0.078193895787070269, 0.072345794108848435,
    0.065822222776361697, 0.058684093478535621, 0.050998059262376265,
    0.042835898022226898, 0.034273862913021563, 0.02539206530926193,
    0.016274394730906284, 0.0070186100094691405,
};

static void insert_breakpoint(
    double *breakpoints, unsigned int *count, double position)
{
    if (position <= 0.0 || position >= breakpoints[*count - 1])
        return;

    unsigned int index = 0;
    while (breakpoints[index] < position)
        ++index;
    if (breakpoints[index] == position)
        return;

    for (unsigned int j = *count; j > index; --j)
        breakpoints[j] = breakpoints[j - 1];
    breakpoints[index] = position;
    ++*count;
}

static void integrate_segment(
    MoogSyncSeries *series,
    double left,
    double right,
    float frequency_hz,
    float waveform,
    double phase_increment)
{
    const double midpoint = (left + right) * 0.5;
    const double half_width = (right - left) * 0.5;
    const double fundamental = MOOG_OSC_TWO_PI / series->period_samples;

    for (unsigned int point = 0; point < MOOG_SYNC_SERIES_QUADRATURE_POINTS;
         ++point)
    {
        const double time = midpoint + half_width * quadrature_nodes[point];
        const double weighted_value =
            half_width * quadrature_weights[point] *
            moog_waveform_evaluate(
                time * phase_increment, frequency_hz, waveform) /
            series->period_samples;
        series->dc += weighted_value;

        const double angle = fundamental * time;
        const double cosine_step = cos(angle);
        const double sine_step = sin(angle);
        double cosine = 1.0;
        double sine = 0.0;
        for (unsigned int harmonic = 0;
             harmonic < series->harmonic_count;
             ++harmonic)
        {
            const double next_cosine =
                cosine * cosine_step - sine * sine_step;
            sine = sine * cosine_step + cosine * sine_step;
            cosine = next_cosine;
            series->cosine[harmonic] += 2.0 * weighted_value * cosine;
            series->sine[harmonic] += 2.0 * weighted_value * sine;
        }
    }
}

int moog_sync_series_prepare(
    MoogSyncSeries *series,
    float frequency_hz,
    float waveform,
    double phase_increment,
    double period_samples)
{
    if (series == NULL || !isfinite(period_samples) ||
        period_samples < MOOG_SYNC_SERIES_MIN_PERIOD_SAMPLES ||
        period_samples > MOOG_SYNC_SERIES_MAX_PERIOD_SAMPLES ||
        !isfinite(phase_increment) || phase_increment <= 0.0 ||
        phase_increment >= 1.0 ||
        phase_increment * period_samples > MOOG_SYNC_SERIES_MAX_PHASE_CYCLES ||
        !isfinite(frequency_hz) || !isfinite(waveform) ||
        waveform == MOOG_SYNC_SERIES_SAW_WAVEFORM)
        return 0;

    MoogWaveformCache shape = {0};
    moog_waveform_cache_prepare(
        &shape, frequency_hz, waveform, phase_increment);
    *series = (MoogSyncSeries){0};
    series->period_samples = period_samples;
    series->harmonic_count =
        (unsigned int)floor(MOOG_WAVEFORM_FOURIER_CUTOFF * period_samples);
    if (series->harmonic_count > MOOG_SYNC_SERIES_MAX_HARMONICS)
        return 0;

    double breakpoints[MOOG_SYNC_SERIES_MAX_BREAKPOINTS] = {
        0.0, period_samples};
    unsigned int count = 2;
    for (unsigned int cycle = 0; cycle <= 2; ++cycle)
    {
        insert_breakpoint(
            breakpoints, &count, (double)cycle / phase_increment);
        for (unsigned int edge = 0; edge < shape.edge_count; ++edge)
        {
            insert_breakpoint(
                breakpoints,
                &count,
                ((double)cycle + shape.edges[edge].phase) / phase_increment);
        }
    }

    for (unsigned int interval = 1; interval < count; ++interval)
    {
        const double left = breakpoints[interval - 1];
        const double width = breakpoints[interval] - left;
        const double maximum_width =
            period_samples / MOOG_SYNC_SERIES_MIN_INTERVALS_PER_PERIOD;
        const unsigned int subdivisions =
            (unsigned int)ceil(width / maximum_width);
        for (unsigned int part = 0; part < subdivisions; ++part)
        {
            integrate_segment(
                series,
                left + width * part / subdivisions,
                left + width * (part + 1) / subdivisions,
                frequency_hz,
                waveform,
                phase_increment);
        }
    }
    return 1;
}

float moog_sync_series_evaluate(
    const MoogSyncSeries *series, double samples_since_event)
{
    double position = fmod(samples_since_event, series->period_samples);
    if (position < 0.0)
        position += series->period_samples;
    const double angle =
        MOOG_OSC_TWO_PI * position / series->period_samples;
    const double cosine_step = cos(angle);
    const double sine_step = sin(angle);
    double cosine = 1.0;
    double sine = 0.0;
    double output = series->dc;
    for (unsigned int harmonic = 0; harmonic < series->harmonic_count; ++harmonic)
    {
        const double next_cosine = cosine * cosine_step - sine * sine_step;
        sine = sine * cosine_step + cosine * sine_step;
        cosine = next_cosine;
        output += series->cosine[harmonic] * cosine +
                  series->sine[harmonic] * sine;
    }
    return (float)output;
}
