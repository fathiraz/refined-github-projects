/**
 * Branded primitives that distinguish otherwise-identical string/number IDs.
 * Raw values cross into branded types only via the `decode*` helpers in
 * `schemas-decode.ts`. This eliminates the historical class of bugs where
 * `domId` and `projectItemId` (both strings) were swapped at call sites.
 *
 * The brand is a phantom property: it exists in the type system and not at
 * runtime, so a `ProjectItemId` IS a `string` everywhere it is used.
 */

type Brand<T, Tag extends string> = T & { readonly __brand: Tag }

export type ProjectItemId = Brand<string, 'ProjectItemId'>

/** DOM-extracted identifier such as "issue:3960969873". Resolved → ProjectItemId. */
export type ProjectItemDomId = Brand<string, 'ProjectItemDomId'>

export type IssueNodeId = Brand<string, 'IssueNodeId'>

export type IssueNumber = Brand<number, 'IssueNumber'>

export type IssueDatabaseId = Brand<number, 'IssueDatabaseId'>

export type RepoOwner = Brand<string, 'RepoOwner'>

export type RepoName = Brand<string, 'RepoName'>
