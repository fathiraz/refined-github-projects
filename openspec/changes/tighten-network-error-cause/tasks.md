## 1. Schema fix

- [ ] 1.1 In `src/lib/schemas-errors.ts`, change `cause: Schema.optional(Schema.Unknown)` to `cause: Schema.Unknown` inside the `GithubNetworkError` `Schema.TaggedStruct`.

## 2. Validation

- [ ] 2.1 Run `rtk pnpm test` and confirm all suites pass.
- [ ] 2.2 Run `rtk pnpm install` (no-op refresh) followed by `rtk pnpm typecheck` and confirm no errors.
- [ ] 2.3 Run `rtk pnpm build:chrome`, `rtk pnpm build:firefox`, `rtk pnpm build:edge` and confirm all succeed.

## 3. Delivery

- [ ] 3.1 Stage `src/lib/schemas-errors.ts` and the new `openspec/changes/tighten-network-error-cause/` files.
- [ ] 3.2 Commit with conventional message `fix(schemas): require cause on GithubNetworkError` plus body referencing PR #26 review.
- [ ] 3.3 `rtk git push` to `feat/effect-platform-runtime`.
- [ ] 3.4 Reply to PR #26 review comment `discussion_r3167663217` with the commit SHA and a link to this change folder.
