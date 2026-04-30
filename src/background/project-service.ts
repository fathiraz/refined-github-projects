import { Context, Effect, Layer } from 'effect'

import {
  getProjectFieldsData as getProjectFieldsDataAsync,
  getRepositoryId as getRepositoryIdAsync,
  listIssueRelationshipsSafe as listIssueRelationshipsSafeAsync,
  listSubIssuesSafe as listSubIssuesSafeAsync,
  resolveProjectItemIds as resolveProjectItemIdsAsync,
  resolveProjectItemIdsWithTitles as resolveProjectItemIdsWithTitlesAsync,
} from '@/background/helpers'
import type { FieldsResultProject, ResolvedItem, ResolvedItemWithTitle } from '@/background/types'
import type { IssueRelationshipData, SubIssueData } from '@/lib/messages'

/**
 * `ProjectService` exposes the legacy background helpers as Effect-returning
 * members. Existing async callers continue to use the helpers directly, but
 * new code that lives inside `runHandler(name, Effect.gen(...))` blocks can
 * yield* these methods to get full Effect-runtime tracing, structured
 * cancellation, and seamless composition with other services.
 *
 * The helpers themselves throw on failure, so we wrap each in
 * `Effect.tryPromise` and let the resulting `unknown` defect bubble up — the
 * default `runHandler` cause-pretty printer surfaces them through the
 * logger.
 */
export interface ProjectServiceShape {
  readonly getProjectFieldsData: (
    owner: string,
    number: number,
    isOrg: boolean,
  ) => Effect.Effect<{ project: FieldsResultProject | undefined }>
  readonly resolveProjectItemIds: (
    domIds: string[],
    projectId: string,
  ) => Effect.Effect<ResolvedItem[]>
  readonly resolveProjectItemIdsWithTitles: (
    domIds: string[],
    projectId: string,
  ) => Effect.Effect<ResolvedItemWithTitle[]>
  readonly listIssueRelationshipsSafe: (
    kind: 'blocked_by' | 'blocking',
    owner: string,
    repo: string,
    issueNumber: number,
    tabId?: number,
  ) => Effect.Effect<IssueRelationshipData[]>
  readonly listSubIssuesSafe: (
    owner: string,
    repo: string,
    issueNumber: number,
  ) => Effect.Effect<SubIssueData[]>
  readonly getRepositoryId: (owner: string, name: string) => Effect.Effect<string>
}

export class ProjectService extends Context.Tag('@rgp/ProjectService')<
  ProjectService,
  ProjectServiceShape
>() {}

const wrap = <Args extends readonly unknown[], R>(
  fn: (...args: Args) => Promise<R>,
): ((...args: Args) => Effect.Effect<R>) => {
  return (...args: Args) =>
    Effect.tryPromise({
      try: () => fn(...args),
      catch: (err) => err as unknown,
    }).pipe(Effect.orDie)
}

export const ProjectServiceLive = Layer.succeed(ProjectService, {
  getProjectFieldsData: wrap(getProjectFieldsDataAsync),
  resolveProjectItemIds: wrap(resolveProjectItemIdsAsync),
  resolveProjectItemIdsWithTitles: wrap(resolveProjectItemIdsWithTitlesAsync),
  listIssueRelationshipsSafe: wrap(listIssueRelationshipsSafeAsync),
  listSubIssuesSafe: wrap(listSubIssuesSafeAsync),
  getRepositoryId: wrap(getRepositoryIdAsync),
})
