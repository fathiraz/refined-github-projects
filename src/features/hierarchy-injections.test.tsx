import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INJECTED_ATTR } from '@/lib/project-table-dom'
import { createHierarchyChipInjector } from '@/features/hierarchy-injections'
import type { ProjectContext } from '@/lib/github-project'
import { registerHovercardTrigger } from '@/lib/hovercard-trigger-registry'

vi.mock('@/lib/hovercard-trigger-registry', () => ({
  registerHovercardTrigger: vi.fn(),
}))

describe('createHierarchyChipInjector', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.mocked(registerHovercardTrigger).mockReset()
  })

  it('cleans tracked row when row becomes legacy invalid marker', () => {
    const row = document.createElement('div')
    row.setAttribute('role', 'row')
    row.setAttribute(INJECTED_ATTR, 'item-1')
    const titleCell = document.createElement('div')
    titleCell.setAttribute('role', 'rowheader')
    row.appendChild(titleCell)
    document.body.appendChild(row)

    const cleanup = vi.fn()
    vi.mocked(registerHovercardTrigger).mockReturnValue(cleanup)

    const inject = createHierarchyChipInjector({} as ProjectContext)
    inject()

    expect(row.getAttribute('data-rgp-hier')).toBe('1')
    expect(registerHovercardTrigger).toHaveBeenCalledTimes(1)

    row.setAttribute(INJECTED_ATTR, '1')
    inject()

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(row.hasAttribute('data-rgp-hier')).toBe(false)
    expect(registerHovercardTrigger).toHaveBeenCalledTimes(1)
  })
})
