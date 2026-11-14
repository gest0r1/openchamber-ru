# Telegram shadow — isolated SDK 2.7.1 extension (not a sender)

**Development-only, passive shadow. This package never sends Telegram messages.**
It is a standalone installable extension: the `openchamber` manifest uses only
the public `sessionEvents` and `service.keepRunning` contracts; its Node.js
service does not import private OpenChamber runtime modules.

Install the folder through OpenChamber Extensions only in an isolated test host.
The service is started by OpenChamber with `OPENCHAMBER_SERVICE_PORT`,
`OPENCHAMBER_SERVICE_TOKEN` and `OPENCHAMBER_SERVICE_DATA_DIR`. Approval of the
event subscription is required. The bearer-guarded `GET /health` returns ready;
`GET /status` returns only aggregate counts. Metadata is saved to
`shadow-events-v1.json` in the private service data dir with file mode 0600.
The transcript permission is not requested; event content is never persisted.

The journal is **bounded (last 2048 event identifiers)** and event-idempotent
within this retention window, *not* a substitute for the production Telegram
subscription/delivery ledger. No tokens, aliases, full replies or destinations
are imported. Root and child events are distinguished using `session.parentId`.
A root `turn-finished` event is **not** treated as a verified terminal idle,
because SDK event delivery is at-most-once and detached-shell, pending-dispatch
and latest-idle equivalence to the incumbent watcher has not been proven.

## Verification

`node --test service/state.test.js` (no Bun, network or Telegram needed).
The package intentionally does not declare `provides: ["notifications"]`;
installing it alongside the old Telegram watcher cannot create a second sender.

## Further work before cutover

Implement explicit opt-in subscriptions, secure credential/settings storage,
legacy v1 alias/subscription/checkpoint/delivery import, precise ownership switch,
durable catch-up for dropped SDK events, independent completion fence, unknown
outcome preservation, user-controlled retry, cross-space scope and rollback.
Do **not** remove the old watcher or enable Bot API delivery from this package
until these have been verified in the A/B acceptance matrix.
