# CI Emscripten Support Design

## Goal

Ensure GitHub Actions jobs that compile or build the application have the
Emscripten SDK available, so `emcc` is on `PATH` when `@axiom/native` invokes
`make wasm`. Update user and codebase documentation to explain the prerequisite
and CI setup.

## Scope

Add a pinned Emscripten SDK setup step to every workflow that builds the
workspace or application:

- `.github/workflows/build.yml`
- `.github/workflows/test.yml`
- `.github/workflows/deploy-pages.yml`
- `.github/workflows/pr-preview.yml`

The PR preview workflow does not currently invoke the full workspace build, but
it produces an application bundle and should share the same toolchain setup as
other build jobs.

Use `emscripten-core/setup-emsdk@v15` pinned to Emscripten SDK `6.0.12`. Its
setup must make `emcc` available on `PATH` before dependency installation/build
steps that may invoke workspace build scripts. Keep the version consistent
across all four workflows.

Update `README.md` and relevant `docs/codebase` files to document that native
WebAssembly compilation uses Emscripten (`emcc`), the local native package
build/test commands, and CI workflow setup. Update stale package inventory,
build, test, and integration details as needed to represent `packages/native`.

## Out of Scope

- Changing native C, Makefile, or JavaScript/WASM generation behavior.
- Adding emscripten installation to the local `pnpm` scripts.
- Changing deployment triggers, permissions, caching, or workflow structure
  beyond the SDK setup step.
- Altering browser runtime behavior.

## Validation

- Confirm each applicable workflow sets up the same pinned Emscripten SDK before
  any operation that can compile WASM, providing `emcc` on `PATH`.
- Run `pnpm build` in an environment with Emscripten installed and confirm the
  native package's `make wasm` step succeeds.
- Run `pnpm test` and `pnpm lint`.
- Ensure docs describe the native package and its Emscripten prerequisite
  consistently.
