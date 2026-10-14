CC      := gcc
EMCC    := emcc

CFLAGS  := -std=c11 -O2 -Wall -Wextra -Wpedantic
LDFLAGS := -lm

INCLUDE := -Iinclude
MATH_INCLUDE := -Isrc

HEADERS := include/moog_saw.h src/moog_saw_math.h

SRC     := src/moog_saw.c
WASM_SRC := $(SRC) src/moog_saw_wasm.c
TEST_SRC := tests/test_moog_saw.c
TEST_MATH_SRC := tests/test_moog_saw_math.c
BENCH_SRC := tests/bench_moog_saw.c

BUILD   := dist
NATIVE  := $(BUILD)/native
WASM    := $(BUILD)/wasm
BENCH_DIR := $(BUILD)/bench
WASM_TSD := moog_saw.d.ts

BENCH_FLAGS := -O3

.PHONY: all native test wasm bench bench-wasm clean

all: native wasm

native: $(NATIVE)/test_moog_saw $(NATIVE)/test_moog_saw_math

$(NATIVE)/test_moog_saw: Makefile $(SRC) $(TEST_SRC) $(HEADERS)
	@mkdir -p $(NATIVE)
	$(CC) $(CFLAGS) $(INCLUDE) $(SRC) $(TEST_SRC) $(LDFLAGS) -o $@

$(NATIVE)/test_moog_saw_math: Makefile $(TEST_MATH_SRC) $(HEADERS)
	@mkdir -p $(NATIVE)
	$(CC) $(CFLAGS) $(INCLUDE) $(MATH_INCLUDE) $(TEST_MATH_SRC) $(LDFLAGS) -o $@

test: $(NATIVE)/test_moog_saw $(NATIVE)/test_moog_saw_math
	$(NATIVE)/test_moog_saw
	$(NATIVE)/test_moog_saw_math

$(NATIVE)/bench_moog_saw: Makefile $(SRC) $(BENCH_SRC) $(HEADERS)
	@mkdir -p $(NATIVE)
	$(CC) $(CFLAGS) $(BENCH_FLAGS) $(INCLUDE) $(SRC) $(BENCH_SRC) $(LDFLAGS) -o $@

bench: $(NATIVE)/bench_moog_saw
	$(NATIVE)/bench_moog_saw

$(BENCH_DIR)/bench_moog_saw.cjs: Makefile $(SRC) $(BENCH_SRC) $(HEADERS)
	@mkdir -p $(BENCH_DIR)
	$(EMCC) \
		$(BENCH_FLAGS) \
		-std=c11 \
		$(INCLUDE) \
		$(SRC) $(BENCH_SRC) \
		-sENVIRONMENT=node \
		-sEXIT_RUNTIME=1 \
		-o $@

bench-wasm: $(BENCH_DIR)/bench_moog_saw.cjs
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
		-sEXPORTED_FUNCTIONS='["_moog_saw_wasm_create","_moog_saw_wasm_destroy","_moog_saw_wasm_reset","_moog_saw_wasm_set_frequency","_moog_saw_wasm_process","_malloc","_free"]' \
		-sEXPORTED_RUNTIME_METHODS='["HEAPF32"]' \
		-o $@

clean:
	rm -rf $(BUILD)
