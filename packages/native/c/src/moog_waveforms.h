#ifndef MOOG_WAVEFORMS_H
#define MOOG_WAVEFORMS_H

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
float moog_waveform_p(float frequency_hz);

#endif
