import { createScrambledBoard, type LetterTile } from "../core/board"
import { countCorrectTiles, swapTileState } from "../core/reviewPath"
import { createWerdolPuzzle, type WerdolPuzzle, type PuzzleSetup } from "../core/puzzle"
import { createSeededRandom, normalizeSeed } from "../core/seededRandom"
import { WERDOL_EVENTS, type WerdolEventType } from "./events"
import type { JsonValue } from "./protocol"

export interface HeadlessAnalyticsSink {
  track(type: WerdolEventType, payload: Record<string, JsonValue>): void
}

export interface HeadlessGameOptions {
  randomSeed: number
  setup?: PuzzleSetup
  sessionId?: string
  puzzleId?: string
  analytics?: HeadlessAnalyticsSink
}

export interface HeadlessGameState {
  puzzleId: string
  randomSeed: number
  movesTaken: number
  selectedSlot?: number
  correctTiles: number
  tiles: LetterTile[]
}

export function createHeadlessGame(options: HeadlessGameOptions) {
  const randomSeed = normalizeSeed(options.randomSeed)
  const sessionId = options.sessionId ?? createId()
  const puzzleId = options.puzzleId ?? createId()
  const puzzle = createWerdolPuzzle(createSeededRandom(randomSeed, 1), options.setup)
  const initialTiles = createScrambledBoard(puzzle, createSeededRandom(randomSeed, 2)).tiles.slice(0, puzzle.rows.length * 5)
  let tiles = initialTiles.map((tile) => ({ ...tile }))
  let selectedSlot: number | undefined
  let movesTaken = 0
  let ended = false

  const track = (type: WerdolEventType, payload: Record<string, JsonValue>) => {
    options.analytics?.track(type, { sessionId, puzzleId, randomSeed, ...payload })
  }

  track(WERDOL_EVENTS.puzzleStarted.type, { puzzleNumber: 1, wordListMode: options.setup?.wordListMode ?? "easy", targetWord: puzzle.target })

  const getState = (): HeadlessGameState => ({
    puzzleId,
    randomSeed,
    movesTaken,
    selectedSlot,
    correctTiles: countCorrectTiles(puzzle, tiles),
    tiles: tiles.map((tile) => ({ ...tile })),
  })

  const selectTile = (slotIndex: number): void => {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= tiles.length) throw new Error("Tile index is out of range.")
    if (selectedSlot === undefined) {
      selectedSlot = slotIndex
      return
    }
    if (selectedSlot === slotIndex) {
      selectedSlot = undefined
      return
    }

    const firstSlot = selectedSlot
    tiles = swapTileState(tiles, firstSlot, slotIndex)
    selectedSlot = undefined
    movesTaken += 1
    track(WERDOL_EVENTS.moveExecuted.type, { moveNumber: movesTaken, firstSlot, secondSlot: slotIndex })

    if (!ended && countCorrectTiles(puzzle, tiles) === tiles.length) {
      ended = true
      track(WERDOL_EVENTS.puzzleEnded.type, { outcome: "solved", movesTaken })
    }
  }

  const reset = (): void => {
    tiles = initialTiles.map((tile) => ({ ...tile }))
    selectedSlot = undefined
    movesTaken = 0
    ended = false
    track(WERDOL_EVENTS.puzzleReset.type, { movesTaken: 0 })
  }

  return { getState, selectTile, reset, puzzle: puzzle as WerdolPuzzle, sessionId }
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `headless-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
