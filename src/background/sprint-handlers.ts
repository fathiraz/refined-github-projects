import { onMessage } from '@/lib/messages'
import type { SprintInfo, SprintProgressData } from '@/lib/messages'
import { gql } from '@/lib/graphql-client'
import { GET_PROJECT_ITEMS_WITH_FIELDS, GET_SPRINT_PROGRESS_ITEMS } from '@/lib/graphql-queries'
import { UPDATE_PROJECT_FIELD } from '@/lib/graphql-mutations'
import { processQueue, sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { allSprintSettingsStorage } from '@/lib/storage'
import { todayUtc, isActive, nearestUpcoming, iterationEndDate } from '@/lib/sprint-utils'
import { logger } from '@/lib/debug-logger'

import { sprintProgressCache, SPRINT_PROGRESS_CACHE_TTL_MS, pruneExpiredCache } from '@/background/cache'

import { isSprintEndFull, acquireSprintEnd, releaseSprintEnd } from '@/background/concurrency'

import { broadcastQueue } from '@/background/rest-helpers'
import { getProjectFieldsData } from '@/background/project-helpers'

export function registerSprintHandlers(): void {
  onMessage('getSprintStatus', async ({ data }) => {
    logger.log('[rgp:bg] getSprintStatus received', data)
    const allSettings = await allSprintSettingsStorage.getValue()
    const settings = allSettings[data.projectId] ?? null

    const { project } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
    const fields = project?.fields.nodes.filter(Boolean) ?? []

    const iterField = fields.find(
      (f) => f.dataType === 'ITERATION' && (!settings || f.id === settings.sprintFieldId),
    )

    if (!iterField?.configuration) {
      return {
        hasSettings: !!settings,
        activeSprint: null,
        nearestUpcoming: null,
        acknowledgedSprint: null,
        iterationFieldId: iterField?.id ?? null,
        settings,
      }
    }

    const allIters = [
      ...(iterField.configuration.iterations ?? []),
      ...(iterField.configuration.completedIterations ?? []),
    ]
    const today = todayUtc()

    const active = allIters.find((i) => isActive(i, today)) ?? null
    const activeSprint: SprintInfo | null = active
      ? { ...active, endDate: iterationEndDate(active) }
      : null

    const upcoming = nearestUpcoming(iterField.configuration.iterations ?? [], today)
    const nearestUpcomingSprint: SprintInfo | null = upcoming
      ? { ...upcoming, endDate: iterationEndDate(upcoming) }
      : null

    // Check acknowledged sprint (if any) — clear stale IDs
    let acknowledgedSprint: SprintInfo | null = null
    if (settings?.acknowledgedSprintId) {
      const ackIter = iterField.configuration.iterations?.find(
        (i) => i.id === settings.acknowledgedSprintId,
      )
      if (ackIter) {
        acknowledgedSprint = { ...ackIter, endDate: iterationEndDate(ackIter) }
      } else {
        // Stale — clear it
        const updated = { ...settings, acknowledgedSprintId: undefined }
        await allSprintSettingsStorage.setValue({ ...allSettings, [data.projectId]: updated })
      }
    }

    return {
      hasSettings: !!settings,
      activeSprint,
      nearestUpcoming: nearestUpcomingSprint,
      acknowledgedSprint,
      iterationFieldId: iterField.id,
      settings,
    }
  })

  onMessage('saveSprintSettings', async ({ data }) => {
    const existing = await allSprintSettingsStorage.getValue()
    await allSprintSettingsStorage.setValue({ ...existing, [data.projectId]: data.settings })
    return { ok: true }
  })

  onMessage('acknowledgeUpcomingSprint', async ({ data }) => {
    const existing = await allSprintSettingsStorage.getValue()
    const current = existing[data.projectId]
    if (!current) return { ok: false }
    await allSprintSettingsStorage.setValue({
      ...existing,
      [data.projectId]: {
        ...current,
        acknowledgedSprintId: data.iterationId,
        sprintSnapshotAt: new Date().toISOString(),
      },
    })
    return { ok: true }
  })

  onMessage('getSprintProgress', async ({ data }) => {
    logger.log('[rgp:bg] getSprintProgress received', data)

    const settingsHash = [
      data.settings.sprintFieldId,
      data.settings.doneFieldId,
      data.settings.doneOptionId,
      data.settings.notStartedOptionId,
      data.settings.pointsFieldId,
      data.settings.sprintSnapshotAt ?? data.sprintStartDate,
    ].join('|')
    const cacheKey = `${data.projectId}/${data.iterationId}/${settingsHash}`
    const cached = sprintProgressCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      logger.log('[rgp:bg] getSprintProgress cache hit', cacheKey)
      return cached.data
    }

    const { project } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
    if (!project) throw new Error('Could not load project fields')
    const realProjectId = project.id

    interface ProgressItemNode {
      id: string
      createdAt: string
      content: {
        title?: string
        assignees?: { nodes: { login: string; avatarUrl: string }[] }
      } | null
      fieldValues: {
        nodes: (
          | { iterationId: string; field: { id: string } | null }
          | { optionId: string; field: { id: string } | null }
          | { text: string; field: { id: string } | null }
          | { number: number; field: { id: string } | null }
        )[]
      }
    }
    interface ProgressItemsResult {
      node: {
        items: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
          nodes: ProgressItemNode[]
        }
      } | null
    }

    const sprintItemsSet = new Set<string>()
    const sprintItems: ProgressItemNode[] = []
    let cursor: string | null = null

    while (true) {
      const page: ProgressItemsResult = await gql<ProgressItemsResult>(GET_SPRINT_PROGRESS_ITEMS, {
        projectId: realProjectId,
        cursor,
      })
      const itemsPage = page.node?.items
      if (!itemsPage) break

      for (const item of itemsPage.nodes) {
        const inSprint = item.fieldValues.nodes
          .filter(Boolean)
          .some(
            (fv: { iterationId?: string; field: { id: string } | null }) =>
              'iterationId' in fv &&
              fv.field?.id === data.settings.sprintFieldId &&
              fv.iterationId === data.iterationId,
          )
        if (inSprint && !sprintItemsSet.has(item.id)) {
          sprintItemsSet.add(item.id)
          sprintItems.push(item)
        }
      }

      if (!itemsPage.pageInfo.hasNextPage) break
      cursor = itemsPage.pageInfo.endCursor
    }

    const hasPointsField = !!data.settings.pointsFieldId
    const pointsFieldId = data.settings.pointsFieldId ?? ''

    type ProgressFv = {
      iterationId?: string
      optionId?: string
      text?: string
      number?: number
      field: { id: string } | null
    }

    const getPoints = (item: ProgressItemNode): number => {
      if (!hasPointsField) return 0
      const fv = item.fieldValues.nodes
        .filter(Boolean)
        .find((f: { field: { id: string } | null }) => f.field?.id === pointsFieldId) as
        | ProgressFv
        | undefined
      return fv && 'number' in fv && typeof fv.number === 'number' ? fv.number : 0
    }

    const isItemDone = (item: ProgressItemNode): boolean => {
      const fvNodes = item.fieldValues.nodes.filter(Boolean) as ProgressFv[]
      const doneFieldValue = fvNodes.find((fv) => fv.field?.id === data.settings.doneFieldId)
      if (!doneFieldValue) return false
      if (data.settings.doneFieldType === 'SINGLE_SELECT' && 'optionId' in doneFieldValue) {
        // If a "not started" option is configured, everything except that option counts as done
        if (data.settings.notStartedOptionId) {
          return doneFieldValue.optionId !== data.settings.notStartedOptionId
        }
        return doneFieldValue.optionId === data.settings.doneOptionId
      }
      if (data.settings.doneFieldType === 'TEXT' && 'text' in doneFieldValue) {
        return doneFieldValue.text === data.settings.doneOptionName
      }
      return false
    }

    let totalIssues = 0
    let doneIssues = 0
    let totalPoints = 0
    let donePoints = 0
    let scopeAddedIssues = 0
    let scopeAddedPoints = 0
    const recentlyAdded: SprintProgressData['recentlyAdded'] = []

    const snapshotCutoff = data.settings.sprintSnapshotAt ?? data.sprintStartDate

    for (const item of sprintItems) {
      const points = getPoints(item)
      const done = isItemDone(item)
      const addedAfterStart = item.createdAt > snapshotCutoff

      totalIssues++
      totalPoints += points
      if (done) {
        doneIssues++
        donePoints += points
      }
      if (addedAfterStart) {
        scopeAddedIssues++
        scopeAddedPoints += points
        recentlyAdded.push({
          id: item.id,
          title: item.content?.title ?? '(no title)',
          points,
          assignees: item.content?.assignees?.nodes ?? [],
        })
      }
    }

    // Show most recently added first (reverse chronological via createdAt, approximate via array order)
    recentlyAdded.reverse()

    const result: SprintProgressData = {
      totalIssues,
      doneIssues,
      totalPoints,
      donePoints,
      hasPointsField,
      pointsFieldName: data.settings.pointsFieldName ?? '',
      scopeAddedIssues,
      scopeAddedPoints,
      recentlyAdded,
    }

    pruneExpiredCache(sprintProgressCache)
    sprintProgressCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + SPRINT_PROGRESS_CACHE_TTL_MS,
    })

    return result
  })

  onMessage('endSprint', async ({ data, sender }) => {
    logger.log('[rgp:bg] endSprint received', data)

    if (isSprintEndFull()) {
      console.warn('[rgp:bg] max concurrent sprint end reached, rejecting')
      return { error: 'Another sprint end is already in progress. Please wait and try again.' }
    }

    acquireSprintEnd()
    const processId = `sprint-end-${Date.now()}`
    const label = 'End Sprint'
    const tabId = sender.tab?.id

    try {
      await broadcastQueue(
        {
          total: 0,
          completed: 0,
          paused: false,
          status: 'Fetching sprint items...',
          processId,
          label,
        },
        tabId,
      )

      // Resolve real GraphQL node ID (data.projectId is a URL slug, not a node ID)
      const { project: sprintProject } = await getProjectFieldsData(
        data.owner,
        data.number,
        data.isOrg,
      )
      if (!sprintProject) throw new Error('Could not load project fields')
      const realProjectId = sprintProject.id

      // Paginate all project items matching the active sprint
      interface SprintItemNode {
        id: string
        fieldValues: {
          nodes: (
            | { iterationId: string; field: { id: string } }
            | { optionId: string; field: { id: string } }
            | { text: string; field: { id: string } }
          )[]
        }
      }
      interface SprintItemsResult {
        node: {
          items: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null }
            nodes: SprintItemNode[]
          }
        } | null
      }

      const endSprintItemsSet = new Set<string>()
      const sprintItems: SprintItemNode[] = []
      let cursor: string | null = null

      while (true) {
        const page: SprintItemsResult = await gql<SprintItemsResult>(
          GET_PROJECT_ITEMS_WITH_FIELDS,
          {
            projectId: realProjectId,
            cursor,
          },
        )

        const itemsPage = page.node?.items
        if (!itemsPage) break

        for (const item of itemsPage.nodes) {
          // Check if this item is in the active sprint
          const inSprint = item.fieldValues.nodes
            .filter(Boolean)
            .some(
              (fv: {
                iterationId?: string
                optionId?: string
                text?: string
                field: { id: string } | null
              }) =>
                'iterationId' in fv &&
                fv.field?.id === data.sprintFieldId &&
                fv.iterationId === data.activeIterationId,
            )
          if (inSprint && !endSprintItemsSet.has(item.id)) {
            endSprintItemsSet.add(item.id)
            sprintItems.push(item)
          }
        }

        if (!itemsPage.pageInfo.hasNextPage) break
        cursor = itemsPage.pageInfo.endCursor
        await sleep(1000)
      }

      // Classify done vs not-done
      const excludeConditions = data.excludeConditions ?? []
      const notDoneItems = sprintItems.filter((item) => {
        // Check done field
        type SprintFv = {
          iterationId?: string
          optionId?: string
          text?: string
          field: { id: string } | null
        }
        const fvNodes = item.fieldValues.nodes.filter(Boolean) as SprintFv[]
        const doneFieldValue = fvNodes.find((fv) => fv.field?.id === data.doneFieldId)
        if (!doneFieldValue) return true // no done-field value → not done

        if (data.doneFieldType === 'SINGLE_SELECT' && 'optionId' in doneFieldValue) {
          if (data.notStartedOptionId) {
            if (doneFieldValue.optionId !== data.notStartedOptionId) return false
          } else if (doneFieldValue.optionId === data.doneOptionId) return false
        } else if (data.doneFieldType === 'TEXT' && 'text' in doneFieldValue) {
          if (doneFieldValue.text === data.doneOptionValue) return false
        } else {
          return true
        }

        // Exclude conditions — item stays in current sprint if it matches any
        for (const cond of excludeConditions) {
          const fv = fvNodes.find((f) => f.field?.id === cond.fieldId)
          if (!fv) continue
          if (
            cond.fieldType === 'SINGLE_SELECT' &&
            'optionId' in fv &&
            fv.optionId === cond.optionId
          )
            return false
          if (cond.fieldType === 'TEXT' && 'text' in fv && fv.text === cond.optionName) return false
        }

        return true
      })

      if (notDoneItems.length === 0) {
        await broadcastQueue(
          {
            total: 0,
            completed: 0,
            paused: false,
            status: 'Done! All items are finished.',
            processId,
            label,
          },
          tabId,
        )
        return
      }

      const tasks: QueueTask[] = notDoneItems.map((item) => ({
        id: `sprint-move-${item.id}`,
        run: async () => {
          await gql(UPDATE_PROJECT_FIELD, {
            projectId: realProjectId,
            itemId: item.id,
            fieldId: data.sprintFieldId,
            value: { iterationId: data.nextIterationId },
          })
          await sleep(1000)
        },
      }))

      await broadcastQueue(
        {
          total: tasks.length,
          completed: 0,
          paused: false,
          status: `Moving ${tasks.length} item${tasks.length !== 1 ? 's' : ''} to next sprint...`,
          processId,
          label,
        },
        tabId,
      )

      await processQueue(
        tasks,
        async (state) => {
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status: `Moving ${state.completed + 1} of ${tasks.length}...`,
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
    } finally {
      releaseSprintEnd()
    }
  })
}
