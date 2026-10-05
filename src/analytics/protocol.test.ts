import { describe, expect, it } from "vitest"
import { WERDOL_EVENTS } from "./events"
import { createEventEnvelope } from "./protocol"

describe("analytics protocol adapter", () => {
  it("creates the receiver-compatible event envelope for any project", () => {
    expect(createEventEnvelope({
      id: "event-1",
      projectId: "werdol",
      source: "werdol",
      type: WERDOL_EVENTS.puzzleStarted.type,
      time: "2026-09-11T12:00:00.000Z",
      payload: { sessionId: "session-1", randomSeed: 123456 },
    })).toEqual({
      id: "event-1",
      projectId: "werdol",
      source: "werdol",
      type: WERDOL_EVENTS.puzzleStarted.type,
      time: "2026-09-11T12:00:00.000Z",
      payload: { sessionId: "session-1", randomSeed: 123456 },
    })
  })
})
