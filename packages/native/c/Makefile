CC      := gcc
EMCC    := emcc

CFLAGS  := -std=c11 -O2 -Wall -Wextra -Wpedantic
TEST_CFLAGS := $(CFLAGS) -DMOOG_SAW_TEST_RNG
LDFLAGS := -lm

INCLUDE := -Iinclude
MATH_INCLUDE := -Isrc

HEADERS := include/moog_saw.h include/moog_oscillator.h src/moog_oscillator_math.h \
	src/moog_oscillator_internal.h src/moog_waveforms.h

SRC     := src/moog_oscillator.c src/moog_waveforms.c src/moog_saw_compat.c
WASM_SRC := $(SRC) src/moog_saw_wasm.c
TEST_SRC := tests/test_moog_saw.c
TEST_GENERIC_SRC := tests/test_moog_oscillator.c
TEST_WAVEFORMS_SRC := tests/test_moog_waveforms.c
TEST_MATH_SRC := tests/test_moog_oscillator_math.c
BENCH_SRC := tests/bench_moog_oscillator.c

BUILD   := dist
NATIVE  := $(BUILD)/native
WASM    := $(BUILD)/wasm
BENCH_DIR := $(BUILD)/bench
WASM_TSD := moog_saw.d.ts

BENCH_FLAGS := -O3

.PHONY: all native test wasm bench bench-wasm clean

all: native wasm

native: $(NATIVE)/test_moog_saw $(NATIVE)/test_moog_oscillator $(NATIVE)/test_moog_waveforms $(NATIVE)/test_moog_oscillator_math

$(NATIVE)/test_moog_saw: Makefile $(SRC) $(TEST_SRC) $(HEADERS)
	@mkdir -p $(NATIVE)
	$(CC) $(TEST_CFLAGS) $(INCLUDE) $(SRC) $(TEST_SRC) $(LDFLAGS) -o $@

$(NATIVE)/test_moog_oscillator: Makefile $(SRC) $(TEST_GENERIC_SRC) $(HEADERS)
	@mkdir -p $(NATIVE)
	$(CC) $(TEST_CFLAGS) $(INCLUDE) $(SRC) $(TEST_GENERIC_SRC) $(LDFLAGS) -o $@

$(NATIVE)/test_moog_waveforms: Makefile src/moog_waveforms.c $(TEST_WAVEFORMS_SRC) $(HEADERS)
	@mkdir -p $(NATIVE)
	$(CC) $(CFLAGS) $(INCLUDE) $(MATH_INCLUDE) src/moog_waveforms.c $(TEST_WAVEFORMS_SRC) $(LDFLAGS) -o $@

$(NATIVE)/test_moog_oscillator_math: Makefile $(TEST_MATH_SRC) $(HEADERS)
	@mkdir -p $(NATIVE)
	$(CC) $(CFLAGS) $(INCLUDE) $(MATH_INCLUDE) $(TEST_MATH_SRC) $(LDFLAGS) -o $@

test: $(NATIVE)/test_moog_saw $(NATIVE)/test_moog_oscillator $(NATIVE)/test_moog_waveforms $(NATIVE)/test_moog_oscillator_math
	$(NATIVE)/test_moog_saw
	$(NATIVE)/test_moog_oscillator
	$(NATIVE)/test_moog_waveforms
	$(NATIVE)/test_moog_oscillator_math

$(NATIVE)/bench_moog_oscillator: Makefile $(SRC) $(BENCH_SRC) $(HEADERS)
	@mkdir -p $(NATIVE)
	$(CC) $(CFLAGS) $(BENCH_FLAGS) $(INCLUDE) $(SRC) $(BENCH_SRC) $(LDFLAGS) -o $@

bench: $(NATIVE)/bench_moog_oscillator
	$(NATIVE)/bench_moog_oscillator

$(BENCH_DIR)/bench_moog_oscillator.cjs: Makefile $(SRC) $(BENCH_SRC) $(HEADERS)
	@mkdir -p $(BENCH_DIR)
	$(EMCC) \
		$(BENCH_FLAGS) \
		-std=c11 \
		$(INCLUDE) \
		$(SRC) $(BENCH_SRC) \
		-sENVIRONMENT=node \
		-sEXIT_RUNTIME=1 \
		-o $@

bench-wasm: $(BENCH_DIR)/bench_moog_oscillator.cjs
	node $<

wasm: $(WASM)/moog_saw.js

$(WASM)/moog_saw.js: Makefile $(WASM_SRC) $(HEADERS)
	@mkdir -p $(WASM)
	$(EMCC) \
		-O3 \
		-std=c11 \
		$(INCLUDE) \
		$(WASM_SRC) \
		-sMODULARIZE=1 \
		-sEXPORT_ES6=1 \
		-sENVIRONMENT=worklet \
		-sSHARED_MEMORY=1 \
		--emit-tsd $(WASM_TSD) \
		-sEXPORTED_FUNCTIONS='["_moog_saw_wasm_init", "_moog_saw_wasm_create","_moog_saw_wasm_destroy","_moog_saw_wasm_reset","_moog_saw_wasm_set_frequency","_moog_saw_wasm_process","_malloc","_free"]' \
		-sEXPORTED_RUNTIME_METHODS='["HEAPF32"]' \
		-o $@

clean:
	rm -rf $(BUILD)
