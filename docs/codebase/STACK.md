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

The app is a browser Web Audio synthesizer; `vue` is the only external production dependency (`@axiom/audio-engine` is an internal workspace package, consumed as source).

| Dependency            | Version   | Role in system                                                                                                  | Evidence                                                                   |
| --------------------- | --------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| vue                   | 3.5.42    | UI framework (`<script setup>` SFCs, `defineModel`)                                                             | `app/package.json`, `pnpm-lock.yaml`                                       |
| `@axiom/audio-engine` | workspace | Internal source library (`packages/audio-engine/`); owns the Web Audio graph, config types, `Observable`        | `packages/audio-engine/package.json`, `packages/audio-engine/src/index.ts` |
| Web Audio API         | —         | Native browser API wrapping all audio (oscillators, `WaveShaperNode`, `BiquadFilterNode`, compressor, analyser) | `packages/audio-engine/src/engine/*`                                       |
| Tailwind CSS          | 4.3.3     | Utility CSS + `@theme inline` color/shadow system                                                               | `app/src/style.css`                                                        |

### 3) Development Toolchain

| Tool                        | Purpose                                                         | Evidence                                          |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| Vite 8.2.2                  | Dev server + build                                              | `app/package.json`, `app/vite.config.ts`          |
| vue-tsc 3.3.11              | Type-check `.vue`/`.ts` in `pnpm build`                         | `app/package.json`                                |
| TypeScript ~6.0.2           | `strict`, `noUnusedLocals/Params`, `erasableSyntaxOnly`         | `app/tsconfig.app.json`                           |
| Prettier 3.9.6              | Only linter/formatter (single quotes, trailing commas, 80-char) | `.prettierrc.yaml`                                |
| prettier-plugin-tailwindcss | Tailwind class ordering in Prettier                             | `.prettierrc.yaml`                                |
| Husky 9 + lint-staged 17    | Pre-commit auto-format of staged files                          | `.husky/pre-commit`, `.lintstagedrc.json`         |
| GitHub Actions              | PR build + GitHub Pages deploy                                  | `.github/workflows/build.yml`, `deploy-pages.yml` |

### 4) Key Commands

```bash
pnpm install
pnpm dev          # dev server on port 4000 (app/vite.config.ts)
pnpm build        # pnpm -r --sort build (all workspace packages)
pnpm build:pages  # build the app with --base=/axiom-synth/ (Pages deploy)
pnpm lint         # prettier --check .   (not run manually; pre-commit handles it)
pnpm format       # prettier --write .
```

Tooling lives at the workspace root: prettier/husky/lint-staged live in the root `package.json` (packages ship no prettier tooling); `pnpm dev`/`pnpm build:pages` run through `pnpm --filter @axiom/app`.

There is **no test runner** configured (no `test` script). Verification is `pnpm build` + lint.

### 5) Environment and Config

- Config sources: `app/vite.config.ts`, `app/tsconfig*.json`, `packages/audio-engine/tsconfig.json`, `.prettierrc.yaml`, `.lintstagedrc.json`, `.husky/pre-commit`, `pnpm-workspace.yaml`
- Required env vars: **none** (no `.env` files; `.gitignore` has `*.local`). No env reads found in `app/src/`.
- Deployment/runtime constraints: no Node runtime used in-app — pure client-side. CI expects Node 24 + pnpm 11. Frequencies/knob ranges are hardcoded UI values, not env-configurable.

### 6) Evidence

- Root `package.json` (scripts, devDeps) + `app/package.json` / `packages/audio-engine/package.json`
- `pnpm-lock.yaml` (lockfileVersion '9.0', resolution versions), `pnpm-workspace.yaml`
- `app/tsconfig.app.json` / `app/tsconfig.node.json`
- `.github/workflows/build.yml`, `.github/workflows/deploy-pages.yml`
- `app/vite.config.ts`
