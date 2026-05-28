import React, { useCallback, useRef, useState } from 'react'
import type { Instance } from 'tippy.js'
import { Avatar, Box, Label, Link, ProgressBar, Text } from '@primer/react'
import type {
  HierarchyData,
  IssueRelationshipData,
  ItemPreviewData,
  SubIssueData,
} from '@/lib/messages'
import { getHovercardAppendTarget } from '@/lib/hovercard-portal-target'
import { primerCss } from '@/lib/primer-css-helper'
import { ensureTippyCss, ensureRgpCardTheme } from '@/lib/tippy-utils'
import { Z_TOOLTIP } from '@/lib/z-index'
import { sendMessage } from '@/lib/messages'
import type { ProjectContext } from '@/lib/github-project'
import Tooltip from '@/ui/tooltip'

ensureTippyCss()
ensureRgpCardTheme()
const MIN_LOADING_SKELETON_MS = 220

interface RowHoverCardProps {
  itemId: string
  projectContext: ProjectContext
  titleCell: HTMLElement
}

type CardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; preview: ItemPreviewData; hierarchy: HierarchyData }

export function RowHoverCard({ itemId, projectContext, titleCell }: RowHoverCardProps) {
  const [state, setState] = useState<CardState>({ status: 'idle' })
  const hasFetchedRef = useRef(false)
  const pendingRef = useRef<Promise<void> | null>(null)

  const startFetch = useCallback(
    (instance: Instance) => {
      if (pendingRef.current) return
      const loadingStartedAt = Date.now()
      pendingRef.current = Promise.all([
        sendMessage('getItemPreview', {
          itemId,
          owner: projectContext.owner,
          number: projectContext.number,
          isOrg: projectContext.isOrg,
        }),
        sendMessage('getHierarchyData', {
          itemId,
          owner: projectContext.owner,
          number: projectContext.number,
          isOrg: projectContext.isOrg,
        }),
      ])
        .then(async ([preview, hierarchy]) => {
          const loadingElapsedMs = Date.now() - loadingStartedAt
          const loadingRemainingMs = MIN_LOADING_SKELETON_MS - loadingElapsedMs
          if (loadingRemainingMs > 0) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, loadingRemainingMs)
            })
          }
          hasFetchedRef.current = true
          setState({ status: 'ready', preview, hierarchy })
          if (instance.state.isVisible) instance.popperInstance?.update()
        })
        .catch(async () => {
          const loadingElapsedMs = Date.now() - loadingStartedAt
          const loadingRemainingMs = MIN_LOADING_SKELETON_MS - loadingElapsedMs
          if (loadingRemainingMs > 0) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, loadingRemainingMs)
            })
          }
          setState({ status: 'error' })
        })
        .finally(() => {
          pendingRef.current = null
        })
    },
    [itemId, projectContext.owner, projectContext.number, projectContext.isOrg],
  )

  const handleShow = useCallback(
    (instance: Instance) => {
      if (hasFetchedRef.current || pendingRef.current) return
      setState({ status: 'loading' })
      startFetch(instance)
    },
    [startFetch],
  )

  return (
    <Tooltip
      content={<CardContent state={state} />}
      reference={titleCell}
      delay={[300, 100]}
      placement="bottom-start"
      appendTo={getHovercardAppendTarget()}
      theme="rgp-card"
      zIndex={Z_TOOLTIP}
      interactive
      arrow
      onShow={handleShow}
      maxWidth={360}
    />
  )
}

function CardContent({ state }: { state: CardState }) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <LoadingSkeleton />
  }

  if (state.status === 'error') {
    return (
      <CardShell>
        <Text sx={{ fontSize: 0, color: 'fg.muted', px: 3, py: 3, display: 'block' }}>
          Could not load details.
        </Text>
      </CardShell>
    )
  }

  const { preview, hierarchy } = state
  const showProjectBlock = hasProjectBlock(preview, hierarchy)
  const bodyExcerpt = excerptIssueBody(preview.body)
  const issueUrl = `https://github.com/${preview.repoOwner}/${preview.repoName}/issues/${preview.issueNumber}`
  const repoUrl = `https://github.com/${preview.repoOwner}/${preview.repoName}`

  return (
    <CardShell>
      <Box sx={{ px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Text sx={{ fontSize: 0, color: 'fg.muted', lineHeight: 'condensed' }}>
          <Link href={repoUrl} target="_blank" rel="noopener noreferrer" sx={{ color: 'fg.muted' }}>
            {preview.repoOwner}/{preview.repoName}
          </Link>
        </Text>

        <Link
          href={issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            color: 'fg.default',
            fontWeight: 'semibold',
            fontSize: 2,
            lineHeight: 'condensed',
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {preview.title}{' '}
          <Text as="span" sx={{ color: 'fg.muted', fontWeight: 'normal' }}>
            #{preview.issueNumber}
          </Text>
        </Link>

        <IssueStateBadge state={preview.state} />

        {bodyExcerpt ? (
          <Text
            as="p"
            sx={{
              fontSize: 1,
              color: 'fg.muted',
              lineHeight: 'condensed',
              m: 0,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {bodyExcerpt}
          </Text>
        ) : null}
      </Box>

      {showProjectBlock ? (
        <>
          <Box sx={primerCss.divider()} />
          <ProjectBlock preview={preview} hierarchy={hierarchy} />
        </>
      ) : null}
    </CardShell>
  )
}

function ProjectBlock({
  preview,
  hierarchy,
}: {
  preview: ItemPreviewData
  hierarchy: HierarchyData
}) {
  const statusField = preview.fields.find(
    (f) =>
      f.dataType === 'SINGLE_SELECT' &&
      f.optionName &&
      (/status/i.test(f.fieldName) || f.fieldName.toLowerCase() === 'status'),
  )
  const priorityField = preview.fields.find((f) => /priority/i.test(f.fieldName) && f.optionName)
  const iterationField = preview.fields.find((f) => f.dataType === 'ITERATION' && f.iterationTitle)

  const hasAssignees = preview.assignees.length > 0
  const hasLabels = preview.labels.length > 0
  const hasParent = Boolean(hierarchy.parent)
  const hasSubIssues = hierarchy.totalSubIssues > 0
  const hasBlockedBy = hierarchy.blockedBy.length > 0
  const hasBlocking = hierarchy.blocking.length > 0

  const subPct = hasSubIssues
    ? Math.round((hierarchy.completedSubIssues / hierarchy.totalSubIssues) * 100)
    : 0

  return (
    <Box sx={{ px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {statusField?.optionName ? (
        <FieldRow label="Status">
          <OptionChip name={statusField.optionName} color={statusField.optionColor} />
        </FieldRow>
      ) : null}

      {iterationField?.iterationTitle ? (
        <FieldRow label="Sprint">
          <OptionChip name={iterationField.iterationTitle} />
        </FieldRow>
      ) : null}

      {priorityField?.optionName ? (
        <FieldRow label="Priority">
          <OptionChip name={priorityField.optionName} color={priorityField.optionColor} />
        </FieldRow>
      ) : null}

      {hasAssignees ? (
        <FieldRow label="Assignees">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {preview.assignees.slice(0, 5).map((a) => (
              <Avatar key={a.id} src={a.avatarUrl} alt={a.login} size={20} />
            ))}
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              {preview.assignees.map((a) => a.login).join(', ')}
            </Text>
          </Box>
        </FieldRow>
      ) : null}

      {hasLabels ? (
        <FieldRow label="Labels">
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {preview.labels.slice(0, 6).map((lbl) => (
              <Box
                key={lbl.id}
                as="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  px: 1,
                  py: '1px',
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  fontSize: 0,
                  color: 'fg.default',
                  borderLeft: '3px solid',
                  borderLeftColor: lbl.color,
                }}
              >
                {lbl.name}
              </Box>
            ))}
          </Box>
        </FieldRow>
      ) : null}

      {hasParent ? (
        <FieldRow label="Parent">
          <IssueLink issue={hierarchy.parent!} />
        </FieldRow>
      ) : null}

      {hasSubIssues ? (
        <FieldRow
          label={`Sub-issues · ${hierarchy.completedSubIssues}/${hierarchy.totalSubIssues}`}
        >
          <ProgressBar progress={subPct} sx={{ width: '100%', boxShadow: 'none' }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', mt: 1 }}>
            {hierarchy.subIssues.slice(0, 5).map((sub) => (
              <SubIssueRow key={`${sub.repoOwner}/${sub.repoName}#${sub.number}`} sub={sub} />
            ))}
            {hierarchy.subIssues.length > 5 ? (
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                +{hierarchy.subIssues.length - 5} more
              </Text>
            ) : null}
          </Box>
        </FieldRow>
      ) : null}

      {hasBlockedBy ? (
        <FieldRow label="Blocked by">
          {hierarchy.blockedBy.map((issue) => (
            <IssueLink
              key={`${issue.repoOwner}/${issue.repoName}#${issue.number}`}
              issue={issue}
              color="danger.fg"
            />
          ))}
        </FieldRow>
      ) : null}

      {hasBlocking ? (
        <FieldRow label="Blocking">
          {hierarchy.blocking.map((issue) => (
            <IssueLink
              key={`${issue.repoOwner}/${issue.repoName}#${issue.number}`}
              issue={issue}
              color="attention.fg"
            />
          ))}
        </FieldRow>
      ) : null}
    </Box>
  )
}

function hasProjectBlock(preview: ItemPreviewData, hierarchy: HierarchyData): boolean {
  const statusField = preview.fields.find(
    (f) =>
      f.dataType === 'SINGLE_SELECT' &&
      f.optionName &&
      (/status/i.test(f.fieldName) || f.fieldName.toLowerCase() === 'status'),
  )
  const priorityField = preview.fields.find((f) => /priority/i.test(f.fieldName) && f.optionName)
  const iterationField = preview.fields.find((f) => f.dataType === 'ITERATION' && f.iterationTitle)

  return (
    Boolean(statusField?.optionName) ||
    Boolean(iterationField?.iterationTitle) ||
    Boolean(priorityField?.optionName) ||
    preview.assignees.length > 0 ||
    preview.labels.length > 0 ||
    Boolean(hierarchy.parent) ||
    hierarchy.totalSubIssues > 0 ||
    hierarchy.blockedBy.length > 0 ||
    hierarchy.blocking.length > 0
  )
}

function excerptIssueBody(body: string, maxLen = 220): string {
  const trimmed = body?.trim()
  if (!trimmed) return ''

  const text = trimmed
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen).trimEnd()}…`
}

function IssueStateBadge({ state }: { state: 'OPEN' | 'CLOSED' }) {
  const isOpen = state === 'OPEN'
  return (
    <Label
      variant={isOpen ? 'success' : 'secondary'}
      sx={{ width: 'fit-content', boxShadow: 'none' }}
    >
      {isOpen ? 'Open' : 'Closed'}
    </Label>
  )
}

function LoadingSkeleton() {
  return (
    <CardShell>
      <Box sx={{ px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box className="rgp-skeleton" sx={{ height: '10px', width: '45%', borderRadius: 1 }} />
        <Box className="rgp-skeleton" sx={{ height: '14px', width: '85%', borderRadius: 1 }} />
        <Box className="rgp-skeleton" sx={{ height: '18px', width: '30%', borderRadius: 1 }} />
        <Box className="rgp-skeleton" sx={{ height: '10px', width: '90%', borderRadius: 1 }} />
      </Box>
      <Box sx={primerCss.divider()} />
      <Box sx={{ px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box className="rgp-skeleton" sx={{ height: '10px', width: '25%', borderRadius: 1 }} />
        <Box className="rgp-skeleton" sx={{ height: '18px', width: '45%', borderRadius: 1 }} />
      </Box>
    </CardShell>
  )
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        ...primerCss.flatPanel(),
        borderRadius: 2,
        minWidth: '240px',
        maxWidth: '340px',
        fontSize: 0,
        color: 'fg.default',
      }}
    >
      {children}
    </Box>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text
        sx={{
          display: 'block',
          fontWeight: 'bold',
          color: 'fg.muted',
          mb: '4px',
          fontSize: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </Text>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{children}</Box>
    </Box>
  )
}

function IssueLink({
  issue,
  color = 'fg.default',
}: {
  issue: IssueRelationshipData
  color?: string
}) {
  const href = `https://github.com/${issue.repoOwner}/${issue.repoName}/issues/${issue.number}`
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 0, color }}
    >
      <Text sx={{ color: 'fg.muted', flexShrink: 0 }}>#{issue.number}</Text>
      <Text sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {issue.title}
      </Text>
    </Link>
  )
}

function OptionChip({ name, color }: { name: string; color?: string }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: '2px',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        fontSize: 0,
        color: 'fg.default',
        width: 'fit-content',
      }}
    >
      {color ? (
        <Box
          as="span"
          sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }}
          style={{ backgroundColor: color }}
        />
      ) : null}
      <Text sx={{ fontSize: 0 }}>{name}</Text>
    </Box>
  )
}

function SubIssueRow({ sub }: { sub: SubIssueData }) {
  const href = `https://github.com/${sub.repoOwner}/${sub.repoName}/issues/${sub.number}`
  const isDone = sub.state === 'CLOSED'
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        fontSize: 0,
        color: isDone ? 'fg.muted' : 'fg.default',
      }}
    >
      <Text sx={{ color: isDone ? 'success.fg' : 'fg.muted', flexShrink: 0 }}>
        {isDone ? '✓' : '○'}
      </Text>
      <Text
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textDecoration: isDone ? 'line-through' : 'none',
        }}
      >
        {sub.title}
      </Text>
    </Link>
  )
}
