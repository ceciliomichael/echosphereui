import type { GitHistoryEntry } from '../../types/chat'

const GRAPH_LANE_COLORS = ['#FFB000', '#DC267F', '#994F00', '#40B0A6', '#B66DFF', '#4ea1ff'] as const
const SWIMLANE_WIDTH = 11

function rot(index: number, total: number) {
  return ((index % total) + total) % total
}

export interface GraphNode {
  id: string
  color: string
}

export interface HistoryItemViewModel {
  entry: GitHistoryEntry
  inputSwimlanes: GraphNode[]
  outputSwimlanes: GraphNode[]
  kind: 'HEAD' | 'node'
}

export function computeSwimlanes(entries: GitHistoryEntry[]): HistoryItemViewModel[] {
  let colorIndex = -1
  const viewModels: HistoryItemViewModel[] = []

  for (const entry of entries) {
    const kind: 'HEAD' | 'node' = entry.isHead ? 'HEAD' : 'node'
    const outputSwimlanesFromPrev = viewModels.at(-1)?.outputSwimlanes ?? []
    const inputSwimlanes = outputSwimlanesFromPrev.map((node) => ({ ...node }))
    const outputSwimlanes: GraphNode[] = []

    let firstParentAdded = false

    if (entry.parentIds.length > 0) {
      for (const node of inputSwimlanes) {
        if (node.id === entry.hash) {
          if (!firstParentAdded) {
            outputSwimlanes.push({
              id: entry.parentIds[0],
              color: node.color,
            })
            firstParentAdded = true
          }
          continue
        }
        outputSwimlanes.push({ ...node })
      }
    }

    for (let index = firstParentAdded ? 1 : 0; index < entry.parentIds.length; index++) {
      colorIndex = rot(colorIndex + 1, GRAPH_LANE_COLORS.length)
      outputSwimlanes.push({
        id: entry.parentIds[index],
        color: GRAPH_LANE_COLORS[colorIndex],
      })
    }

    viewModels.push({ entry, kind, inputSwimlanes, outputSwimlanes })
  }

  return viewModels
}

export function getSwimlaneIndentPx(columns: number) {
  return Math.max(24, Math.max(1, columns) * SWIMLANE_WIDTH + 8)
}
