# Wasm Dev Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm dev` rebuilds the native wasm module whenever Rust sources change, and works on a fresh clone without manual wasm-pack runs.

**Architecture:** `@axiom/axiom-native` gets a package-level `dev` script built on `chokidar-cli` that runs an initial `wasm-pack` build then re-runs it whenever `rust/**/*.rs` or `rust/Cargo.toml` changes. Root `dev` runs every package's `dev` script in parallel (`pnpm -r --parallel --if-present dev`). When the rebuild rewrites files under `pkg/`, Vite's own module-graph watcher full-reloads the page — no custom plugin or reload coupling needed.

**Tech Stack:** pnpm workspaces, `chokidar-cli` (npm devDependency), `wasm-pack`, Vite.

## Global Constraints

- Only new dependency in the repo: `chokidar-cli` as a devDependency in `packages/axiom-native/package.json`.
- Build command stays `build:wasm` (`wasm-pack build ./rust --target web --out-dir ../pkg`) — single source of truth, no duplicate wasm-pack args, no `--dev`/release profile toggle.
- No Vite plugin, no custom watcher script, no `concurrently`, `cargo-watch`, or `rsw`.
- Root `dev` script becomes exactly `pnpm -r --parallel --if-present dev`.
- No automated tests for this feature (thin config, no testable logic) — verified manually per Task steps.
- Cross-platform: chokidar-cli args in `package.json` use escaped double quotes, never single quotes.

---

### Task 1: Native package — chokidar-cli dependency and `dev` script

**Files:**

- Modify: `packages/axiom-native/package.json`
- Generated: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `@axiom/axiom-native` script `dev` — run via `pnpm --filter @axiom/axiom-native dev` (cwd = package dir).

- [ ] **Step 1: Add chokidar-cli devDependency**

Run:

```bash
pnpm --filter @axiom/axiom-native add -D chokidar-cli
```

Expected: `chokidar-cli` appears under `devDependencies` in `packages/axiom-native/package.json`, `pnpm-lock.yaml` updated. Confirm installed version requires Node >= 20 (repo already runs Vite 8, which requires the same floor) — `node -v`.

- [ ] **Step 2: Add the `dev` script**

Edit `packages/axiom-native/package.json`, inserting directly after the `build:wasm` line:

```json
"dev": "pnpm run build:wasm && chokidar \"rust/**/*.rs\" \"rust/Cargo.toml\" -c \"pnpm run build:wasm\" --silent"
```

Notes: `&&` runs one build before watching (fresh-clone/stale-artifact fix; a failed initial build exits loudly and never starts watching). `--silent` suppresses chokidar-cli's internal change messages so only wasm-pack output appears. chokidar-cli's built-in debounce (default 400 ms) coalesces rapid edits.

- [ ] **Step 3: Verify initial build + rebuild loop**

Run (from repo root, one foreground shell):

```bash
rm -rf packages/axiom-native/pkg
pnpm --filter @axiom/axiom-native dev >/tmp/native-dev.log 2>&1 &
WATCHER_PID=$!
sleep 12
touch packages/axiom-native/rust/src/lib.rs
sleep 12
kill $WATCHER_PID
```

Expected: `packages/axiom-native/pkg/` exists after the first 12 s (initial build ran without manual wasm-pack), and the log contains two wasm-pack build runs (initial + the run triggered by `touch`). Grep `/tmp/native-dev.log` for `Compiling axiom-native` / `Finished` count >= 2.

- [ ] **Step 4: Verify failure path keeps watching**

Run:

```bash
pnpm --filter @axiom/axiom-native dev >/tmp/native-dev-fail.log 2>&1 &
WATCHER_PID=$!
sleep 10
printf '\n// deliberate compile error\n' >> packages/axiom-native/rust/src/lib.rs
sleep 10
git -C packages/axiom-native/rust checkout src/lib.rs
sleep 10
kill $WATCHER_PID
```

Expected: first `sleep` completes initial build; after the bad edit the log shows a failing build (rustc error, exit != 0) and the watcher keeps running (no process exit); after `git checkout` revert the log shows a successful rebuild. `pkg/` still present throughout.

- [ ] **Step 5: Commit**

```bash
git add packages/axiom-native/package.json pnpm-lock.yaml
git commit -m "feat(native): chokidar-cli dev watch for wasm rebuilds"
```

---

### Task 2: Root dev wiring — parallel package dev scripts

**Files:**

- Modify: `package.json` (repo root)

**Interfaces:**

- Consumes: Task 1's `@axiom/axiom-native` `dev` script.
- Produces: root `dev` script `pnpm -r --parallel --if-present dev` — starts app vite + native watcher in parallel.

- [ ] **Step 1: Change the root `dev` script**

Edit root `package.json`:

```json
"dev": "pnpm -r --parallel --if-present dev"
```

Rationale: `--recursive`/`-r` runs the script in every workspace package that has it; `--if-present` skips packages without `dev` (`@axiom/audio-engine`, `@axiom/axiom-synth`) without failing; `--parallel` disregards topo ordering with prefixed streaming output — the right mode for long-running dev processes.

- [ ] **Step 2: Dry-run the task graph**

Run:

```bash
pnpm -r run --parallel --if-present --dry-run dev
```

Expected: output lists exactly two tasks — `packages/app` (dev: vite) and `packages/axiom-native` (dev: chokidar watcher); audio-engine and axiom-synth absent. (Confirm pnpm's `--dry-run` prints a stable topological/selection listing; if unpresent in this pnpm version, proceed directly to Step 3.)

- [ ] **Step 3: Smoke-test `pnpm dev` end to end**

Run:

```bash
rm -rf packages/axiom-native/pkg
pnpm dev >/tmp/root-dev.log 2>&1 &
ROOT_PID=$!
sleep 15
curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/
sleep 5
kill $ROOT_PID
```

Expected: HTTP 200 from the Vite server on port 4000, `packages/axiom-native/pkg/` exists (watcher's initial build), and both processes started — `/tmp/root-dev.log` shows the Vite banner plus wasm-pack build output with workspace prefixes.

- [ ] **Step 4: Run regression checks**

Run:

```bash
pnpm test
pnpm lint
pnpm build
pnpm test:native
```

Expected: all pass. `pnpm build` exercises `build:wasm` (unchanged semantics); `pnpm lint` — prettier check must not flag the edited `package.json` files.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "feat(root): parallel dev across workspace packages"
```

---

## Self-Review Notes

- Spec §1 (native dev script with chokidar-cli, no scripts file) — Task 1.
- Spec §2 (`&&` initial build, watch `*.rs` + `Cargo.toml`, failed rebuild keeps old artifact, no debounce flags — default 400 ms covered) — Task 1 Steps 3-4.
- Spec §3 (no reload coupling; Vite graph watcher reloads) — implicitly relied on in Task 2 Step 3 (HTTP 200 + wasm exists; actual in-browser reload verified in human smoke test, see note).
- Spec §4 (root `pnpm -r --parallel --if-present dev`, no concurrently) — Task 2.
- Spec §5 (no automated tests, manual verification only) — Tasks have manual verification steps; no vitest added.
- Spec non-goals — all respected (no vite plugin, no custom watcher, no concurrently/cargo-watch/rsw, no profile toggle).

Known accepted limits (matching spec §2/§3, not fit-to-fix):

- A page load before the first build finishes may show a one-time import error; manual refresh resolves it.
- An edit landing mid-build can trigger one redundant rebuild (cargo's target-dir lock serializes the `wasm-pack` processes).
- Browser full reload after rebuild is not asserted by an automated check in this plan; final human smoke test should edit `rust/src/lib.rs` while `pnpm dev` runs and confirm the page reflects the change (e.g. oscillator frequency/sample value observable change, or cargo log confirming rebuild + network tab showing fresh wasm fetch).
