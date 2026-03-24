import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, SelectPanel, Text } from '@primer/react'
import type { SelectPanelItemInput, SelectPanelItemProps } from '@primer/react'
import { TriangleDownIcon } from '@primer/octicons-react'
import { BULK_BAR_PRIMER_PORTAL_NAME } from '../../lib/primer-shadow-portal'
import { Z_MODAL_PORTAL } from '../../lib/z-index'

export type SearchSelectPanelMessage = {
  title: string
  body: string | React.ReactElement
  variant: 'empty' | 'error' | 'warning'
}

export type SearchSelectPanelOption<T> = {
  id: string
  item: T
  panelItem: SelectPanelItemProps & { id: string }
  selectionText?: string
}

type SearchSelectPanelWidth = 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge' | 'auto'
type SelectedPlacement = 'selected-first' | 'selected-first-when-filter-empty' | 'results-only'
type SelectPanelGesture = 'anchor-click' | 'anchor-key-press' | 'click-outside' | 'escape' | 'selection' | 'cancel'

const anchorButtonSx = {
  boxShadow: 'none',
  width: '100%',
  justifyContent: 'space-between',
  transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
  '&:active': { transform: 'translateY(0)', transition: '100ms' },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover:not(:disabled)': { transform: 'none' },
  },
} as const

interface CommonProps<T> {
  search: (query: string) => Promise<T[]>
  mapItem: (item: T) => SearchSelectPanelOption<T>
  placeholder: string
  title?: string
  subtitle?: string
  placeholderText?: string
  inputLabel?: string
  disabled?: boolean
  width?: SearchSelectPanelWidth
  emptyState?: (args: { filterQuery: string }) => SearchSelectPanelMessage | undefined
  searchErrorMessage: string
  errorTitle?: string
  selectedPlacement?: SelectedPlacement
  anchorAriaLabel?: string
  portalContainerName?: string
  debugName?: string
}

interface MultiProps<T> extends CommonProps<T> {
  selected: T[]
  onSelectedChange: (selected: T[]) => void
}

interface SingleProps<T> extends CommonProps<T> {
  selected: T | undefined
  onSelectedChange: (selected: T | undefined) => void
}

function mapSelectedValues<T>(selected: T[] | T | undefined): T[] {
  if (Array.isArray(selected)) return selected
  return selected ? [selected] : []
}

function summarizeDebugValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(summarizeDebugValue)

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const summary: Record<string, unknown> = {}

    for (const key of ['id', 'name', 'text', 'description', 'nameWithOwner']) {
      if (key in record) summary[key] = record[key]
    }

    if (Object.keys(summary).length > 0) return summary
  }

  return value
}

export function SearchSelectPanel<T>(props: MultiProps<T>): React.ReactElement
export function SearchSelectPanel<T>(props: SingleProps<T>): React.ReactElement
export function SearchSelectPanel<T>(props: MultiProps<T> | SingleProps<T>) {
  const {
    search,
    mapItem,
    placeholder,
    title,
    subtitle,
    placeholderText = 'Filter items',
    inputLabel = placeholderText,
    disabled = false,
    width = 'large',
    emptyState,
    searchErrorMessage,
    errorTitle = 'Could not load results',
    selectedPlacement = 'selected-first',
    anchorAriaLabel,
    portalContainerName = BULK_BAR_PRIMER_PORTAL_NAME,
    debugName,
  } = props

  const [filterQuery, setFilterQuery] = useState('')
  const [results, setResults] = useState<T[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const requestGen = useRef(0)

  const log = useCallback((message: string, payload?: unknown) => {
    if (!debugName) return

    if (typeof payload === 'undefined') {
      console.log(`[${debugName}] ${message}`)
      return
    }

    console.log(`[${debugName}] ${message}`, payload)
  }, [debugName])

  const isMultiSelect = Array.isArray(props.selected)
  const selectedValues = useMemo(() => mapSelectedValues(props.selected), [props.selected])

  const selectedOptions = useMemo(() => {
    const unique = new Map<string, SearchSelectPanelOption<T>>()
    for (const item of selectedValues) {
      const option = mapItem(item)
      unique.set(option.id, option)
    }
    return [...unique.values()]
  }, [mapItem, selectedValues])

  const resultOptions = useMemo(() => results.map(mapItem), [mapItem, results])

  const optionsById = useMemo(() => {
    const next = new Map<string, SearchSelectPanelOption<T>>()
    for (const option of selectedOptions) next.set(option.id, option)
    for (const option of resultOptions) next.set(option.id, option)
    return next
  }, [resultOptions, selectedOptions])

  const selectedIds = useMemo(() => new Set(selectedOptions.map(option => option.id)), [selectedOptions])

  const panelOptions = useMemo(() => {
    const remainingResults = resultOptions.filter(option => !selectedIds.has(option.id))

    if (selectedPlacement === 'results-only') return resultOptions
    if (selectedPlacement === 'selected-first-when-filter-empty' && filterQuery.trim() !== '') {
      return resultOptions
    }

    return [...selectedOptions, ...remainingResults]
  }, [filterQuery, resultOptions, selectedIds, selectedOptions, selectedPlacement])

  const panelItems = useMemo(() => panelOptions.map(option => option.panelItem), [panelOptions])

  const selectedPanelItems = useMemo(() => {
    const currentPanelItemsById = new Map(panelOptions.map(option => [option.id, option.panelItem]))
    return selectedOptions.map(option => currentPanelItemsById.get(option.id) ?? option.panelItem)
  }, [panelOptions, selectedOptions])

  const selectedAnchorText = useMemo(() => {
    if (selectedOptions.length === 0) return undefined
    return selectedOptions.map(option => option.selectionText ?? option.panelItem.text).join(', ')
  }, [selectedOptions])

  const message = useMemo(() => {
    if (fetching) return undefined

    if (fetchError && panelItems.length === 0) {
      return {
        title: errorTitle,
        body: fetchError,
        variant: 'error' as const,
      }
    }

    if (panelItems.length === 0) {
      return emptyState?.({ filterQuery })
    }

    return undefined
  }, [emptyState, errorTitle, fetchError, fetching, filterQuery, panelItems.length])

  const notice = useMemo(() => {
    if (fetching || !fetchError || panelItems.length === 0) return undefined

    return {
      text: fetchError,
      variant: 'error' as const,
    }
  }, [fetchError, fetching, panelItems.length])

  const handleOpenChange = useCallback((open: boolean, gesture?: SelectPanelGesture) => {
    log('onOpenChange', { open, gesture })
    setPanelOpen(open)

    if (!open) {
      requestGen.current += 1
      setFilterQuery('')
      setFetchError(null)
    }
  }, [log])

  const handleFilterChange = useCallback((nextFilterQuery: string) => {
    log('onFilterChange', { filterQuery: nextFilterQuery })
    setFilterQuery(nextFilterQuery)
  }, [log])

  useEffect(() => {
    if (!panelOpen || disabled) return

    const trimmedQuery = filterQuery.trim()
    const delay = trimmedQuery === '' ? 0 : 300
    const gen = ++requestGen.current
    const timeoutId = window.setTimeout(() => {
      log('search:start', { filterQuery: trimmedQuery, requestGen: gen, delay })
      setFetching(true)
      setFetchError(null)

      search(trimmedQuery)
        .then(items => {
          if (requestGen.current !== gen) return
          log('search:success', {
            filterQuery: trimmedQuery,
            requestGen: gen,
            resultCount: items.length,
          })
          setResults(items)
        })
        .catch((error) => {
          if (requestGen.current !== gen) return
          console.error(`[${debugName ?? 'SearchSelectPanel'}] search:error`, {
            filterQuery: trimmedQuery,
            requestGen: gen,
            error,
          })
          setResults([])
          setFetchError(searchErrorMessage)
        })
        .finally(() => {
          if (requestGen.current !== gen) return
          log('search:complete', { filterQuery: trimmedQuery, requestGen: gen })
          setFetching(false)
        })
    }, delay)

    return () => window.clearTimeout(timeoutId)
  }, [debugName, disabled, filterQuery, log, panelOpen, search, searchErrorMessage])

  useEffect(() => {
    if (!disabled) return

    log('panel:disabled-reset')
    requestGen.current += 1
    setPanelOpen(false)
    setFilterQuery('')
    setFetchError(null)
  }, [disabled, log])

  const renderAnchor = useCallback(
    ({ children, ...anchorProps }: React.ComponentProps<typeof Button>) => (
      <Button
        {...anchorProps}
        type="button"
        trailingAction={TriangleDownIcon}
        aria-haspopup="dialog"
        aria-label={anchorAriaLabel}
        disabled={disabled}
        block
        sx={anchorButtonSx}
      >
        <Text as="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'left' }}>
          {selectedAnchorText ?? children ?? placeholder}
        </Text>
      </Button>
    ),
    [anchorAriaLabel, disabled, placeholder, selectedAnchorText],
  )

  const commonProps = {
    title,
    subtitle,
    renderAnchor,
    placeholder,
    placeholderText,
    inputLabel,
    open: panelOpen,
    onOpenChange: handleOpenChange,
    items: panelItems,
    onFilterChange: handleFilterChange,
    filterValue: filterQuery,
    loading: fetching,
    message,
    notice,
    width,
    align: 'start' as const,
    disableFullscreenOnNarrow: true,
    showSelectedOptionsFirst: true,
    overlayProps: {
      portalContainerName,
      sx: {
        boxShadow: 'none',
        pointerEvents: 'auto',
        zIndex: Z_MODAL_PORTAL,
      },
    },
  }

  const getOptionValue = useCallback(
    (id: number | string | undefined) => {
      if (typeof id === 'undefined') return undefined
      return optionsById.get(String(id))?.item
    },
    [optionsById],
  )

  if (isMultiSelect) {
    const multiProps = props as MultiProps<T>

    return (
      <Box sx={{ width: '100%' }}>
        <SelectPanel
          {...commonProps}
          selected={selectedPanelItems}
          onSelectedChange={(items: SelectPanelItemInput[]) => {
            const nextSelected = items
              .map(item => getOptionValue(item.id))
              .filter((item): item is T => typeof item !== 'undefined')

            log('onSelectedChange:multi', {
              rawItems: items.map(item => ({ id: item.id, text: item.text })),
              resolvedItems: summarizeDebugValue(nextSelected),
            })

            multiProps.onSelectedChange(nextSelected)
          }}
        />
      </Box>
    )
  }

  const singleProps = props as SingleProps<T>

  return (
    <Box sx={{ width: '100%' }}>
      <SelectPanel
        {...commonProps}
        selected={selectedPanelItems[0]}
        onSelectedChange={(item: SelectPanelItemInput | undefined) => {
          const nextSelected = getOptionValue(item?.id)

          log('onSelectedChange:single', {
            rawItem: item ? { id: item.id, text: item.text, description: item.description } : undefined,
            resolvedItem: summarizeDebugValue(nextSelected),
          })

          singleProps.onSelectedChange(nextSelected)
        }}
      />
    </Box>
  )
}
