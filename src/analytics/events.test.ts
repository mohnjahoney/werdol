import { describe, expect, it } from "vitest"
import { WERDOL_COMMON_FIELDS, WERDOL_EVENT_SCHEMA, WERDOL_EVENTS, type WerdolCommonFields } from "./events"

describe("werdol event schema", () => {
  it("publishes exactly the events in the catalogue", () => {
    const catalogued = Object.values(WERDOL_EVENTS).map((event) => event.type).sort()
    expect(Object.keys(WERDOL_EVENT_SCHEMA.events).sort()).toEqual(catalogued)
  })

  it("uses only field types the receiver understands", () => {
    const fields = [WERDOL_EVENT_SCHEMA.common, ...Object.values(WERDOL_EVENT_SCHEMA.events)].flatMap((group) => Object.values(group))
    fields.forEach((spec) => expect(spec).toMatch(/^(string|number|boolean)\??$/))
  })

  it("lists every metadata field the tracker may add", () => {
    const everyCommonField: Required<WerdolCommonFields> = { sessionId: "s", devMode: true, optedOut: true, playerName: "Ada" }
    expect(Object.keys(WERDOL_COMMON_FIELDS).sort()).toEqual(Object.keys(everyCommonField).sort())
  })
})
