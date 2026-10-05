import { describe, expect, it } from "vitest"
import { createSeededRandom, nextPuzzleSeed, seedFromCurrentTime } from "./seededRandom"

describe("seeded random", () => {
  it("repeats a stream for the same seed and stream", () => {
    const first = createSeededRandom(1234, 1)
    const second = createSeededRandom(1234, 1)
    expect([first(), first(), first()]).toEqual([second(), second(), second()])
  })

  it("keeps the word and letter streams independent", () => {
    const words = createSeededRandom(1234, 1)
    const letters = createSeededRandom(1234, 2)
    expect(words()).not.toBe(letters())
  })

  it("derives a six-digit seed from the clock", () => {
    expect(seedFromCurrentTime(new Date(2026, 0, 1, 8, 37, 42))).toBe(83742)
  })

  it("advances puzzle seeds by one and wraps at the seed limit", () => {
    expect(nextPuzzleSeed(10)).toBe(11)
    expect(nextPuzzleSeed(999_999)).toBe(0)
  })

  it("gives neighbouring seeds unrelated first values", () => {
    const firstValues = Array.from({ length: 100 }, (_value, seed) => createSeededRandom(seed, 1)())
    const steps = firstValues.slice(1).map((value, index) => Math.abs(value - firstValues[index]!))
    expect(steps.filter((step) => step < 0.01).length).toBeLessThan(10)
  })
})
