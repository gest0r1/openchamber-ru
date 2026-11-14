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
are imported **by the running shadow service**. A separate offline preparation CLI can
create a private, non-active migration snapshot that retains legacy settings and
receipts without turning on a sender. Root and child events are distinguished using `session.parentId`.
A root `turn-finished` event is **not** treated as a verified terminal idle,
because SDK event delivery is at-most-once and detached-shell, pending-dispatch
and latest-idle equivalence to the incumbent watcher has not been proven.

## Verification

`npm test` runs Node unit, loopback HTTP and offline legacy migration tests. No Bun, external network or Telegram are required.
The package intentionally does not declare `provides: ["notifications"]`;
installing it alongside the old Telegram watcher cannot create a second sender.

## Offline legacy migration preparation (no cutover)

Run **only in an isolated test copy** of the data, not on production. The
migration tool takes explicit, absolute paths for the legacy v1 Telegram
runtime JSON, watch JSON, config JSON and, **when aliases are stored in app
settings instead of the legacy runtime**, a JSON array of configured alias
records (`name`, `chat_id`, `message_thread_id`, `kind`):

```sh
node service/prepare-legacy.js \
  --runtime /absolute/test-copy/runtime.json \
  --watch /absolute/test-copy/watch.json \
  --config /absolute/test-copy/config.json \
  --aliases /absolute/test-copy/aliases.json \
  --data-dir /absolute/private/extension-data
```

The tool rejects malformed v1 states, mismatched subscription/delivery keys,
unresolved destinations, duplicate watch checkpoints and changed input files.
It **does not** discover source paths or alter any input. It atomically
creates `legacy-prepared-v1.json` mode 0600 under the chosen data directory.
The private snapshot includes credentials and chat destinations: **never
commit it, upload it to GitHub or post it in a chat**. The CLI rejects a
private data directory nested under the extension source checkout. Output on success is
only aggregate counts. Repeating with identical data is idempotent; different
data cannot overwrite the prior snapshot. There is no CLI command to activate
the snapshot, and the running SDK service never reads it.

This is preparation, not a live consistent handover. Before any future sender
cutover, stop/quiesce the legacy writer, check unchanged source digests, create
an authoritative ownership fence, prove exact session/child/shell/dispatch
completion and preserve ambiguous delivery outcomes across rollback. The SDK
2.7.1 public `opencode` read-only capability does not expose shell or pending
dispatch status; `turn-finished` alone is not equivalent to the legacy
terminal-idle fence. **No owner switch or Telegram sender has been added.**

## Further work before cutover

Implement explicit opt-in subscriptions, secure credential/settings storage,
validated offline legacy v1 state preparation; live alias/subscription/checkpoint/delivery adoption and precise ownership switch,
durable catch-up for dropped SDK events, independent completion fence, unknown
outcome preservation, user-controlled retry, cross-space scope and rollback.
Do **not** remove the old watcher or enable Bot API delivery from this package
until these have been verified in the A/B acceptance matrix.
