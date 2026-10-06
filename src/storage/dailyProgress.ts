import { DAILY_PUZZLE_COUNT } from "../core/dailyPuzzles"

const STORAGE_KEY = "werdol-daily-progress"

export interface DailyProgress {
  day: string
  /** The puzzle the player is on, counting from 0. Equal to the puzzle count once the day's set is finished. */
  position: number
  solved: boolean[]
  /** How many times each puzzle has been started today. */
  attempts: number[]
}

// Also kept in memory so the day's list still advances when storage is unavailable.
let sessionProgress: DailyProgress | undefined

function freshProgress(day: string): DailyProgress {
  return { day, position: 0, solved: Array<boolean>(DAILY_PUZZLE_COUNT).fill(false), attempts: Array<number>(DAILY_PUZZLE_COUNT).fill(0) }
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

/** Marks a puzzle solved and moves the player on to the next one. */
export function recordSolved(day: string, index: number): DailyProgress {
  const progress = loadDailyProgress(day)
  progress.solved[index] = true
  progress.position = Math.min(DAILY_PUZZLE_COUNT, index + 1)
  return save(progress)
}

/** Moves the player past a puzzle, solved or not. */
export function advancePast(day: string, index: number): DailyProgress {
  const progress = loadDailyProgress(day)
  progress.position = Math.min(DAILY_PUZZLE_COUNT, index + 1)
  return save(progress)
}

/** Sends the player back to the day's first puzzle, keeping what they solved and their attempt counts. */
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
  return { day: progress.day, position: progress.position, solved: [...progress.solved], attempts: [...progress.attempts] }
}

function isProgress(value: unknown): value is DailyProgress {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<DailyProgress>
  return typeof candidate.day === "string"
    && Number.isInteger(candidate.position) && (candidate.position ?? -1) >= 0 && (candidate.position ?? 0) <= DAILY_PUZZLE_COUNT
    && Array.isArray(candidate.solved) && candidate.solved.length === DAILY_PUZZLE_COUNT && candidate.solved.every((entry) => typeof entry === "boolean")
    && Array.isArray(candidate.attempts) && candidate.attempts.length === DAILY_PUZZLE_COUNT && candidate.attempts.every((entry) => Number.isInteger(entry) && entry >= 0)
}
