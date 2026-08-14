// bulkUpdate handler — applies field/title/body/comment/relationship updates.

import { onMessage } from '@/lib/messages'
import type { BulkUpdateDispatchResult, BulkUpdateMessageData } from '@/lib/messages'
import { gql } from '@/lib/graphql-client'
import {
  ADD_ASSIGNEES,
  ADD_LABELS,
  UPDATE_ISSUE_MILESTONE,
  UPDATE_ISSUE_TYPE,
  UPDATE_ISSUE_TITLE,
  UPDATE_PR_TITLE,
  UPDATE_ISSUE_BODY,
  UPDATE_PR_BODY,
  ADD_COMMENT,
  UPDATE_PROJECT_FIELD,
} from '@/lib/graphql-mutations'
import { processQueue, sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'

import { isBulkFull, acquireBulk, releaseBulk } from '@/background/concurrency'
import { takeCachedResolvedItems } from '@/background/cache'
import { broadcastQueue } from '@/background/rest-helpers'
import { buildBulkRelationshipTasks } from '@/background/relationship-helpers'
import { resolveProjectItemIds } from '@/background/project-helpers'
import type { ResolvedItem } from '@/background/types'
import { newProcessId, plural } from '@/lib/format'

function formatDetailDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

/**
 * What the content script actually puts in `update.value`, which the message
 * contract types as `unknown`. Declared once so this file narrows at a single
 * documented boundary instead of casting in every branch.
 */
interface BulkFieldValue {
  dataType?: string
  text?: string
  date?: string
  number?: number
  singleSelectOptionId?: string
  iterationId?: string
  array?: { id: string; login?: string; name?: string; title?: string }[]
}

type FieldMeta = NonNullable<BulkUpdateMessageData['fieldMeta']>[string]

interface UpdateContext {
  value: BulkFieldValue
  fieldId: string
  fieldLabel: string
  meta: FieldMeta | undefined
  item: ResolvedItem
  projectId: string
}

interface UpdateKind {
  /** The line shown under the progress bar while this update runs. */
  detail: (ctx: UpdateContext) => string
  /** Omit to fall through to the project-custom-field mutation. */
  run?: (ctx: UpdateContext) => Promise<void>
}

/** Set a project custom field — the fallback for every dataType without a `run`. */
async function setProjectField({ value, fieldId, item, projectId }: UpdateContext): Promise<void> {
  let valueOpt: Record<string, unknown> = {}
  if (value.singleSelectOptionId) valueOpt = { singleSelectOptionId: value.singleSelectOptionId }
  else if (value.iterationId) valueOpt = { iterationId: value.iterationId }
  else if (value.date !== undefined) valueOpt = { date: value.date }
  else if (value.number !== undefined && value.number !== null) valueOpt = { number: value.number }
  else if (value.text !== undefined) valueOpt = { text: value.text }

  await gql(UPDATE_PROJECT_FIELD, {
    projectId,
    itemId: item.projectItemId,
    fieldId,
    value: valueOpt,
  })
}

/**
 * One row per dataType, replacing the two parallel nine-way switches this
 * handler used to carry — one to build the progress detail, one to build the
 * mutation. Keeping them together is what stops the two drifting apart.
 */
const UPDATE_KINDS: Record<string, UpdateKind> = {
  ASSIGNEES: {
    detail: ({ value }) => {
      const logins = (value.array ?? []).map((a) => a.login).filter(Boolean)
      return logins.length > 0
        ? `Adding assignees: ${logins.map((l) => '@' + l).join(', ')}`
        : 'Adding assignees'
    },
    run: async ({ value, item }) => {
      if (!value.array?.length) return
      const assigneeIds = value.array.map((a) => a.id)
      logger.log('[rgp:bg] Adding assignees:', assigneeIds, 'to issue:', item.issueNodeId)
      await gql(ADD_ASSIGNEES, { assignableId: item.issueNodeId, assigneeIds })
      await sleep(1000)
    },
  },

  LABELS: {
    detail: ({ value }) => {
      const names = (value.array ?? []).map((l) => l.name).filter(Boolean)
      return names.length > 0 ? `Adding labels: ${names.join(', ')}` : 'Adding labels'
    },
    run: async ({ value, item }) => {
      if (!value.array?.length) return
      const labelIds = value.array.map((l) => l.id)
      logger.log('[rgp:bg] Adding labels:', labelIds, 'to issue:', item.issueNodeId)
      await gql(ADD_LABELS, { labelableId: item.issueNodeId, labelIds })
      await sleep(1000)
    },
  },

  MILESTONE: {
    detail: ({ value }) => {
      // milestones arrive under `title` from search and `name` from the picker
      const name = value.array?.[0]?.title ?? value.array?.[0]?.name ?? ''
      return name ? `Setting milestone → ${name}` : 'Setting milestone'
    },
    run: async ({ value, item }) => {
      if (!value.array?.length) return
      const milestoneId = value.array[0].id
      logger.log('[rgp:bg] Setting milestone:', milestoneId, 'on issue:', item.issueNodeId)
      await gql(UPDATE_ISSUE_MILESTONE, { issueId: item.issueNodeId, milestoneId })
      await sleep(1000)
    },
  },

  ISSUE_TYPE: {
    detail: ({ value }) => {
      const name = value.array?.[0]?.name ?? ''
      return name ? `Setting issue type → ${name}` : 'Setting issue type'
    },
    run: async ({ value, item }) => {
      if (!value.array?.length) return
      const issueTypeId = value.array[0].id
      logger.log('[rgp:bg] Setting issue type:', issueTypeId, 'on issue:', item.issueNodeId)
      await gql(UPDATE_ISSUE_TYPE, { issueId: item.issueNodeId, issueTypeId })
      await sleep(1000)
    },
  },

  TITLE: {
    detail: ({ value }) => {
      const trimmed = value.text?.trim() ?? ''
      return trimmed ? `Changing title → "${truncate(trimmed, 40)}"` : 'Updating title'
    },
    run: async ({ value, item }) => {
      const title = value.text?.trim()
      if (!title) return
      if (item.typename === 'PullRequest') {
        await gql(UPDATE_PR_TITLE, { prId: item.issueNodeId, title })
      } else {
        await gql(UPDATE_ISSUE_TITLE, { issueId: item.issueNodeId, title })
      }
      await sleep(1000)
    },
  },

  BODY: {
    detail: () => 'Updating body',
    run: async ({ value, item }) => {
      const body = value.text
      if (body === undefined) return
      if (item.typename === 'PullRequest') {
        await gql(UPDATE_PR_BODY, { prId: item.issueNodeId, body })
      } else {
        await gql(UPDATE_ISSUE_BODY, { issueId: item.issueNodeId, body })
      }
      await sleep(1000)
    },
  },

  COMMENT: {
    detail: () => 'Adding comment',
    run: async ({ value, item }) => {
      const body = value.text?.trim()
      if (!body) return
      await gql(ADD_COMMENT, { subjectId: item.issueNodeId, body })
      await sleep(1000)
    },
  },

  // The next two set a project custom field like any other, but name their
  // chosen option in the progress detail, so they override `detail` only.
  SINGLE_SELECT: {
    detail: ({ value, meta, fieldLabel }) => {
      const name = meta?.options?.find((o) => o.id === value.singleSelectOptionId)?.name
      return name ? `${fieldLabel} → ${name}` : `${fieldLabel} → (option)`
    },
  },

  ITERATION: {
    detail: ({ value, meta, fieldLabel }) => {
      const title = meta?.iterations?.find((i) => i.id === value.iterationId)?.title
      return title ? `${fieldLabel} → ${title}` : `${fieldLabel} → (iteration)`
    },
  },
}

/** Text, number and date custom fields, which carry no dataType-specific row. */
const DEFAULT_KIND: UpdateKind = {
  detail: ({ value, fieldLabel }) => {
    if (value.text !== undefined) return `${fieldLabel} → "${truncate(value.text, 30)}"`
    if (value.number !== undefined && value.number !== null)
      return `${fieldLabel} → ${value.number}`
    if (value.date !== undefined) return `${fieldLabel} → ${formatDetailDate(value.date)}`
    return `Updating ${fieldLabel}`
  },
}

function buildFieldTask(ctx: UpdateContext, domId: string): QueueTask {
  const kind = UPDATE_KINDS[ctx.value.dataType ?? ''] ?? DEFAULT_KIND
  return {
    id: `bulk-${domId}-${ctx.fieldId}`,
    detail: kind.detail(ctx),
    run: () => (kind.run ?? setProjectField)(ctx),
  }
}

async function runBulkUpdate(
  data: BulkUpdateMessageData,
  tabId: number | undefined,
): Promise<void> {
  const processId = newProcessId('bulk')
  const label = `Bulk update · ${plural(data.itemIds.length, 'item')}`

  try {
    await broadcastQueue(
      {
        total: data.itemIds.length,
        completed: 0,
        paused: false,
        status: 'Resolving items...',
        processId,
        label,
      },
      tabId,
    )
    const cachedResolvedItems = data.relationships
      ? takeCachedResolvedItems(data.projectId, data.itemIds)
      : undefined
    let resolvedItems =
      cachedResolvedItems ?? (await resolveProjectItemIds(data.itemIds, data.projectId, tabId))

    // ponytail: a just-created issue's project item lands in the project's `items`
    // connection asynchronously (~100ms after the board row renders), so the first
    // resolve can come back empty/partial. Re-run the same idempotent read until it
    // appears. Reads only → anti-abuse safe. Attempt ceiling is the tuning knob.
    if (!cachedResolvedItems && resolvedItems.length < data.itemIds.length) {
      const MAX_RESOLVE_ATTEMPTS = 6 // 1.5s backoff ⇒ ≈9s ceiling; bump if QA still races
      for (let attempt = 1; attempt <= MAX_RESOLVE_ATTEMPTS; attempt++) {
        await sleep(1500)
        try {
          resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)
        } catch (err) {
          logger.warn('[rgp:bg] resolution retry threw, will retry', { attempt, err })
        }
        if (resolvedItems.length >= data.itemIds.length) break
      }
    }
    logger.log('[rgp:bg] resolved item IDs', resolvedItems)

    if (resolvedItems.length === 0) {
      console.error('[rgp:bg] no valid ProjectV2Item IDs resolved, aborting')
      return
    }

    const tasks: QueueTask[] = []

    for (const item of resolvedItems) {
      for (const update of data.updates) {
        const meta = data.fieldMeta?.[update.fieldId]
        tasks.push(
          buildFieldTask(
            {
              value: update.value as BulkFieldValue,
              fieldId: update.fieldId,
              fieldLabel: meta?.name ?? 'Field',
              meta,
              item,
              projectId: data.projectId,
            },
            item.domId,
          ),
        )
      }

      if (data.relationships) {
        tasks.push(...buildBulkRelationshipTasks(item, data.relationships, tabId))
      }
    }

    await processQueue(
      tasks,
      async (state) => {
        logger.log('[rgp:bg] queue state broadcast', {
          completed: state.completed,
          total: state.total,
          processId,
        })
        await broadcastQueue(
          {
            total: state.total,
            completed: state.completed,
            paused: state.paused,
            retryAfter: state.retryAfter,
            status: `Updating ${plural(resolvedItems.length, 'item')}...`,
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
  } catch (error) {
    console.error('[rgp:bg] bulkUpdate failed', error)
    await broadcastQueue(
      { total: 0, completed: 0, paused: false, status: 'Done!', processId, label },
      tabId,
    )
  }
}

export function registerBulkUpdateHandler(): void {
  onMessage('bulkUpdate', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkUpdate received', {
      itemCount: data.itemIds.length,
      updatesCount: data.updates.length,
      projectId: data.projectId,
    })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk updates reached, rejecting')
      return { ok: false, reason: 'concurrent' } satisfies BulkUpdateDispatchResult
    }

    acquireBulk()
    const tabId = sender.tab?.id
    void runBulkUpdate(data, tabId).finally(() => releaseBulk())
    return { ok: true }
  })
}
