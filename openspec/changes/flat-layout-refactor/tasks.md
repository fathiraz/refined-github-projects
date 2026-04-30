# Tasks

## Phase 0 — branch + baseline
- [x] Branch off `feat/effect-platform-runtime` as `refactor/flat-layout`.
- [x] Capture baseline: `rtk pnpm test` (must show 225 passed / 24 files), `rtk pnpm typecheck` (zero errors), `rtk pnpm build:{chrome,firefox,edge}` sizes.

## Phase 1 — folder restructure (no logic changes)
- [x] Create `src/features/`, `src/ui/`, `src/background/`.
- [x] Move `components/bulk/*` → `features/*`.
- [x] Move `components/sprint/*.tsx` → `features/*`; `components/sprint/sprint-store.ts` → `lib/sprint-store.ts`.
- [x] Move `components/hierarchy/*` → `features/*`.
- [x] Move `components/ui/*` → `ui/*`.
- [x] Move loose `components/*.tsx` (onboarding-coach, token-setup, debug-settings-card, checkbox-portal-host, toast-list, queue-tracker, keyboard-help-overlay) → `features/*`.
- [x] Move `entries/background/index.ts` → `entries/background.ts`.
- [x] Move `entries/background/handlers/*` and `entries/background/services/*` and `entries/background/{cache,concurrency,helpers,types}.ts` → `background/*` (paths flat).
- [x] Move `entries/content/index.ts` → `entries/content.ts`; siblings → `features/*`.
- [x] Merge `entries/popup/{bootstrap,app}.tsx` → `entries/popup/main.tsx`; same for options. (kept folder pattern because WXT requires html+tsx in popup/ folder.)
- [x] Move `lib/effect/runtime.ts` → `lib/effect-runtime.ts`.
- [x] Move `lib/effect/use-subscription-ref.ts` → `lib/use-subscription-ref.ts`.
- [x] Move `lib/effect/schemas/<name>.ts` → `lib/schemas-<name>.ts`.
- [x] Move `lib/effect/services/{graphql,storage,http}.ts` → `lib/{graphql,storage,http}-service.ts`.
- [x] Move `lib/graphql/{client,queries,mutations}.ts` → `lib/graphql-{client,queries,mutations}.ts`.
- [x] Move tests out of `__tests__/` into source siblings; rename `vitest.setup.effect.ts` → `vitest.setup.ts`, `effect-test-layers.ts` → `effect-test-helpers.ts`.
- [x] Delete `lib/effect/` and `lib/graphql/` and `__tests__/` directories once empty.
- [x] Delete empty barrels (`lib/effect/services/index.ts`, `lib/effect/schemas/index.ts`, `components/bulk/lazy-modals.tsx` kept until phase 2 inlining).
- [x] Update `vitest.config.ts` `setupFiles` to `./src/lib/vitest.setup.ts`.
- [x] Replace every relative `../`/`../../`/`./` import in `src/` with `@/...`.
- [x] Validate: `rtk pnpm install && rtk pnpm typecheck && rtk pnpm test && rtk pnpm build:chrome && rtk pnpm build:firefox && rtk pnpm build:edge`.

## Phase 2 — split big files
- [~] Split `features/bulk-duplicate-modal.tsx` → modal + steps + utils. _Deferred: modal is a tightly-coupled state machine; splitting hurts cohesion._
- [~] Split `features/bulk-edit-modal.tsx` → wizard + steps + relationships + utils. _Deferred: same as above._
- [x] Split `features/bulk-actions-bar.tsx` → inline `lazy-modals.tsx` directly. (bar + dispatch left intact since `ModalStep` enum drives a single switch.)
- [~] Split `features/bulk-rename-modal.tsx` → modal + preview + utils. _Deferred: preview is intertwined with form state._
- [~] Split `features/bulk-move-modal.tsx` → modal + utils. _Deferred: form is small enough._
- [~] Split `features/sprint-modal.tsx` → modal + end-view + settings-view. _Deferred: SettingsView and EndSprintView already at function-component level inside the file._
- [~] Split `features/table-enhancements.ts` → enhancements + drag-and-drop. _Deferred: DOM-mutation modules cohesive._
- [x] Split `background/bulk-handlers.ts` → register + bulk-update + bulk-state + bulk-rename + bulk-position.
- [x] Split `background/helpers.ts` → project-helpers + relationship-helpers + rest-helpers.
- [x] Split `ui/primitives.tsx` → icons + actions + panel-card + section-header + progress-state + status-banner + step-indicator + empty-state + keyboard-hint + app-shell. Deleted `primitives.tsx`.
- [x] Validate.

## Phase 3 — DRY pass
- [ ] Extract duplicated helpers to `features/field-helpers.tsx`.
- [ ] Make every `*Icon` import resolve to `ui/icons.tsx`.
- [ ] Confirm no helper has more than one definition (grep: `function formatIssueReference|function getFieldIcon|function createEmptyRelationship`).
- [ ] Validate.

## Phase 4 — lowercase comments
- [ ] Sweep every touched file: short, lowercase intent comments; kebab section banners; drop JSDoc that doesn't drive types.
- [ ] No emojis.
- [ ] Validate.

## Phase 5 — final
- [ ] `rtk pnpm test` — 225 passed.
- [ ] `rtk pnpm typecheck` — clean.
- [ ] `rtk pnpm build:chrome && rtk pnpm build:firefox && rtk pnpm build:edge` — clean.
- [ ] `pnpm check:manifest` — clean.
- [ ] Diff size sanity: `git diff --stat origin/main...HEAD` — verify scope (files moved/split, not behavior).
- [ ] Open PR; archive change once merged: rename `openspec/changes/2026-04-30-flat-layout-refactor/` → `openspec/changes/archive/2026-04-30-flat-layout-refactor/` and copy its `specs/layout/spec.md` → `openspec/specs/layout/spec.md`.
