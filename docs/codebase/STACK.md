# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area                | Value                                                      | Evidence                                           |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Primary language    | TypeScript 6.0.3 (strict mode)                             | `pnpm-lock.yaml` (`typescript@6.0.3`)              |
| Runtime + version   | Browser (ESM in browser); dev/build runtime Node 24        | `.github/workflows/build.yml` (`runtime: node@24`) |
| Package manager     | pnpm (lockfile v9) with workspaces (`pnpm-workspace.yaml`) | `pnpm-lock.yaml`, `pnpm-workspace.yaml`            |
| Module/build system | Vite 8.2.2 + `@vitejs/plugin-vue` + `@tailwindcss/vite`    | `package.json`                                     |

### 2) Production Frameworks and Dependencies

The app is a browser Web Audio synthesizer. Workspace packages include the Vue
app, audio engine, synth, test fakes, and `@axiom/native`, which compiles a C
audio processor to WebAssembly with Emscripten.

| Dependency             | Version   | Role in system                                                                                                                                           | Evidence                                                                     |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| vue                    | 3.5.42    | UI framework (`<script setup>` SFCs, `defineModel`)                                                                                                      | `app/package.json`, `pnpm-lock.yaml`                                         |
| `@axiom/audio-engine`  | workspace | Internal source library (`packages/audio-engine/`); host `AudioEngine`, building-block units, abstract `Voice`/`Synth` bases, config types, `Observable` | `packages/audio-engine/package.json`, `packages/audio-engine/src/index.ts`   |
| `@axiom/axiom-synth`   | workspace | Internal source library (`packages/axiom-synth/`); owns the Axiom synth (`AxiomSynth`/`AxiomVoice`), consumed as source                                  | `packages/axiom-synth/package.json`, `packages/axiom-synth/src/index.ts`     |
| `@axiom/audio-testing` | workspace | Internal test-only library (`packages/audio-testing/`); fake Web Audio context/nodes shared by engine and synth tests                                    | `packages/audio-testing/package.json`, `packages/audio-testing/src/index.ts` |
| `@axiom/native`        | workspace | Native C/WebAssembly audio processor and AudioWorklet integration                                                                                        | `packages/native/package.json`, `packages/native/c/Makefile`                 |
| Web Audio API          | —         | Native browser API wrapping all audio (oscillators, `WaveShaperNode`, `BiquadFilterNode`, compressor, analyser)                                          | `packages/audio-engine/src/engine/*`, `packages/axiom-synth/src/*`           |
| Emscripten SDK         | 6.0.12    | Compiles `packages/native/c` to WebAssembly using `emcc`                                                                                                 | `packages/native/c/Makefile`, `.github/workflows/*.yml`                      |
| Tailwind CSS           | 4.3.3     | Utility CSS + `@theme inline` color/shadow system                                                                                                        | `app/src/style.css`                                                          |

### 3) Development Toolchain

| Tool                        | Purpose                                                                          | Evidence                                  |
| --------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| Vite 8.2.2                  | Dev server + build                                                               | `app/package.json`, `app/vite.config.ts`  |
| vue-tsc 3.3.11              | Type-check `.vue`/`.ts` in `pnpm build`                                          | `app/package.json`                        |
| TypeScript ~6.0.2           | `strict`, `noUnusedLocals/Params`, `erasableSyntaxOnly`                          | `app/tsconfig.app.json`                   |
| Prettier 3.9.6              | Only linter/formatter (single quotes, trailing commas, 80-char)                  | `.prettierrc.yaml`                        |
| prettier-plugin-tailwindcss | Tailwind class ordering in Prettier                                              | `.prettierrc.yaml`                        |
| Husky 9 + lint-staged 17    | Pre-commit auto-format of staged files                                           | `.husky/pre-commit`, `.lintstagedrc.json` |
| GitHub Actions              | PR build/test, GitHub Pages deploy, and PR previews; Emscripten setup for builds | `.github/workflows/*.yml`                 |

### 4) Key Commands

```bash
pnpm install
pnpm dev          # dev server on port 4000 (app/vite.config.ts)
pnpm build        # all workspace packages; requires emcc on PATH
pnpm build:pages  # build the app with --base=/axiom-synth/ (Pages deploy)
pnpm --filter @axiom/native build # type-check JS and compile WASM; requires emcc
pnpm --filter @axiom/native test  # native C and JavaScript tests
pnpm lint         # prettier --check .   (not run manually; pre-commit handles it)
pnpm format       # prettier --write .
```

Tooling lives at the workspace root: prettier/husky/lint-staged live in the root `package.json` (packages ship no prettier tooling); `pnpm dev`/`pnpm build:pages` run through `pnpm --filter @axiom/app`. Workspace builds include `@axiom/native`, whose `make wasm` target requires Emscripten `emcc` on `PATH`. GitHub Actions installs SDK `6.0.12` with `emscripten-core/setup-emsdk@v15`.

Testing uses Vitest across the JavaScript packages and native C tests in `packages/native`: `pnpm test` runs `pnpm -r --sort test`. Shared fake Web Audio fakes live in `packages/audio-testing`.

### 5) Environment and Config

- Config sources: `app/vite.config.ts`, `app/tsconfig*.json`, `packages/audio-engine/tsconfig.json`, `packages/axiom-synth/tsconfig.json`, `packages/audio-testing/tsconfig.json`, `.prettierrc.yaml`, `.lintstagedrc.json`, `.husky/pre-commit`, `pnpm-workspace.yaml`
- Required env vars: **none** (no `.env` files; `.gitignore` has `*.local`). No env reads found in `app/src/`.
- Deployment/runtime constraints: no Node runtime used in-app — pure client-side. CI expects Node 24 + pnpm 11. Frequencies/knob ranges are hardcoded UI values, not env-configurable.

### 6) Evidence

- Root `package.json` (scripts, devDeps) + `app/package.json` / `packages/audio-engine/package.json` / `packages/axiom-synth/package.json` / `packages/audio-testing/package.json`
- `pnpm-lock.yaml` (lockfileVersion '9.0', resolution versions), `pnpm-workspace.yaml`
- `app/tsconfig.app.json` / `app/tsconfig.node.json`
- `.github/workflows/build.yml`, `.github/workflows/test.yml`, `.github/workflows/deploy-pages.yml`, `.github/workflows/pr-preview.yml`
- `app/vite.config.ts`
