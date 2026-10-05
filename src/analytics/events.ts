/**
 * The canonical catalogue of WERDOL analytics events.
 *
 * Add an event here before emitting it elsewhere. Transport metadata such as
 * sessionId, playerName, devMode, and optedOut is added by tracker.ts rather
 * than repeated in every event definition.
 */
export const WERDOL_EVENTS = {
  sessionStarted: {
    type: "werdol:session_started",
    description: "A player has chosen how to play and starts a WERDOL session.",
  },
  puzzleStarted: {
    type: "werdol:puzzle_started",
    description: "A puzzle has been generated and displayed.",
  },
  moveExecuted: {
    type: "werdol:move_executed",
    description: "A player commits a tile swap.",
  },
  puzzleReset: {
    type: "werdol:puzzle_reset",
    description: "A player returns the current puzzle to its initial scramble.",
  },
  outOfMoves: {
    type: "werdol:out_of_moves",
    description: "A player reaches the move limit without solving the puzzle.",
  },
  puzzleEnded: {
    type: "werdol:puzzle_ended",
    description: "A player solves a puzzle.",
  },
} as const

export type WerdolEventType = typeof WERDOL_EVENTS[keyof typeof WERDOL_EVENTS]["type"]

/** Event-specific fields, excluding tracker-supplied metadata. */
export interface WerdolEventDetails {
  [WERDOL_EVENTS.sessionStarted.type]: {
    platform: "web"
  }
  [WERDOL_EVENTS.puzzleStarted.type]: {
    puzzleId: string
    puzzleNumber: number
    randomSeed: number
    wordListMode: "easy" | "hard"
    targetWord: string
    minimumMoves: number
    wordsConsidered: number
  }
  [WERDOL_EVENTS.moveExecuted.type]: {
    puzzleId: string
    puzzleNumber: number
    moveNumber: number
    firstSlot: number
    secondSlot: number
    interactionMode: "swap" | "reveal"
  }
  [WERDOL_EVENTS.puzzleReset.type]: {
    puzzleId: string
    puzzleNumber: number
    movesTaken: number
  }
  [WERDOL_EVENTS.outOfMoves.type]: {
    puzzleId: string
    puzzleNumber: number
    randomSeed: number
    wordListMode: "easy" | "hard"
    movesTaken: number
    minimumMoves: number
    elapsedMs: number
  }
  [WERDOL_EVENTS.puzzleEnded.type]: {
    puzzleId: string
    puzzleNumber: number
    outcome: "solved"
    randomSeed: number
    wordListMode: "easy" | "hard"
    movesTaken: number
    minimumMoves: number
    elapsedMs: number
  }
}
