#ifndef MOOG_SYNC_SERIES_H
#define MOOG_SYNC_SERIES_H

/* Bound periodic sync evaluation cost by retaining only eight harmonics. */
enum {
  MOOG_SYNC_SERIES_MAX_HARMONICS = 8,
};

/* Fourier coefficients for one detected, repeated sync period. */
typedef struct {
  double period_samples;
  double dc;
  double cosine[MOOG_SYNC_SERIES_MAX_HARMONICS];
  double sine[MOOG_SYNC_SERIES_MAX_HARMONICS];
  unsigned int harmonic_count;
} MoogSyncSeries;

/* Prepare the truncated series; return zero for unsupported periods. */
int moog_sync_series_prepare(MoogSyncSeries *series, float frequency_hz,
                             float waveform, double phase_increment,
                             double period_samples);

/* Evaluate the series at a sample offset from its sync event. */
float moog_sync_series_evaluate(const MoogSyncSeries *series,
                                double samples_since_event);

#endif
