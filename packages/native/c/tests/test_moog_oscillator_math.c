#include "moog_oscillator_math.h"

#include <assert.h>
#include <math.h>
#include <stdio.h>

static void test_wrap_phase(void) {
  const double inputs[] = {-1e6 - 0.25, -5.3, -1.0, -0.5, -0.0,  0.0,
                           0.5,         1.0,  1.7,  2.0,  3.999, 1e6 + 0.25};
  const int n = (int)(sizeof(inputs) / sizeof(inputs[0]));

  for (int i = 0; i < n; ++i) {
    const double p = inputs[i];
    const double got = wrap_phase(p);
    assert(got >= 0.0 && got < 1.0);
    /* The wrapped phase differs from the input by a whole number. */
    assert(fabs((p - got) - floor(p)) < 1e-9);
  }
}

static void test_clamp(void) {
  assert(clamp(-1.0f, 0.0f, 1.0f) == 0.0f);
  assert(clamp(0.5f, 0.0f, 1.0f) == 0.5f);
  assert(clamp(2.0f, 0.0f, 1.0f) == 1.0f);
}

static void test_cos_poly(void) {
  for (int k = 0; k <= 1000; ++k) {
    const double r = MOOG_OSC_PI / 4.0 * ((double)k / 1000.0 * 2.0 - 1.0);
    assert(fabs(cos_poly(r) - cos(r)) < 1e-7);
  }
}

static void test_sin_poly(void) {
  for (int k = 0; k <= 1000; ++k) {
    const double r = MOOG_OSC_PI / 4.0 * ((double)k / 1000.0 * 2.0 - 1.0);
    assert(fabs(sin_poly(r) - sin(r)) < 1e-8);
  }
}

static void test_quadrant_cos(void) {
  /* Covers many quadrant boundaries, positive and negative. */
  for (int k = -20000; k <= 20000; ++k) {
    const double t = (double)k / 1000.0;
    assert(fabs(quadrant_cos(t) - cos(t)) < 1e-6);
  }
}

static void test_quadrant_sincos(void) {
  for (int k = -20000; k <= 20000; ++k) {
    const double angle = (double)k / 1000.0;
    double cosine;
    double sine;
    quadrant_sincos(angle, &cosine, &sine);
    assert(fabs(cosine - cos(angle)) < 1e-6);
    assert(fabs(sine - sin(angle)) < 1e-6);
  }
}

static void test_cents_to_ratio(void) {
  assert(fabsf(cents_to_ratio(0.0f) - 1.0f) < 1e-6f);
  assert(fabsf(cents_to_ratio(1200.0f) - 2.0f) < 1e-6f);
  assert(fabsf(cents_to_ratio(-1200.0f) - 0.5f) < 1e-6f);
  assert(fabsf(cents_to_ratio(700.0f) - powf(2.0f, 700.0f / 1200.0f)) < 1e-5f);
}

int main(void) {
  test_clamp();
  test_wrap_phase();
  test_cos_poly();
  test_sin_poly();
  test_quadrant_cos();
  test_quadrant_sincos();
  test_cents_to_ratio();
  puts("all tests passed");
  return 0;
}
