# Contributing to Refined GitHub Projects

## Dev Setup

```bash
pnpm install
pnpm dev       # hot reload on chrome://extensions
pnpm build     # production build → .output/chrome-mv3/
pnpm typecheck # tsc --noEmit
```

## Pull Request Rules

1. `pnpm typecheck` must pass with zero errors before submitting.
2. **No `Promise.all()` for mutations.** All GitHub API writes must go through the sequential queue (`lib/queue.ts`).
3. **1 s delay between mutations.** Every content-creating mutation must be followed by `await sleep(1000)`.
4. All API calls must originate in `entrypoints/background.ts` — never in content scripts.

> [!CAUTION]
> **Rate-limit safety is non-negotiable.** GitHub will permanently ban a user's PAT with a 403 Abuse
> alert if multiple mutations are fired concurrently. Never bypass the queue or the sleep delay.

## Code Style

- TypeScript strict mode — no `any` where avoidable
- Immutable patterns — create new objects, never mutate in place
- Small files: aim for < 400 lines, hard cap at 800 lines
- Handle errors explicitly; never silently swallow them
