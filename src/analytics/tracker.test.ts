import { afterEach, describe, expect, it, vi } from "vitest"
import { WERDOL_EVENTS, type WerdolEventDetails, type WerdolEventType } from "./events"
import { analyticsChoice, isAnalyticsOptedOut, setAnalyticsOptedOut, setPlayerName, TRACKER_ENDPOINT, trackWerdolEvent } from "./tracker"

describe("werdol analytics tracker", () => {
  afterEach(() => {
    setAnalyticsOptedOut(false)
    setPlayerName("")
    vi.unstubAllGlobals()
  })

  it.each([
    [WERDOL_EVENTS.sessionStarted.type, { platform: "web" }],
    [WERDOL_EVENTS.puzzleStarted.type, { puzzleId: "puzzle-1", randomSeed: 123456 }],
    [WERDOL_EVENTS.moveExecuted.type, { puzzleId: "puzzle-1", moveNumber: 1, firstSlot: 0, secondSlot: 1 }],
    [WERDOL_EVENTS.puzzleReset.type, { puzzleId: "puzzle-1", movesTaken: 3 }],
    [WERDOL_EVENTS.outOfMoves.type, { puzzleId: "puzzle-1", movesTaken: 17, minimumMoves: 14 }],
    [WERDOL_EVENTS.puzzleEnded.type, { puzzleId: "puzzle-1", outcome: "solved", movesTaken: 4 }],
  ])("posts %s in the receiver protocol envelope", (event, details) => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response()))
    vi.stubGlobal("fetch", fetchMock)

    trackWerdolEvent(event as WerdolEventType, details as WerdolEventDetails[WerdolEventType])

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]).toBe(TRACKER_ENDPOINT)
    expect(calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    })

    const request = JSON.parse(String(calls[0]?.[1].body))
    expect(request).toEqual({ events: [expect.objectContaining({
      id: expect.any(String),
      projectId: "werdol",
      source: "werdol",
      type: event,
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      payload: { sessionId: expect.any(String), ...details },
    })] })
    expect(request.events[0]).not.toHaveProperty("seed")
    expect(request.events[0].payload).not.toHaveProperty("seed")
  })

  it("sends only the session start while opted out", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response()))
    vi.stubGlobal("fetch", fetchMock)
    setAnalyticsOptedOut(true)

    trackWerdolEvent(WERDOL_EVENTS.puzzleStarted.type, { puzzleId: "puzzle-1", puzzleNumber: 1, puzzleDay: "2026-10-05", dailyIndex: 1, attempt: 1, randomSeed: 123456, wordListMode: "easy", targetWord: "CRANE", minimumMoves: 1, wordsConsidered: 1 })
    trackWerdolEvent(WERDOL_EVENTS.moveExecuted.type, { puzzleId: "puzzle-1", puzzleNumber: 1, puzzleDay: "2026-10-05", dailyIndex: 1, attempt: 1, moveNumber: 1, firstSlot: 0, secondSlot: 1, interactionMode: "swap" })
    trackWerdolEvent(WERDOL_EVENTS.sessionStarted.type, { platform: "web", generatorVersion: 1 })

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls).toHaveLength(1)
    const request = JSON.parse(String(calls[0]?.[1].body))
    expect(request.events[0].type).toBe("werdol:session_started")
    expect(request.events[0].payload).toEqual({ sessionId: expect.any(String), optedOut: true, platform: "web", generatorVersion: 1 })
  })

  it("remembers the opt-out choice and resumes when it is withdrawn", () => {
    const values = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    })
    const fetchMock = vi.fn(() => Promise.resolve(new Response()))
    vi.stubGlobal("fetch", fetchMock)

    setAnalyticsOptedOut(true)
    expect(isAnalyticsOptedOut()).toBe(true)
    expect(values.get("werdol-analytics-opt-out")).toBe("true")

    setAnalyticsOptedOut(false)
    expect(analyticsChoice()).toBe("logged")
    expect(values.get("werdol-analytics-opt-out")).toBe("false")
    trackWerdolEvent(WERDOL_EVENTS.moveExecuted.type, { puzzleId: "puzzle-1", puzzleNumber: 1, puzzleDay: "2026-10-05", dailyIndex: 1, attempt: 1, moveNumber: 1, firstSlot: 0, secondSlot: 1, interactionMode: "swap" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("sends the game-name with logged events but never while playing privately", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response()))
    vi.stubGlobal("fetch", fetchMock)
    const payloads = (): Array<Record<string, unknown>> => (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)
      .map((call) => JSON.parse(String(call[1].body)).events[0].payload)

    setPlayerName("  Ada Lovelace  ")
    trackWerdolEvent(WERDOL_EVENTS.moveExecuted.type, { puzzleId: "puzzle-1", puzzleNumber: 1, puzzleDay: "2026-10-05", dailyIndex: 1, attempt: 1, moveNumber: 1, firstSlot: 0, secondSlot: 1, interactionMode: "swap" })
    expect(payloads()[0]).toMatchObject({ playerName: "Ada Lovelace" })

    setAnalyticsOptedOut(true)
    trackWerdolEvent(WERDOL_EVENTS.sessionStarted.type, { platform: "web", generatorVersion: 1 })
    expect(payloads()[1]).not.toHaveProperty("playerName")
  })
})
