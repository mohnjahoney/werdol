export const BOARD_LAYOUT = {
  anchorX: 215,
  top: 135,
  tileSize: 56,
  gap: 14,
  rowStep: 73,
  completionMarkGap: 3,
  columns: 5,
  tileBorderWidth: 0.0,
  letterFontSize: 32,
} as const

export const ROW_COMPLETION_MARK_RADIUS = 4
export const ROW_COMPLETION_MARK_GAP = BOARD_LAYOUT.completionMarkGap

export interface BoardPoint {
  x: number
  y: number
}

export function boardRowCenter(rowIndex: number): number {
  return BOARD_LAYOUT.top + rowIndex * BOARD_LAYOUT.rowStep + BOARD_LAYOUT.tileSize / 2
}

export function boardSlotCenter(rowIndex: number, columnIndex: number): { x: number; y: number } {
  return {
    x: BOARD_LAYOUT.anchorX + (columnIndex - (BOARD_LAYOUT.columns - 1) / 2) * (BOARD_LAYOUT.tileSize + BOARD_LAYOUT.gap),
    y: BOARD_LAYOUT.top + rowIndex * BOARD_LAYOUT.rowStep + BOARD_LAYOUT.tileSize / 2,
  }
}

export function boardTileSpan(): number {
  return BOARD_LAYOUT.columns * BOARD_LAYOUT.tileSize + (BOARD_LAYOUT.columns - 1) * BOARD_LAYOUT.gap
}
