# axiom-synth

Vue 3 + TypeScript + Vite web synthesizer using the Web Audio API.

Work in progress. Use the caveman skill in ultra mode.

## Commands

- `pnpm dev` — Vite dev server on port 4000
- `pnpm build` — `pnpm -r --sort build` (builds all workspace packages)
- `pnpm test` — package tests, including native C and JavaScript tests
- `pnpm lint` — `prettier --check .`
- `pnpm format` — `prettier --write .`

Linting runs in the pre-commit hook. New features and behavior changes require
automated tests. `pnpm build` compiles the native WebAssembly module and needs
Emscripten (`emcc`) on `PATH`. GitHub Actions runs `pnpm test`, `pnpm build`,
and `pnpm lint`; build workflows install Emscripten SDK `6.0.12`.

## Way of working

- Work on a feature branch; ask the user if a worktree is needed.
- Never commit to `main` directly; always go through a pull request.
- No magic numbers: every literal with meaning gets a named constant, so
  intent is self-documenting (e.g. `1 / OSCILLATOR_COUNT` in `axiom-voice.ts`).
- Never commit files under `.superpowers/`; treat them as local agent artifacts.

## Repo structure

pnpm workspaces monorepo on branch-based workflow (PRs to `main`):

- `app/` — Vite + Vue application (`@axiom/app`)
- `packages/audio-engine/` — Web Audio engine library (`@axiom/audio-engine`),
  internal-only, consumed as source (no build output)
- `packages/axiom-synth/` — Axiom synth library (`@axiom/axiom-synth`),
  internal-only, consumed as source (no build output)
- `packages/audio-testing/` — fake Web Audio context/nodes shared by tests
  (`@axiom/audio-testing`), internal-only
- `packages/native/` — native C and WebAssembly audio processor
- Root owns prettier/husky/lint-staged; packages ship no prettier tooling

## Codebase docs

`docs/codebase/` is the source of truth for conventions and architecture. Read
the relevant file before deep work:

| File              | Contents                                   |
| ----------------- | ------------------------------------------ |
| `STACK.md`        | Tech stack, toolchain, key commands        |
| `STRUCTURE.md`    | Directory layout, entry points, boundaries |
| `ARCHITECTURE.md` | Audio engine graph, data flow, patterns    |
| `CONVENTIONS.md`  | Naming, Prettier, TypeScript strictness    |
| `INTEGRATIONS.md` | CI/CD, GitHub Pages, localStorage          |
| `TESTING.md`      | Test setup, commands, and coverage rules   |
| `CONCERNS.md`     | Known issues, tech debt, risks             |
| `RULES.md`        | Locked architectural rules (living doc)    |
