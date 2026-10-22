#ifndef MOOG_WAVEFORMS_H
#define MOOG_WAVEFORMS_H

#define MOOG_WAVEFORM_SYNC_SLOPE_FIT_DELTA 1e-5
#define MOOG_WAVEFORM_FOURIER_CUTOFF 0.45

enum {
  MOOG_WAVEFORM_CACHE_HARMONIC_COUNT = 64,
  MOOG_WAVEFORM_SYNC_CORRECTION_RADIUS_SAMPLES = 84,
};

typedef struct {
  double phase;
  double curvature_jump;
  double slope_jump;
  double value_jump;
} MoogWaveformFourierEdge;

typedef struct {
  double dc;
  double saw_weight;
  MoogWaveformFourierEdge edges[3];
  unsigned int edge_count;
  double saw_half_cosine;
  double saw_half_sine;
  float p;
  float frequency_hz;
  float waveform;
  double phase_increment;
  double inverse_phase_increment;
  double correction_phase_radius;
  unsigned int harmonic_count;
  int initialized;
  int harmonic_count_initialized;
  int harmonic_count_fallback;
} MoogWaveformCache;

float moog_waveform_saw(double phase, float p);
float moog_waveform_saw_unwrapped(double phase, float p);
float moog_waveform_triangle(double phase, float p);
float moog_waveform_sharktooth(double phase, float p);
float moog_waveform_pulse(double phase, float p, float duty);

float moog_waveform_morph_triangle_shark(double phase, float p, float t);
float moog_waveform_morph_shark_saw(double phase, float p, float t);
float moog_waveform_morph_saw_square(double phase, float p, float t);
float moog_waveform_morph_square_wide(double phase, float p, float t);
float moog_waveform_morph_wide_narrow(double phase, float p, float t);

float moog_waveform_evaluate(double phase, float frequency_hz, float waveform);
void moog_waveform_initialize(void);
void moog_waveform_cache_prepare(MoogWaveformCache *cache, float frequency_hz,
                                 float waveform, double phase_increment);
float moog_waveform_evaluate_prepared(double phase,
                                      const MoogWaveformCache *cache);
float moog_waveform_sync_saw_bandlimit_correction(
  double phase, const MoogWaveformCache *cache);
float moog_waveform_sync_edge_correction(double distance_samples,
                                         double phase_increment,
                                         double value_jump, double slope_jump,
                                         double curvature_jump);
float moog_waveform_evaluate_bandlimited(double phase, float frequency_hz,
                                         float waveform,
                                         double phase_increment);
float moog_waveform_evaluate_bandlimited_cached(double phase,
                                                float frequency_hz,
                                                float waveform,
                                                double phase_increment,
                                                MoogWaveformCache *cache);
float moog_waveform_p(float frequency_hz);

#endif
