# Oscillator Unison Research

## Purpose

Define oscillator-local unison controls and deterministic DSP formulas for
Axiom Synth. This document is the implementation basis, not an implementation
plan.

Unison creates simultaneous copies of one oscillator for each played note. It
must not duplicate a whole `AxiomVoice`, its envelopes, filter, waveshaper, or
other oscillators.

## Industry Findings

Phase Plant is the closest product match. Its oscillator unison applies to
individual analog, sampler, and wavetable generators. Its controls are Voice
Count, Detune, Spread, and Blend. Spread pans voices across the stereo image;
Blend balances detuned voices and main voice. It also offers phase modes.

Phase Plant distinguishes oscillator unison from global unison. Global unison

Ableton Analog stacks two or four voices and exposes a detune amount. FL Studio
Harmless describes unison as per-note subvoices with pitch, pan, volume, and
phase variation. These products establish per-note subvoices, pitch variation,

Phase Plant does not publish numeric ranges or its Blend gain curve. Its named

## Parameters

| Control | UI range         | Stored range | Default | Meaning                              |
| ------- | ---------------- | ------------ | ------- | ------------------------------------ |
| Voices  | 1 to 16, integer | 1 to 16      | 1       | Simultaneous oscillator nodes        |
| Detune  | 0 to 50 cents    | 0 to 50      | 0       | Maximum absolute pitch offset        |
| Depth   | 0 to 100%        | 0 to 1       | 0       | Fraction of assigned stereo position |
| Blend   | 0 to 100%        | 0 to 1       | 1       | Center-to-edge voice-level balance   |

Use `depth` rather than `spread` in Axiom UI. Its behavior matches Phase
Plant's Spread control. A 50-cent maximum matches Axiom's existing fine-detune

Clamp externally supplied values. Round Voices to nearest integer, then clamp.

Notation:

- `V`: voice count in `[1, 16]`.
- `i`: voice index in `[0, V - 1]`.
- `c`: detune in cents.
- `d`: normalized depth in `[0, 1]`.
- `b`: normalized blend in `[0, 1]`.
- `p_i`: symmetric voice position in `[-1, 1]`.
- `q_i`: Web Audio pan value in `[-1, 1]`.

## Distribution And Detune

Distribute all `V` source nodes symmetrically. For one voice, use center;

```text
p_0 = 0                                      when V = 1
p_i = -1 + (2i / (V - 1))                    when V >= 2
```

Properties:

```text
p_0 = -1                                    when V >= 2
p_(V - 1) = 1                               when V >= 2
sum(p_i for i in [0, V - 1]) = 0
p_i = -p_(V - 1 - i)
```

Each source receives its pitch offset in cents:

```text
detune_i = c * p_i
```

The corresponding frequency ratio is:

```text
ratio(x) = 2^(x / 1200)
frequency_i = rootFrequency * ratio(detune_i)
ratio(-x) = 1 / ratio(x)
```

This distribution has no systematic pitch drift and is symmetric in logarithmic

Connect existing shared frequency and detune modulation to every subvoice's

## Depth And Equal-Power Panning

Depth scales the assigned stereo positions:

```text
q_i = d * p_i
```

At `d = 0`, every source is centered. At `d = 1`, sources span assigned

Each source must route through a `StereoPannerNode`. It is specified as an

```text
leftGain(q) = cos((q + 1) * pi / 4)
rightGain(q) = sin((q + 1) * pi / 4)
leftGain(q)^2 + rightGain(q)^2 = 1
```

Thus a source keeps constant power while moving from left to right. Do not

Panning must occur per subvoice, before their mix. The signal becomes stereo at

## Blend And Normalization

Axiom Blend changes relative level by position. At zero, central voices are

```text
centerWeight_i = 1 / (1 + abs(p_i))
rawGain_i = (1 - b) * centerWeight_i + b
normalizer = sqrt(sum(rawGain_k^2 for k in [0, V - 1]))
gain_i = rawGain_i / normalizer
```

The gain vector has unit power:

```text
sum(gain_i^2 for i in [0, V - 1]) = 1
```

At `b = 1`, every voice is `1 / sqrt(V)`. At `b = 0`, a center voice has twice

Detuned copies remain partly correlated, especially on attacks. Peaks can rise

## Phase

Phase Plant offers Hard, Smooth, and Synthetic phase modes. Axiom does not

A future phase mode must be a separate explicit parameter.

## Graph And Lifecycle

Per active oscillator:

```text
OscillatorNode -> per-subvoice GainNode -> StereoPannerNode -> outputGain
... one path for every V
```

Existing `frequencySource` and `detuneSource` connect to every active

The oscillator keeps its public `frequency`, `detune`, and `gain` AudioParam

## Capacity

Axiom has three oscillators per synth voice and a 16-voice synth pool:

```text
3 oscillators * 16 synth voices * 16 unison voices = 768 OscillatorNodes
```

At this maximum, graph also has 768 panners and 768 per-subvoice gains. This

## Examples

| Voices | Detune   | Depth | Blend | Result                                                |
| ------ | -------- | ----- | ----- | ----------------------------------------------------- |
| 1      | any      | any   | any   | One centered source at normal level                   |
| 2      | 20 cents | 100%  | 100%  | -20, +20 cents; pans -1, +1; gain 0.707 each          |
| 3      | 20 cents | 100%  | 100%  | -20, 0, +20 cents; pans -1, 0, +1; gain 0.577 each    |
| 5      | 12 cents | 50%   | 0%    | -12, -6, 0, +6, +12 cents; center source highest gain |
| 5      | 12 cents | 50%   | 100%  | Equal gain; pans -0.5, -0.25, 0, +0.25, +0.5          |

## Sources

- Kilohearts, [Phase Plant: Unison Settings](https://kilohearts.com/docs/phase_plant#unison_settings), accessed 2026-09-18.
- W3C, [Web Audio API: StereoPannerNode](https://webaudio.github.io/web-audio-api/#stereopannernode), accessed 2026-09-18.
- MDN, [StereoPannerNode](https://developer.mozilla.org/en-US/docs/Web/API/StereoPannerNode), accessed 2026-09-18.
- Ableton, [Live Instrument Reference: Analog](https://www.ableton.com/en/live-manual/12/live-instrument-reference/), accessed 2026-09-18.
- Image-Line, [Harmless manual: Unison](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/plugins/Harmless.htm), accessed 2026-09-18.
