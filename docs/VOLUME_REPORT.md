# Volume report

Where the signal level goes in the current Axiom chain, with the max gain of
every stage read from the source.

## Summary

The oscillators and the voice are not quiet. The per-voice shaper output already
peaks at full scale. The loss happens afterwards: two fixed attenuators,
`synth.output` at 0.6 and the master gain at 0.5, produce a combined factor of
0.3 (about $-10.5$ dB), and the master compressor runs on the Web Audio defaults
(threshold $-24$ dB, ratio $12{:}1$, no makeup gain). The compressor pulls hot
material down to roughly $-22$ dBFS. The app has no master volume control.

## Signal chain

```text
osc 1 ─► gain ─► unison ─┐
osc 2 ─► gain ─► unison ─┼─► ×1/3 ─► ×(1 + drive) ─► shaper ─► filter
osc 3 ─► gain ─► unison ─┘                                   ─► amp env
                                                            ─► amp mod
                                                            ─► synth.output (0.6)

synth.output ─► masterInput (1.0) ─► delay ─► reverb ─► idle gate
              ─► master (0.5) ─► compressor ─► destination
```

The analyser and the meter are leaf taps off the compressor. The audible path
is `compressor -> destination`.

## Per-voice stages

| Stage                       | Code                                               | Max gain                        | Max dB                   | Default                      |
| --------------------------- | -------------------------------------------------- | ------------------------------- | ------------------------ | ---------------------------- |
| Oscillator waveform         | `moog_saw.c`, `web-audio-oscillator.ts`            | $\pm 1$ peak                    | 0 dBFS                   | $\pm 1$                      |
| Unison blend, $V$ subvoices | `blend-curve-cache.ts:25-42`                       | $\sqrt{V}$ coherent peak, RMS 1 | up to $+12$ dB at $V=16$ | $V=2$ on osc 1               |
| Osc gain knob               | `OscillatorPanel.vue:6-15`                         | 2                               | $+6$ dB                  | 1 / 0.4 / 1                  |
| Three-oscillator normalize  | `axiom-voice.ts:77-78`                             | $1/3$                           | $-9.5$ dB                | $1/3$                        |
| Shaper drive                | `waveshaper.ts:14-18`, `WaveshaperPanel.vue:16-24` | $1 + 4 = 5$                     | $+14$ dB                 | $1 + 2 = 3$                  |
| Shaper curve                | `waveshaper-curve.ts:71-97`                        | output capped at $\pm 1$        | 0 dBFS                   | hard clip, amount 70         |
| Filter passband             | `filter.ts`                                        | 1 per stage                     | 0 dB                     | LP24, 1300 Hz                |
| Filter resonance            | `filter-resonance.ts:60-66`                        | composite peak equals $Q$       | up to $+26$ dB at $Q=20$ | $+15.6$ dB at $Q=6$          |
| Amp envelope                | `envelope.ts:22-61`                                | $v/127 \times$ sustain          | 0 dB peak                | $v=127 \to 1.0$, sustain 0.6 |
| Amp mod                     | `axiom-voice.ts:106-108`                           | 5 (four LFOs at $+1$)           | $+14$ dB                 | 1.0                          |

Details that matter for level:

- The unison blend keeps total power at 1 (`sum(gain_i^2) = 1`). RMS stays flat
  as voices are added, while coherent attack peaks grow as $\sqrt{V}$.
- The shaper is a full-scale limiter. At the default drive of 3 the
  $1/3$ oscillator normalize is cancelled exactly, so a raw oscillator sum of
  up to 2.4 arrives at the curve. For the default hard clipper at amount 70,
  $k = 1 - 0.95 \times 0.70 = 0.335$. The curve divides by $k$, so small signals
  get about $+9.5$ dB and anything above $0.335$ clips to $\pm 1$.
- Every shaper type in `waveshaper-curve.ts` normalizes its output to $\pm 1$.
  Raising drive makes the sound more distorted, not louder.
- The resonance curve is built as $Q_{\text{stage}} = Q^{1/N}$ for $N$ stages,
  so the composite peak at the cutoff equals the Q knob value.
- The keyboard sends velocity 127 (`Keyboard.vue:80`), so the envelope target is
  1.0. The default sustain of 0.6 costs $-4.4$ dB after the decay.

## Master stages

| Stage          | Code                                   | Max gain            | Max dB                | Default                   |
| -------------- | -------------------------------------- | ------------------- | --------------------- | ------------------------- |
| Synth output   | `axiom-synth.ts:214-215`               | 0.6                 | $-4.4$ dB             | 0.6                       |
| Master input   | `engine.ts:29-30`                      | 1.0                 | 0 dB                  | 1.0                       |
| Feedback delay | `feedback-delay.ts`, `engine.ts:40-42` | dry 1 + wet 0.2     | about $+1.6$ dB       | wet 0.2                   |
| Reverb         | `reverb.ts`, `engine.ts:44-45`         | dry 1 + wet 0.4     | about $+2.9$ dB       | wet 0.4                   |
| Idle gate      | `idle-gate.ts`                         | 1.0                 | 0 dB                  | 1.0                       |
| Master gain    | `engine.ts:31-32`                      | 0.5                 | $-6.0$ dB             | 0.5                       |
| Compressor     | `engine.ts:37`                         | defaults, no makeup | limits above $-24$ dB | threshold $-24$, ratio 12 |

The compressor keeps the Web Audio defaults because the constructor never sets
a parameter: threshold $-24$ dB, knee 30 dB, ratio $12{:}1$, attack 3 ms,
release 250 ms. With no makeup gain, a $0$ dBFS input comes out around
$-22$ dBFS. The VU meter reads after the compressor (`comp -> meter.input`), so
it shows the squashed level, not the level the synth produces.

## End-to-end level

For one voice at the default patch, with the envelope at sustain:

$$
1.0\ \text{(shaper)} \times 0.6\ \text{(sustain)} \times 0.6\ \text{(synth)}
\times 0.5\ \text{(master)} = 0.18 \approx -14.9\ \text{dBFS}
$$

At the envelope peak (before decay) the same chain gives $0.3$ or
$-10.5$ dBFS. Both values are before the filter, which removes shaper harmonics
and lowers the level further in practice.

Polyphony sums before the master gain. Four voices at sustain reach $0.72$
($-2.9$ dBFS) and sixteen reach $2.88$ ($+9.2$ dBFS). The compressor flattens
all of that to around $-22$ dBFS, so the synth cannot get louder by playing more
notes.

## Findings

1. The compressor causes most of the perceived quietness. It is a $-24$ dB
   threshold, $12{:}1$ limiter with no makeup gain, so loud material comes out
   near $-22$ dBFS.
2. The fixed attenuators cost $10.5$ dB together. Neither value is exposed in
   the UI.
3. The LP24 filter at 1300 Hz removes most of the shaper harmonics. That is the
   intended tone, but it also drops perceived loudness while the peak level
   stays high.
4. The amp sustain of 0.6 costs another $4.4$ dB in steady state.
5. The three-oscillator normalize is not a loss today because the default drive
   exactly cancels it. Setting drive to 0 would remove about $9.5$ dB of input.

## Suggested changes

- Raise the master gain from 0.5 to about 0.8 ($+4.1$ dB), or raise
  `synth.output` from 0.6 to 1.0 ($+4.4$ dB).
- Treat the compressor as a safety limiter: threshold around $-6$ dB and ratio
  around $4{:}1$, or add a makeup gain stage after it.
- Add a master volume control. No component in `app/src` touches
  `engine.master` or `synth.output` today.
- Move the fixed values into named constants. `docs/codebase/CONCERNS.md`
  already lists the master 0.5, synth output 0.6 and shaper curve factors as
  undocumented magic numbers.

## Volume-chain recommendations

The goal should be to preserve the synth's intended voice character and effect
balance, provide a predictable master level, and prevent overload without
compressing every patch into the same quiet output. Apply these changes in
priority order.

### 1. Separate patch level from master volume

- Add a user-facing **Master Volume** control, backed by a gain stage near the
  end of the master chain. Keep it separate from oscillator gain, shaper drive,
  and per-voice amp level: those controls should continue to shape the sound,
  not compensate for a global output-level problem.
- Put the control after the compressor/limiter so turning the listening level
  down does not change the amount of compression or the effect-send balance.
  Keep the final safety stage after that control only if it is configured to
  catch accidental overloads; do not use it as the everyday volume control.
- Use a named default and document the gain convention. Avoid leaving the
  current fixed master gain of 0.5 as an unexplained level trim.

### 2. Remove arbitrary attenuation deliberately, not by stacking boosts

The fixed synth.output = 0.6 and master = 0.5 trims cost about 10.5 dB
before compression. Do not simply raise both to 1.0 and assume the result is
safe: effects, polyphonic summing, and resonant filter peaks can create
levels above full scale.

- Make synth.output a documented unity-gain stage by default, or retain a
  lower value only if tests show it is needed for headroom or effect balance.
- Keep master listening level independent of that stage.
- Recheck effect wet/dry levels and polyphonic peaks after changing the trims.
  Delay and reverb can add energy, and the report's four- and sixteen-voice
  estimates exceed 0 dBFS before compression.

### 3. Replace the default compressor behavior with an intentional safety stage

The current Web Audio compressor defaults (threshold -24 dB, ratio 12:1, no
makeup gain) explain why hot signals end up around -22 dBFS. This is acting as
a loudness reducer rather than a transparent peak-safety stage.

- Start by testing a higher threshold (around -6 dB) and a gentler ratio
  (around 4:1), as a baseline rather than a final calibrated setting.
- If the product requirement is strictly to prevent output clipping, consider
  a dedicated limiter with a ceiling below 0 dBFS instead of relying on the
  default compressor. Validate its attack/release behavior and transient
  handling at the actual sample rate.
- Avoid automatic makeup gain until measured output levels and headroom are
  understood; makeup gain can restore loudness but cannot recover dynamics or
  prevent overload by itself.

### 4. Make the level observable at useful points

Expose separate metering for at least the signal before the safety compressor/
limiter and the final output after it. The existing post-compressor meter alone
hides how much gain reduction is occurring.

- Show peak level in dBFS and, where useful, RMS or short-term level.
- If practical, show gain reduction so users can distinguish a quiet patch from
  one being heavily compressed.
- Add tests for a single sustained note, coherent multi-voice peaks, high-Q
  resonance, maximum shaper drive, and wet delay/reverb. Assert finite samples
  and verify that the final safety stage keeps the output within its intended
  ceiling.

### 5. Preserve musical gain staging inside the voice

- Keep the shaper's normalization behavior documented: drive is primarily a
  timbre control because the curve is normalized to ±1, not a reliable output
  volume control.
- Do not compensate for the three-oscillator normalization by blindly raising
  every upstream gain. In particular, the report shows that default drive
  currently cancels the 1/3 normalization; changing either side can alter
  distortion and input level substantially.
- Treat the amp envelope sustain and filter/resonance as patch-level tone and
  dynamics controls. Their level changes are expected and should not be
  counteracted by a global compressor that flattens every note.

### Recommended implementation order

1. Add a master-volume parameter and post-compressor gain stage, with a
   documented default and UI control.
2. Make compressor/limiter settings explicit and choose them from listening
   tests plus peak measurements, rather than browser defaults.
3. Revisit the fixed 0.6 synth-output trim and effect levels using pre/post
   meters; change it only after confirming headroom across polyphony.
4. Add automated level tests and document expected peak ranges for a default
   patch, high resonance, and multi-voice playback.

This order fixes the user-visible volume problem first, makes the remaining
gain structure measurable, and avoids using compression or oscillator gain as
a substitute for a master-volume control.

### 6. Revisit the fixed three-oscillator normalization

The fixed $1/3$ factor before the waveshaper is not a generally correct way to
mix oscillators. It averages the sum as though the goal were to keep the peak
bounded regardless of how many oscillators are active. That attenuates a
single active oscillator by 9.54 dB, while phase-aligned oscillators and
uncorrelated oscillators have different peak and RMS behavior. It also couples
oscillator count to the waveshaper's drive calibration.

- Prefer summing oscillator signals at their configured oscillator gains, with
  any pre-shaper gain represented as an explicit, named parameter or calibrated
  constant.
- Calibrate the pre-shaper level and drive together by listening and measuring
  one-, two-, and three-oscillator patches. Do not remove $1/3$ in isolation:
  the current default drive of 3 approximately cancels that attenuation, so
  changing only one factor would substantially alter the waveshaper input.
- Do not introduce $1/\sqrt{N}$ as an automatic replacement without testing.
  It may be a useful starting point for RMS-oriented normalization, but it
  cannot guarantee constant loudness for correlated signals, and the
  waveshaper makes input-level differences change timbre as well as loudness.
- Let additional oscillators naturally increase level and/or saturation where
  that is musically useful. Use explicit voice/master gain staging and a safety
  limiter for headroom rather than silently averaging away oscillator energy.

Treat oscillator-count normalization as a sound-design decision, not a
mathematical requirement. The preferred default should be selected from
listening tests across representative patches, with the pre-shaper level and
resulting distortion documented.
