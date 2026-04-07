# AGENTS.md

## Cursor Cloud specific instructions

This is a **browser extension** (Chrome/Firefox/Edge) built with WXT + React + TypeScript. There is no backend server or database. All API calls go directly from the browser to GitHub's GraphQL API.

### Quick reference

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Dev server (hot reload) | `pnpm dev` |
| Production build | `pnpm build` |
| Type check (only CI validation) | `pnpm typecheck` |

### Key caveats

- **Node.js 25** is required (matches CI). Use `nvm use 25` if multiple versions are installed.
- **pnpm 10.32.1** is specified in `packageManager`; install via `npm install --global pnpm@10.32.1`.
- **No test framework** exists — there are no unit/integration tests. `pnpm typecheck` is the only automated validation.
- `pnpm dev` starts the WXT dev server on port 3000 and auto-opens a Chromium browser with the extension loaded. In headless/cloud environments the auto-opened browser may not be visible; load the built extension manually via `chrome://extensions` → "Load unpacked" → `dist/chrome-mv3` (prod build) or `dist/chrome-mv3-dev` (dev build).
- The `postinstall` script runs `wxt prepare` which generates `.wxt/` types required by `tsconfig.json`. If typecheck fails after a fresh clone, re-run `pnpm install`.
- Styled-components warnings about unknown props (`sx`, `alignItems`, etc.) in the dev console are pre-existing and harmless — they come from `@primer/react` internals.
