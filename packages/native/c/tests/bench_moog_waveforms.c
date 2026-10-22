#include "moog_oscillator.h"

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
static double now_ms(void) {
  return emscripten_get_now();
}
#else
#include <time.h>
static double now_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1e6;
}
#endif

#define BENCH_PI 3.14159265358979323846
#define SAMPLE_RATE 48000.0
#define OSCILLATOR_FREQUENCY_HZ 440.0f
#define VARYING_FREQUENCY_BASE_HZ 220.0
#define VARYING_FREQUENCY_DEPTH 0.5
#define SYNC_FREQUENCY_HZ 880.0
#define BLOCK_FRAMES 128
#define SYNC_BUFFER_FRAMES 48000
#ifndef BENCH_WARMUP_MS
#define WARMUP_MS 250.0
#else
#define WARMUP_MS BENCH_WARMUP_MS
#endif
#ifndef BENCH_MEASURE_MS
#define MEASURE_MS 750.0
#else
#define MEASURE_MS BENCH_MEASURE_MS
#endif
#ifndef BENCH_REPEATS
#define REPEATS 5
#else
#define REPEATS BENCH_REPEATS
#endif
#define FIRST_WAVEFORM 0.0f
#define LAST_WAVEFORM 5.0f
#define WAVEFORM_STEP 0.5f

#define BLOCK_BUDGET_MS ((double)BLOCK_FRAMES / SAMPLE_RATE * 1000.0)

static float frequency_block[BLOCK_FRAMES];
static float varying_frequency_block[BLOCK_FRAMES];
static float waveform_block[BLOCK_FRAMES];
static float sync_buffer[SYNC_BUFFER_FRAMES];
static float output_block[BLOCK_FRAMES];

static void initialize_inputs(void) {
  for (uint32_t i = 0; i < BLOCK_FRAMES; ++i) {
    frequency_block[i] = OSCILLATOR_FREQUENCY_HZ;
    const double phase = (double)i / (double)BLOCK_FRAMES * 2.0 * BENCH_PI;
    varying_frequency_block[i] =
      (float)(VARYING_FREQUENCY_BASE_HZ *
              (1.0 + VARYING_FREQUENCY_DEPTH * sin(phase)));
  }

  for (uint32_t i = 0; i < SYNC_BUFFER_FRAMES; ++i) {
    double phase = (double)i * SYNC_FREQUENCY_HZ / SAMPLE_RATE;
    phase -= floor(phase);
    sync_buffer[i] = (float)(2.0 * phase - 1.0);
  }
}

static void render_block(MoogOscillator *osc, uint32_t sync_index, int use_sync,
                         int varying_frequency) {
  moog_oscillator_process(
    osc, varying_frequency ? varying_frequency_block : frequency_block, NULL,
    use_sync ? &sync_buffer[sync_index] : NULL, waveform_block, output_block,
    BLOCK_FRAMES);
}

static double measure(double target_ms, int use_sync, int varying_frequency,
                      volatile float *sink) {
  MoogOscillator *osc = moog_oscillator_create(SAMPLE_RATE);
  if (!osc) {
    fprintf(stderr, "failed to create oscillator\n");
    return -1.0;
  }
  moog_oscillator_reset(osc, 0.125);

  float acc = 0.0f;
  uint32_t sync_index = 0;
  for (double elapsed = 0.0; elapsed < WARMUP_MS;) {
    const double start = now_ms();
    render_block(osc, sync_index, use_sync, varying_frequency);
    acc += output_block[0];
    elapsed += now_ms() - start;
    sync_index = (sync_index + BLOCK_FRAMES) % SYNC_BUFFER_FRAMES;
  }

  uint64_t blocks = 0;
  const double start = now_ms();
  double elapsed = 0.0;
  do {
    render_block(osc, sync_index, use_sync, varying_frequency);
    acc += output_block[0];
    ++blocks;
    sync_index = (sync_index + BLOCK_FRAMES) % SYNC_BUFFER_FRAMES;
    elapsed = now_ms() - start;
  } while (elapsed < target_ms);

  moog_oscillator_destroy(osc);
  *sink += acc;
  return elapsed / (double)(blocks * BLOCK_FRAMES);
}

static int compare_double(const void *a, const void *b) {
  const double x = *(const double *)a;
  const double y = *(const double *)b;
  return (x > y) - (x < y);
}

static int run(float waveform, int use_sync, int varying_frequency) {
  for (uint32_t i = 0; i < BLOCK_FRAMES; ++i)
    waveform_block[i] = waveform;

  volatile float sink = 0.0f;
  double samples[REPEATS];
  const double untimed =
    measure(MEASURE_MS, use_sync, varying_frequency, &sink);
  if (untimed < 0.0)
    return 0;

  for (int repeat = 0; repeat < REPEATS; ++repeat) {
    samples[repeat] = measure(MEASURE_MS, use_sync, varying_frequency, &sink);
    if (samples[repeat] < 0.0)
      return 0;
  }
  qsort(samples, REPEATS, sizeof(samples[0]), compare_double);

  const double best = samples[0];
  const double median = samples[REPEATS / 2];
  printf("waveform %3.1f | pitch %s | sync %s | best %8.1f ns/sample | "
         "median %8.1f ns/sample | %6.0fx realtime\n",
         waveform, varying_frequency ? "sweep" : "440 Hz",
         use_sync ? "880 Hz" : "off", best * 1e6, median * 1e6,
         BLOCK_BUDGET_MS / best);
  (void)sink;
  return 1;
}

int main(int argc, char **argv) {
  initialize_inputs();
  printf("generic waveform oscillator (%d-frame blocks, 440 Hz or 220 Hz "
         "+/- 50%% pitch, %.0f Hz sync)\n",
         BLOCK_FRAMES, SYNC_FREQUENCY_HZ);

  if (argc != 1 && argc != 4) {
    fprintf(stderr, "usage: %s [waveform static|sweep off|sync]\n", argv[0]);
    return 2;
  }
  if (argc == 4) {
    char *end = NULL;
    const float waveform = strtof(argv[1], &end);
    if (end == argv[1] || *end != '\0' || !isfinite(waveform) ||
        waveform < FIRST_WAVEFORM || waveform > LAST_WAVEFORM ||
        (strcmp(argv[2], "static") != 0 && strcmp(argv[2], "sweep") != 0) ||
        (strcmp(argv[3], "off") != 0 && strcmp(argv[3], "sync") != 0)) {
      fprintf(stderr, "invalid benchmark case\n");
      return 2;
    }
    return run(waveform, strcmp(argv[3], "sync") == 0,
               strcmp(argv[2], "sweep") == 0)
             ? 0
             : 1;
  }

  for (float waveform = FIRST_WAVEFORM; waveform <= LAST_WAVEFORM;
       waveform += WAVEFORM_STEP) {
    for (int varying_frequency = 0; varying_frequency <= 1;
         ++varying_frequency) {
      if (!run(waveform, 0, varying_frequency) ||
          !run(waveform, 1, varying_frequency))
        return 1;
    }
  }
  return 0;
}
