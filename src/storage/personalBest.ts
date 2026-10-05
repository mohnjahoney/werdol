import type { LetterTile } from "../core/board"
import type { WerdolPuzzle } from "../core/puzzle"

const STORAGE_KEY = "werdol-personal-bests"

// Bests are also kept in memory so replaying still works when storage is unavailable.
const sessionBests = new Map<string, number>()

/** Identifies a puzzle by its content, so a best survives changes to how seeds map to puzzles. */
export function personalBestKey(puzzle: WerdolPuzzle, startingTiles: readonly LetterTile[]): string {
  const rows = puzzle.rows.map((row) => row.intendedGuess).join(",")
  const scramble = startingTiles.slice(0, puzzle.rows.length * 5).map((tile) => tile.letter).join("")
  return `${puzzle.target}|${rows}|${scramble}`
}

export function loadPersonalBest(key: string): number | undefined {
  const stored = readStoredBests()[key]
  const session = sessionBests.get(key)
  if (stored === undefined) return session
  return session === undefined ? stored : Math.min(stored, session)
}

/** Records a solve and returns the best known move count for the puzzle. */
export function savePersonalBest(key: string, moves: number): number {
  const best = Math.min(loadPersonalBest(key) ?? Number.POSITIVE_INFINITY, moves)
  sessionBests.set(key, best)
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ ...readStoredBests(), [key]: best }))
  } catch {
    // The in-memory best still covers this session.
  }
  return best
}

function readStoredBests(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "{}")
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => (
      typeof entry[1] === "number" && Number.isInteger(entry[1]) && entry[1] >= 0
    )))
  } catch {
    return {}
  }
}
