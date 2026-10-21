#ifndef MOOG_SYNC_SERIES_H
#define MOOG_SYNC_SERIES_H

enum
{
    MOOG_SYNC_SERIES_MAX_HARMONICS = 76,
};

typedef struct
{
    double period_samples;
    double dc;
    double cosine[MOOG_SYNC_SERIES_MAX_HARMONICS];
    double sine[MOOG_SYNC_SERIES_MAX_HARMONICS];
    unsigned int harmonic_count;
} MoogSyncSeries;

int moog_sync_series_prepare(
    MoogSyncSeries *series,
    float frequency_hz,
    float waveform,
    double phase_increment,
    double period_samples);
float moog_sync_series_evaluate(
    const MoogSyncSeries *series, double samples_since_event);

#endif
