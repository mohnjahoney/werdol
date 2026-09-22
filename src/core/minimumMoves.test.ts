import { describe, expect, it } from "vitest"
import { countGreedyMoves, countOptimalMoves, findNextSwap } from "./minimumMoves"
import type { WerdolPuzzle } from "./puzzle"
import type { LetterTile } from "./board"

const puzzle: WerdolPuzzle = {
  target: "CRANE",
  rows: [
    { intendedGuess: "SLATE", pattern: ["absent", "absent", "correct", "absent", "correct"] },
  ],
}

function tiles(letters: string): LetterTile[] {
  return [...letters].map((letter, id) => ({ id, letter, sourceRow: 0, sourceColumn: id }))
}

describe("findNextSwap", () => {
  it("finds a swap that fixes two positions", () => {
    const next = findNextSwap(puzzle, tiles("ELATS"))
    expect(next).toEqual({ firstSlot: 0, secondSlot: 4, improvement: 2 })
  })

  it("falls back to fixing the first unfinished position", () => {
    const next = findNextSwap(puzzle, tiles("ALTES"))
    expect(next).toEqual({ firstSlot: 0, secondSlot: 4, improvement: 1 })
  })

  it("returns no move for a solved board", () => {
    expect(findNextSwap(puzzle, tiles("SLATE"))).toBeUndefined()
  })
})

describe("move counters", () => {
  it("counts the exact minimum for a simple swap", () => {
    expect(countOptimalMoves(puzzle, tiles("ELATS"))).toBe(1)
  })

  it("returns zero for an already solved board", () => {
    expect(countOptimalMoves(puzzle, tiles("SLATE"))).toBe(0)
  })

  it("keeps the legacy greedy counter available for diagnostics", () => {
    expect(countGreedyMoves(puzzle, tiles("ELATS"))).toBe(1)
  })
})
