import { afterEach, describe, expect, it, vi } from "vitest"
import { loadPersonalBest, personalBestKey, savePersonalBest } from "./personalBest"
import type { WerdolPuzzle } from "../core/puzzle"

const puzzle: WerdolPuzzle = {
  target: "CRANE",
  rows: [{ intendedGuess: "SLATE", pattern: ["absent", "absent", "correct", "absent", "correct"] }],
}
const tiles = [..."ELATS"].map((letter, id) => ({ id, letter }))

function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const values = new Map(Object.entries(initial))
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  })
  return values
}

describe("personal best storage", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("keys a puzzle by its words and starting scramble", () => {
    expect(personalBestKey(puzzle, tiles)).toBe("CRANE|SLATE|ELATS")
  })

  it("keeps the lowest move count across saves", () => {
    const values = stubStorage()
    expect(loadPersonalBest("a")).toBeUndefined()
    expect(savePersonalBest("a", 9)).toBe(9)
    expect(savePersonalBest("a", 12)).toBe(9)
    expect(savePersonalBest("a", 7)).toBe(7)
    expect(JSON.parse(values.get("werdol-personal-bests") ?? "{}")).toEqual({ a: 7 })
  })

  it("reads bests saved by an earlier visit", () => {
    stubStorage({ "werdol-personal-bests": JSON.stringify({ b: 11, broken: "x" }) })
    expect(loadPersonalBest("b")).toBe(11)
    expect(loadPersonalBest("broken")).toBeUndefined()
  })

  it("still remembers a best for the session when storage is unavailable", () => {
    expect(savePersonalBest("c", 8)).toBe(8)
    expect(loadPersonalBest("c")).toBe(8)
  })

  it("ignores corrupt stored data", () => {
    stubStorage({ "werdol-personal-bests": "not json" })
    expect(loadPersonalBest("d")).toBeUndefined()
  })
})
