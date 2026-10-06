import { afterEach, describe, expect, it, vi } from "vitest"
import { DAILY_PUZZLE_COUNT } from "../core/dailyPuzzles"
import { advancePast, loadDailyProgress, recordAttempt, recordSolved, restartDay } from "./dailyProgress"

function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const values = new Map(Object.entries(initial))
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  })
  return values
}

describe("daily progress", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("starts a day at the first puzzle with nothing solved", () => {
    stubStorage()
    expect(loadDailyProgress("2026-01-01")).toEqual({ day: "2026-01-01", position: 0, results: Array(DAILY_PUZZLE_COUNT).fill("unsolved"), attempts: Array(DAILY_PUZZLE_COUNT).fill(0) })
  })

  it("counts attempts, records solves and moves on", () => {
    const values = stubStorage()
    expect(recordAttempt("2026-01-02", 0)).toBe(1)
    expect(recordAttempt("2026-01-02", 0)).toBe(2)
    expect(recordSolved("2026-01-02", 0, "second").position).toBe(1)
    expect(advancePast("2026-01-02", 1).position).toBe(2)
    const stored = JSON.parse(values.get("werdol-daily-progress") ?? "{}")
    expect(stored).toMatchObject({ day: "2026-01-02", position: 2, results: ["second", "unsolved", "unsolved", "unsolved", "unsolved"], attempts: [2, 0, 0, 0, 0] })
  })

  it("finishes the day after the last puzzle and can be replayed without losing solves", () => {
    stubStorage()
    for (let index = 0; index < DAILY_PUZZLE_COUNT; index += 1) recordSolved("2026-01-03", index, "first")
    expect(loadDailyProgress("2026-01-03").position).toBe(DAILY_PUZZLE_COUNT)
    const replay = restartDay("2026-01-03")
    expect(replay.position).toBe(0)
    expect(replay.results.every((result) => result === "first")).toBe(true)
    expect(recordSolved("2026-01-03", 0, "finished").results[0]).toBe("first")
  })

  it("discards progress from another day and ignores corrupt data", () => {
    stubStorage({ "werdol-daily-progress": JSON.stringify({ day: "2026-01-04", position: 3, results: ["first", "second", "finished", "unsolved", "unsolved"], attempts: [1, 1, 1, 0, 0] }) })
    expect(loadDailyProgress("2026-01-04").position).toBe(3)
    expect(loadDailyProgress("2026-01-05").position).toBe(0)
    stubStorage({ "werdol-daily-progress": "{broken" })
    expect(loadDailyProgress("2026-01-06").position).toBe(0)
  })

  it("still advances within a visit when storage is unavailable", () => {
    recordSolved("2026-01-07", 0, "first")
    expect(loadDailyProgress("2026-01-07").position).toBe(1)
  })
})
