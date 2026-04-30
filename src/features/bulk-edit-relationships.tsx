// relationship sub-editors used in the bulk-edit wizard's values step.

import React from 'react'
import { Box, Button, Checkbox, FormControl, Text } from '@primer/react'
import { IssueRelationshipSelectPanel } from '@/ui/issue-relationship-select-panel'
import { XIcon } from '@/ui/icons'
import type { BulkEditRelationshipsUpdate, IssueRelationshipData } from '@/lib/messages'
import { formatIssueReference, relationshipKey as issueKey } from '@/lib/relationship-utils'
import { issueTitle, type RelationshipSelectionState } from '@/features/bulk-edit-utils'

export function RelationshipIssueList({
  items,
  onRemove,
}: {
  items: IssueRelationshipData[]
  onRemove: (issue: IssueRelationshipData) => void
}) {
  if (items.length === 0) return null

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {items.map((issue, index) => (
        <Box
          key={issueKey(issue)}
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 2,
            px: 3,
            py: 2,
            borderTop: index === 0 ? 'none' : '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Text sx={{ display: 'block', fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>
              {issueTitle(issue)}
            </Text>
            <Text sx={{ display: 'block', fontSize: 0, color: 'fg.muted', mt: 1 }}>
              {formatIssueReference(issue)}
            </Text>
          </Box>
          <Button
            variant="invisible"
            size="small"
            aria-label={`Remove ${formatIssueReference(issue)}`}
            onClick={() => onRemove(issue)}
            sx={{ boxShadow: 'none', color: 'fg.muted' }}
          >
            <XIcon size={14} />
          </Button>
        </Box>
      ))}
    </Box>
  )
}

export function ParentRelationshipEditor({
  owner,
  repoName,
  value,
  onChange,
}: {
  owner: string
  repoName?: string
  value: BulkEditRelationshipsUpdate['parent']
  onChange: (nextValue: BulkEditRelationshipsUpdate['parent']) => void
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>Parent issue</Text>
      <IssueRelationshipSelectPanel
        owner={owner}
        repoName={repoName}
        value={value.set ? [value.set] : []}
        onChange={(selected) => onChange({ set: selected[0], clear: false })}
        singleSelect
        title="Select parent issue"
        subtitle="Choose the issue that should become the parent for each selected issue."
        placeholder="Search for a parent issue"
        placeholderText="Search for a parent issue"
        inputLabel="Parent issue"
        anchorAriaLabel="Select parent issue"
      />
      {value.set && (
        <RelationshipIssueList
          items={[value.set]}
          onRemove={() => onChange({ set: undefined, clear: false })}
        />
      )}
      <FormControl sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Checkbox
          checked={value.clear}
          onChange={(event) =>
            onChange({
              set: event.target.checked ? undefined : value.set,
              clear: event.target.checked,
            })
          }
        />
        <FormControl.Label sx={{ m: 0, fontWeight: 400 }}>
          Clear existing parent relationship
        </FormControl.Label>
      </FormControl>
    </Box>
  )
}

export function RelationshipCategoryEditor({
  label,
  owner,
  repoName,
  value,
  onChange,
}: {
  label: 'Blocked by' | 'Blocking'
  owner: string
  repoName?: string
  value: BulkEditRelationshipsUpdate['blockedBy']
  onChange: (nextValue: BulkEditRelationshipsUpdate['blockedBy']) => void
}) {
  const addTitle =
    label === 'Blocked by'
      ? 'Issues that block the selected issues'
      : 'Issues the selected issues block'
  const removeTitle = label === 'Blocked by' ? 'Blockers to remove' : 'Blocked issues to remove'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>{label}</Text>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Text sx={{ fontSize: 1, fontWeight: 400, color: 'fg.default' }}>Add issues</Text>
        <IssueRelationshipSelectPanel
          owner={owner}
          repoName={repoName}
          value={value.add}
          onChange={(nextAdd) => {
            const nextAddKeys = new Set(nextAdd.map(issueKey))
            onChange({
              ...value,
              add: nextAdd,
              remove: value.remove.filter((issue) => !nextAddKeys.has(issueKey(issue))),
            })
          }}
          title={`Add ${label.toLowerCase()} issues`}
          subtitle={addTitle}
          placeholder={`Search issues to add to ${label.toLowerCase()}`}
          placeholderText={`Search issues to add to ${label.toLowerCase()}`}
          inputLabel={`Add ${label.toLowerCase()} issues`}
          anchorAriaLabel={`Add ${label.toLowerCase()} issues`}
        />
      </Box>
      <RelationshipIssueList
        items={value.add}
        onRemove={(issue) =>
          onChange({
            ...value,
            add: value.add.filter((candidate) => issueKey(candidate) !== issueKey(issue)),
          })
        }
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Text sx={{ fontSize: 1, fontWeight: 400, color: 'fg.default' }}>
          Remove specific issues
        </Text>
        <IssueRelationshipSelectPanel
          owner={owner}
          repoName={repoName}
          value={value.remove}
          onChange={(nextRemove) => {
            const nextRemoveKeys = new Set(nextRemove.map(issueKey))
            onChange({
              ...value,
              remove: nextRemove,
              add: value.add.filter((issue) => !nextRemoveKeys.has(issueKey(issue))),
            })
          }}
          title={`Remove ${label.toLowerCase()} issues`}
          subtitle={removeTitle}
          placeholder={`Search issues to remove from ${label.toLowerCase()}`}
          placeholderText={`Search issues to remove from ${label.toLowerCase()}`}
          inputLabel={`Remove ${label.toLowerCase()} issues`}
          anchorAriaLabel={`Remove ${label.toLowerCase()} issues`}
        />
      </Box>
      <RelationshipIssueList
        items={value.remove}
        onRemove={(issue) =>
          onChange({
            ...value,
            remove: value.remove.filter((candidate) => issueKey(candidate) !== issueKey(issue)),
          })
        }
      />

      <FormControl sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Checkbox
          checked={value.clear}
          onChange={(event) => onChange({ ...value, clear: event.target.checked })}
        />
        <FormControl.Label sx={{ m: 0, fontWeight: 400 }}>
          Clear all current {label === 'Blocked by' ? 'blockers' : 'blocked issues'} before applying
          updates
        </FormControl.Label>
      </FormControl>
    </Box>
  )
}

export function RelationshipsSection({
  owner,
  repoName,
  relationshipSelection,
  relationships,
  onUpdateRelationships,
}: {
  owner: string
  repoName?: string
  relationshipSelection: RelationshipSelectionState
  relationships: BulkEditRelationshipsUpdate
  onUpdateRelationships: (relationships: BulkEditRelationshipsUpdate) => void
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Text sx={{ fontSize: 2, fontWeight: 'bold', color: 'fg.default' }}>Relationships</Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          Relationship updates apply only to issues. Pull requests in the selection are skipped
          automatically.
        </Text>
      </Box>

      {relationshipSelection.parent && (
        <Box sx={{ border: '1px solid', borderColor: 'border.default', borderRadius: 2, p: 3 }}>
          <ParentRelationshipEditor
            owner={owner}
            repoName={repoName}
            value={relationships.parent}
            onChange={(parent) => onUpdateRelationships({ ...relationships, parent })}
          />
        </Box>
      )}

      {relationshipSelection.blockedBy && (
        <Box sx={{ border: '1px solid', borderColor: 'border.default', borderRadius: 2, p: 3 }}>
          <RelationshipCategoryEditor
            label="Blocked by"
            owner={owner}
            repoName={repoName}
            value={relationships.blockedBy}
            onChange={(blockedBy) => onUpdateRelationships({ ...relationships, blockedBy })}
          />
        </Box>
      )}

      {relationshipSelection.blocking && (
        <Box sx={{ border: '1px solid', borderColor: 'border.default', borderRadius: 2, p: 3 }}>
          <RelationshipCategoryEditor
            label="Blocking"
            owner={owner}
            repoName={repoName}
            value={relationships.blocking}
            onChange={(blocking) => onUpdateRelationships({ ...relationships, blocking })}
          />
        </Box>
      )}
    </Box>
  )
}
