# CI Emscripten Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `emcc` available in all GitHub Actions workflows that build the workspace or app, and document the native package toolchain.

**Architecture:** Each workflow installs the same pinned Emscripten SDK with the official `emscripten-core/setup-emsdk` action before dependency installation or compilation. README and codebase documentation describe `packages/native`, its build/test commands, and the SDK prerequisite.

**Tech Stack:** GitHub Actions YAML, Emscripten SDK, pnpm workspaces, Prettier.

## Global Constraints

- Use `emscripten-core/setup-emsdk@v15` with Emscripten version `6.0.12` in all four workflows.
- Set up Emscripten before dependency installation/build steps that may invoke `make wasm`.
- Do not change C, Makefile, or JavaScript/WASM generation behavior.
- Do not add Emscripten installation to local pnpm scripts.
- Add no deployment trigger, permission, caching, or runtime behavior changes.
- Use named constants for meaningful code literals; workflow SDK versions remain explicit pins.

---

## File Map

- Modify `.github/workflows/build.yml` — prepare Emscripten before the workspace build.
- Modify `.github/workflows/test.yml` — prepare Emscripten before workspace tests/build.
- Modify `.github/workflows/deploy-pages.yml` — prepare Emscripten before production app build.
- Modify `.github/workflows/pr-preview.yml` — prepare Emscripten before PR app build.
- Modify `README.md` — explain native package, local commands, and Emscripten prerequisite.
- Modify `AGENTS.md` — correct package/test/CI summaries.
- Modify `docs/codebase/STACK.md` — record SDK and native package commands/toolchain.
- Modify `docs/codebase/STRUCTURE.md` — include native package and workflow inventory.
- Modify `docs/codebase/INTEGRATIONS.md` — update workflow inventory/evidence for Emscripten builds.
- Modify `docs/codebase/TESTING.md` — document native package test/build coverage and prerequisites.
- Modify `docs/codebase/CONVENTIONS.md` — correct the test-framework and CI summaries.

### Task 1: Set up pinned Emscripten in all build workflows

**Files:**

- Modify: `.github/workflows/build.yml`
- Modify: `.github/workflows/test.yml`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `.github/workflows/pr-preview.yml`

**Interfaces:**

- Each workflow consumes the official `emscripten-core/setup-emsdk@v15` action.
- Each workflow installs Emscripten version `6.0.12`; `emcc` is available on `PATH` afterward.

- [ ] **Step 1: Add the pinned SDK setup step to each workflow**

Add this step after checkout and before dependency installation or build steps:

```yaml
- name: Setup Emscripten
  uses: emscripten-core/setup-emsdk@v15
  with:
    version: 6.0.12
```

In `pr-preview.yml`, retain the existing `if: github.event.action != 'closed'` condition on the SDK setup step, because closed events only remove previews and do not build. Keep the step before `Install dependencies` and `Build PR preview`.

- [ ] **Step 2: Check workflow consistency and ordering**

Inspect the four workflow files. Confirm every setup uses the same action and version, runs only where a build may occur, and precedes dependency installation/build. Confirm no trigger, permission, concurrency, deploy, or preview behavior changed.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Commit workflow changes**

```bash
git add .github/workflows/build.yml .github/workflows/test.yml .github/workflows/deploy-pages.yml .github/workflows/pr-preview.yml
git commit -m "ci: install emscripten for wasm builds"
```

### Task 2: Document native build, test, and CI prerequisites

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/codebase/STACK.md`
- Modify: `docs/codebase/STRUCTURE.md`
- Modify: `docs/codebase/INTEGRATIONS.md`
- Modify: `docs/codebase/TESTING.md`
- Modify: `docs/codebase/CONVENTIONS.md`

**Interfaces:**

- `@axiom/native` is the workspace package at `packages/native/`.
- `pnpm --filter @axiom/native build` runs JS type-checking and `make wasm`.
- `pnpm --filter @axiom/native test` runs native C tests and Vitest tests.
- `pnpm build` and CI build workflows require Emscripten `emcc` on `PATH`.
- CI uses `emscripten-core/setup-emsdk@v15` with SDK `6.0.12`.

- [ ] **Step 1: Update README development and package overview**

In `README.md`, update the development commands to reflect current workspace behavior and add the native package commands:

```bash
pnpm install
pnpm dev                          # dev server on http://localhost:4000
pnpm test                         # tests across workspace packages
pnpm build                        # all workspace builds; requires emcc on PATH
pnpm --filter @axiom/native build # type-check native JS and compile WASM
pnpm --filter @axiom/native test  # native C and JS tests
pnpm build:pages                  # build with the /axiom-synth/ base path
pnpm format                       # prettier --write
```

Add a short note that the `@axiom/native` package compiles its C WebAssembly module with Emscripten (`emcc`), and developers must install/configure the SDK locally before running its build or the full workspace build. Mention CI installs pinned SDK version `6.0.12` through `emscripten-core/setup-emsdk@v15`.

- [ ] **Step 2: Correct repository agent guidance**

In `AGENTS.md`, add `packages/native/` to the package map, update the `pnpm test` description to include native C and JS tests, and state that `pnpm build` requires `emcc` on `PATH` because native WASM compilation runs in the workspace build.

- [ ] **Step 3: Update codebase stack and testing docs**

In `docs/codebase/STACK.md`, document the native package and Emscripten toolchain, update build/test command descriptions, and update CI evidence to include all applicable workflows.

In `docs/codebase/TESTING.md`, list native C tests (`make test -C packages/native/c`) and native JavaScript tests (`pnpm --filter @axiom/native test:js`), and state that workspace build includes the Emscripten WASM compilation step.

In `docs/codebase/CONVENTIONS.md`, update the test framework and command summary to include native C tests and note the Emscripten setup in build-capable CI workflows.

- [ ] **Step 4: Update structure and integration inventory**

In `docs/codebase/STRUCTURE.md`, add `packages/native/` with its TypeScript worker and C/Emscripten WASM sources, and update workflow inventory to include build, test, deploy, and PR preview workflows.

In `docs/codebase/INTEGRATIONS.md`, update the GitHub Actions integration purpose and evidence to reflect Emscripten setup and WASM compilation in build-capable workflows.

- [ ] **Step 5: Format-check documentation**

Run: `pnpm lint`

Expected: `prettier --check .` passes.

- [ ] **Step 6: Commit documentation changes**

```bash
git add README.md AGENTS.md docs/codebase/STACK.md docs/codebase/STRUCTURE.md docs/codebase/INTEGRATIONS.md docs/codebase/TESTING.md
git commit -m "docs: document native emscripten toolchain"
```

### Task 3: Verify Emscripten build and workspace checks

**Files:**

- No additional files; validate Tasks 1 and 2.

**Interfaces:**

- `emcc -v` reports Emscripten `6.0.12` in the validation environment.
- `pnpm build`, `pnpm test`, and `pnpm lint` complete successfully.

- [ ] **Step 1: Verify the toolchain version and executable path**

Run:

```bash
command -v emcc
emcc -v
```

Expected: `emcc` resolves from `PATH` and reports version `6.0.12`.

- [ ] **Step 2: Build all workspace packages**

Run: `pnpm build`

Expected: all workspace packages build, including `@axiom/native` running `make wasm` successfully.

- [ ] **Step 3: Run workspace tests and formatting check**

Run: `pnpm test`

Expected: all workspace tests pass, including native C and JS tests.

Run: `pnpm lint`

Expected: Prettier reports all files formatted.

- [ ] **Step 4: Review final diff**

Run: `git diff --check`

Expected: no whitespace errors. Inspect `git diff` and confirm only the four workflows and named docs changed. Confirm all four workflows use the same action/version and documentation agrees on the local and CI prerequisites.

## Self-Review

- Spec coverage: Task 1 covers all four build workflows and puts `emcc` on `PATH`; Task 2 updates README and relevant codebase/repository docs; Task 3 verifies pinned toolchain behavior, workspace build/tests, and lint.
- Placeholder scan: no TBD/TODO or unbounded implementation steps remain.
- Workflow conditions: PR preview skips Emscripten setup on closed events, which only remove deployed previews.
- Version consistency: all workflow and documentation references use SDK `6.0.12` and action `@v15`.
