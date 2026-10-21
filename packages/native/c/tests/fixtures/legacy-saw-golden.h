#ifndef LEGACY_SAW_GOLDEN_H
#define LEGACY_SAW_GOLDEN_H

#include <stdint.h>

/*
 * Exact bit fixtures are supported for the native C build's GCC C11 -O2
 * configuration with IEEE-754 binary32 float/binary64 double, default
 * round-to-nearest behavior, and no fast-math flags. Other compiler or
 * floating-point configurations may differ by bits and are outside this
 * fixture's portability guarantee.
 */
#define LEGACY_SAW_SAMPLE_RATE 48000.0
#define LEGACY_SAW_STATIC_FRAMES 64
#define LEGACY_SAW_FREQUENCY_DETUNE_FRAMES 64
#define LEGACY_SAW_FRACTIONAL_SYNC_FRAMES 8

#define LEGACY_SAW_STATIC_PHASE 0.125
#define LEGACY_SAW_FREQUENCY_DETUNE_PHASE 0.271
#define LEGACY_SAW_FRACTIONAL_SYNC_PHASE 0.4375

#define LEGACY_SAW_STATIC_FINAL_PHASE 0x1.6c5f92c5f92cp-1
#define LEGACY_SAW_FREQUENCY_DETUNE_FINAL_PHASE 0x1.444f78d4fdf3fp-1
#define LEGACY_SAW_FRACTIONAL_SYNC_FINAL_PHASE 0x1.ee5d4c3b2a19p-5

static const float
  legacy_saw_frequency_sequence[LEGACY_SAW_FREQUENCY_DETUNE_FRAMES] = {
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
};

static const float
  legacy_saw_detune_sequence[LEGACY_SAW_FREQUENCY_DETUNE_FRAMES] = {
    -12.5f, 0.0f,  7.25f,  -3.0f, 14.0f,  0.0f,  -6.5f,  2.25f, -12.5f, 0.0f,
    7.25f,  -3.0f, 14.0f,  0.0f,  -6.5f,  2.25f, -12.5f, 0.0f,  7.25f,  -3.0f,
    14.0f,  0.0f,  -6.5f,  2.25f, -12.5f, 0.0f,  7.25f,  -3.0f, 14.0f,  0.0f,
    -6.5f,  2.25f, -12.5f, 0.0f,  7.25f,  -3.0f, 14.0f,  0.0f,  -6.5f,  2.25f,
    -12.5f, 0.0f,  7.25f,  -3.0f, 14.0f,  0.0f,  -6.5f,  2.25f, -12.5f, 0.0f,
    7.25f,  -3.0f, 14.0f,  0.0f,  -6.5f,  2.25f, -12.5f, 0.0f,  7.25f,  -3.0f,
    14.0f,  0.0f,  -6.5f,  2.25f,
};

static const float
  legacy_saw_sync_frequency[LEGACY_SAW_FRACTIONAL_SYNC_FRAMES] = {
    220.0f, 330.0f, 440.0f, 550.0f, 660.0f, 770.0f, 880.0f, 990.0f,
};
static const float legacy_saw_sync_signal[LEGACY_SAW_FRACTIONAL_SYNC_FRAMES] = {
  -1.0f, -0.25f, 0.75f, 1.0f, -1.0f, 0.5f, 1.0f, -1.0f,
};

static const uint32_t legacy_saw_static_golden_bits[LEGACY_SAW_STATIC_FRAMES] =
  {
    UINT32_C(0xbf6bd6fc), UINT32_C(0xbf68d253), UINT32_C(0xbf659a83),
    UINT32_C(0xbf623040), UINT32_C(0xbf5e9449), UINT32_C(0xbf5ac76a),
    UINT32_C(0xbf56ca79), UINT32_C(0xbf529e56), UINT32_C(0xbf4e43ec),
    UINT32_C(0xbf49bc30), UINT32_C(0xbf45081f), UINT32_C(0xbf4028c4),
    UINT32_C(0xbf3b1f30), UINT32_C(0xbf35ec7f), UINT32_C(0xbf3091d4),
    UINT32_C(0xbf2b105d), UINT32_C(0xbf256950), UINT32_C(0xbf1f9dea),
    UINT32_C(0xbf19af72), UINT32_C(0xbf139f35), UINT32_C(0xbf0d6e89),
    UINT32_C(0xbf071ec9), UINT32_C(0xbf00b158), UINT32_C(0xbef44f42),
    UINT32_C(0xbee70625), UINT32_C(0xbed98a44), UINT32_C(0xbecbde97),
    UINT32_C(0xbebe061f), UINT32_C(0xbeb003e6), UINT32_C(0xbea1db00),
    UINT32_C(0xbe938e89), UINT32_C(0xbe8521a7), UINT32_C(0xbe6d2f07),
    UINT32_C(0xbe4fe6a3), UINT32_C(0xbe327091), UINT32_C(0xbe14d349),
    UINT32_C(0xbdee2a9c), UINT32_C(0xbdb27a52), UINT32_C(0xbd6d45a0),
    UINT32_C(0xbceac4f3), UINT32_C(0x3a269de1), UINT32_C(0x3cf52dad),
    UINT32_C(0x3d727845), UINT32_C(0x3db51237), UINT32_C(0x3df0c082),
    UINT32_C(0x3e161cf3), UINT32_C(0x3e33b8aa), UINT32_C(0x3e512ce3),
    UINT32_C(0x3e6e7326), UINT32_C(0x3e85c282), UINT32_C(0x3e942e0d),
    UINT32_C(0x3ea27909), UINT32_C(0x3eb0a052), UINT32_C(0x3ebea0cc),
    UINT32_C(0x3ecc7763), UINT32_C(0x3eda210d), UINT32_C(0x3ee79ac9),
    UINT32_C(0x3ef4e1a2), UINT32_C(0x3f00f956), UINT32_C(0x3f076584),
    UINT32_C(0x3f0db3f2), UINT32_C(0x3f13e33d), UINT32_C(0x3f19f20a),
    UINT32_C(0x3f1fdf03),
};
static const uint32_t
  legacy_saw_frequency_detune_golden_bits[LEGACY_SAW_FREQUENCY_DETUNE_FRAMES] =
    {
      UINT32_C(0xbf26a41a), UINT32_C(0xbf23c195), UINT32_C(0xbf20a3b1),
      UINT32_C(0xbf1d4918), UINT32_C(0xbf19af55), UINT32_C(0xbf15cd52),
      UINT32_C(0xbf11a710), UINT32_C(0xbf0d3249), UINT32_C(0xbf090216),
      UINT32_C(0xbf05cb13), UINT32_C(0xbf0254ef), UINT32_C(0xbefd3e2f),
      UINT32_C(0xbef54ccd), UINT32_C(0xbeecc5a7), UINT32_C(0xbee3b172),
      UINT32_C(0xbed9f9e3), UINT32_C(0xbed1122e), UINT32_C(0xbeca1c64),
      UINT32_C(0xbec2a374), UINT32_C(0xbebaa7eb), UINT32_C(0xbeb221e6),
      UINT32_C(0xbea9042e), UINT32_C(0xbe9f57c8), UINT32_C(0xbe9504f0),
      UINT32_C(0xbe8bcad3), UINT32_C(0xbe847186), UINT32_C(0xbe7925dc),
      UINT32_C(0xbe6862bd), UINT32_C(0xbe568697), UINT32_C(0xbe437ddd),
      UINT32_C(0xbe2f5a82), UINT32_C(0xbe19eacf), UINT32_C(0xbe073b6c),
      UINT32_C(0xbdf01dc8), UINT32_C(0xbdcfb234), UINT32_C(0xbdad4483),
      UINT32_C(0xbd88a821), UINT32_C(0xbd438a94), UINT32_C(0xbce2fa53),
      UINT32_C(0xbbd2e189), UINT32_C(0x3c3ec5c4), UINT32_C(0x3cda15b0),
      UINT32_C(0x3d2e6d9a), UINT32_C(0x3d73ab1e), UINT32_C(0x3d9e93f5),
      UINT32_C(0x3dc579a4), UINT32_C(0x3dee6625), UINT32_C(0x3e0cdfda),
      UINT32_C(0x3e1ed4e0), UINT32_C(0x3e2e0393), UINT32_C(0x3e3e2838),
      UINT32_C(0x3e4f33f9), UINT32_C(0x3e614230), UINT32_C(0x3e744ea5),
      UINT32_C(0x3e842536), UINT32_C(0x3e8eb3cc), UINT32_C(0x3e97394e),
      UINT32_C(0x3e9e9441), UINT32_C(0x3ea6615e), UINT32_C(0x3eae97d4),
      UINT32_C(0x3eb745fe), UINT32_C(0x3ec065f0), UINT32_C(0x3ec9f0ea),
      UINT32_C(0x3ed3fec6),
};
static const uint32_t
  legacy_saw_fractional_sync_golden_bits[LEGACY_SAW_FRACTIONAL_SYNC_FRAMES] = {
    UINT32_C(0xbe368214), UINT32_C(0xbe246335), UINT32_C(0xbf7ff02e),
    UINT32_C(0xbf7fa977), UINT32_C(0xbf7f0092), UINT32_C(0xbf7ff64a),
    UINT32_C(0xbf7f63ef), UINT32_C(0xbf7de3a3),
};

#endif
