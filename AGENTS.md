# axiom-synth

Vue 3 + TypeScript + Vite web synthesizer using the Web Audio API.

Work in progress.

Use the caveman skill in ultra mode.

## Commands

- `pnpm dev` — Vite dev server on port 4000
- `pnpm build` — `vue-tsc -b && vite build` (type-checks then builds)
- `pnpm lint` — `prettier --check .`
- `pnpm format` — `prettier --write .`

Linting is done in the pre-commit hook, no need to run `pnpm lint` manually.

There is no test runner configured.

## Conventions

- **Package manager:** pnpm (lockfile: `pnpm-lock.yaml`)
- **Vue SFCs:** `<script setup lang="ts">` — no Options API
- **TypeScript:** strict mode, no unused locals/params, `erasableSyntaxOnly`
- **Formatting:** Prettier with single quotes, trailing commas, no semicolons, 80 char width, `prettier-plugin-tailwindcss`
- **Pre-commit:** Husky + lint-staged auto-formats staged `.ts/.js/.vue/.css/.md/.json/.yml/.yaml` files
- **CSS:** Tailwind CSS v4 with `@theme inline` custom properties — see `src/style.css` for the full color/shadow system
- **Dark mode:** class-based via `.dark` — use `dark:` variant with `@custom-variant` in style.css

## Architecture

- `src/engine/` — `AudioEngine` class wrapping Web Audio API (voice pool, filter, compressor, analyser chain)
- `src/types/` — config interfaces (`OscillatorConfig`, `EnvelopeConfig`, `FilterConfig`)
- `src/composables/` — Vue composables (`useAudioEngine`, `useThemeMode`)
- `src/components/` — UI components (Synth, Keyboard, Knob, OscillatorPanel, FilterPanel, etc.)
- `src/utils/` — display helpers for dB, fractions, semitones, key mapping
