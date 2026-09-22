import type { LetterTile } from "./board"
import { TILES_PER_ROW } from "./board"
import type { WerdolPuzzle } from "./puzzle"

export interface ProposedSwap {
  firstSlot: number
  secondSlot: number
  improvement: 1 | 2
}

export interface SolverBenchmark {
  greedyMoves: number
  greedyMilliseconds: number
  optimalMoves: number
  optimalMilliseconds: number
}

function expectedCharacter(puzzle: WerdolPuzzle, slotIndex: number): string | undefined {
  const rowIndex = Math.floor(slotIndex / TILES_PER_ROW)
  const row = puzzle.rows[rowIndex]
  return (rowIndex === puzzle.rows.length ? puzzle.target : row?.intendedGuess)?.[slotIndex % TILES_PER_ROW]
}

export function findNextSwap(puzzle: WerdolPuzzle, tiles: readonly LetterTile[]): ProposedSwap | undefined {
  const totalSlots = (puzzle.rows.length + 1) * TILES_PER_ROW
  const correct = (slotIndex: number): boolean => {
    const tile = tiles[slotIndex]
    return tile !== undefined && tile.letter === expectedCharacter(puzzle, slotIndex)
  }
  const correctCount = (): number => tiles.reduce((count, _tile, slotIndex) => count + (correct(slotIndex) ? 1 : 0), 0)
  const currentCorrect = correctCount()

  for (let firstSlot = 0; firstSlot < totalSlots; firstSlot += 1) {
    if (correct(firstSlot)) continue
    for (let secondSlot = firstSlot + 1; secondSlot < totalSlots; secondSlot += 1) {
      if (correct(secondSlot)) continue
      const firstTile = tiles[firstSlot]
      const secondTile = tiles[secondSlot]
      if (firstTile === undefined || secondTile === undefined) continue

      const afterSwap = [...tiles]
      afterSwap[firstSlot] = secondTile
      afterSwap[secondSlot] = firstTile
      const improvement = afterSwap.reduce((count, _tile, slotIndex) => {
        const tile = afterSwap[slotIndex]
        return count + (tile !== undefined && tile.letter === expectedCharacter(puzzle, slotIndex) ? 1 : 0)
      }, 0) - currentCorrect
      if (improvement === 2) return { firstSlot, secondSlot, improvement }
    }
  }

  const firstSlot = Array.from({ length: totalSlots }, (_value, slotIndex) => slotIndex).find((slotIndex) => !correct(slotIndex))
  if (firstSlot === undefined) return undefined
  const expectedLetter = expectedCharacter(puzzle, firstSlot)
  if (expectedLetter === undefined) return undefined
  const secondSlot = Array.from({ length: totalSlots }, (_value, slotIndex) => slotIndex).find(
    (slotIndex) => slotIndex !== firstSlot && !correct(slotIndex) && tiles[slotIndex]?.letter === expectedLetter,
  )
  if (secondSlot === undefined) return undefined
  return { firstSlot, secondSlot, improvement: 1 }
}

/**
 * Legacy greedy estimate. Kept as a diagnostic/reference solver; production
 * move goals should use countOptimalMoves instead.
 */
export function countGreedyMoves(puzzle: WerdolPuzzle, startingTiles: readonly LetterTile[]): number {
  const tiles = startingTiles.map((tile) => ({ ...tile }))
  let moves = 0
  while (true) {
    const next = findNextSwap(puzzle, tiles)
    if (next === undefined) return moves
    const firstTile = tiles[next.firstSlot]
    const secondTile = tiles[next.secondSlot]
    if (firstTile === undefined || secondTile === undefined) return moves
    tiles[next.firstSlot] = secondTile
    tiles[next.secondSlot] = firstTile
    moves += 1
  }
}

/** Finds the true minimum for arbitrary swaps while treating equal letters as interchangeable. */
export function countOptimalMoves(puzzle: WerdolPuzzle, startingTiles: readonly LetterTile[]): number {
  const totalSlots = puzzle.rows.length * TILES_PER_ROW
  const expected = Array.from({ length: totalSlots }, (_value, slotIndex) => expectedCharacter(puzzle, slotIndex))
  const current = startingTiles.slice(0, totalSlots)
  const positionsByLetter = new Map<string, number[]>()
  const goalsByLetter = new Map<string, number[]>()

  current.forEach((tile, slotIndex) => {
    const positions = positionsByLetter.get(tile.letter) ?? []
    positions.push(slotIndex)
    positionsByLetter.set(tile.letter, positions)
  })
  expected.forEach((letter, slotIndex) => {
    if (letter === undefined) return
    const goals = goalsByLetter.get(letter) ?? []
    goals.push(slotIndex)
    goalsByLetter.set(letter, goals)
  })

  const mapping = Array<number | undefined>(totalSlots).fill(undefined)
  let bestMoves = totalSlots
  const groups = [...positionsByLetter.entries()]

  const visitGroup = (groupIndex: number): void => {
    if (groupIndex === groups.length) {
      const visited = Array(totalSlots).fill(false)
      let cycles = 0
      for (let slotIndex = 0; slotIndex < totalSlots; slotIndex += 1) {
        if (visited[slotIndex]) continue
        cycles += 1
        let next = slotIndex
        while (!visited[next]) {
          visited[next] = true
          next = mapping[next]!
        }
      }
      bestMoves = Math.min(bestMoves, totalSlots - cycles)
      return
    }

    const [letter, positions] = groups[groupIndex]!
    const goals = [...(goalsByLetter.get(letter) ?? [])]
    const assign = (positionIndex: number): void => {
      if (positionIndex === positions.length) {
        visitGroup(groupIndex + 1)
        return
      }
      for (let goalIndex = 0; goalIndex < goals.length; goalIndex += 1) {
        const goal = goals[goalIndex]
        if (goal === undefined) continue
        goals.splice(goalIndex, 1)
        mapping[positions[positionIndex]!] = goal
        assign(positionIndex + 1)
        goals.splice(goalIndex, 0, goal)
      }
    }
    assign(0)
  }

  visitGroup(0)
  return bestMoves
}

export function benchmarkSolvers(puzzle: WerdolPuzzle, startingTiles: readonly LetterTile[]): SolverBenchmark {
  const greedyStart = performance.now()
  const greedyMoves = countGreedyMoves(puzzle, startingTiles)
  const greedyMilliseconds = performance.now() - greedyStart
  const optimalStart = performance.now()
  const optimalMoves = countOptimalMoves(puzzle, startingTiles)
  const optimalMilliseconds = performance.now() - optimalStart
  return { greedyMoves, greedyMilliseconds, optimalMoves, optimalMilliseconds }
}
