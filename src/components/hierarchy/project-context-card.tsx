import React, { useEffect, useState } from 'react'
import { Box, Link, ProgressBar, Spinner, Text } from '@primer/react'
import type { HierarchyData, ItemPreviewData } from '../../lib/messages'
import { sendMessage } from '../../lib/messages'
import type { ProjectContext } from '../../lib/github-project'

interface ProjectContextCardProps {
  itemId: string
  projectContext: ProjectContext
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; preview: ItemPreviewData; hierarchy: HierarchyData }

export function ProjectContextCard({ itemId, projectContext }: ProjectContextCardProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    Promise.all([
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
      .then(([preview, hierarchy]) => {
        if (!cancelled) setState({ status: 'ready', preview, hierarchy })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })

    return () => { cancelled = true }
  }, [itemId, projectContext])

  if (state.status === 'loading') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
        <Spinner size="small" />
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Loading project context…</Text>
      </Box>
    )
  }

  if (state.status === 'error') {
    return (
      <Box sx={{ p: 2 }}>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Could not load project context.</Text>
      </Box>
    )
  }

  const { preview, hierarchy } = state

  const iterationField = preview.fields.find((f) => f.dataType === 'ITERATION')
  const statusField = preview.fields.find((f) => f.dataType === 'SINGLE_SELECT')

  const completedPct =
    hierarchy.totalSubIssues > 0
      ? Math.round((hierarchy.completedSubIssues / hierarchy.totalSubIssues) * 100)
      : 0

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        boxShadow: 'none',
        overflow: 'hidden',
        fontSize: 0,
        color: 'fg.default',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3,
          py: 2,
          bg: 'canvas.subtle',
          borderBottom: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <Text sx={{ fontWeight: 'bold', fontSize: 1 }}>Project Context</Text>
      </Box>

      <Box sx={{ px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Status / iteration */}
        {(statusField || iterationField) && (
          <CardRow label="Status">
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {statusField?.optionName && (
                <Text sx={{ color: 'fg.default' }}>{statusField.optionName}</Text>
              )}
              {iterationField?.iterationTitle && (
                <Text sx={{ color: 'fg.muted' }}>· {iterationField.iterationTitle}</Text>
              )}
            </Box>
          </CardRow>
        )}

        {/* Parent epic */}
        {hierarchy.parent && (
          <CardRow label="Parent">
            <Link
              href={`https://github.com/${hierarchy.parent.repoOwner}/${hierarchy.parent.repoName}/issues/${hierarchy.parent.number}`}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ fontSize: 0, color: 'fg.default' }}
            >
              <Text sx={{ color: 'fg.muted' }}>#{hierarchy.parent.number}</Text>
              {' '}
              {hierarchy.parent.title}
            </Link>
          </CardRow>
        )}

        {/* Sub-issues progress */}
        {hierarchy.totalSubIssues > 0 && (
          <CardRow label={`Sub-issues (${hierarchy.completedSubIssues}/${hierarchy.totalSubIssues})`}>
            <ProgressBar
              progress={completedPct}
              sx={{ width: '100%', bg: 'border.default', boxShadow: 'none' }}
            />
          </CardRow>
        )}

        {/* Blocked by */}
        {hierarchy.blockedBy.length > 0 && (
          <CardRow label="Blocked by">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {hierarchy.blockedBy.map((issue) => (
                <Link
                  key={`${issue.repoOwner}/${issue.repoName}#${issue.number}`}
                  href={`https://github.com/${issue.repoOwner}/${issue.repoName}/issues/${issue.number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ fontSize: 0, color: 'danger.fg' }}
                >
                  #{issue.number} {issue.title}
                </Link>
              ))}
            </Box>
          </CardRow>
        )}

        {/* Blocking */}
        {hierarchy.blocking.length > 0 && (
          <CardRow label="Blocking">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {hierarchy.blocking.map((issue) => (
                <Link
                  key={`${issue.repoOwner}/${issue.repoName}#${issue.number}`}
                  href={`https://github.com/${issue.repoOwner}/${issue.repoName}/issues/${issue.number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ fontSize: 0, color: 'fg.default' }}
                >
                  #{issue.number} {issue.title}
                </Link>
              ))}
            </Box>
          </CardRow>
        )}
      </Box>
    </Box>
  )
}

function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text
        sx={{ display: 'block', fontWeight: 'bold', color: 'fg.muted', mb: 1, fontSize: 0 }}
      >
        {label}
      </Text>
      {children}
    </Box>
  )
}
