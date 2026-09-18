# CI Test Report

## Changes

- Added `.github/workflows/test.yml` for pushes and pull requests.
- Configured pnpm 11 and Node.js 24, matching the repository's existing CI setup.
- Added frozen dependency installation followed by `pnpm test`, `pnpm build`, and `pnpm lint`.
- No production code was modified.

## Local Verification

Run on 2026-09-18:

- `pnpm test`: passed, 2 test files and 7 tests.
- `pnpm build`: passed for all three buildable workspace packages.
- `pnpm lint`: passed, all files matched Prettier style.
- `git diff --check`: passed.
