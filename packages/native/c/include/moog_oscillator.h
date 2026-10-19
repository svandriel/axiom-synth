#ifndef MOOG_OSCILLATOR_H
#define MOOG_OSCILLATOR_H

#include <stdint.h>

#ifdef __cplusplus
extern "C"
{
#endif

    typedef struct MoogOscillator MoogOscillator;

    MoogOscillator *moog_oscillator_create(double sample_rate);
    void moog_oscillator_destroy(MoogOscillator *osc);
    void moog_oscillator_reset(MoogOscillator *osc, double phase);
    void moog_oscillator_set_frequency(MoogOscillator *osc, float frequency_hz);
    double moog_oscillator_phase(const MoogOscillator *osc);
    void moog_oscillator_process(
        MoogOscillator *osc,
        const float *frequency,
        const float *detune,
        const float *sync,
        const float *waveform,
        float *output,
        uint32_t frames);

#ifdef __cplusplus
}
#endif

#endif
