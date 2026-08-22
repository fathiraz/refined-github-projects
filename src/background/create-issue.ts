// ─── Create-issue handler ─────────────────────────────────────────────────────
// RGP owns the native "Create issue" flow: create → attach to project → apply
// staged custom fields, reading ids straight from the API responses (no DOM
// diffing, no network capture). Trimmed clone of duplicate-handlers.ts's
// create→attach→set-fields task sequence.

import { onMessage } from '@/lib/messages'
import type { CreateIssueWithFieldsMessageData } from '@/lib/messages'
import { gql } from '@/lib/graphql-client'
import { CLONE_ISSUE, ATTACH_TO_PROJECT, UPDATE_PROJECT_FIELD } from '@/lib/graphql-mutations'
import { GET_REPO_ASSIGNEES, GET_REPO_LABELS } from '@/lib/graphql-queries'
import { sleep } from '@/lib/queue'
import { newProcessId } from '@/lib/format'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'

import { isBulkFull, acquireBulk, releaseBulk } from '@/background/concurrency'
import { withRateLimitRetry } from '@/background/rest-helpers'
import { broadcastDone, broadcastStatus, runQueueWithProgress } from '@/background/queue-run'
import { getRepositoryId } from '@/background/project-helpers'

// Resolves the dialog's assignee logins / label names to node ids before
// create. Best-effort: names that don't resolve are dropped rather than
// failing the create.
async function resolveAssigneeIds(
  owner: string,
  name: string,
  logins: string[],
): Promise<string[]> {
  if (logins.length === 0) return []
  // Query per login with the login itself as the search filter — an unfiltered
  // (q: '') query only returns the repo's first 20 assignable users, silently
  // dropping any selected login that doesn't sort into that page.
  const results = await Promise.all(
    logins.map((login) =>
      gql<{
        repository: { assignableUsers: { nodes: { id: string; login: string }[] } }
      }>(GET_REPO_ASSIGNEES, { owner, name, q: login }),
    ),
  )
  return results
    .map(
      (result, i) =>
        result.repository?.assignableUsers?.nodes?.find((u) => u.login === logins[i])?.id,
    )
    .filter((id): id is string => Boolean(id))
}

async function resolveLabelIds(
  owner: string,
  name: string,
  labelNames: string[],
): Promise<string[]> {
  if (labelNames.length === 0) return []
  // Same fix as resolveAssigneeIds: query per label name so selections beyond
  // the first 20 unfiltered results aren't silently dropped.
  const results = await Promise.all(
    labelNames.map((labelName) =>
      gql<{
        repository: { labels: { nodes: { id: string; name: string }[] } }
      }>(GET_REPO_LABELS, { owner, name, q: labelName }),
    ),
  )
  return results
    .map((result, i) => result.repository?.labels?.nodes?.find((l) => l.name === labelNames[i])?.id)
    .filter((id): id is string => Boolean(id))
}

function toFieldValue(value: unknown): Record<string, unknown> {
  const { singleSelectOptionId, iterationId, text, date, number: num } = value as any
  if (singleSelectOptionId) return { singleSelectOptionId }
  if (iterationId) return { iterationId }
  if (date !== undefined) return { date }
  if (num !== undefined && num !== null) return { number: num }
  return { text }
}

async function runCreateIssue(data: CreateIssueWithFieldsMessageData, tabId?: number) {
  if (isBulkFull()) {
    logger.warn('[rgp:bg] max concurrent bulk operations reached, rejecting create-issue')
    return
  }

  acquireBulk()
  const run = {
    processId: newProcessId('create'),
    label: `Create issue · ${data.title}`,
    tabId,
  }
  const totalSteps = 2 + data.updates.length

  await broadcastStatus(run, totalSteps, 'Creating issue…')

  try {
    let newIssueId = ''
    let newItemId = ''

    const tasks: QueueTask[] = [
      {
        id: 'create-issue',
        detail: data.title,
        run: async () => {
          const repositoryId = await getRepositoryId(data.repoOwner, data.repoName)
          const [assigneeIds, labelIds] = await Promise.all([
            resolveAssigneeIds(data.repoOwner, data.repoName, data.assignees ?? []),
            resolveLabelIds(data.repoOwner, data.repoName, data.labels ?? []),
          ])
          logger.log('[rgp:bg] creating issue', { repositoryId, title: data.title })
          interface CreateResult {
            createIssue: { issue: { id: string; databaseId: number; number: number } }
          }
          // Deliberately NOT wrapped in withRateLimitRetry — a blind retry of a
          // create mutation risks creating a duplicate issue.
          const result = await gql<CreateResult>(CLONE_ISSUE, {
            repositoryId,
            title: data.title,
            body: data.body,
            assigneeIds,
            labelIds,
          })
          newIssueId = result.createIssue.issue.id
          await sleep(1000)
        },
      },
      {
        id: 'attach-project',
        detail: data.repoName,
        run: async () => {
          logger.log('[rgp:bg] attaching to project', { newIssueId, projectId: data.projectId })
          interface AttachResult {
            addProjectV2ItemById: { item: { id: string } }
          }
          const result = await withRateLimitRetry(
            () =>
              gql<AttachResult>(ATTACH_TO_PROJECT, {
                projectId: data.projectId,
                contentId: newIssueId,
              }),
            tabId,
          )
          newItemId = result.addProjectV2ItemById.item.id
          await sleep(1000)
        },
      },
      ...data.updates.map((update) => ({
        id: `field-${update.fieldId}`,
        detail: data.fieldMeta?.[update.fieldId]?.name ?? update.fieldId,
        run: async () => {
          await withRateLimitRetry(
            () =>
              gql(UPDATE_PROJECT_FIELD, {
                projectId: data.projectId,
                itemId: newItemId,
                fieldId: update.fieldId,
                value: toFieldValue(update.value),
              }),
            tabId,
          )
          await sleep(1000)
        },
      })),
    ]

    await runQueueWithProgress(tasks, run, (state) => ({
      total: totalSteps,
      status: state.completed === 0 ? 'Creating issue…' : 'Applying custom fields…',
    }))

    await broadcastDone(run)
    logger.log('[rgp:bg] create-issue complete', { processId: run.processId })
  } finally {
    releaseBulk()
  }
}

export function registerCreateIssueHandler(): void {
  onMessage('createIssueWithFields', ({ data, sender }) => {
    logger.log('[rgp:bg] createIssueWithFields received', {
      title: data.title,
      projectId: data.projectId,
    })
    const tabId = sender.tab?.id
    if (isBulkFull()) {
      return { ok: false, reason: 'concurrent' as const }
    }
    void runCreateIssue(data, tabId)
    return { ok: true as const }
  })
}
