#ifndef LEGACY_SAW_GOLDEN_H
#define LEGACY_SAW_GOLDEN_H

#include <stdint.h>

#define LEGACY_SAW_SAMPLE_RATE 48000.0
#define LEGACY_SAW_STATIC_FRAMES 64
#define LEGACY_SAW_FREQUENCY_DETUNE_FRAMES 64
#define LEGACY_SAW_FRACTIONAL_SYNC_FRAMES 8

#define LEGACY_SAW_STATIC_PHASE 0.125
#define LEGACY_SAW_FREQUENCY_DETUNE_PHASE 0.271
#define LEGACY_SAW_FRACTIONAL_SYNC_PHASE 0.4375

#define LEGACY_SAW_STATIC_FINAL_PHASE 0x1.6c3a28f5c28fcp-1
#define LEGACY_SAW_FREQUENCY_DETUNE_FINAL_PHASE 0x1.44385bfd44f2ep-1
#define LEGACY_SAW_FRACTIONAL_SYNC_FINAL_PHASE 0x1.ee1fb8c66dae8p-5

static const float legacy_saw_frequency_sequence[LEGACY_SAW_FREQUENCY_DETUNE_FRAMES] = {
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
    220.0f, 233.0f, 247.0f, 262.0f, 277.0f, 294.0f, 311.0f, 330.0f,
};

static const float legacy_saw_detune_sequence[LEGACY_SAW_FREQUENCY_DETUNE_FRAMES] = {
    -12.5f, 0.0f, 7.25f, -3.0f, 14.0f, 0.0f, -6.5f, 2.25f,
    -12.5f, 0.0f, 7.25f, -3.0f, 14.0f, 0.0f, -6.5f, 2.25f,
    -12.5f, 0.0f, 7.25f, -3.0f, 14.0f, 0.0f, -6.5f, 2.25f,
    -12.5f, 0.0f, 7.25f, -3.0f, 14.0f, 0.0f, -6.5f, 2.25f,
    -12.5f, 0.0f, 7.25f, -3.0f, 14.0f, 0.0f, -6.5f, 2.25f,
    -12.5f, 0.0f, 7.25f, -3.0f, 14.0f, 0.0f, -6.5f, 2.25f,
    -12.5f, 0.0f, 7.25f, -3.0f, 14.0f, 0.0f, -6.5f, 2.25f,
    -12.5f, 0.0f, 7.25f, -3.0f, 14.0f, 0.0f, -6.5f, 2.25f,
};

static const float legacy_saw_sync_frequency[LEGACY_SAW_FRACTIONAL_SYNC_FRAMES] = {
    220.0f, 330.0f, 440.0f, 550.0f, 660.0f, 770.0f, 880.0f, 990.0f,
};
static const float legacy_saw_sync_signal[LEGACY_SAW_FRACTIONAL_SYNC_FRAMES] = {
    -1.0f, -0.25f, 0.75f, 1.0f, -1.0f, 0.5f, 1.0f, -1.0f,
};

static const uint32_t legacy_saw_static_golden_bits[LEGACY_SAW_STATIC_FRAMES] = {
    UINT32_C(0xbf6bd708), UINT32_C(0xbf68d2c5), UINT32_C(0xbf659b66), UINT32_C(0xbf6231a1),
    UINT32_C(0xbf5e9635), UINT32_C(0xbf5ac9ed), UINT32_C(0xbf56cd9e), UINT32_C(0xbf52a229),
    UINT32_C(0xbf4e4877), UINT32_C(0xbf49c17d), UINT32_C(0xbf450e39), UINT32_C(0xbf402fb4),
    UINT32_C(0xbf3b26ff), UINT32_C(0xbf35f535), UINT32_C(0xbf309b7a), UINT32_C(0xbf2b1afa),
    UINT32_C(0xbf2574ec), UINT32_C(0xbf1faa8b), UINT32_C(0xbf19bd1e), UINT32_C(0xbf13adf2),
    UINT32_C(0xbf0d7e5c), UINT32_C(0xbf072fb6), UINT32_C(0xbf00c363), UINT32_C(0xbef47599),
    UINT32_C(0xbee72ec2), UINT32_C(0xbed9b52d), UINT32_C(0xbecc0bcd), UINT32_C(0xbebe35a3),
    UINT32_C(0xbeb035b9), UINT32_C(0xbea20f20), UINT32_C(0xbe93c4f4), UINT32_C(0xbe855a59),
    UINT32_C(0xbe6da4f0), UINT32_C(0xbe506103), UINT32_C(0xbe32ef59), UINT32_C(0xbe155668),
    UINT32_C(0xbdef395d), UINT32_C(0xbdb39167), UINT32_C(0xbd6f840d), UINT32_C(0xbcef6170),
    UINT32_C(0x38738b4f), UINT32_C(0x3cf054e0), UINT32_C(0x3d6ffd9d), UINT32_C(0x3db3ce0e),
    UINT32_C(0x3def75d5), UINT32_C(0x3e157486), UINT32_C(0x3e330d53), UINT32_C(0x3e507ed2),
    UINT32_C(0x3e6dc28c), UINT32_C(0x3e85690b), UINT32_C(0x3e93d387), UINT32_C(0x3ea21d90),
    UINT32_C(0x3eb04403), UINT32_C(0x3ebe43c5), UINT32_C(0x3ecc19c3), UINT32_C(0x3ed9c2f3),
    UINT32_C(0x3ee73c57), UINT32_C(0x3ef482f8), UINT32_C(0x3f00c9f7), UINT32_C(0x3f07362c),
    UINT32_C(0x3f0d84b3), UINT32_C(0x3f13b42a), UINT32_C(0x3f19c334), UINT32_C(0x3f1fb07e),
};
static const uint32_t
    legacy_saw_frequency_detune_golden_bits[LEGACY_SAW_FREQUENCY_DETUNE_FRAMES] = {
        UINT32_C(0xbf26a434), UINT32_C(0xbf23c20c), UINT32_C(0xbf20a48e), UINT32_C(0xbf1d4a64),
        UINT32_C(0xbf19b11a), UINT32_C(0xbf15cf9c), UINT32_C(0xbf11a9e7), UINT32_C(0xbf0d35bc),
        UINT32_C(0xbf090619), UINT32_C(0xbf05cf87), UINT32_C(0xbf0259de), UINT32_C(0xbefd4915),
        UINT32_C(0xbef558d0), UINT32_C(0xbeecd2de), UINT32_C(0xbee3bff0), UINT32_C(0xbeda09c3),
        UINT32_C(0xbed12345), UINT32_C(0xbeca2e7a), UINT32_C(0xbec2b69c), UINT32_C(0xbebabc35),
        UINT32_C(0xbeb23767), UINT32_C(0xbea91afe), UINT32_C(0xbe9f6ff7), UINT32_C(0xbe951e98),
        UINT32_C(0xbe8be5b7), UINT32_C(0xbe848d76), UINT32_C(0xbe795ff9), UINT32_C(0xbe689f33),
        UINT32_C(0xbe56c58e), UINT32_C(0xbe43bf7f), UINT32_C(0xbe2f9eea), UINT32_C(0xbe1a3230),
        UINT32_C(0xbe078526), UINT32_C(0xbdf0b562), UINT32_C(0xbdd04e33), UINT32_C(0xbdade519),
        UINT32_C(0xbd894d96), UINT32_C(0xbd44dfc0), UINT32_C(0xbce5b9da), UINT32_C(0xbbde39b3),
        UINT32_C(0x3c38f85a), UINT32_C(0x3cd71f82), UINT32_C(0x3d2cea60), UINT32_C(0x3d721f7a),
        UINT32_C(0x3d9dc9b5), UINT32_C(0x3dc4aac5), UINT32_C(0x3ded928f), UINT32_C(0x3e0c7393),
        UINT32_C(0x3e1e66e9), UINT32_C(0x3e2d93ef), UINT32_C(0x3e3db6d6), UINT32_C(0x3e4ec0d1),
        UINT32_C(0x3e60cd2e), UINT32_C(0x3e73d7bb), UINT32_C(0x3e83e8cd), UINT32_C(0x3e8e7665),
        UINT32_C(0x3e96fb4f), UINT32_C(0x3e9e559c), UINT32_C(0x3ea6220f), UINT32_C(0x3eae57db),
        UINT32_C(0x3eb70558), UINT32_C(0x3ec0249c), UINT32_C(0x3ec9aeee), UINT32_C(0x3ed3bc1f),
};
static const uint32_t
    legacy_saw_fractional_sync_golden_bits[LEGACY_SAW_FRACTIONAL_SYNC_FRAMES] = {
        UINT32_C(0xbe3682e7), UINT32_C(0xbe246653), UINT32_C(0xbf7ff032), UINT32_C(0xbf7fa98d),
        UINT32_C(0xbf7f00d2), UINT32_C(0xbf7ff64d), UINT32_C(0xbf7f6417), UINT32_C(0xbf7de42c),
};

#endif
