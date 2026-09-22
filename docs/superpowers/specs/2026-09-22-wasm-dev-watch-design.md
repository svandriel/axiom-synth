# Wasm dev watch — design

Date: 2026-09-22

## Context

`pnpm dev` runs the Vite dev server (`app/package.json`). The native package
`packages/axiom-native` is built by `wasm-pack build ./rust --target web
--out-dir ../pkg` (`build:wasm` script) into gitignored `pkg/`, which the
library imports from `src/index.ts` (`../pkg/axiom_native_bg.wasm?url`) and
`src/processors/saw.ts` (`../../pkg/axiom_native` glue). No tooling rebuilds
wasm when Rust sources change: editing `rust/src/lib.rs` serves stale
artifacts silently, and a fresh clone fails outright because nothing in the
dev path creates `pkg/`.

Alternatives evaluated: `concurrently` + `cargo-watch`, third-party Vite
plugins (`vite-plugin-wasm-pack-watcher`, `vite-plugin-rsw`), and an own Vite
plugin or custom `chokidar`-based script (rejected — Vite already
full-reloads when the imported `pkg/` files change, and a bespoke
debounce/serialize scheduler is over-engineering for dev tooling; cargo's
target-dir lock already serializes concurrent `wasm-pack` runs). Chosen: a
package-level `dev` script in `@axiom/axiom-native` built on `chokidar-cli`,
run in parallel with app's vite via the standard pnpm workspace convention.
Zero custom JS, one new devDependency.

## Design

### 1. Native package dev script

`packages/axiom-native/package.json`, `chokidar-cli` as the only new
devDependency:

```json
"dev": "pnpm run build:wasm && chokidar \"rust/**/*.rs\" \"rust/Cargo.toml\" -c \"pnpm run build:wasm\" --silent"
```

- pnpm recursive (`pnpm -r --parallel dev`) runs each package script with
  cwd = that package's directory, so the `rust/**/*.rs` glob, the
  `Cargo.toml` glob, and the self-referencing `pnpm run build:wasm` all
  resolve relative to `packages/axiom-native`.
- No scripts file, no tsconfig involvement, nothing type-checked.

### 2. Watch and build behavior

- `pnpm run build:wasm &&` runs one build before watching starts: catches
  fresh clones (no `pkg/`) and stale/half-written artifacts; `&&` means a
  failed initial build surfaces loudly and skips watching.
- chokidar-cli watches `rust/**/*.rs` (source edits) and `rust/Cargo.toml`
  (dependency edits) and re-runs `build:wasm` on change.
- No debounce flags. When an edit arrives mid-build, cargo's target-dir lock
  serializes the second `wasm-pack`; worst case is a redundant rebuild.
  Accepted for dev tooling.
- A failed rebuild keeps the previous `pkg/` artifact; chokidar-cli keeps
  watching, next save retries. `--silent` avoids command-echo noise.

### 3. Browser refresh

No coupling to Vite needed. The wasm asset (`?url` import) and the wasm-pack
glue module are part of Vite's module graph; when the rebuild rewrites files
under `pkg/`, Vite's own watcher invalidates and full-reloads the page.
Accepted race, identical to any dev setup: a page load before `pkg/` exists
may show an import error once; a manual refresh resolves it.

### 4. Root dev wiring

- Root `package.json`: `"dev": "pnpm -r --parallel --if-present dev"` —
  runs `@axiom/app`'s vite and `@axiom/axiom-native`'s watcher in parallel;
  `--if-present` skips packages without a `dev` script (audio-engine,
  axiom-synth). No `concurrently` dependency.

### 5. Testing

No automated tests. The feature is a thin config change — one script line plus
a devDependency — with no testable logic (debounce/serialize was removed with
the custom-script variant). Behavior is integration-level and covered by the
manual dev loop in Verification; CI already builds the crate (`test:native`,
`pnpm build`), which stays unchanged. No vitest added to the native package.

## Explicit non-goals

- No Vite plugin, no custom watcher script, no scheduler logic.
- No `concurrently`, `cargo-watch`, or `rsw` toolchain.
- No HMR of Rust/wasm — full reload only (via Vite's graph watcher).
- No `--dev` vs release profile toggle — `build:wasm` unchanged.
- No `chokidar` (JS API) package — CLI wrapper only.
- No docs rewrite beyond what the implementation forces.

## Verification

- Clean checkout (no `pkg/`): `pnpm dev` builds wasm without manual steps;
  app serves once build completes.
- Edit `rust/src/lib.rs`, save: rebuild runs, browser reloads with new
  behavior.
- Introduce a Rust compile error, save: terminal prints wasm-pack stderr, old
  wasm keeps playing; fix and save recovers, browser reloads.
- `pnpm lint`, `pnpm build`, `pnpm test:native` clean.
