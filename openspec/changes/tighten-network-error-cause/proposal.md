## Why

The runtime `GithubNetworkError` class declares `cause: unknown` as a required field, but its mirroring `Schema.TaggedStruct` in `src/lib/schemas-errors.ts` declared `cause` as optional. This lets invalid network-error payloads decode across the background ↔ content messaging boundary without their root cause, weakening the error contract that the `errors` capability is supposed to guarantee. Flagged by `cubic-dev-ai` review on PR #26.

## What Changes

- Tighten `GithubNetworkError` schema: change `cause: Schema.optional(Schema.Unknown)` to `cause: Schema.Unknown` so the schema mirrors the runtime class exactly.
- Strengthen the `errors` capability requirement so optional schema fields are forbidden where the runtime class declares the field as required.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `errors`: tighten the "Schema-mirrored error payloads" requirement to forbid optional schema fields whose runtime counterpart is required, and add a scenario asserting decode failure when `cause` is missing on `GithubNetworkError`.

## Impact

- Code: `src/lib/schemas-errors.ts` (one line).
- Tests: existing `errors.test.ts` and `graphql-client.test.ts` already construct `GithubNetworkError({ cause })`; no changes expected.
- Messaging boundary contract: stricter decode — payloads missing `cause` will now fail with a `ParseError` instead of silently decoding.
- Risk: very low. No persisted snapshots include the optional shape; messaging payloads are point-in-time.
