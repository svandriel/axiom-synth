#ifndef MOOG_OSCILLATOR_INTERNAL_H
#define MOOG_OSCILLATOR_INTERNAL_H

#include "moog_oscillator.h"

void moog_oscillator_process_sample_sync(
    MoogOscillator *osc,
    float frequency_hz,
    int sync_event,
    double event_offset_samples,
    float *output);

#endif
