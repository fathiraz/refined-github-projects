# Capability: Errors

## MODIFIED Requirements

### Requirement: Schema-mirrored error payloads
Each tagged error SHALL have a parallel `Schema` (in `src/lib/schemas-errors.ts`) so errors can be transported across messaging boundaries (background ↔ content) without losing structure. The schema field shape SHALL exactly mirror the runtime `Data.TaggedError` class shape: any field declared as required on the runtime class MUST be required on the schema (no `Schema.optional(...)` mirror for a required runtime field).

#### Scenario: Error transport across messaging boundary
- WHEN a background handler fails with a tagged error
- THEN the error is encoded via its Schema before sending to the content script
- AND the content script decodes it back into the same tagged error class

#### Scenario: GithubNetworkError preserves cause across boundary
- WHEN a background handler fails with `new GithubNetworkError({ cause })`
- THEN the schema-encoded payload carries a `cause` value
- AND decoding a payload that omits `cause` fails with a `ParseError`
