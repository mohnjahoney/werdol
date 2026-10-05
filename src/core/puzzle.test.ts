import { describe, expect, it } from "vitest"
import { createWerdolPuzzle, MAX_LETTER_COPIES, ROW_COUNT } from "./puzzle"
import { createSeededRandom } from "./seededRandom"
import { evaluateGuess } from "./evaluateGuess"

describe("createWerdolPuzzle", () => {
  it("creates four intended guesses with matching evaluations", () => {
    const puzzle = createWerdolPuzzle(() => 0.25)
    expect(puzzle.target).toHaveLength(5)
    expect(puzzle.rows).toHaveLength(ROW_COUNT)
    puzzle.rows.forEach((row) => {
      expect(evaluateGuess(row.intendedGuess, puzzle.target)).toEqual(row.pattern)
    })
  })

  it("gives every row a unique evaluation pattern", () => {
    const puzzle = createWerdolPuzzle(() => 0.25)
    const signatures = puzzle.rows.map((row) => row.pattern.join(""))
    expect(new Set(signatures).size).toBe(ROW_COUNT)
  })

  it("can require every row to share a target letter", () => {
    const puzzle = createWerdolPuzzle(() => 0.25, { requireTargetLetterInEachRow: true })
    puzzle.rows.forEach((row) => {
      expect(row.pattern.some((result) => result !== "absent")).toBe(true)
    })
  })

  it("can require every row to have a green tile", () => {
    const puzzle = createWerdolPuzzle(() => 0.25, { requireGreenTileInEachRow: true })
    puzzle.rows.forEach((row) => {
      expect(row.pattern.some((result) => result === "correct")).toBe(true)
    })
  })

  it("meets minimum total green and yellow tile counts", () => {
    const puzzle = createWerdolPuzzle(() => 0.25, { minGreenTiles: 4, minYellowTiles: 4 })
    const counts = puzzle.rows.flatMap((row) => row.pattern).reduce(
      (totals, result) => {
        if (result === "correct") totals.green += 1
        if (result === "present") totals.yellow += 1
        return totals
      },
      { green: 0, yellow: 0 },
    )
    expect(counts.green).toBeGreaterThanOrEqual(4)
    expect(counts.yellow).toBeGreaterThanOrEqual(4)
  })

  it("can draw rows from the smaller answer-word list", () => {
    const puzzle = createWerdolPuzzle(() => 0.25, { useAnswerWordsForRows: true })
    expect(puzzle.rows).toHaveLength(ROW_COUNT)
  })

  it("never puts more than the capped number of one letter on a board", () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const puzzle = createWerdolPuzzle(createSeededRandom(seed, 1), { minGreenTiles: 4, minYellowTiles: 4, wordListMode: "easy" })
      const counts = new Map<string, number>()
      for (const letter of puzzle.rows.map((row) => row.intendedGuess).join("")) counts.set(letter, (counts.get(letter) ?? 0) + 1)
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(MAX_LETTER_COPIES)
    }
  })
})
