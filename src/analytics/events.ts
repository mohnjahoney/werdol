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

/**
 * Event-specific fields, excluding tracker-supplied metadata.
 *
 * Puzzle events carry puzzleDay (the player's local date), dailyIndex (the
 * puzzle's place in that day's shared list, from 1; 0 for a puzzle outside the
 * list) and attempt (1 for the first time this player started it that day).
 */
export interface WerdolEventDetails {
  [WERDOL_EVENTS.sessionStarted.type]: {
    platform: "web"
    generatorVersion: number
  }
  [WERDOL_EVENTS.puzzleStarted.type]: {
    puzzleId: string
    puzzleNumber: number
    puzzleDay: string
    dailyIndex: number
    attempt: number
    randomSeed: number
    wordListMode: "easy" | "hard"
    targetWord: string
    minimumMoves: number
    wordsConsidered: number
  }
  [WERDOL_EVENTS.moveExecuted.type]: {
    puzzleId: string
    puzzleNumber: number
    puzzleDay: string
    dailyIndex: number
    attempt: number
    moveNumber: number
    firstSlot: number
    secondSlot: number
    interactionMode: "swap" | "reveal"
  }
  [WERDOL_EVENTS.puzzleReset.type]: {
    puzzleId: string
    puzzleNumber: number
    puzzleDay: string
    dailyIndex: number
    attempt: number
    movesTaken: number
  }
  [WERDOL_EVENTS.outOfMoves.type]: {
    puzzleId: string
    puzzleNumber: number
    puzzleDay: string
    dailyIndex: number
    attempt: number
    randomSeed: number
    wordListMode: "easy" | "hard"
    movesTaken: number
    minimumMoves: number
    elapsedMs: number
  }
  [WERDOL_EVENTS.puzzleEnded.type]: {
    puzzleId: string
    puzzleNumber: number
    puzzleDay: string
    dailyIndex: number
    attempt: number
    outcome: "solved"
    randomSeed: number
    wordListMode: "easy" | "hard"
    movesTaken: number
    minimumMoves: number
    elapsedMs: number
  }
}

type FieldSpecFor<Value> = Value extends string ? "string" : Value extends number ? "number" : "boolean"

/**
 * The same fields as data, in the form the receiver validates against.
 * The compiler rejects this table if it lists a field WerdolEventDetails
 * does not have, omits one it does, or gives one the wrong type.
 */
export const WERDOL_EVENT_FIELDS = {
  [WERDOL_EVENTS.sessionStarted.type]: {
    platform: "string",
    generatorVersion: "number",
  },
  [WERDOL_EVENTS.puzzleStarted.type]: {
    puzzleId: "string",
    puzzleNumber: "number",
    puzzleDay: "string",
    dailyIndex: "number",
    attempt: "number",
    randomSeed: "number",
    wordListMode: "string",
    targetWord: "string",
    minimumMoves: "number",
    wordsConsidered: "number",
  },
  [WERDOL_EVENTS.moveExecuted.type]: {
    puzzleId: "string",
    puzzleNumber: "number",
    puzzleDay: "string",
    dailyIndex: "number",
    attempt: "number",
    moveNumber: "number",
    firstSlot: "number",
    secondSlot: "number",
    interactionMode: "string",
  },
  [WERDOL_EVENTS.puzzleReset.type]: {
    puzzleId: "string",
    puzzleNumber: "number",
    puzzleDay: "string",
    dailyIndex: "number",
    attempt: "number",
    movesTaken: "number",
  },
  [WERDOL_EVENTS.outOfMoves.type]: {
    puzzleId: "string",
    puzzleNumber: "number",
    puzzleDay: "string",
    dailyIndex: "number",
    attempt: "number",
    randomSeed: "number",
    wordListMode: "string",
    movesTaken: "number",
    minimumMoves: "number",
    elapsedMs: "number",
  },
  [WERDOL_EVENTS.puzzleEnded.type]: {
    puzzleId: "string",
    puzzleNumber: "number",
    puzzleDay: "string",
    dailyIndex: "number",
    attempt: "number",
    outcome: "string",
    randomSeed: "number",
    wordListMode: "string",
    movesTaken: "number",
    minimumMoves: "number",
    elapsedMs: "number",
  },
} as const satisfies { [Type in WerdolEventType]: { [Field in keyof WerdolEventDetails[Type]]: FieldSpecFor<WerdolEventDetails[Type][Field]> } }

/** Metadata tracker.ts adds to every payload. A trailing `?` marks a field optional. */
export const WERDOL_COMMON_FIELDS = {
  sessionId: "string",
  devMode: "boolean?",
  optedOut: "boolean?",
  playerName: "string?",
} as const

export interface WerdolCommonFields {
  sessionId: string
  devMode?: boolean
  optedOut?: boolean
  playerName?: string
}

/** The event schema published to the receiver, which rejects anything that does not fit it. */
export const WERDOL_EVENT_SCHEMA = {
  common: WERDOL_COMMON_FIELDS,
  events: WERDOL_EVENT_FIELDS,
} as const
