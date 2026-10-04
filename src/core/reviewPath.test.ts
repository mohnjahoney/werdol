import { describe, expect, it } from "vitest"
import { createReferencePath } from "./reviewPath"
import type { LetterTile } from "./board"
import type { WerdolPuzzle } from "./puzzle"

const puzzle: WerdolPuzzle = {
  target: "CRANE",
  rows: [{ intendedGuess: "SLATE", pattern: ["absent", "absent", "correct", "absent", "correct"] }],
}

function tiles(letters: string): LetterTile[] {
  return [...letters].map((letter, id) => ({ id, letter }))
}

describe("createReferencePath", () => {
  it("records the initial state and each improving swap", () => {
    const path = createReferencePath(puzzle, tiles("ELATS"))
    expect(path.map((state) => state.deltaCorrect)).toEqual([0, 2])
    expect(path.at(-1)?.tiles.map((tile) => tile.letter).join("")).toBe("SLATE")
  })
})
