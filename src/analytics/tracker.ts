import { createEventEnvelope } from "./protocol"

export const TRACKER_ENDPOINT = "https://analytics-receiver.mohnjahoney.chatgpt.site/api/events"

type AnalyticsDetails = Record<string, unknown>

const sessionId = createAnalyticsId()
// Lets sessions that used the developer tools be filtered out of the data.
const devMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("dev") === "1"
let sessionStarted = false
let puzzleNumber = 0

export function trackSessionStarted(): void {
  if (sessionStarted) return
  sessionStarted = true
  trackWerdolEvent("werdol:session_started", { platform: "web" })
}

export function startPuzzleAnalytics(): { puzzleId: string; puzzleNumber: number } {
  puzzleNumber += 1
  return { puzzleId: createAnalyticsId(), puzzleNumber }
}

export function trackWerdolEvent(event: string, details: AnalyticsDetails = {}): void {
  const envelope = createEventEnvelope({
    projectId: "werdol",
    source: "werdol",
    id: createAnalyticsId(),
    type: event,
    time: new Date().toISOString(),
    payload: { sessionId, ...(devMode ? { devMode: true } : {}), ...details },
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

function createAnalyticsId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
