import { ROW_COUNT, type WerdolPuzzle, type WerdolRow } from "./puzzle"

export const TILES_PER_ROW = 5

export interface Letter {
  id: number
  character: string
  sourceRow: number
  sourceColumn: number
}

export interface Tile {
  id: number
  row: number
  column: number
  occupyingLetterId: number
  originalLetter: string
}

export interface LetterTile {
  id: number
  letter: string
  sourceRow: number
  sourceColumn: number
}

export interface ScrambledBoard {
  rows: WerdolRow[]
  letters: Letter[]
  boardTiles: Tile[]
  initialOccupancy: number[]
  occupancy: number[]
  initialTiles: LetterTile[]
  tiles: LetterTile[]
  frozenRows: number[]
}

export function createScrambledBoard(
  puzzle: WerdolPuzzle,
  random = Math.random,
  initialLetters?: string,
): ScrambledBoard {
  if (puzzle.rows.length !== ROW_COUNT) {
    throw new Error(`Werdol boards must contain exactly ${ROW_COUNT} rows`)
  }

  const letters = puzzle.rows.flatMap((row, sourceRow) =>
    [...row.intendedGuess].map((letter, sourceColumn) => ({
      id: sourceRow * TILES_PER_ROW + sourceColumn,
      character: letter,
      sourceRow,
      sourceColumn,
    })),
  )

  const targetLetters = [...puzzle.target].map((letter, sourceColumn) => ({
    id: ROW_COUNT * TILES_PER_ROW + sourceColumn,
    character: letter,
    sourceRow: ROW_COUNT,
    sourceColumn,
  }))
  const allLetters = [...letters, ...targetLetters]

  const boardRows: WerdolRow[] = [
    ...puzzle.rows,
    { intendedGuess: puzzle.target, pattern: Array(5).fill("correct") },
  ]

  const boardTiles = boardRows.flatMap((row, rowIndex) =>
    [...row.intendedGuess].map((originalLetter, column) => ({
      id: rowIndex * TILES_PER_ROW + column,
      row: rowIndex,
      column,
      occupyingLetterId: rowIndex * TILES_PER_ROW + column,
      originalLetter,
    })),
  )
  const shuffledTiles = initialLetters === undefined ? shuffled(letters, random) : arrangeLetters(letters, initialLetters)
  removeAccidentallyCorrectLetters(shuffledTiles, boardTiles, random)
  const initialOccupancy = boardTiles.map((tile) => tile.occupyingLetterId)
  const occupancy = [...shuffledTiles.map((letter) => letter.id), ...targetLetters.map((letter) => letter.id)]
  const initialTiles: LetterTile[] = allLetters.map((letter) => ({
    id: letter.id,
    letter: letter.character,
    sourceRow: letter.sourceRow,
    sourceColumn: letter.sourceColumn,
  }))

  return {
    rows: boardRows,
    letters: allLetters,
    boardTiles,
    initialOccupancy,
    occupancy,
    initialTiles,
    tiles: [...shuffledTiles, ...targetLetters].map((letter) => ({
      id: letter.id,
      letter: letter.character,
      sourceRow: letter.sourceRow,
      sourceColumn: letter.sourceColumn,
    })),
    frozenRows: [ROW_COUNT],
  }
}

function arrangeLetters(letters: readonly Letter[], arrangement: string): Letter[] {
  if (arrangement.length !== letters.length) {
    throw new Error(`Initial arrangement must contain exactly ${letters.length} letters`)
  }

  const remaining = [...letters]
  return [...arrangement].map((character) => {
    const index = remaining.findIndex((letter) => letter.character === character)
    if (index < 0) throw new Error(`Initial arrangement contains an unexpected letter: ${character}`)
    return remaining.splice(index, 1)[0]!
  })
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = result[index]
    result[index] = result[swapIndex] as T
    result[swapIndex] = current as T
  }
  return result
}

function removeAccidentallyCorrectLetters(letters: Letter[], boardTiles: readonly Tile[], random: () => number): void {
  const slotCount = letters.length
  const start = Math.max(0, Math.min(slotCount - 1, Math.floor(random() * slotCount)))
  let scanStart = start

  for (let swaps = 0; swaps < 100; swaps += 1) {
    const correctSlot = findNextSlot(slotCount, scanStart, (slotIndex) => (
      letters[slotIndex]?.character === boardTiles[slotIndex]?.originalLetter
    ))
    if (correctSlot === undefined) return

    const correctLetter = letters[correctSlot]
    if (correctLetter === undefined) return
    const swapSlot = findNextSlot(slotCount, (correctSlot + 1) % slotCount, (slotIndex) => {
      if (slotIndex === correctSlot) return false
      const candidate = letters[slotIndex]
      const correctTile = boardTiles[correctSlot]
      const candidateTile = boardTiles[slotIndex]
      return candidate !== undefined && correctTile !== undefined && candidateTile !== undefined
        && candidate.character !== correctTile.originalLetter
        && correctLetter.character !== candidateTile.originalLetter
    })
    if (swapSlot === undefined) return

    const replacement = letters[swapSlot]
    if (replacement === undefined) return
    letters[correctSlot] = replacement
    letters[swapSlot] = correctLetter
    scanStart = (correctSlot + 1) % slotCount
  }
}

function findNextSlot(slotCount: number, start: number, predicate: (slotIndex: number) => boolean): number | undefined {
  for (let offset = 0; offset < slotCount; offset += 1) {
    const slotIndex = (start + offset) % slotCount
    if (predicate(slotIndex)) return slotIndex
  }
  return undefined
}
