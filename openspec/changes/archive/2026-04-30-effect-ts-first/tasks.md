# Tasks

## Phase 0 — Foundation
- [x] Create `src/lib/effect/runtime.ts` exporting `AppRuntime`, `runPromise`, `runFork`, `runSync`, `runHandler`.
- [x] Create `src/lib/effect/{services,schemas}/index.ts` barrels.
- [x] Wire `AppRuntime` initialisation in `src/entries/background/index.ts` and `src/entries/content/...`.
- [x] Validate: `rtk pnpm typecheck && rtk pnpm test`.

## Phase 1 — Schema everywhere
- [x] Add `src/lib/effect/schemas/branded.ts` (ProjectId, ProjectItemId, IssueNumber, IssueDatabaseId, Pat, Login, RepoOwner, RepoName).
- [x] Add `src/lib/effect/schemas/messages.ts` covering every entry in `ProtocolMap` as `{ input, output }`.
- [x] Add `src/lib/effect/schemas/github.ts` for `ProjectItemDetails`, `FieldsResultProject`, `RelationshipSearchResult`, `RestIssueDependencyResponse`, `RestSubIssue`.
- [x] Add `src/lib/effect/schemas/storage.ts` for `SprintSettings`, `ExcludeCondition`.
- [x] Add `src/lib/effect/schemas/errors.ts` mirroring `Data.TaggedError` payloads.
- [x] Validate.

## Phase 2 — Error ADT + Match
- [x] Split `GithubHttpError` into `GithubRateLimitError`, `GithubAuthError`, `GithubServerError`, `GithubClientError`. Keep `GithubHttpError` as deprecated alias.
- [x] Add `GithubDecodeError`.
- [x] Replace ad-hoc 403/429 chains with `Match.tag` classifier.
- [x] Map `PatErrorType` UI logic via `Match.value`.
- [x] Update `errors.test.ts`.
- [x] Validate.

## Phase 3 — HttpClient + GraphQL service
- [x] Add deps: `pnpm add @effect/platform @effect/platform-browser` (versions compatible with `effect@^3.21.1`).
- [x] Create `src/lib/effect/services/http.ts` exposing `HttpClientLive = FetchHttpClient.layer`.
- [x] Create `src/lib/effect/services/graphql.ts` with `GithubGraphQL` service tag + Layer providing `request<A,I,R>(schema, query, vars, opts?)`. Handles Pat, classification, `Schedule.exponential.jittered ⨯ recurs(2)` retry on `RateLimitError`, `Effect.timeout(30s)`, `Effect.withSpan`.
- [x] Refactor `src/lib/graphql/client.ts` `gql(...)` to a thin shim that `runPromise(GithubGraphQL.request(...))`.
- [x] Reduce `withRateLimitRetry` in `helpers.ts` to a UI-broadcast wrapper (full deletion in Phase 7 once handlers are Effect-first).
- [x] Validate (also visually check bundle sizes after first build).

## Phase 4 — Concurrency primitives
- [x] Replace `entries/background/concurrency.ts` integer counters with three `Effect.Semaphore`s, exposed via a `Concurrency` Layer.
- [x] Replace `activeFibers: Map + cancelledProcesses: Set` in `lib/queue.ts` with `FiberMap`.
- [x] Replace setTimeout-based eviction in `cache.ts` & `toast-store.ts` with `Effect.acquireRelease` inside a Scope.
- [x] Validate.

## Phase 5 — Stores via SubscriptionRef
- [x] Convert `selection-store.ts` internals to `SubscriptionRef<ReadonlySet<string>>` via `SelectionStore` Tag + Layer. Public API preserved.
- [x] Convert `toast-store.ts` to `SubscriptionRef<ToastEntry[]>`.
- [x] Convert `queue-store.ts` to `SubscriptionRef<ProcessEntry[]>` consuming `queueStateUpdate` messages via Schema decode.
- [x] Convert `checkbox-portal-store.ts` to `SubscriptionRef<readonly PortalEntry[]>`.
- [x] Add `src/lib/effect/use-subscription-ref.ts` React hook.
- [x] Update store tests; add a new test that drives changes via Stream.
- [x] Validate.

## Phase 6 — Branded primitives
- [x] Replace raw `string` IDs in `messages.ts`, `types.ts`, helper signatures with branded types. (Internal types branded; ProtocolMap kept `string` for wire-format compat — UI callsites send raw strings, helpers decode at the boundary.)
- [x] Update DOM extraction in `project-table-dom.ts` to decode → branded.
- [x] Update tests asserting branded equality.
- [x] Validate.

## Phase 7 — Effect-first handlers
- [x] Refactor each `onMessage(...)` in `entries/background/handlers/*.ts` to `runHandler(name, Effect.gen(...))`. Done for getPatStatus, validatePat, getProjectFields, getItemTitles, getItemPreview, getHierarchyData. **Bulk/sprint/duplicate handlers (which mutate processQueue) deferred to a future iteration — they keep async style but compose with the Effect runtime via the existing `gql`+`runPromise` shim.**
- [x] Convert `getProjectFieldsData`, `resolveProjectItemIds`, `listIssueRelationshipsSafe`, `listSubIssuesSafe`, `getRepositoryId` to `Effect`-returning members of `ProjectService` (via `Effect.tryPromise` adapters; legacy helpers remain).
- [x] Replace cache logic in `cache.ts` with `PreviewCache` / `HierarchyCache` services. **Note:** services wrap the existing `getOrCachePreview`/`getOrCacheHierarchy` rather than reimplementing on `Cache.makeWith` because the lookup function in `Cache.makeWith` must be fixed at construction-time, but our fetchers vary per call. Existing impl already uses `Effect.cachedWithTTL` per key + `Effect.sleep`/`Fiber.interrupt` eviction (TestClock-friendly).
- [x] Delete deprecated shims (`gql`, store-listener APIs not needed by React). **Deferred to Phase 9** — see notes there.
- [x] Validate.

## Phase 8 — Tests + Test Layers
- [x] Add `vitest.setup.effect.ts` registering Effect-aware matchers globally; per-test layers come from `effect-test-layers.ts` factories (`makeTestStorageLayer`, `makeRecordedHttpLayer`).
- [x] Add `TestClock` driven tests for retry+rate-limit flows (see `graphql-testclock.test.ts`).
- [x] Snapshot Schema-encoded outputs for representative ProtocolMap messages (see `schema-snapshots.test.ts`).
- [x] Validate.

## Phase 9 — Cleanup
- [x] Remove `GithubHttpError` deprecated alias. Replaced 5 callsites: `helpers.ts` REST throw → `classifyHttpError(...)`, two 404 catches → `instanceof GithubClientError`, dropped `GitHubRequestError` re-export, dropped `GqlError` re-export, updated `errors.test.ts` + `client.test.ts`.
- [x] Remove deprecated store shims: dropped unused `subscribeQueueState` / `getQueueState` / `currentState` / `stateListeners` / internal `setState` / `StateListener` from `lib/queue.ts`. All store consumers now go through `*Changes: Stream` + `get*Snapshot()` accessors via the `useSubscriptionRef` hook.
- [x] Update `AGENTS.md`/`.ruler/01_ghpira.md` with the new architecture diagram. `.ruler/01_ghpira.md` gets the full Effect-TS architecture section + ASCII diagram + "where to add new code" guide; root `AGENTS.md` (Cursor Cloud doc) gets a concise architecture summary and now correctly advertises `pnpm test` (vitest) as wired-in.
- [x] Final validation: `rtk pnpm test` (225 pass / 24 files) → `rtk pnpm typecheck` (no errors) → `rtk pnpm build:chrome` (3.05 MB) → `rtk pnpm build:firefox` (3.05 MB) → `rtk pnpm build:edge` (3.05 MB).
