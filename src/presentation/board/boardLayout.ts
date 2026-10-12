/** The header's rule sits at this y; the board is centred between it and the status rule below. */
export const HEADER_RULE_Y = 121
const BOARD_RULE_GAP = 50

export const BOARD_LAYOUT = {
  anchorX: 215,
  top: HEADER_RULE_Y + BOARD_RULE_GAP,
  tileSize: 56,
  gap: 14,
  rowStep: 73,
  completionMarkGap: 3,
  columns: 5,
  rows: 5,
  tileBorderWidth: 0.0,
  letterFontSize: 32,
} as const

/** The rule above the moves bar, the same distance below the board as the header rule is above it. */
export const STATUS_RULE_Y = BOARD_LAYOUT.top + (BOARD_LAYOUT.rows - 1) * BOARD_LAYOUT.rowStep + BOARD_LAYOUT.tileSize + BOARD_RULE_GAP
/** How far the status block and the demo's lower layout sit below where they were designed. */
export const CONTENT_SHIFT = STATUS_RULE_Y - 512

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
