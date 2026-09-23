# Rust build support in CI/CD — design

Date: 2026-09-21

## Context

`packages/axiom-native` is a Rust `wasm-bindgen` crate built with `wasm-pack`
(`--target web`). Output lands in gitignored `packages/axiom-native/pkg/`, which
`packages/axiom-native/src/index.ts` imports as an asset (`../pkg/axiom_native_bg.wasm?url`).

Dependency chain for the built app: `app` → `@axiom/axiom-synth` →
`@axiom/audio-engine` → `@axiom/axiom-native`. A clean checkout has no `pkg/`
artifacts, so **any job that builds TS must build the Rust crate first**.

## Current state and gaps

| Workflow           | Rust + wasm-pack? | Problem                                                             |
| ------------------ | ----------------- | ------------------------------------------------------------------- |
| `build.yml` (PR)   | yes               | Lint step is prettier-only — no Rust fmt/clippy                     |
| `test.yml`         | yes               | `Native Rust tests` uses wrong filter `@axiom/audio-native` → fails |
| `deploy-pages.yml` | **no**            | Runs only `build:pages` → wasm pkg missing → build fails            |
| all                | —                 | No Cargo caching (cold rebuild every job)                           |
| hooks              | —                 | pre-commit: prettier only; pre-push: build only (no cargo test)     |

## Design

1. **`build:pages` builds native first** (root `package.json`):
   `"build:pages": "pnpm --filter @axiom/axiom-native build && pnpm --filter @axiom/app build:pages"`.
   Guarantees wasm pkg exists for the Pages app build in clean checkouts.
   Fixes deploy-pages build failure and keeps local parity.

2. **Fix `test.yml`**: filter `@axiom/audio-native` → `@axiom/axiom-native`.

3. **Root convenience scripts**:
   - `test:native`: `pnpm --filter @axiom/axiom-native test` (cargo test)
   - `lint:native`: cargo fmt `--check` + cargo clippy `-D warnings` for the crate

4. **CI lint includes Rust**: `build.yml` and `test.yml` Lint steps run
   `pnpm run lint:native` alongside `pnpm run lint`.

5. **deploy-pages.yml adds Rust setup**: `dtolnay/rust-toolchain@stable` +
   `jetli/wasm-pack-action@v0.5.0` after checkout.

6. **Cargo caching in all three workflows** (`actions/cache@v4`):
   cache `~/.cargo/registry`, `~/.cargo/git`, `packages/axiom-native/rust/target`,
   keyed on `hashFiles('packages/axiom-native/rust/Cargo.lock')`.

7. **Hooks**:
   - pre-commit: after lint-staged, run `cargo fmt --check` (blocks on
     unformatted Rust, same gate CI enforces).
   - pre-push: after `pnpm run build`, run `pnpm run test:native`.

8. **Docs**: update `docs/codebase/INTEGRATIONS.md` (CI inventory + tests,
   deployment pipeline) and `docs/codebase/STACK.md` (Rust toolchain entry) if
   missing.

## Explicit non-goals

- napi-rs / native node module path — crate stays wasm-bindgen for browser.
- Cross-platform/matrix Rust builds — workflows run `ubuntu-latest` only, same
  as today.
- wasm-pack internal cache (`~/.cache/wasm-pack`) — minor vs cargo target.

## Verification

- `pnpm run lint` and `pnpm run lint:native` clean locally.
- `pnpm run build` and `pnpm run build:pages` succeed locally (native first).
- `cargo test` passes (existing 4 oscillator unit tests).
- Hooks run without error on commit/push.
