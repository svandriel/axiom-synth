# axiom-synth

Vue 3 + TypeScript + Vite web synthesizer using the Web Audio API.

Work in progress. Use the caveman skill in ultra mode.

## Commands

- `pnpm dev` — Vite dev server on port 4000
- `pnpm build` — `pnpm -r --sort build` (builds all workspace packages)
- `pnpm lint` — `prettier --check .`
- `pnpm format` — `prettier --write .`

Linting runs in the pre-commit hook. No test runner configured.

## Way of working

- Work on a feature branch; ask the user if a worktree is needed.
- Never commit to `main` directly; always go through a pull request.

## Repo structure

pnpm workspaces monorepo on branch-based workflow (PRs to `main`):

- `app/` — Vite + Vue application (`@axiom/app`)
- `packages/audio-engine/` — Web Audio engine library (`@axiom/audio-engine`),
  internal-only, consumed as source (no build output)
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
| `TESTING.md`      | Test setup (none — build is the gate)      |
| `CONCERNS.md`     | Known issues, tech debt, risks             |
