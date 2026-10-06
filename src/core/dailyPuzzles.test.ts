import { describe, expect, it } from "vitest"
import { betterResult, DAILY_PUZZLE_COUNT, dailySeed, gradeSolve, localDayKey } from "./dailyPuzzles"
import { createWerdolPuzzle } from "./puzzle"
import { createSeededRandom } from "./seededRandom"

describe("daily puzzles", () => {
  it("names a day by the player's local calendar date", () => {
    expect(localDayKey(new Date(2026, 9, 5, 23, 59, 59))).toBe("2026-10-05")
    expect(localDayKey(new Date(2026, 9, 6, 0, 0, 0))).toBe("2026-10-06")
    expect(localDayKey(new Date(2027, 0, 3, 12))).toBe("2027-01-03")
  })

  it("gives every puzzle of every nearby day its own seed", () => {
    const seeds = new Set<number>()
    for (let day = 1; day <= 28; day += 1) {
      for (let index = 0; index < DAILY_PUZZLE_COUNT; index += 1) seeds.add(dailySeed(`2026-10-${String(day).padStart(2, "0")}`, index))
    }
    expect(seeds.size).toBe(28 * DAILY_PUZZLE_COUNT)
  })

  it("produces the same puzzle for the same day and position", () => {
    const setup = { minGreenTiles: 4, minYellowTiles: 4, wordListMode: "easy" as const }
    const first = createWerdolPuzzle(createSeededRandom(dailySeed("2026-10-05", 0), 1), setup)
    const again = createWerdolPuzzle(createSeededRandom(dailySeed("2026-10-05", 0), 1), setup)
    const tomorrow = createWerdolPuzzle(createSeededRandom(dailySeed("2026-10-06", 0), 1), setup)
    expect(again).toEqual(first)
    expect(tomorrow.rows.map((row) => row.intendedGuess)).not.toEqual(first.rows.map((row) => row.intendedGuess))
  })

  it("grades a solve by how close it was to the goal and which try it was", () => {
    expect(gradeSolve(13, 13, 1)).toBe("first")
    expect(gradeSolve(16, 13, 1)).toBe("first")
    expect(gradeSolve(17, 13, 1)).toBe("finished")
    expect(gradeSolve(14, 13, 2)).toBe("second")
    expect(gradeSolve(14, 13, 3)).toBe("finished")
    expect(gradeSolve(20, 13, 2)).toBe("finished")
  })

  it("never downgrades a result", () => {
    expect(betterResult("first", "finished")).toBe("first")
    expect(betterResult("finished", "second")).toBe("second")
    expect(betterResult("unsolved", "finished")).toBe("finished")
  })
})
