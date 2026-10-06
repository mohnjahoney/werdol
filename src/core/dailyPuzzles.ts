import { normalizeSeed } from "./seededRandom"

/** How many puzzles everyone shares each day: one for each letter of the title. */
export const DAILY_PUZZLE_COUNT = 6

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

/** A solve within this many moves of the goal counts as getting the puzzle. */
export const GOT_IT_MARGIN = 3

/**
 * How a day's puzzle turned out, best first:
 * "first" – got it on the first try; "second" – got it on the second try;
 * "finished" – solved it some other way (more tries, or more moves).
 */
export type DailyResult = "unsolved" | "finished" | "second" | "first"

const RESULT_RANK: Record<DailyResult, number> = { unsolved: 0, finished: 1, second: 2, first: 3 }

export function gradeSolve(movesTaken: number, minimumMoves: number, attempt: number): DailyResult {
  const gotIt = movesTaken <= minimumMoves + GOT_IT_MARGIN
  if (gotIt && attempt === 1) return "first"
  if (gotIt && attempt === 2) return "second"
  return "finished"
}

/** A player keeps the best result they have earned on a puzzle. */
export function betterResult(current: DailyResult, next: DailyResult): DailyResult {
  return RESULT_RANK[next] > RESULT_RANK[current] ? next : current
}

