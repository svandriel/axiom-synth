# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area                | Value                                                   | Evidence                                           |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| Primary language    | TypeScript 6.0.3 (strict mode)                          | `pnpm-lock.yaml` (`typescript@6.0.3`)              |
| Runtime + version   | Browser (ESM in browser); dev/build runtime Node 24     | `.github/workflows/build.yml` (`runtime: node@24`) |
| Package manager     | pnpm (lockfile v9)                                      | `pnpm-lock.yaml`                                   |
| Module/build system | Vite 8.2.2 + `@vitejs/plugin-vue` + `@tailwindcss/vite` | `package.json`                                     |

### 2) Production Frameworks and Dependencies

The app is a browser Web Audio synthesizer; `vue` is the only production dependency.

| Dependency    | Version | Role in system                                                                                                  | Evidence                         |
| ------------- | ------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| vue           | 3.5.42  | UI framework (`<script setup>` SFCs, `defineModel`)                                                             | `package.json`, `pnpm-lock.yaml` |
| Web Audio API | —       | Native browser API wrapping all audio (oscillators, `WaveShaperNode`, `BiquadFilterNode`, compressor, analyser) | `src/engine/*`                   |
| Tailwind CSS  | 4.3.3   | Utility CSS + `@theme inline` color/shadow system                                                               | `src/style.css`                  |

### 3) Development Toolchain

| Tool                        | Purpose                                                         | Evidence                                          |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| Vite 8.2.2                  | Dev server + build                                              | `package.json`, `vite.config.ts`                  |
| vue-tsc 3.3.11              | Type-check `.vue`/`.ts` in `pnpm build`                         | `package.json`                                    |
| TypeScript ~6.0.2           | `strict`, `noUnusedLocals/Params`, `erasableSyntaxOnly`         | `tsconfig.app.json`                               |
| Prettier 3.9.6              | Only linter/formatter (single quotes, trailing commas, 80-char) | `.prettierrc.yaml`                                |
| prettier-plugin-tailwindcss | Tailwind class ordering in Prettier                             | `.prettierrc.yaml`                                |
| Husky 9 + lint-staged 17    | Pre-commit auto-format of staged files                          | `.husky/pre-commit`, `.lintstagedrc.json`         |
| GitHub Actions              | PR build + GitHub Pages deploy                                  | `.github/workflows/build.yml`, `deploy-pages.yml` |

### 4) Key Commands

```bash
pnpm install
pnpm dev          # dev server on port 4000 (vite.config.ts)
pnpm build        # vue-tsc -b && vite build
pnpm build:pages  # vue-tsc -b && vite build --base=/axiom-synth/  (Pages deploy)
pnpm lint         # prettier --check .   (not run manually; pre-commit handles it)
pnpm format       # prettier --write .
```

There is **no test runner** configured (no `test` script). Verification is `pnpm build` + lint.

### 5) Environment and Config

- Config sources: `vite.config.ts`, `tsconfig*.json`, `.prettierrc.yaml`, `.lintstagedrc.json`, `.husky/pre-commit`
- Required env vars: **none** (no `.env` files; `.gitignore` has `*.local`). No env reads found in `src/`.
- Deployment/runtime constraints: no Node runtime used in-app — pure client-side. CI expects Node 24 + pnpm 11. Frequencies/knob ranges are hardcoded UI values, not env-configurable.

### 6) Evidence

- `package.json`
- `pnpm-lock.yaml` (lockfileVersion '9.0', resolution versions)
- `tsconfig.app.json` / `tsconfig.node.json`
- `.github/workflows/build.yml`, `.github/workflows/deploy-pages.yml`
- `vite.config.ts`
