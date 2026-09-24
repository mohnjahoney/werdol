import type { Letter, LetterTile, Tile } from "./board"

export function swapOccupancy(occupancy: readonly number[], firstSlot: number, secondSlot: number): number[] {
  const next = [...occupancy]
  const first = next[firstSlot]
  const second = next[secondSlot]
  if (first === undefined || second === undefined) return next
  next[firstSlot] = second
  next[secondSlot] = first
  return next
}

export function tilesFromOccupancy(occupancy: readonly number[], letters: readonly Letter[]): LetterTile[] {
  return occupancy.flatMap((letterId) => {
    const letter = letters[letterId]
    return letter === undefined ? [] : [{
      id: letter.id,
      letter: letter.character,
      sourceRow: letter.sourceRow,
      sourceColumn: letter.sourceColumn,
    }]
  })
}

export function letterMatchesOriginalTileLetter(
  boardTiles: readonly Tile[],
  occupancy: readonly number[],
  letters: readonly Letter[],
  slotIndex: number,
): boolean {
  const letterId = occupancy[slotIndex]
  const letter = letterId === undefined ? undefined : letters[letterId]
  const tile = boardTiles[slotIndex]
  return letter !== undefined && tile?.originalLetter === letter.character
}

export function countCorrectOccupancy(
  boardTiles: readonly Tile[],
  occupancy: readonly number[],
  letters: readonly Letter[],
): number {
  return occupancy.reduce((count, _letterId, slotIndex) => count + (
    letterMatchesOriginalTileLetter(boardTiles, occupancy, letters, slotIndex) ? 1 : 0
  ), 0)
}
