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
import { processQueue, sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'

import { isBulkFull, acquireBulk, releaseBulk } from '@/background/concurrency'
import { broadcastQueue, withRateLimitRetry } from '@/background/rest-helpers'
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
  const result = await gql<{
    repository: { assignableUsers: { nodes: { id: string; login: string }[] } }
  }>(GET_REPO_ASSIGNEES, { owner, name, q: '' })
  const byLogin = new Map(
    (result.repository?.assignableUsers?.nodes || []).map((u) => [u.login, u.id]),
  )
  return logins.map((login) => byLogin.get(login)).filter((id): id is string => Boolean(id))
}

async function resolveLabelIds(
  owner: string,
  name: string,
  labelNames: string[],
): Promise<string[]> {
  if (labelNames.length === 0) return []
  const result = await gql<{
    repository: { labels: { nodes: { id: string; name: string }[] } }
  }>(GET_REPO_LABELS, { owner, name, q: '' })
  const byName = new Map((result.repository?.labels?.nodes || []).map((l) => [l.name, l.id]))
  return labelNames.map((n) => byName.get(n)).filter((id): id is string => Boolean(id))
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
  const processId = `create-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const totalSteps = 2 + data.updates.length
  const label = `Create issue · ${data.title}`

  await broadcastQueue(
    { total: totalSteps, completed: 0, paused: false, status: 'Creating issue…', processId, label },
    tabId,
  )

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

    await processQueue(
      tasks,
      async (state) => {
        await broadcastQueue(
          {
            total: totalSteps,
            completed: state.completed,
            paused: state.paused,
            retryAfter: state.retryAfter,
            status: state.completed === 0 ? 'Creating issue…' : 'Applying custom fields…',
            detail: state.detail,
            processId,
            label,
            failedItems: state.failedItems,
          },
          tabId,
        )
      },
      processId,
    )

    await broadcastQueue(
      { total: 0, completed: 0, paused: false, status: 'Done!', processId, label },
      tabId,
    )
    logger.log('[rgp:bg] create-issue complete', { processId })
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
