# Wasm dev watch — design

Date: 2026-09-22

## Context

`pnpm dev` runs plain `vite` (`app/package.json`). The native package
`packages/axiom-native` is built by `wasm-pack build ./rust --target web
--out-dir ../pkg` (`build:wasm` script) into gitignored `pkg/`, which the
library imports from `src/index.ts` (`../pkg/axiom_native_bg.wasm?url`) and
`src/processors/saw.ts` (`../../pkg/axiom_native` glue). No tooling rebuilds
wasm when Rust sources change: editing `rust/src/lib.rs` serves stale
artifacts silently, and a fresh clone fails outright because nothing in the
dev path creates `pkg/`.

Alternatives evaluated: `concurrently` + `cargo-watch` (extra process,
install burden), third-party Vite plugins (`vite-plugin-wasm-pack-watcher`,
`vite-plugin-rsw` — low stars, stale, heavy extra CLI), an own Vite plugin
(now rejected — Vite already watches imported `pkg/` files and full-reloads
on change, so a plugin buys little). Chosen: a package-level `dev` script in
`@axiom/axiom-native` using chokidar, run in parallel with app's vite by the
standard pnpm workspace convention.

## Design

### 1. Native package dev script

- `packages/axiom-native/scripts/dev-watch.mjs` — plain Node ESM script,
  `chokidar` as the only new devDependency. A `.mjs` script is deliberately
  outside every tsconfig's `include`; no TypeScript/type-check coverage.
- `"dev": "node scripts/dev-watch.mjs"` in `packages/axiom-native/package.json`.

### 2. Watch and build behavior

- Build command: `spawn('pnpm', ['--filter', '@axiom/axiom-native',
'build:wasm'])` with repo-root cwd. The package.json script stays the
  single source of truth for wasm-pack arguments.
- On start: run one build immediately — catches fresh clones (no `pkg/`) and
  stale/half-written artifacts, cheap when Cargo is incremental.
- Watch globs (package root-relative): `rust/**/*.rs` and `rust/Cargo.toml` —
  dependency edits must rebuild too.
- Debounce `DEBOUNCE_MS = 250`. Builds serialize: never two concurrent
  `wasm-pack` processes. Changes arriving mid-build set a dirty flag; a
  follow-up build runs when the current one finishes.
- Failure: keep the previous `pkg/` artifact, print the child process stderr
  to the watcher terminal, continue watching. Next save retries.

### 3. Browser refresh

No coupling to Vite needed. The wasm asset (`?url` import) and the wasm-pack
glue module are part of Vite's module graph; when the rebuild rewrites files
under `pkg/`, Vite's own watcher invalidates and full-reloads the page.
Accepted race, identical to any dev setup: a page load during a cold build —
or when `pkg/` does not exist yet — may show an import error once; a manual
refresh (or the post-rebuild reload once files exist) resolves it.

### 4. Root dev wiring

- Root `package.json`: `"dev": "pnpm -r --parallel --if-present dev"` —
  runs `@axiom/app`'s vite and `@axiom/axiom-native`'s watcher in parallel;
  `--if-present` skips packages without a `dev` script (audio-engine,
  axiom-synth). No `concurrently` dependency.

### 5. Testing

- Extract the debounce/serialize/dirty-flag decision logic into a pure
  `scripts/build-queue.mjs` (imported by `dev-watch.mjs`), so it tests
  without spawning processes.
- Test file `scripts/build-queue.test.mjs`: debounce coalescing, dirty-flag
  re-run after in-flight build, no concurrent spawns, error path keeps
  artifact (returns build outcome). Runs under vitest.
- Add `vitest` devDependency and `"test": "cargo test --manifest-path
rust/Cargo.toml && vitest run"` in `packages/axiom-native/package.json`, so
  root `pnpm test:native` and the CI native job cover both suites. Root
  `pnpm test` stays audio-engine-only (unchanged).

## Explicit non-goals

- No Vite plugin (either own or third-party).
- No `concurrently`, `cargo-watch`, or `rsw` toolchain.
- No HMR of Rust/wasm — full reload only (via Vite's graph watcher).
- No `--dev` vs release profile toggle — `build:wasm` unchanged.
- No docs rewrite beyond what the implementation forces.

## Verification

- Clean checkout (no `pkg/`): `pnpm dev` builds wasm without manual steps;
  app serves once build completes.
- Edit `rust/src/lib.rs`, save: rebuild runs once (debounced), browser
  reloads with new behavior.
- Introduce a Rust compile error, save: watcher terminal prints stderr, old
  wasm keeps playing; fix and save recovers, browser reloads.
- `pnpm test:native` runs cargo tests + vitest queue tests; `pnpm lint`,
  `pnpm build` clean.
