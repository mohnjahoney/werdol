// Sends one of every WERDOL event to the live receiver and fails if any is
// rejected. Run it after changing the event catalogue and publishing it.
// The events are marked devMode so they can be filtered out of the data.
// Usage: TRACKER_CURL_PASSWORD=... npm run analytics:smoke
import { WERDOL_EVENTS, type WerdolCommonFields, type WerdolEventDetails } from "../src/analytics/events.ts"
import { createEventEnvelope } from "../src/analytics/protocol.ts"

const endpoint = "https://analytics-receiver.mohnjahoney.chatgpt.site/api/events"
const password = process.env.TRACKER_CURL_PASSWORD

if (!password) throw new Error("Set TRACKER_CURL_PASSWORD before running the live analytics smoke test.")

const puzzle = { puzzleId: `smoke-${crypto.randomUUID()}`, puzzleNumber: 1, puzzleDay: new Date().toISOString().slice(0, 10), dailyIndex: 0, attempt: 1 }
const samples: WerdolEventDetails = {
  [WERDOL_EVENTS.sessionStarted.type]: { platform: "web", generatorVersion: 1 },
  [WERDOL_EVENTS.puzzleStarted.type]: { ...puzzle, randomSeed: 13579, wordListMode: "easy", targetWord: "CRANE", minimumMoves: 13, wordsConsidered: 40 },
  [WERDOL_EVENTS.moveExecuted.type]: { ...puzzle, moveNumber: 1, firstSlot: 0, secondSlot: 1, interactionMode: "swap" },
  [WERDOL_EVENTS.puzzleReset.type]: { ...puzzle, movesTaken: 1 },
  [WERDOL_EVENTS.outOfMoves.type]: { ...puzzle, randomSeed: 13579, wordListMode: "easy", movesTaken: 16, minimumMoves: 13, elapsedMs: 60_000 },
  [WERDOL_EVENTS.puzzleEnded.type]: { ...puzzle, outcome: "solved", randomSeed: 13579, wordListMode: "easy", movesTaken: 14, minimumMoves: 13, elapsedMs: 75_000 },
}
const common: WerdolCommonFields = { sessionId: `smoke-${crypto.randomUUID()}`, devMode: true }

const failures: string[] = []
for (const [type, details] of Object.entries(samples)) {
  const envelope = createEventEnvelope({
    id: crypto.randomUUID(),
    projectId: "werdol",
    source: "werdol",
    type,
    time: new Date().toISOString(),
    payload: { ...common, ...details },
  })
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${password}`, "Content-Type": "application/json" },
    body: JSON.stringify({ events: [envelope] }),
  })
  if (!response.ok) failures.push(`${type} → ${response.status}: ${await response.text()}`)
}

if (failures.length > 0) throw new Error(`Live analytics smoke test failed:\n${failures.join("\n")}`)
console.log(`The receiver accepted all ${Object.keys(samples).length} WERDOL event types.`)
