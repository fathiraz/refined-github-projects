// "Fields ▾" chip + anchored flyout injected into GitHub's native "Create new
// issue" modal. Lets the user stage the project's own custom fields before
// GitHub creates the issue; values are applied afterward via the existing
// bulkUpdate pipeline (see create-issue-injections.tsx).

import React, { useEffect, useRef, useState } from 'react'
import { AnchoredOverlay, Box, Button, CounterLabel, Spinner, Text } from '@primer/react'

import { BULK_BAR_PRIMER_PORTAL_NAME } from '@/lib/primer-shadow-dom-compat'
import { Z_TOOLTIP } from '@/lib/z-index'
import { primerCss } from '@/lib/primer-css-helper'
import { ListCheckIcon } from '@/ui/icons'
import { EDITABLE_PROJECT_FIELD_DATATYPES, type ProjectData } from '@/features/bulk-edit-utils'
import { ValuePicker } from '@/features/bulk-edit-value-picker'
import { createIssueFieldsStore } from '@/lib/create-issue-fields-store'

const chipSx = primerCss.chipButton()

export interface CreateIssueFieldsChipProps {
  getFields: () => Promise<ProjectData>
}

function noop(): void {}

export function CreateIssueFieldsChip({ getFields }: CreateIssueFieldsChipProps) {
  const chipRef = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState<ProjectData['fields'] | null>(null)
  const [, forceRender] = useState(0)

  useEffect(() => createIssueFieldsStore.subscribe(() => forceRender((n) => n + 1)), [])
  const count = createIssueFieldsStore.count()
  const loading = open && fields === null

  useEffect(() => {
    if (!open || fields !== null) return
    let cancelled = false
    getFields().then((data) => {
      if (cancelled) return
      setFields(data.fields.filter((f) => EDITABLE_PROJECT_FIELD_DATATYPES.has(f.dataType)))
    })
    return () => {
      cancelled = true
    }
  }, [open, fields, getFields])

  return (
    <>
      <Button
        ref={chipRef}
        type="button"
        variant="default"
        size="small"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="rgp-create-issue-fields-chip"
        sx={chipSx}
      >
        <ListCheckIcon size={14} />
        <Text sx={{ fontSize: 1, fontWeight: 'semibold', ml: '6px' }}>Fields</Text>
        {count > 0 && (
          <CounterLabel scheme="primary" sx={{ ml: '6px' }}>
            {count}
          </CounterLabel>
        )}
        <Text sx={{ ml: '4px', color: 'fg.muted' }}>▾</Text>
      </Button>

      <AnchoredOverlay
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={chipRef as React.RefObject<HTMLElement>}
        renderAnchor={null}
        align="start"
        side="outside-bottom"
        width="auto"
        height="auto"
        overlayProps={{
          portalContainerName: BULK_BAR_PRIMER_PORTAL_NAME,
          role: 'dialog',
          'aria-label': 'Project fields',
          sx: { boxShadow: 'none', pointerEvents: 'auto', zIndex: Z_TOOLTIP },
        }}
      >
        <Box
          sx={{
            bg: 'canvas.overlay',
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            boxShadow: 'none',
            width: 320,
            maxHeight: 400,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            p: 3,
          }}
          data-testid="rgp-create-issue-fields-flyout"
        >
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <Spinner size="small" />
            </Box>
          )}
          {!loading && (fields?.length ?? 0) === 0 && (
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>No editable fields on this project.</Text>
          )}
          {!loading &&
            (fields ?? []).map((field) => {
              const staged = createIssueFieldsStore.snapshot().get(field.id)
              return (
                <ValuePicker
                  key={field.id}
                  field={field}
                  value={staged?.value ?? null}
                  onChange={(next) => createIssueFieldsStore.set(field, next)}
                  metaQuery=""
                  setMetaQuery={noop}
                  metaResults={[]}
                  metaLoading={false}
                />
              )
            })}
        </Box>
      </AnchoredOverlay>
    </>
  )
}
