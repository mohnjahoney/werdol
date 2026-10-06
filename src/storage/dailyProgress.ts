import { betterResult, DAILY_PUZZLE_COUNT, type DailyResult } from "../core/dailyPuzzles"

const STORAGE_KEY = "werdol-daily-progress"

export interface DailyProgress {
  day: string
  /** The puzzle the player is on, counting from 0. Equal to the puzzle count once the day's set is finished. */
  position: number
  /** The best result earned on each puzzle today. */
  results: DailyResult[]
  /** How many times each puzzle has been started today. */
  attempts: number[]
}

// Also kept in memory so the day's list still advances when storage is unavailable.
let sessionProgress: DailyProgress | undefined

function freshProgress(day: string): DailyProgress {
  return { day, position: 0, results: Array<DailyResult>(DAILY_PUZZLE_COUNT).fill("unsolved"), attempts: Array<number>(DAILY_PUZZLE_COUNT).fill(0) }
}

/** Today's progress. Progress from any other day is discarded. */
export function loadDailyProgress(day: string): DailyProgress {
  if (sessionProgress?.day === day) return copy(sessionProgress)
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "null")
    if (isProgress(parsed) && parsed.day === day) return copy(parsed)
  } catch {
    // Unreadable progress is treated as a fresh day.
  }
  return freshProgress(day)
}

/** Counts a start of a puzzle and returns which attempt this is, from 1. */
export function recordAttempt(day: string, index: number): number {
  const progress = loadDailyProgress(day)
  progress.attempts[index] = (progress.attempts[index] ?? 0) + 1
  save(progress)
  return progress.attempts[index]
}

/** Records how a solve went, keeping the player's best result, and moves them on to the next puzzle. */
export function recordSolved(day: string, index: number, result: DailyResult): DailyProgress {
  const progress = loadDailyProgress(day)
  progress.results[index] = betterResult(progress.results[index] ?? "unsolved", result)
  progress.position = Math.min(DAILY_PUZZLE_COUNT, index + 1)
  return save(progress)
}

/** Moves the player past a puzzle, solved or not. */
export function advancePast(day: string, index: number): DailyProgress {
  const progress = loadDailyProgress(day)
  progress.position = Math.min(DAILY_PUZZLE_COUNT, index + 1)
  return save(progress)
}

/** Sends the player back to the day's first puzzle, keeping their results and attempt counts. */
export function restartDay(day: string): DailyProgress {
  const progress = loadDailyProgress(day)
  progress.position = 0
  return save(progress)
}

function save(progress: DailyProgress): DailyProgress {
  sessionProgress = copy(progress)
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // The in-memory copy still covers this visit.
  }
  return copy(progress)
}

function copy(progress: DailyProgress): DailyProgress {
  return { day: progress.day, position: progress.position, results: [...progress.results], attempts: [...progress.attempts] }
}

function isProgress(value: unknown): value is DailyProgress {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<DailyProgress>
  return typeof candidate.day === "string"
    && Number.isInteger(candidate.position) && (candidate.position ?? -1) >= 0 && (candidate.position ?? 0) <= DAILY_PUZZLE_COUNT
    && Array.isArray(candidate.results) && candidate.results.length === DAILY_PUZZLE_COUNT && candidate.results.every((entry) => (["unsolved", "finished", "second", "first"] as unknown[]).includes(entry))
    && Array.isArray(candidate.attempts) && candidate.attempts.length === DAILY_PUZZLE_COUNT && candidate.attempts.every((entry) => Number.isInteger(entry) && entry >= 0)
}
