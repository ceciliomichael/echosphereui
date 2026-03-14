import type { ReactNode } from 'react'
import type { GraphNode, HistoryItemViewModel } from './historyGraphLayout'

const SWIMLANE_WIDTH = 11
const SWIMLANE_HEIGHT = 50
const SWIMLANE_CURVE_RADIUS = 5
const CIRCLE_RADIUS = 4
const CIRCLE_STROKE_WIDTH = 2
const GRAPH_LANE_COLORS = ['#FFB000', '#DC267F', '#994F00', '#40B0A6', '#B66DFF', '#4ea1ff'] as const

function findLastGraphNodeIndex(nodes: GraphNode[], id: string): number {
  for (let index = nodes.length - 1; index >= 0; index--) {
    if (nodes[index].id === id) {
      return index
    }
  }

  return -1
}

export function GitGraphLane({ viewModel }: { viewModel: HistoryItemViewModel }) {
  const { entry, inputSwimlanes, outputSwimlanes, kind } = viewModel

  const inputIndex = inputSwimlanes.findIndex((node) => node.id === entry.hash)
  const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length
  const circleColor =
    circleIndex < outputSwimlanes.length
      ? outputSwimlanes[circleIndex].color
      : circleIndex < inputSwimlanes.length
        ? inputSwimlanes[circleIndex].color
        : GRAPH_LANE_COLORS[0]

  const svgElements: ReactNode[] = []
  let outputSwimlaneIdx = 0

  for (let index = 0; index < inputSwimlanes.length; index++) {
    const color = inputSwimlanes[index].color

    if (inputSwimlanes[index].id === entry.hash) {
      if (index !== circleIndex) {
        const x1 = SWIMLANE_WIDTH * (index + 1)
        const x2 = SWIMLANE_WIDTH * (circleIndex + 1)
        svgElements.push(
          <path
            key={`in-${index}`}
            d={`M ${x1} 0 A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${x1 - SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} H ${x2}`}
            stroke={color}
            strokeWidth={1}
            strokeLinecap="round"
            fill="none"
          />,
        )
      } else {
        outputSwimlaneIdx++
      }
    } else if (
      outputSwimlaneIdx < outputSwimlanes.length &&
      inputSwimlanes[index].id === outputSwimlanes[outputSwimlaneIdx].id
    ) {
      if (index === outputSwimlaneIdx) {
        const cx = SWIMLANE_WIDTH * (index + 1)
        svgElements.push(
          <line
            key={`str-${index}`}
            x1={cx}
            y1={0}
            x2={cx}
            y2={SWIMLANE_HEIGHT}
            stroke={color}
            strokeWidth={1}
            strokeLinecap="round"
          />,
        )
      } else {
        const x1 = SWIMLANE_WIDTH * (index + 1)
        const x2 = SWIMLANE_WIDTH * (outputSwimlaneIdx + 1)
        const r = SWIMLANE_CURVE_RADIUS
        const halfH = SWIMLANE_HEIGHT / 2
        svgElements.push(
          <path
            key={`shift-${index}`}
            d={`M ${x1} 0 V ${halfH - r} A ${r} ${r} 0 0 1 ${x1 - r} ${halfH} H ${x2 + r} A ${r} ${r} 0 0 0 ${x2} ${halfH + r} V ${SWIMLANE_HEIGHT}`}
            stroke={color}
            strokeWidth={1}
            strokeLinecap="round"
            fill="none"
          />,
        )
      }
      outputSwimlaneIdx++
    }
  }

  for (let index = 1; index < entry.parentIds.length; index++) {
    const parentOutputIndex = findLastGraphNodeIndex(outputSwimlanes, entry.parentIds[index])
    if (parentOutputIndex === -1) {
      continue
    }

    const parentColor = outputSwimlanes[parentOutputIndex].color
    const parentX = SWIMLANE_WIDTH * (parentOutputIndex + 1)
    const circleX = SWIMLANE_WIDTH * (circleIndex + 1)
    const halfHeight = SWIMLANE_HEIGHT / 2
    const controlY = halfHeight + SWIMLANE_CURVE_RADIUS + 1
    svgElements.push(
      <path
        key={`par-${index}`}
        d={`M ${circleX} ${halfHeight} C ${circleX} ${controlY} ${parentX} ${controlY} ${parentX} ${SWIMLANE_HEIGHT}`}
        stroke={parentColor}
        strokeWidth={1}
        strokeLinecap="round"
        fill="none"
      />,
    )
  }

  if (inputIndex !== -1) {
    const circleX = SWIMLANE_WIDTH * (circleIndex + 1)
    svgElements.push(
      <line
        key="l-to"
        x1={circleX}
        y1={0}
        x2={circleX}
        y2={SWIMLANE_HEIGHT / 2}
        stroke={inputSwimlanes[inputIndex].color}
        strokeWidth={1}
        strokeLinecap="round"
      />,
    )
  }

  if (entry.parentIds.length > 0) {
    const circleX = SWIMLANE_WIDTH * (circleIndex + 1)
    svgElements.push(
      <line
        key="l-from"
        x1={circleX}
        y1={SWIMLANE_HEIGHT / 2}
        x2={circleX}
        y2={SWIMLANE_HEIGHT}
        stroke={circleColor}
        strokeWidth={1}
        strokeLinecap="round"
      />,
    )
  }

  const nodeX = SWIMLANE_WIDTH * (circleIndex + 1)
  const nodeY = SWIMLANE_HEIGHT / 2

  if (kind === 'HEAD') {
    svgElements.push(
      <circle
        key="co"
        cx={nodeX}
        cy={nodeY}
        r={CIRCLE_RADIUS + 3}
        fill={circleColor}
        stroke="var(--workspace-panel-surface)"
        strokeWidth={CIRCLE_STROKE_WIDTH}
      />,
      <circle key="ci" cx={nodeX} cy={nodeY} r={CIRCLE_STROKE_WIDTH} fill="var(--workspace-panel-surface)" />,
    )
  } else if (entry.parentIds.length > 1) {
    svgElements.push(
      <circle
        key="co"
        cx={nodeX}
        cy={nodeY}
        r={CIRCLE_RADIUS + 2}
        fill={circleColor}
        stroke="var(--workspace-panel-surface)"
        strokeWidth={CIRCLE_STROKE_WIDTH}
      />,
      <circle key="ci" cx={nodeX} cy={nodeY} r={CIRCLE_RADIUS - 1} fill={circleColor} />,
    )
  } else {
    svgElements.push(
      <circle
        key="cn"
        cx={nodeX}
        cy={nodeY}
        r={CIRCLE_RADIUS + 1}
        fill={circleColor}
        stroke="var(--workspace-panel-surface)"
        strokeWidth={CIRCLE_STROKE_WIDTH}
      />,
    )
  }

  const totalLanes = Math.max(inputSwimlanes.length, outputSwimlanes.length, 1) + 1
  const svgWidth = SWIMLANE_WIDTH * totalLanes

  return (
    <svg width={svgWidth} height={SWIMLANE_HEIGHT} viewBox={`0 0 ${svgWidth} ${SWIMLANE_HEIGHT}`} className="shrink-0">
      {svgElements}
    </svg>
  )
}

export function GitGraphPlaceholder({ columns }: { columns: GraphNode[] }) {
  if (columns.length === 0) {
    return null
  }

  const svgWidth = SWIMLANE_WIDTH * (columns.length + 1)
  return (
    <svg width={svgWidth} height="100%" className="shrink-0" style={{ minHeight: SWIMLANE_HEIGHT }}>
      {columns.map((column, index) => (
        <line
          key={column.id + index}
          x1={SWIMLANE_WIDTH * (index + 1)}
          y1={0}
          x2={SWIMLANE_WIDTH * (index + 1)}
          y2="100%"
          stroke={column.color}
          strokeWidth={1}
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}
