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
