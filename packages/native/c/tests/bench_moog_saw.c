#include "moog_saw.h"

#include <math.h>
#include <stdint.h>
#include <stdio.h>

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
#define BLOCK_FRAMES 128
#define WARMUP_MS 250.0
#define MEASURE_MS 750.0
#define REPEATS 5

/* A 128-frame block is the worklet render quantum; the realtime budget for one
 * block is BLOCK_FRAMES / SAMPLE_RATE seconds. */
#define BLOCK_BUDGET_MS ((double)BLOCK_FRAMES / SAMPLE_RATE * 1000.0)

static float frequency_block[BLOCK_FRAMES];
static float detune_block[BLOCK_FRAMES];
static float output_block[BLOCK_FRAMES];

static void fill_static(void) {
  for (uint32_t i = 0; i < BLOCK_FRAMES; ++i) {
    frequency_block[i] = 440.0f;
    detune_block[i] = 0.0f;
  }
}

static void fill_detuned(void) {
  for (uint32_t i = 0; i < BLOCK_FRAMES; ++i) {
    frequency_block[i] = 440.0f;
    detune_block[i] = 700.0f;
  }
}

static void fill_varying(void) {
  for (uint32_t i = 0; i < BLOCK_FRAMES; ++i) {
    const double t = (double)i / (double)BLOCK_FRAMES;
    frequency_block[i] = (float)(220.0 * (1.0 + 0.5 * sin(2.0 * BENCH_PI * t)));
    detune_block[i] = (float)(600.0 * sin(2.0 * BENCH_PI * t));
  }
}

/* Warm the caches and the oscillator state, then run for ~target_ms and return
 * the mean milliseconds spent per rendered sample. */
static double measure(double target_ms, volatile float *sink) {
  MoogSaw *osc = moog_saw_create(SAMPLE_RATE);
  float acc = 0.0f;

  for (double elapsed = 0.0; elapsed < WARMUP_MS;) {
    const double start = now_ms();
    moog_saw_process(osc, frequency_block, detune_block, NULL, output_block,
                     BLOCK_FRAMES);
    acc += output_block[0];
    elapsed += now_ms() - start;
  }

  uint64_t blocks = 0;
  const double start = now_ms();
  double elapsed = 0.0;
  do {
    moog_saw_process(osc, frequency_block, detune_block, NULL, output_block,
                     BLOCK_FRAMES);
    acc += output_block[0];
    ++blocks;
    elapsed = now_ms() - start;
  } while (elapsed < target_ms);

  moog_saw_destroy(osc);
  *sink += acc;
  return elapsed / (double)(blocks * BLOCK_FRAMES);
}

static int compare_double(const void *a, const void *b) {
  const double x = *(const double *)a;
  const double y = *(const double *)b;
  return (x > y) - (x < y);
}

static void run(const char *label) {
  volatile float sink = 0.0f;
  double samples[REPEATS];

  /* One untimed run to stabilise the machine before sampling. */
  measure(MEASURE_MS, &sink);
  for (int r = 0; r < REPEATS; ++r) {
    samples[r] = measure(MEASURE_MS, &sink);
  }
  qsort(samples, REPEATS, sizeof(samples[0]), compare_double);

  const double best = samples[0];
  const double median = samples[REPEATS / 2];
  const double ns_per_sample = best * 1e6;
  const double realtime = BLOCK_BUDGET_MS / best;

  printf(
    "%-9s best %8.1f ns/sample | median %8.1f ns/sample | %6.0fx realtime\n",
    label, ns_per_sample, median * 1e6, realtime);
  (void)sink;
}

int main(void) {
  printf("moog_saw_process benchmark (%d-frame blocks, %.0f Hz)\n",
         BLOCK_FRAMES, SAMPLE_RATE);
  fill_static();
  run("static");
  fill_detuned();
  run("detuned");
  fill_varying();
  run("varying");
  return 0;
}
