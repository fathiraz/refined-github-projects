/**
 * Vitest setup file for Effect-first tests.
 *
 * Tests don't pre-register a single global Layer — instead they compose
 * per-test Layers via the factories exported from `./effect-test-layers`.
 * This keeps each test isolated (no shared mutable state) while still
 * letting them share the same `GithubGraphQLLive` contract.
 *
 * Test-layer factories are NOT re-exported here because they transitively
 * import `@/lib/storage`, which depends on the WXT `storage` global that
 * only exists once a per-test `vi.mock('@/lib/storage', ...)` is registered.
 * Tests that need them should `import { makeRecordedHttpLayer, ... } from
 * './effect-test-layers'` directly, after their `vi.mock` call.
 *
 * This file's sole job is to register the Effect-aware `toEqualValue`
 * matcher globally so every test file picks it up.
 */
import './effect-assert'
