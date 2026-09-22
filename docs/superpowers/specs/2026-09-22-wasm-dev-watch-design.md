# Wasm dev watch plugin — design

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
separate error stream, install burden), third-party Vite plugins
(`vite-plugin-wasm-pack-watcher`, `vite-plugin-rsw` — low stars, stale, or
heavy extra CLI), `vite-plugin-wasm` (solves wasm _loading_, not rebuilding —
irrelevant since loading is plain `?url` imports). Chosen: a small Vite
plugin we own.

## Design

### 1. Location and wiring

- Single file `packages/axiom-native/vite-plugin.ts`, at package root —
  **not** under `src/`, so native build tsconfigs (`tsconfig.app.json` /
  `tsconfig.processor.json`, both `include: ["src/**/*.ts"]`) never compile or
  emit it. The file's type-checking falls out of `app/tsconfig.node.json`,
  which `include`s `vite.config.ts` and therefore follows the plugin import
  (node types, `module: nodenext`). No tsconfig edits unless type-check
  fails.
- Subpath export in `packages/axiom-native/package.json`:
  `"./vite-plugin": { "types": "./vite-plugin.ts", "default": "./vite-plugin.ts" }`
  — package is consumed as source, so no separate workspace package or build
  step.
- `app/vite.config.ts` adds `wasmWatch()` to `plugins`.
- Zero new npm dependencies: Vite's own `server.watcher` (chokidar) +
  Node `child_process.spawn`.

### 2. Build and watch behavior

- Build command: spawn `pnpm --filter @axiom/axiom-native build:wasm` with
  repo-root cwd. The package.json script stays the single source of truth for
  wasm-pack arguments.
- On `configureServer`: always enqueue one build. Cheap when Cargo is
  incremental (catches stale/half-written `pkg/` and fresh clones). Known
  accepted race: first page load during a cold build may fail once; the
  completed rebuild triggers a reload.
- Watch globs (package-relative): `./rust/**/*.rs` and `./rust/Cargo.toml` —
  dependency edits must rebuild too.
- Debounce `DEBOUNCE_MS = 250`. Builds serialize: never two concurrent
  `wasm-pack` processes. Changes arriving mid-build set a dirty flag; a
  follow-up build runs when the current one finishes.

### 3. Reload and failure handling

- Success: invalidate Vite modules under `packages/axiom-native/pkg/`, then
  send `{ type: 'full-reload' }`. Full reload, not HMR — the AudioContext and
  registered worklet cannot hot-swap wasm bytes cleanly.
- Failure: keep the previous `pkg/` artifact, print the child process stderr
  to the terminal, send `{ type: 'error', err }` over the dev server WS
  (Vite client renders the overlay). The dev server never crashes; the next
  save retries.

### 4. Testing

- Extract the debounce/serialize/dirty-flag decision logic into a pure
  `createBuildScheduler()` (same file or sibling), so it tests without
  spawning processes or a running Vite server.
- Test file `packages/axiom-native/vite-plugin.test.ts`: debounce coalescing,
  dirty-flag re-run after in-flight build, no concurrent spawns, error path
  does not clear the artifact.
- Add `vitest` devDependency and `"test": "cargo test --manifest-path
rust/Cargo.toml && vitest run"` in `packages/axiom-native/package.json`, so
  root `pnpm test:native` and the CI native job cover both suites. Root
  `pnpm test` stays audio-engine-only (unchanged).

## Explicit non-goals

- No `cargo-watch`, `concurrently`, or `rsw` toolchain.
- No HMR of Rust/wasm — full reload only.
- No `--dev` vs release profile toggle — `build:wasm` unchanged.
- No docs rewrite beyond what the implementation forces (`STACK.md` command
  mention if needed).

## Verification

- `pnpm dev` on a clean checkout (no `pkg/`) builds wasm without manual
  steps; app serves once build completes.
- Edit `rust/src/lib.rs`, save: rebuild runs once (debounced), browser
  reloads with new behavior.
- Introduce a Rust compile error, save: overlay shows error, terminal prints
  stderr, old wasm keeps playing; fix and save recovers.
- `pnpm test:native` runs cargo tests + vitest scheduler tests; `pnpm lint`,
  `pnpm build` clean.
