// Uploads WERDOL's event schema to the analytics receiver, which then rejects
// any WERDOL event that does not fit it. Runs in CI before every deploy, so the
// receiver always knows about an event or field before a player can send it.
// Usage: TRACKER_CURL_PASSWORD=... npm run analytics:publish
import { WERDOL_EVENT_SCHEMA } from "../src/analytics/events.ts"

const endpoint = "https://analytics-receiver.mohnjahoney.chatgpt.site/api/projects/schema"
const projectId = "werdol"
const password = process.env.TRACKER_CURL_PASSWORD

if (!password) throw new Error("Set TRACKER_CURL_PASSWORD before publishing the analytics schema.")

const authorization = { Authorization: `Bearer ${password}` }
const published = await fetch(endpoint, {
  method: "POST",
  headers: { ...authorization, "Content-Type": "application/json" },
  body: JSON.stringify({ projectId, schema: WERDOL_EVENT_SCHEMA }),
})
if (!published.ok) throw new Error(`Publishing the analytics schema failed (${published.status}): ${await published.text()}`)

// Read it back, so a deploy only continues when the receiver holds exactly this schema.
const stored = await fetch(`${endpoint}?projectId=${projectId}`, { headers: authorization })
if (!stored.ok) throw new Error(`Reading back the analytics schema failed (${stored.status}): ${await stored.text()}`)
const { schema } = await stored.json() as { schema: unknown }
if (canonical(schema) !== canonical(WERDOL_EVENT_SCHEMA)) throw new Error("The receiver's stored schema does not match the one just published.")

console.log(`Published ${Object.keys(WERDOL_EVENT_SCHEMA.events).length} WERDOL event types to the analytics receiver.`)

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  const entries = Object.entries(value as Record<string, unknown>).sort(([first], [second]) => first.localeCompare(second))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`
}
