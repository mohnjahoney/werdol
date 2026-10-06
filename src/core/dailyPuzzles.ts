import { normalizeSeed } from "./seededRandom"

/** How many puzzles everyone shares each day. */
export const DAILY_PUZZLE_COUNT = 5

/**
 * Bump this whenever a change makes the same seed produce a different puzzle
 * (word lists, generation rules, the random generator). Results are only
 * comparable between players on the same generator version.
 */
export const GENERATOR_VERSION = 1

/** The player's own calendar day, so the list changes at their midnight. */
export function localDayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** The seed of a day's nth puzzle (counting from 0). The same for every player. */
export function dailySeed(dayKey: string, index: number): number {
  const [year, month, day] = dayKey.split("-").map(Number)
  const dayNumber = Math.floor(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000)
  return normalizeSeed(dayNumber * 10 + index)
}
