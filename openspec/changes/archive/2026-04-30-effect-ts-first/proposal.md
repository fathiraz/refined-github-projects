# Effect-TS first migration

## Why
Today the codebase uses Effect-TS in only four spots (queue, GraphQL fetch, logger Layer, simple `cachedWithTTL` for hover tooltips, `Data.TaggedError` for errors). The rest re-implements primitives Effect already ships:

- 4 stores (`selection`, `toast`, `queue`, `checkbox-portal`) hand-roll `Set<Listener> + notify()` instead of `SubscriptionRef + Stream`.
- `concurrency.ts` tracks integer counters instead of `Effect.Semaphore`.
- `withRateLimitRetry` hand-rolls a 3-attempt retry loop instead of `Schedule.exponential + Schedule.recurs`.
- Message protocol (`messages.ts ProtocolMap`), GraphQL responses, and storage values are TypeScript-only — no runtime guard against shape drift.
- `gql(...)` returns `Promise<unknown>` cast to `T`; defects/typed errors leak through `throw`. Each call site re-handles 403/429.
- Stores expose imperative subscribe/listener APIs that React reaches via `useSyncExternalStore` ad-hoc.

This change makes Effect-TS a first-class runtime: schemas decode every boundary, stores are `SubscriptionRef`s, services live in `Layer`s wired via a single `ManagedRuntime`, and HTTP/retry/timeout/tracing concerns move to `@effect/platform`'s `HttpClient`.

## What Changes
- ADD `@effect/platform`, `@effect/platform-browser` dependencies.
- ADD `src/lib/effect/{runtime,schemas,services,use-subscription-ref}.ts`.
- MODIFY `src/lib/{graphql/client,queue,errors,debug-logger,storage,selection-store,toast-store,queue-store,checkbox-portal-store}.ts`.
- MODIFY all background handlers under `src/entries/background/handlers/` to delegate to Effect programs through a single `runHandler` adapter.
- MODIFY `src/entries/background/{cache,concurrency,helpers,types}.ts`.
- DELETE `withRateLimitRetry` (replaced by `Schedule` in GraphQL service).
- DEPRECATE then DELETE the imperative `Set<Listener>` patterns inside stores.

## Non-Goals
- No UI/behavior changes — pure refactor.
- No new features.
- No replacement of `@webext-core/messaging` (wrapped, not replaced).
- No conversion of MutationObservers / DOM-tracking code to Effect Stream.
- No replacement of React / styled-components / Primer.
- No CI/release/Manifest changes beyond what builds require.

## Decisions (confirmed by user)
- Scope: Full Effect-first (rewrite handlers, stores, services).
- HTTP: Add `@effect/platform` + `@effect/platform-browser`.
- Schema: Validate at all boundaries (messages + GraphQL + storage).
- Stores: All 4 stores → `SubscriptionRef` + `useSubscriptionRef` hook.

## Validation
After every phase:
`rtk pnpm test && rtk pnpm install && rtk pnpm typecheck && rtk pnpm build:chrome && rtk pnpm build:firefox && rtk pnpm build:edge`
