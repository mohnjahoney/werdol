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

The receiver validates the envelope, then checks each event against the
schema WERDOL has published for itself: the event type must be listed, every
required field present with the right type, and no unlisted field included.
Anything else is rejected.

That schema is `WERDOL_EVENT_SCHEMA` in `events.ts`. The deploy workflow
publishes it with `npm run analytics:publish` just before each deploy, so the
receiver learns about a new event or field before any player can send it. To
add or change a field: edit `WerdolEventDetails` and `WERDOL_EVENT_FIELDS`
together (the compiler rejects a mismatch), then push. `npm run
analytics:smoke` sends one of every event to the live receiver to confirm it
accepts them. Both commands need `TRACKER_CURL_PASSWORD`.

Adding a field is always safe. Removing or renaming one loses events from
players who still have the previous version open, until they reload.

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
