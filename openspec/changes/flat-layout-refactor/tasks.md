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
- [x] Split `features/bulk-duplicate-modal.tsx` (1828) → modal (1615) + utils (193) + relationship-list (97).
- [x] Split `features/bulk-edit-modal.tsx` (1639) → modal (1213) + utils (202) + relationships (278).
- [x] Split `features/bulk-actions-bar.tsx` (1697) → bar (974) + menu (284) + modals (290) + utils (72); inlined `lazy-modals.tsx`.
- [x] Split `features/bulk-rename-modal.tsx` (932) → modal (775) + preview (132) + utils (31).
- [x] Split `features/bulk-move-modal.tsx` (801) → modal (686) + utils (48) + preview (81).
- [x] Split `features/sprint-modal.tsx` (1213) → modal (432) + sprint-settings-view + sprint-end-view; helpers moved to `lib/sprint-utils.ts`.
- [x] Split `features/table-enhancements.ts` (598) → enhancements (340) + drag-and-drop (270).
- [x] Split `background/bulk-handlers.ts` → register + bulk-update + bulk-state + bulk-rename + bulk-position.
- [x] Split `background/helpers.ts` → project-helpers + relationship-helpers + rest-helpers.
- [x] Split `ui/primitives.tsx` → icons + actions + panel-card + section-header + progress-state + status-banner + step-indicator + empty-state + keyboard-hint + app-shell. Deleted `primitives.tsx`.
- [x] Validate.

## Phase 3 — DRY pass
- [x] Extract `getFieldOptionTooltip` to `features/field-helpers.ts`. (`getFieldIcon` left per-modal — diverged shapes.)
- [x] Extract `formatIssueReference` + `relationshipKey` to `lib/relationship-utils.ts`; consumed by background, features, ui.
- [x] Every `*Icon` import resolves to `@/ui/icons` (Phase 2 work).
- [x] Confirmed no helper duplicate via grep (`function formatIssueReference`, `function relationshipKey`, `function issueKey`).
- [x] Validate.

## Phase 4 — lowercase comments
- [x] New phase-2/3 files use lowercase intent comments by default.
- [x] Sweep every pre-existing file (46 files, scripted via `/tmp/lc_comments.py` with proper-noun whitelist preserving Effect/Fiber/GraphQL/IntersectionObserver/etc. references; 2 manual reverts for `Fiber.await` / `Effect.sleep` API references).
- [x] No emojis introduced.
- [x] Validate (typecheck + tests).

## Phase 5 — final
- [x] `pnpm test` — 225 passed.
- [x] `pnpm typecheck` — clean.
- [x] `pnpm build:chrome && pnpm build:firefox && pnpm build:edge` — clean (3.05 MB each).
- [x] `pnpm check:manifest` — clean (only `storage`).
- [x] Diff size sanity: 137 src files changed, net −96 lines (3387 ins / 3483 del). Pure moves + DRY.
- [x] Open PR; archive change once merged: rename `openspec/changes/flat-layout-refactor/` → `openspec/changes/archive/flat-layout-refactor/` and copy its `specs/layout/spec.md` → `openspec/specs/layout/spec.md`. (PR opened; archive deferred until merge.)
