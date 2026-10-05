import { createEventEnvelope } from "./protocol"
import { WERDOL_EVENTS, type WerdolEventDetails, type WerdolEventType } from "./events"

export const TRACKER_ENDPOINT = "https://analytics-receiver.mohnjahoney.chatgpt.site/api/events"

const OPT_OUT_KEY = "werdol-analytics-opt-out"
const PLAYER_NAME_KEY = "werdol-player-name"
export const MAX_PLAYER_NAME_LENGTH = 20

export type AnalyticsChoice = "undecided" | "logged" | "private"

const sessionId = createAnalyticsId()
// Lets sessions that used the developer tools be filtered out of the data.
const devMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("dev") === "1"
let sessionStarted = false
let choice = readChoice()
let playerName = readPlayerName()
let puzzleNumber = 0

export function trackSessionStarted(): void {
  if (sessionStarted) return
  sessionStarted = true
  trackWerdolEvent(WERDOL_EVENTS.sessionStarted.type, { platform: "web" })
}

/** "undecided" until the player has answered the welcome screen. */
export function analyticsChoice(): AnalyticsChoice {
  return choice
}

export function isAnalyticsOptedOut(): boolean {
  return choice === "private"
}

/** While opted out, only the session start (and so the time play began) is sent. */
export function setAnalyticsOptedOut(value: boolean): void {
  choice = value ? "private" : "logged"
  try {
    globalThis.localStorage?.setItem(OPT_OUT_KEY, String(value))
  } catch {
    // The choice still holds for this visit.
  }
}

export function getPlayerName(): string {
  return playerName
}

export function setPlayerName(name: string): void {
  playerName = name.trim().slice(0, MAX_PLAYER_NAME_LENGTH)
  try {
    if (playerName) globalThis.localStorage?.setItem(PLAYER_NAME_KEY, playerName)
    else globalThis.localStorage?.removeItem(PLAYER_NAME_KEY)
  } catch {
    // The name still holds for this visit.
  }
}

export function startPuzzleAnalytics(): { puzzleId: string; puzzleNumber: number } {
  puzzleNumber += 1
  return { puzzleId: createAnalyticsId(), puzzleNumber }
}

export function trackWerdolEvent<Event extends WerdolEventType>(event: Event, details: WerdolEventDetails[Event]): void {
  const optedOut = choice === "private"
  if (optedOut && event !== WERDOL_EVENTS.sessionStarted.type) return
  const envelope = createEventEnvelope({
    projectId: "werdol",
    source: "werdol",
    id: createAnalyticsId(),
    type: event,
    time: new Date().toISOString(),
    payload: {
      sessionId,
      ...(devMode ? { devMode: true } : {}),
      ...(optedOut ? { optedOut: true } : {}),
      ...(!optedOut && playerName ? { playerName } : {}),
      ...details,
    },
  })

  void fetch(TRACKER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: [envelope] }),
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt or alter gameplay.
  })
}

function readChoice(): AnalyticsChoice {
  try {
    const stored = globalThis.localStorage?.getItem(OPT_OUT_KEY)
    if (stored === "true") return "private"
    return stored === "false" ? "logged" : "undecided"
  } catch {
    return "undecided"
  }
}

function readPlayerName(): string {
  try {
    return (globalThis.localStorage?.getItem(PLAYER_NAME_KEY) ?? "").trim().slice(0, MAX_PLAYER_NAME_LENGTH)
  } catch {
    return ""
  }
}

function createAnalyticsId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
