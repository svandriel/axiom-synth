# Monorepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure this repo into a pnpm workspace monorepo with `app/` (Vite+Vue application) and `packages/audio-engine/` (internal, source-consumed library).

**Architecture:** pnpm workspaces only — no turborepo. The engine package ships no build output; `@axiom/audio-engine` exports resolve to its TypeScript source, which Vite bundles and `tsc`/`vue-tsc` type-check. The root package orchestrates via `pnpm --filter` and `pnpm -r`, and owns all formatting tooling (prettier, husky, lint-staged).

**Tech Stack:** pnpm (v11), Vite 8, Vue 3, TypeScript 6, vue-tsc, prettier.

## Global Constraints

- No turborepo; pnpm workspaces only.
- Package scope is `@axiom/*` (`@axiom/app`, `@axiom/audio-engine`).
- Engine is internal-only (no npm publish) and consumed as source — no engine emit/build artifact.
- Prettier, prettier config, husky, lint-staged live **only at the repo root**. No package ships prettier config or prettier devDeps.
- CI keeps the existing `pnpm/setup@v2` + `pnpm install` pattern.
- Work happens on branch `refactor/monorepo`, merged via PR to `main`.
- Existing formatting/prettier rules unchanged (`.prettierrc.yaml` config).

---

### Task 1: Scaffold pnpm workspace

**Files:**

- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Rewrite: `package.json` (root)
- Modify: `.prettierrc.yaml`
- Create: `app/package.json`
- Create: `packages/audio-engine/package.json`
- Create: `packages/audio-engine/src/index.ts`

**Interfaces:**

- Produces: workspace root at `app/` + `packages/*`; package names `@axiom/app` and `@axiom/audio-engine`; shared `tsconfig.base.json` extended by both packages in later tasks.

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - app
  - packages/*
```

- [ ] **Step 2: Rewrite root `package.json`**

```json
{
  "name": "axiom-synth",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "pnpm --filter @axiom/app dev",
    "build": "pnpm -r --sort build",
    "build:pages": "pnpm --filter @axiom/app build:pages",
    "preview": "pnpm --filter @axiom/app preview",
    "lint": "prettier --check .",
    "format": "prettier --write .",
    "prepare": "husky"
  },
  "devDependencies": {
    "@vue/tsconfig": "^0.9.1",
    "husky": "^9.1.7",
    "lint-staged": "^17.5.0",
    "prettier": "^3.9.6",
    "prettier-plugin-tailwindcss": "^0.8.1",
    "typescript": "~6.0.2"
  }
}
```

Note: `vue`, `vite`, and build-related devDeps (vite plugins, tailwind, vue-tsc, `@types/node`) are removed from root — they move to `app/package.json` in Task 3.

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- [ ] **Step 4: Create `app/package.json` (stub — final version in Task 3)**

Create the directory `app/` and:

```json
{
  "name": "@axiom/app",
  "private": true,
  "version": "0.0.0",
  "type": "module"
}
```

- [ ] **Step 5: Create `packages/audio-engine/package.json`**

```json
{
  "name": "@axiom/audio-engine",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc --noEmit"
  },
  "devDependencies": {
    "@vue/tsconfig": "^0.9.1",
    "typescript": "~6.0.2"
  }
}
```

- [ ] **Step 6: Create `packages/audio-engine/src/index.ts` (stub barrel)**

```ts
export {};
```

- [ ] **Step 7: Fix `.prettierrc.yaml` `tailwindStylesheet` path**

`tailwindStylesheet: ./src/style.css` resolves relative to the prettier config at repo root. After the app moves, the stylesheet lives at `app/src/style.css`. This path is relative to the config file, so update it:

```yaml
tailwindStylesheet: ./app/src/style.css
```

- [ ] **Step 8: Install and verify workspace**

Run: `pnpm install`
Expected: lockfile updates to a workspace lockfile; no errors; if pnpm prints `Ignored build scripts: esbuild`, add to `pnpm-workspace.yaml`:

```yaml
onlyBuiltDependencies:
  - esbuild
```

then rerun `pnpm install`.

Run: `pnpm -r list`
Expected: prints `@axiom/app` and `@axiom/audio-engine` as workspace projects.

- [ ] **Step 9: Commit**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json .prettierrc.yaml app packages
git commit -m "chore: scaffold pnpm workspace monorepo"
```

---

### Task 2: Move audio-engine into its package

**Files:**

- Move: `src/engine/*` → `packages/audio-engine/src/engine/`
- Move: `src/types/envelope-config.ts`, `filter-config.ts`, `fixed-array.ts`, `oscillator-config.ts`, `waveshaper-config.ts` → `packages/audio-engine/src/types/`
- Move: `src/utils/observable.ts` → `packages/audio-engine/src/utils/`
- Modify: `packages/audio-engine/src/index.ts` (real barrel)
- Create: `packages/audio-engine/tsconfig.json`

**Interfaces:**

- Consumes: `tsconfig.base.json`, `@vue/tsconfig` (from Task 1).
- Produces: package `@axiom/audio-engine` exporting `AudioEngine`, `WaveshaperType`, and the config types; app imports these in Task 3.

- [ ] **Step 1: Create target directories**

```bash
mkdir -p packages/audio-engine/src/types packages/audio-engine/src/utils
```

- [ ] **Step 2: Git-move engine and shared types/utils**

```bash
git mv src/engine packages/audio-engine/src/engine
git mv src/types/envelope-config.ts packages/audio-engine/src/types/envelope-config.ts
git mv src/types/filter-config.ts packages/audio-engine/src/types/filter-config.ts
git mv src/types/fixed-array.ts packages/audio-engine/src/types/fixed-array.ts
git mv src/types/oscillator-config.ts packages/audio-engine/src/types/oscillator-config.ts
git mv src/types/waveshaper-config.ts packages/audio-engine/src/types/waveshaper-config.ts
git mv src/utils/observable.ts packages/audio-engine/src/utils/observable.ts
```

No internal import rewrites are needed: engine files import `../types` and `../utils/observable`, and those relative paths stay valid inside the package (`src/engine/../types`, `src/engine/../utils`). `src/types/waveshaper-config.ts` imports `../engine/waveshaper` — also still valid.

- [ ] **Step 3: Replace stub with real package barrel `packages/audio-engine/src/index.ts`**

```ts
export * from './engine';
export type * from './types/envelope-config';
export type * from './types/filter-config';
export type * from './types/oscillator-config';
export type * from './types/fixed-array';
export type * from './types/waveshaper-config';
export type { WaveshaperType } from './engine/waveshaper';
```

`./engine` resolves to `src/engine/index.ts`, which re-exports `AudioEngine`. `WaveshaperType` must be re-exported explicitly because `engine.ts` imports it but does not re-export it; the app consumes it (Task 3).

- [ ] **Step 4: Create `packages/audio-engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "../../node_modules/.tmp/tsconfig.audio-engine.tsbuildinfo"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 5: Verify engine type-checks standalone**

Run: `pnpm --filter @axiom/audio-engine build`
Expected: exit 0, no output (or no errors). Engine types are pure, no Web Audio lib issues with the DOM lib from `tsconfig.base.json`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move audio engine into @axiom/audio-engine package"
```

---

### Task 3: Move the app into `app/` and rewire imports

**Files:**

- Move: `src/App.vue`, `src/main.ts`, `src/style.css`, `src/components/`, `src/composables/` → `app/src/`
- Move: `src/types/{numeric-keys.ts,index.ts}` → `app/src/types/`
- Move: `src/utils/{db-display,semi-display,fraction-display,time-display,key-map,index}.ts` → `app/src/utils/`
- Move: `index.html`, `vite.config.ts`, `public/`, `example/` → `app/`
- Rewrite: `app/package.json` (final)
- Rewrite: `app/src/types/index.ts`
- Create: `app/tsconfig.json`, `app/tsconfig.app.json`, `app/tsconfig.node.json`
- Rewrite: root `tsconfig.json` references
- Modify: `app/src/composables/use-audio-context.ts`
- Modify: `app/src/components/EnvelopePanel.vue`
- Modify: `app/src/components/OscillatorPanel.vue`
- Modify: `app/src/components/WaveshaperPanel.vue`

**Interfaces:**

- Consumes: `@axiom/audio-engine` (Task 2) via `"workspace:*"`.
- Produces: complete `app` package building via `vue-tsc -b && vite build`; root `pnpm build` green.

- [ ] **Step 1: Create app source directories**

```bash
mkdir -p app/src/types app/src/utils app/example
```

- [ ] **Step 2: Git-move app source files**

```bash
git mv src/App.vue src/main.ts src/style.css app/src/
git mv src/components app/src/components
git mv src/composables app/src/composables
git mv src/types/numeric-keys.ts app/src/types/numeric-keys.ts
git mv src/types/index.ts app/src/types/index.ts
git mv src/utils/db-display.ts src/utils/semi-display.ts src/utils/fraction-display.ts src/utils/time-display.ts src/utils/key-map.ts src/utils/index.ts app/src/utils/
git mv index.html app/index.html
git mv vite.config.ts app/vite.config.ts
git mv public app/public
git mv example/osc1-neumorphic-button.html example/neumorphic-button.png app/example/
rmdir src/types src/utils src 2>/dev/null
```

- [ ] **Step 3: Rewrite `app/src/types/index.ts`**

```ts
export * from './numeric-keys';
```

All other type files (`envelope-config`, `filter-config`, `fixed-array`, `oscillator-config`, `waveshaper-config`) now live in `@axiom/audio-engine`.

- [ ] **Step 4: Rewrite `app/package.json`**

```json
{
  "name": "@axiom/app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "build:pages": "vue-tsc -b && vite build --base=/axiom-synth/",
    "preview": "vite preview"
  },
  "dependencies": {
    "@axiom/audio-engine": "workspace:*",
    "vue": "^3.5.41"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@types/node": "^24.13.3",
    "@vitejs/plugin-vue": "^6.0.8",
    "tailwindcss": "^4.3.3",
    "vite": "^8.2.2",
    "vue-tsc": "^3.3.11"
  }
}
```

- [ ] **Step 5: Rewrite engine imports in app files**

`app/src/composables/use-audio-context.ts` — replace `import { AudioEngine } from '../engine';` with:

```ts
import { AudioEngine } from '@axiom/audio-engine';
```

`app/src/components/EnvelopePanel.vue` — replace `import type { EnvelopeConfig } from '../types/envelope-config.ts';` with:

```ts
import type { EnvelopeConfig } from '@axiom/audio-engine';
```

Keep `import type { NumericKeys } from '../types/numeric-keys.ts';` as-is.

`app/src/components/OscillatorPanel.vue` — replace `import type { OscillatorConfig, WaveFormType } from '../types';` with:

```ts
import type { OscillatorConfig, WaveFormType } from '@axiom/audio-engine';
```

`app/src/components/WaveshaperPanel.vue` — replace `import { type WaveshaperType } from '../engine/waveshaper.ts';` with:

```ts
import { type WaveshaperType } from '@axiom/audio-engine';
```

- [ ] **Step 6: Create app tsconfigs**

`app/tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`app/tsconfig.app.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "../../node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"]
}
```

`app/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "../../node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}
```

`tsBuildInfoFile` paths point into the pnpm-hoisted root `node_modules` (the old `./node_modules/.tmp/...` would create a non-existent `app/node_modules`).

- [ ] **Step 7: Rewrite root `tsconfig.json`**

```json
{
  "files": [],
  "references": [{ "path": "./app/tsconfig.json" }]
}
```

The engine is type-checked by its own `tsc --noEmit` build script (Task 2), which the root `pnpm build` runs via `pnpm -r --sort build`.

- [ ] **Step 8: Reinstall with workspace dependency**

Run: `pnpm install`
Expected: `@axiom/audio-engine` resolves via `workspace:*`; no errors.

- [ ] **Step 9: Verify build and formatting**

Run: `pnpm build`
Expected: engine `tsc --noEmit` passes, app `vue-tsc -b` passes, `vite build` emits `app/dist/`.

Run: `pnpm lint`
Expected: prettier check passes (no diffs listed).

Run: `pnpm dev` with a short timeout to smoke-test the dev server:
`timeout 10 pnpm dev`
Expected: Vite starts, prints `Local: http://localhost:4000/`; process exits via timeout (SIGTERM), no TS/plugin errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: move app into @axiom/app and consume audio-engine package"
```

---

### Task 4: Update CI/CD for the monorepo

**Files:**

- Modify: `.github/workflows/build.yml`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**

- Consumes: root scripts from Task 1 (`lint`, `build`, `build:pages`).
- Produces: PR gate that lints + builds; Pages deploy that uploads `app/dist`.

- [ ] **Step 1: Update `build.yml`** — add `--frozen-lockfile` and a lint step:

```diff
       - name: Install dependencies
-        run: pnpm install
+        run: pnpm install --frozen-lockfile
+
+      - name: Lint
+        run: pnpm run lint

       - name: Build
         run: pnpm run build
```

- [ ] **Step 2: Update `deploy-pages.yml`** — upload path moves with the app:

```diff
       - name: Upload Pages artifact
         uses: actions/upload-pages-artifact@v5
         with:
-          path: ./dist
+          path: ./app/dist
```

`build:pages` still runs from the repo root (`pnpm run build:pages`), which delegates to `@axiom/app`; its Vite root is `app/`, so output lands in `app/dist`.

- [ ] **Step 3: Verify page build output path**

Run: `pnpm build:pages`
Expected: build succeeds; `app/dist/index.html` exists.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/build.yml .github/workflows/deploy-pages.yml
git commit -m "ci: adapt workflows to monorepo layout"
```

---

### Task 5: Update repo docs

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/codebase/STRUCTURE.md`
- Modify: `docs/codebase/ARCHITECTURE.md`
- Modify: `docs/codebase/STACK.md`
- Modify: `docs/codebase/INTEGRATIONS.md`
- Modify: `docs/codebase/CONVENTIONS.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: final layout from Tasks 1-3, CI changes from Task 4.

- [ ] **Step 1: Update `AGENTS.md`**

- Commands stay the same (root scripts unchanged). Add a short "## Repo structure" section:

```markdown
## Repo structure

pnpm workspaces monorepo on branch-based workflow (PRs to `main`):

- `app/` — Vite + Vue application (`@axiom/app`)
- `packages/audio-engine/` — Web Audio engine library (`@axiom/audio-engine`),
  internal-only, consumed as source (no build output)
- Root owns prettier/husky/lint-staged; packages ship no prettier tooling
```

- [ ] **Step 2: Update `docs/codebase/STRUCTURE.md`**

Replace the top-level map row for `src/engine/`, `src/components/`, `src/types/`, `src/utils/` with monorepo entries:

| Path                         | Purpose                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `app/src/`                   | Vue application source: components, composables, app-only types (`NumericKeys`), display utils |
| `app/` (root files)          | `index.html`, `vite.config.ts`, `public/`, `example/`                                          |
| `packages/audio-engine/src/` | Engine package: `engine/`, `types/`, `utils/observable.ts`, `index.ts` barrel                  |
| `pnpm-workspace.yaml`        | Workspace root (`app`, `packages/*`)                                                           |

Update: directory organization note (layer-based per package); remove stale "no aliases" claim — app now imports `@axiom/audio-engine`.

- [ ] **Step 3: Update `docs/codebase/ARCHITECTURE.md`**

- `src/engine/` module ownership rows → `packages/audio-engine/src/engine/`.
- `useAudioEngine` composable now imports `AudioEngine` from `@axiom/audio-engine`.
- Engine boundary note: engine owns its config types + `Observable`; app imports those types through the package.

- [ ] **Step 4: Update `docs/codebase/STACK.md`**

Add: pnpm workspaces (`pnpm-workspace.yaml`), package names `@axiom/*`, key commands (already root-level). Note `pnpm -r --sort build`.

- [ ] **Step 5: Update `docs/codebase/INTEGRATIONS.md`**

- Deploy artifact path now `app/dist`.
- `build.yml`: `pnpm install --frozen-lockfile`, lint + build steps.
- localStorage note (theme) unchanged.

- [ ] **Step 6: Update `docs/codebase/CONVENTIONS.md`**

- Package naming: `@axiom/*` scope.
- Prettier/tooling: root-only rule (no prettier config or deps in packages).
- Engine package export style: source exports (`exports` → `./src/index.ts`), no build artifacts.
- Existing naming/file rules unchanged.

- [ ] **Step 7: Update `README.md`**

- "Stack" paragraph: codebase map reference — `src/engine/` → `packages/audio-engine/`.
- Development section command table stays (commands unchanged).
- If README references file layout elsewhere, fix paths (`app/`, `packages/`).

- [ ] **Step 8: Verify lint and final build**

Run: `pnpm lint`
Expected: prettier check passes across the repo (docs included).

Run: `pnpm build`
Expected: green (both packages).

- [ ] **Step 9: Commit**

```bash
git add AGENTS.md docs README.md
git commit -m "docs: reflect monorepo layout"
```

---

### Task 6: Final verification pass

**Files:**

- None (verification-only).

**Interfaces:**

- Consumes: everything above.

- [ ] **Step 1: Clean-install check**

Run: `rm -rf node_modules && rm -f pnpm-lock.yaml && pnpm install`
Expected: clean install succeeds; lockfile regenerated as a workspace lockfile.

Run: `pnpm install --frozen-lockfile`
Expected: reports "Already up to date" (lockfile clean).

- [ ] **Step 2: Full gate**

Run: `pnpm lint && pnpm build && pnpm build:pages`
Expected: all pass; `app/dist/index.html` exists.

- [ ] **Step 3: Confirm git history preserved**

Run: `git log --follow --oneline -- packages/audio-engine/src/engine/engine.ts | head` and `git log --follow --oneline -- app/src/components/Synth.vue | head`
Expected: commits from before the move appear (history preserved via `git mv`).

- [ ] **Step 4: Manual dev smoke**

Run: `pnpm dev` (leave running briefly)
Expected: opens at http://localhost:4000, synth loads, no console errors.

- [ ] **Step 5: Final commit (if any stray changes)**

```bash
git status --porcelain
```

Expected: clean tree. If not, commit the strays with a descriptive message. Then suggest opening a PR from `refactor/monorepo` to `main`.
