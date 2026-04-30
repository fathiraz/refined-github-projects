// types + ordering math for the bulk-move modal.

export type MoveAction = 'TOP' | 'BOTTOM' | 'BEFORE' | 'AFTER'

export interface OrderedItem {
  memexItemId: number
  nodeId: string
  title: string
}

export interface ReorderOp {
  nodeId: string
  previousNodeId: string | null
}

export function computeNewOrder(
  allItems: OrderedItem[],
  selectedMemexIds: Set<number>,
  action: MoveAction,
  targetMemexId: number | null,
): OrderedItem[] {
  const selected = allItems.filter((i) => selectedMemexIds.has(i.memexItemId))
  const nonSelected = allItems.filter((i) => !selectedMemexIds.has(i.memexItemId))

  if (action === 'TOP') return [...selected, ...nonSelected]
  if (action === 'BOTTOM') return [...nonSelected, ...selected]

  if (targetMemexId == null) return allItems

  const targetIdx = nonSelected.findIndex((i) => i.memexItemId === targetMemexId)
  if (targetIdx === -1) return allItems

  if (action === 'BEFORE') {
    return [...nonSelected.slice(0, targetIdx), ...selected, ...nonSelected.slice(targetIdx)]
  }

  // after
  return [...nonSelected.slice(0, targetIdx + 1), ...selected, ...nonSelected.slice(targetIdx + 1)]
}

export function buildOps(newOrder: OrderedItem[], selectedMemexIds: Set<number>): ReorderOp[] {
  return newOrder.reduce<ReorderOp[]>((acc, item, i) => {
    if (!selectedMemexIds.has(item.memexItemId)) return acc
    const prev = newOrder[i - 1]
    acc.push({ nodeId: item.nodeId, previousNodeId: prev?.nodeId ?? null })
    return acc
  }, [])
}
