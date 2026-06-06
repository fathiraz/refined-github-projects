import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Box, Flash, Radio, RadioGroup, SegmentedControl, Text } from '@primer/react'
import { IssueRelationshipSelectPanel } from '@/ui/issue-relationship-select-panel'
import type { IssueRelationshipItem } from '@/ui/issue-relationship-select-panel'
import {
  buildRelationshipsPayload,
  type ListOperation,
  type ParentOperation,
} from '@/features/bulk-actions-utils'
import type { RelationshipKey } from '@/features/bulk-edit-utils'
import { sendMessage } from '@/lib/messages'
import { queueStore } from '@/lib/queue-store'
import {
  BULK_EDIT_CONCURRENT_MESSAGE,
  BULK_EDIT_DISPATCH_FAILED_MESSAGE,
} from '@/features/bulk-edit-flyout-helpers'

export type { ParentOperation, ListOperation } from '@/features/bulk-actions-utils'
export { buildRelationshipsPayload } from '@/features/bulk-actions-utils'

export interface BulkEditRelationshipPaneProps {
  relationshipKey: RelationshipKey
  itemIds: readonly string[]
  projectId: string
  owner: string
  repoName?: string
  onCanApplyChange: (canApply: boolean) => void
}

export interface BulkEditRelationshipPaneHandle {
  apply: () => Promise<{ ok: true } | { ok: false; message: string }>
}

function operationReady(
  key: RelationshipKey,
  parentOp: ParentOperation,
  parentTarget: IssueRelationshipItem | null,
  listOp: ListOperation,
  listTargets: IssueRelationshipItem[],
): boolean {
  if (key === 'parent') {
    return parentOp === 'clear' || parentTarget !== null
  }
  if (listOp === 'clear') return true
  return listTargets.length > 0
}

export const BulkEditRelationshipPane = forwardRef<
  BulkEditRelationshipPaneHandle,
  BulkEditRelationshipPaneProps
>(function BulkEditRelationshipPane(
  { relationshipKey, itemIds, projectId, owner, repoName, onCanApplyChange },
  ref,
) {
  const [parentOp, setParentOp] = useState<ParentOperation>('set')
  const [parentTarget, setParentTarget] = useState<IssueRelationshipItem[]>([])
  const [listOp, setListOp] = useState<ListOperation>('add')
  const [listTargets, setListTargets] = useState<IssueRelationshipItem[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [prSkipCount, setPrSkipCount] = useState(0)
  const [validating, setValidating] = useState(false)
  const latestPreflightReq = useRef(0)

  const relationships = useMemo(
    () =>
      buildRelationshipsPayload(
        relationshipKey,
        parentOp,
        parentTarget[0] ?? null,
        listOp,
        listTargets,
      ),
    [relationshipKey, parentOp, parentTarget, listOp, listTargets],
  )

  const ready = operationReady(
    relationshipKey,
    parentOp,
    parentTarget[0] ?? null,
    listOp,
    listTargets,
  )

  useEffect(() => {
    onCanApplyChange(ready && validationErrors.length === 0 && !validating)
  }, [ready, validationErrors.length, validating, onCanApplyChange])

  const runPreflight = useCallback(async () => {
    const reqId = ++latestPreflightReq.current

    if (!ready) {
      if (reqId !== latestPreflightReq.current) return
      setValidationErrors([])
      setPrSkipCount(0)
      return
    }

    setValidating(true)
    try {
      const [validation, titles] = await Promise.all([
        sendMessage('validateBulkRelationshipUpdates', {
          itemIds: [...itemIds],
          projectId,
          relationships,
        }),
        sendMessage('getItemTitles', { itemIds: [...itemIds], projectId }),
      ])
      if (reqId !== latestPreflightReq.current) return
      setValidationErrors(validation.errors)
      setPrSkipCount(titles.filter((t) => t.typename === 'PullRequest').length)
    } catch {
      if (reqId !== latestPreflightReq.current) return
      setValidationErrors(['Could not validate relationship changes. Try again.'])
      setPrSkipCount(0)
    } finally {
      if (reqId === latestPreflightReq.current) setValidating(false)
    }
  }, [ready, itemIds, projectId, relationships])

  useEffect(() => {
    const timer = setTimeout(() => {
      void runPreflight()
    }, 300)
    return () => clearTimeout(timer)
  }, [runPreflight])

  useImperativeHandle(ref, () => ({
    async apply() {
      if (!ready) {
        return { ok: false as const, message: BULK_EDIT_DISPATCH_FAILED_MESSAGE }
      }

      if (queueStore.getActiveCount() >= 3) {
        return { ok: false as const, message: BULK_EDIT_CONCURRENT_MESSAGE }
      }

      let validation: { errors: string[] }
      try {
        validation = await sendMessage('validateBulkRelationshipUpdates', {
          itemIds: [...itemIds],
          projectId,
          relationships,
        })
      } catch {
        return { ok: false as const, message: BULK_EDIT_DISPATCH_FAILED_MESSAGE }
      }
      if (validation.errors.length > 0) {
        setValidationErrors(validation.errors)
        return {
          ok: false as const,
          message: validation.errors[0] ?? BULK_EDIT_DISPATCH_FAILED_MESSAGE,
        }
      }

      try {
        const result = await sendMessage('bulkUpdate', {
          itemIds: [...itemIds],
          projectId,
          updates: [],
          relationships,
        })
        if (!result.ok) {
          return {
            ok: false as const,
            message:
              result.reason === 'concurrent'
                ? BULK_EDIT_CONCURRENT_MESSAGE
                : BULK_EDIT_DISPATCH_FAILED_MESSAGE,
          }
        }
        return { ok: true as const }
      } catch {
        return { ok: false as const, message: BULK_EDIT_DISPATCH_FAILED_MESSAGE }
      }
    },
  }))

  const label =
    relationshipKey === 'parent'
      ? 'Parent'
      : relationshipKey === 'blockedBy'
        ? 'Blocked by'
        : 'Blocking'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {validationErrors.length > 0 && (
        <Flash variant="danger" data-testid="rgp-edit-relationship-validation">
          {validationErrors.map((err) => (
            <Text key={err} sx={{ fontSize: 0 }}>
              {err}
            </Text>
          ))}
        </Flash>
      )}
      {prSkipCount > 0 && validationErrors.length === 0 && (
        <Flash variant="warning" data-testid="rgp-edit-relationship-pr-skip">
          {prSkipCount} pull request{prSkipCount === 1 ? '' : 's'} will be skipped — relationships
          apply to issues only.
        </Flash>
      )}

      {relationshipKey === 'parent' ? (
        <>
          <RadioGroup name="rgp-rel-parent-op">
            <RadioGroup.Label sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
              Operation
            </RadioGroup.Label>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Radio
                  name="rgp-rel-parent-op"
                  value="set"
                  checked={parentOp === 'set'}
                  onChange={() => setParentOp('set')}
                />
                <Text sx={{ fontSize: 1 }}>Set to…</Text>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Radio
                  name="rgp-rel-parent-op"
                  value="clear"
                  checked={parentOp === 'clear'}
                  onChange={() => setParentOp('clear')}
                />
                <Text sx={{ fontSize: 1 }}>Clear parent</Text>
              </Box>
            </Box>
          </RadioGroup>
          {parentOp === 'set' && (
            <IssueRelationshipSelectPanel
              owner={owner}
              repoName={repoName}
              value={parentTarget}
              onChange={setParentTarget}
              singleSelect
              title="Parent issue"
              placeholderText="Search parent issue"
              inputLabel="Search parent issue"
            />
          )}
        </>
      ) : (
        <>
          <Text sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>Operation</Text>
          <SegmentedControl
            aria-label={`${label} operation`}
            onChange={(index) => {
              const ops: ListOperation[] = ['add', 'remove', 'clear']
              setListOp(ops[index] ?? 'add')
            }}
          >
            <SegmentedControl.Button selected={listOp === 'add'}>Add</SegmentedControl.Button>
            <SegmentedControl.Button selected={listOp === 'remove'}>Remove</SegmentedControl.Button>
            <SegmentedControl.Button selected={listOp === 'clear'}>
              Clear all
            </SegmentedControl.Button>
          </SegmentedControl>
          {(listOp === 'add' || listOp === 'remove') && (
            <IssueRelationshipSelectPanel
              owner={owner}
              repoName={repoName}
              value={listTargets}
              onChange={setListTargets}
              title={`${listOp === 'add' ? 'Add' : 'Remove'} ${label.toLowerCase()}`}
              placeholderText={`Search issues to ${listOp}`}
              inputLabel={`Search issues to ${listOp}`}
            />
          )}
        </>
      )}
    </Box>
  )
})
