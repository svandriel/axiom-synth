# Monorepo Migration Design

Date: 2026-09-13

## Decision

Restructure the repo as a pnpm workspace monorepo. Two packages:

- `app/` — the Vite + Vue application (package name `@axiom/app`).
- `packages/audio-engine/` — the Web Audio engine library (package name
  `@axiom/audio-engine`).

No turborepo. The audio engine is **internal-only** (no npm publish) and is
**consumed as source**: the app imports the package's TypeScript directly,
so the package has no build/emit step.

Prettier, Husky, and lint-staged live **only at the repo root** — no
package ships its own prettier tooling or config.

## Package Boundary

`audio-engine` owns:

- All current `src/engine/*` files.
- The type files the engine depends on:
  `envelope-config.ts`, `filter-config.ts`, `oscillator-config.ts`,
  `fixed-array.ts`, `waveshaper-config.ts` (currently under `src/types/`).
- `utils/observable.ts` (the engine's only runtime dependency outside
  `src/engine/`).
- Its public exports: `AudioEngine`, `@axiom/audio-engine` types
  (`OscillatorConfig`, `EnvelopeConfig`, `FilterConfig`, `WaveshaperConfig`,
  `FixedArray`, `WaveFormType`, `WaveshaperType`), and its own
  `WaveshaperCurve`/`Envelope`/`Voice`/`AxiomVoice`/`AxiomVoiceConfig`
  entities. The full public surface is defined by the package's `src/index.ts`
  barrel (currently `src/engine/index.ts` re-exports `AudioEngine`).

`app` keeps:

- `NumericKeys` (used only by `EnvelopePanel.vue`).
- The display helper utilities (`db-display.ts`, `fraction-display.ts`,
  `semi-display.ts`, `time-display.ts`, `key-map.ts`).
- All components, composables, and app entry files.
- `src/composables/use-audio-context.ts` imports `AudioEngine` from
  `@axiom/audio-engine` instead of `../engine`.
- `WaveshaperPanel.vue` imports `WaveshaperType` from
  `@axiom/audio-engine` instead of `../engine/waveshaper.ts`.

All engine config types are imported by the app through the package, so the
app's `src/types/` directory reduces to `numeric-keys.ts` plus a slim barrel.

## Target Layout

```
/                              root — private, orchestration only
  pnpm-workspace.yaml
  package.json                 name: "axiom-synth", scripts dispatch workspaces
  tsconfig.base.json           shared compiler options (strict flags)
  tsconfig.json                root project references (app + node + engine)
  .prettierrc.yaml, .prettierignore, .lintstagedrc.json
  .husky/                      pre-commit (lint-staged on staged files)
  .github/workflows/           build.yml, deploy-pages.yml
  docs/
  AGENTS.md, README.md
  app/                         @axiom/app
    index.html
    vite.config.ts
    public/
    src/                       components/, composables/, types/, utils/, main.ts, App.vue
example/                     (moved UI prototype)
    package.json               scripts: dev, build, build:pages
    tsconfig.app.json, tsconfig.node.json
  packages/
    audio-engine/              @axiom/audio-engine
      src/                     engine files + moved types + observable.ts + index.ts barrel
      package.json             type: module, exports → ./src/index.ts
      tsconfig.json            single config, extends DOM base + root base
```

`example/` at repo root is the early standalone HTML UI prototype. It is not
part of the app build. Decision: move it into `app/example/` so the root has
no app files.

## Config & Scripts

### Root package.json

- `private: true`, `name: "axiom-synth"`, `type: "module"`.
- Deps: prettier, husky, lint-staged, typescript, `@vue/tsconfig` (shared
  base). All prettier tooling and config stay root-only.
- Scripts delegate to workspaces:

  | Script        | Command                                |
  | ------------- | -------------------------------------- |
  | `dev`         | `pnpm --filter @axiom/app dev`         |
  | `build`       | `pnpm -r --sort build`                 |
  | `build:pages` | `pnpm --filter @axiom/app build:pages` |
  | `lint`        | `prettier --check .`                   |
  | `format`      | `prettier --write .`                   |
  | `prepare`     | `husky`                                |

  `pnpm -r --sort build` runs package builds in topological order. Both
  packages have a `build` script, so the root `build` covers type-checking of
  the engine and the app's `vue-tsc -b && vite build`.

### app/package.json (@axiom/app)

- `private: true`, `type: "module"`.
- Deps: `vue`, workspace dep `"@axiom/audio-engine": "workspace:*"`.
- Dev deps (moved from current root): `vite`, `@vitejs/plugin-vue`,
  `@tailwindcss/vite`, `tailwindcss`, `vue-tsc`. Tooling that must run
  **inside** the app package (vite, vue-tsc) moves with it.
- Scripts:
  - `dev`: `vite`
  - `build`: `vue-tsc -b && vite build`
  - `build:pages`: `vue-tsc -b && vite build --base=/axiom-synth/`
  - `preview`: `vite preview`
- `vite.config.ts` moves to `app/` (Vite root is the app dir; output lands
  in `app/dist`).

### packages/audio-engine/package.json (@axiom/audio-engine)

- `name: "@axiom/audio-engine"`, `private: true`, `type: "module"`.
- No runtime dependencies.
- `exports`:
  ```json
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
  ```
  Vite and `tsc` both resolve the package to its TypeScript source, so the
  package needs no emit step.
- Scripts:
  - `build`: `tsc --noEmit` (type-check gate; no emit).

### TypeScript configs

- Root `tsconfig.base.json`: the strict flags currently inline in
  `tsconfig.app.json` (`strict`, `noUncheckedIndexedAccess`,
  `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`,
  `noFallthroughCasesInSwitch`) plus a shared `tsBuildInfoFile` location.
  App and engine extend this base.
- `app/tsconfig.app.json`: extends `@vue/tsconfig/tsconfig.dom.json` + the
  root base; includes `src/**/*`. No longer includes engine files.
- `app/tsconfig.node.json`: unchanged in spirit, references `vite.config.ts`.
- `app/tsconfig.json`: project references to `tsconfig.app.json` and
  `tsconfig.node.json`.
- `packages/audio-engine/tsconfig.json`: single config; extends
  `@vue/tsconfig/tsconfig.dom.json` + root base; includes `src/**/*`;
  `tsBuildInfoFile` under the package. No project reference is needed if
  `vue-tsc -b` type-checks the imported source — verified during
  implementation; fallback is adding the engine as a referenced project.

### pnpm-workspace.yaml

```yaml
packages:
  - app
  - packages/*
```

### pnpm behavior notes

- `pnpm-workspace.yaml` makes the existing lockfile a workspace lockfile;
  `pnpm install` regenerates it.
- pnpm blocks lifecycle scripts on dependencies unless allowed. If `esbuild`
  (vite dep) needs its postinstall, add it to `onlyBuiltDependencies` in
  `pnpm-workspace.yaml`.

## CI/CD

Both workflows keep the existing `pnpm/setup@v2` + `pnpm install` pattern.

### build.yml (PR gate)

- Unchanged setup steps.
- `pnpm install --frozen-lockfile`.
- `pnpm lint`, then `pnpm build`.
- Works as-is because root scripts delegate to workspaces.

### deploy-pages.yml

- Unchanged build steps (`pnpm run build:pages`).
- Upload artifact path changes from `./dist` to `./app/dist`.

No other CI changes. No turborepo, no per-package workflows.

## Docs

Update to reflect the monorepo:

- `AGENTS.md` — commands, structure, way-of-working (unchanged branching rule).
- `docs/codebase/STRUCTURE.md` — new directory layout + boundaries.
- `docs/codebase/ARCHITECTURE.md` — module ownership changes (engine is now
  a package boundary).
- `docs/codebase/STACK.md` — pnpm workspace, per-package commands.
- `docs/codebase/INTEGRATIONS.md` — deploy artifact path, build steps.
- `docs/codebase/CONVENTIONS.md` — scoped package naming (`@axiom/*`),
  prettier root-only rule.
- `README.md` — commands if it lists them.

## Migration Steps (Summary)

1. Create `pnpm-workspace.yaml`; scaffold `app/` and
   `packages/audio-engine/` package.json files; add `@axiom/audio-engine`
   as `workspace:*` dep of the app.
2. Git-move app source into `app/`, engine + its types + `observable.ts`
   into `packages/audio-engine/src/`; move `example/` into `app/example/`.
3. Rewire imports across app files (`../engine` → `@axiom/audio-engine`,
   moved type/util imports), rebuild the app and engine `src/index.ts`
   barrels.
4. Split TypeScript configs (base + per-package); move prettier tooling to
   stay root-only.
5. Update root scripts; restore `dev` and `build` to green locally.
6. Update CI workflows (artifact path) and docs.
7. Verify: `pnpm install --frozen-lockfile` is clean, `pnpm lint`,
   `pnpm build`, and `pnpm dev` work from the root; `build:pages` outputs
   `app/dist`.

## Verification

- `pnpm build` passes (type-checks engine + app, vite builds).
- `pnpm lint` passes (prettier, all packages).
- Dev server runs from repo root at port 4000.
- GitHub Pages deploy uploads `app/dist`.
