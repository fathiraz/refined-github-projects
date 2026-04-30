# Flat-layout refactor (refined-github style)

## Why
The codebase has 8 files >600 lines, four-deep folders (e.g. `src/lib/effect/schemas/messages.ts`), three separate `__tests__/` folders, mixed import styles (`@/...` in background, `../../...` in components), and duplicated helpers between bulk modals (`formatIssueReference`, `getFieldIcon`, empty-state factories, …). New contributors need a mental map before they can change anything.

[refined-github](https://github.com/refined-github/refined-github) ships a much larger extension with only six folders under `source/`, one file per feature, tests beside source, and short kebab-case filenames. We adopt the same style so the layout itself is the documentation.

## What Changes
- ADD `src/features/`, `src/ui/`, `src/background/` top-level folders.
- MOVE every component into `features/` (one file per feature, kebab-case).
- MOVE every shared UI building block into `ui/`.
- MOVE every background-only file into `background/` (flat).
- MOVE every effect/schema/service/graphql file from `lib/effect/...` and `lib/graphql/...` into `lib/` with kebab-prefix names (e.g. `lib/schemas-github.ts`, `lib/graphql-service.ts`).
- MOVE every test out of `__tests__/` directories and place it next to its source.
- MOVE `components/sprint/sprint-store.ts` → `lib/sprint-store.ts`.
- DELETE empty barrels (`lib/effect/services/index.ts`, `lib/effect/schemas/index.ts`, `components/bulk/lazy-modals.tsx`).
- REWRITE every relative import in `src/` to use the `@/` alias.
- SPLIT 11 files >400 lines into siblings (`*-utils.ts`, `*-steps.tsx`, `*-helpers.ts`).
- EXTRACT duplicated helpers into `features/field-helpers.tsx` and `ui/icons.tsx`.
- SWEEP comments to short, lowercase, intent-first style.
- DO NOT change runtime behavior, GraphQL queries, message shapes, storage keys, or any logic.

## Non-Goals
- No new features.
- No GraphQL or REST changes.
- No Effect-runtime restructuring (semaphores, services, Tags, Layers stay identical — only paths change).
- No design-system / Primer / Tippy / motion changes.
- No README / docs writing (per project guideline).
- No safari-build validation.
- No CI/CD config touch.

## Decisions
- Tests colocated as `*.test.ts(x)` next to source.
- `@/*` alias everywhere (no `../../...`).
- Effect helpers fully flattened into `lib/` (no nested `lib/effect/...`).
- `lib/effect/services/{graphql,storage,http}.ts` → `lib/{graphql,storage,http}-service.ts`.
- `lib/effect/schemas/<name>.ts` → `lib/schemas-<name>.ts`.
- `lib/graphql/<name>.ts` → `lib/graphql-<name>.ts`.
- Sprint store leaves `components/` and lives with the other stores in `lib/`.
- Each phase ends with full validation before the next phase begins.

## Validation
After every phase:
`rtk pnpm install && rtk pnpm typecheck && rtk pnpm test && rtk pnpm build:chrome && rtk pnpm build:firefox && rtk pnpm build:edge`
Acceptance: all 6 commands exit 0; vitest reports 225 passed / 24 files; `pnpm check:manifest` (when run after `build:chrome`) still OK.
