export interface CircularArc {
  center: { x: number; y: number }
  radius: number
  startAngle: number
  angleDelta: number
}

export function createCircularArc(
  start: { x: number; y: number },
  end: { x: number; y: number },
  radius: number,
  side: number,
  useShortArc: boolean,
): CircularArc {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return { center: start, radius, startAngle: 0, angleDelta: 0 }
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const halfChord = distance / 2
  const centerOffset = Math.sqrt(Math.max(0, radius * radius - halfChord * halfChord))
  const perpendicular = { x: -dy / distance, y: dx / distance }
  const center = {
    x: midpoint.x + perpendicular.x * centerOffset * side,
    y: midpoint.y + perpendicular.y * centerOffset * side,
  }
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x)
  const shortDelta = normalizeAngle(endAngle - startAngle)
  const angleDelta = useShortArc ? shortDelta : shortDelta - Math.sign(shortDelta || 1) * Math.PI * 2
  return { center, radius, startAngle, angleDelta }
}

export function pointOnCircularArc(arc: CircularArc, progress: number): { x: number; y: number } {
  const angle = arc.startAngle + arc.angleDelta * progress
  return {
    x: arc.center.x + Math.cos(angle) * arc.radius,
    y: arc.center.y + Math.sin(angle) * arc.radius,
  }
}

export function sampleCircularArc(arc: CircularArc, segments = 32): Array<{ x: number; y: number }> {
  return Array.from({ length: segments + 1 }, (_, index) => pointOnCircularArc(arc, index / segments))
}

/** Reflects the first short arc across its chord and reverses its travel direction. */
export function mirrorCircularArc(
  arc: CircularArc,
  start: { x: number; y: number },
  end: { x: number; y: number },
): CircularArc {
  const reflectedCenter = reflectPointOverLine(arc.center, start, end)
  return {
    center: reflectedCenter,
    radius: arc.radius,
    startAngle: Math.atan2(end.y - reflectedCenter.y, end.x - reflectedCenter.x),
    angleDelta: arc.angleDelta,
  }
}

function reflectPointOverLine(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
): { x: number; y: number } {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return point
  const projection = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared
  const projected = { x: lineStart.x + projection * dx, y: lineStart.y + projection * dy }
  return { x: 2 * projected.x - point.x, y: 2 * projected.y - point.y }
}

function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2
  let normalized = angle % fullTurn
  if (normalized > Math.PI) normalized -= fullTurn
  if (normalized < -Math.PI) normalized += fullTurn
  return normalized
}
