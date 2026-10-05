# WERDOL analytics contract

`events.ts` is the canonical list of WERDOL event names and event-specific
fields. Add or change events there before changing a caller.

## Receiver interface

WERDOL sends `POST` requests to the shared analytics receiver's `/api/events`
endpoint. Each request has the form:

```json
{
  "events": [{
    "id": "unique-event-id",
    "projectId": "werdol",
    "source": "werdol",
    "type": "werdol:puzzle_started",
    "time": "2026-10-05T12:00:00.000Z",
    "payload": {}
  }]
}
```

The receiver validates the envelope and preserves the JSON `payload` as-is.
It does not need a database migration for a new optional WERDOL payload field.
A receiver change is appropriate only when a field must be indexed, displayed,
or queried separately.

`tracker.ts` adds `sessionId` to every payload. It may also add `devMode`,
`optedOut`, and, for logged play only, `playerName`. The player-facing
WERDOL-name is therefore stored as `payload.playerName`, not in the receiver's
legacy `session_name` column.

## Privacy

Players choose logged or private play before a puzzle is generated. Logged
play sends the events in the catalogue; a supplied WERDOL-name is included.
Private play sends only `werdol:session_started`, with `optedOut: true`, and
never sends `playerName`.

## Receiver project configuration

The receiver has a `projects` table that controls which browser applications
may write. Before the public WERDOL site can send analytics, its deployed
origin needs an active `werdol` project entry. That is a one-time receiver
configuration step—not something a player or the WERDOL browser code does.
The receiver administrator creates or updates it with its private credential,
including WERDOL's hosted URL in `allowedOrigins`.
