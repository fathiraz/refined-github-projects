## Context

`src/lib/errors.ts` exports a closed tagged ADT of GitHub-domain errors via `Data.TaggedError`. Each runtime class has a parallel `Schema.TaggedStruct` in `src/lib/schemas-errors.ts` so failures can be encoded across messaging boundaries (background SW ↔ content script) without losing structure. The `GithubNetworkError` runtime class has a single required field `cause: unknown` (set from the underlying `fetch` rejection or thrown error). The current schema mirror declares both `message` and `cause` as `Schema.optional(...)`, which violates the "schema mirrors runtime" invariant the `errors` capability promises.

`cubic-dev-ai` flagged this on PR #26 (`discussion_r3167663217`).

## Goals / Non-Goals

**Goals:**
- Make the `GithubNetworkError` schema field shape match the runtime class (`cause` required).
- Codify the invariant in the `errors` spec so future schemas cannot regress.

**Non-Goals:**
- Reworking other error variants. The schema mirrors of the other six tagged errors already match their runtime classes.
- Removing the optional `message` field on the schema. The runtime class does not have `message`, but tightening that is out of scope for this PR-26 review item; it can be a follow-up.
- Touching `Data.TaggedError` runtime classes themselves.

## Decisions

### Decision 1: Tighten `cause` to `Schema.Unknown`
Change `cause: Schema.optional(Schema.Unknown)` to `cause: Schema.Unknown` exactly as suggested by the reviewer.

**Alternatives considered:**
- *Keep optional and add a runtime guard.* Rejected — duplicates validation and silently passes invalid payloads through `Schema.decode`, defeating the purpose of having a schema.
- *Replace `Schema.Unknown` with `Schema.Defect` or a structured cause schema.* Rejected — out of scope and would require changes to every call site that currently passes a `fetch` rejection (an arbitrary `unknown`).

### Decision 2: Encode the invariant in the spec
Update the `Schema-mirrored error payloads` requirement to explicitly forbid optional schema fields whose runtime counterpart is required, and add a scenario asserting `GithubNetworkError` decode fails when `cause` is missing.

## Risks / Trade-offs

- **Risk**: Some message payload in flight at upgrade time could lack `cause`. → Mitigation: messaging payloads are point-in-time (no persistence), and every existing call site (`graphql-service.ts:82`, `:165`; tests) already passes `cause`. No upgrade window exists.
- **Trade-off**: Slightly stricter decoding — a malformed payload now fails fast with `ParseError` instead of decoding to `{ cause: undefined }`. This is the desired behaviour.

## Migration Plan

None. Single-line schema change; existing call sites already comply.

## Open Questions

None.
