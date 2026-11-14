# Telegram Notifications — SDK service

Standalone SDK host extension. Does **not** receive Telegram updates or commands.
Does **not** store a bot token, chat destination, message text, or credentials.
Uses the existing OpenChamber outbound Bot API transport and durable delivery
ledger exclusively through host-authenticated callbacks.

The service only signals `telegram.deliver` after a new terminal idle is seen
by `sessions.completion`. The host checks terminal activity again, including
running descendant agents, detached shells, unresolved forms/permissions,
Goal mode and pending dispatch, before any Bot API send. Failed/unknown reads
never count as completion. The sender owner switch defaults to legacy and must
remain legacy until parity and cutover tests succeed.

`sessionEvents` are a wake-up hint only (at-most-once); a 60-second sweep
reconciles subscriptions after lost events or restart. No other extension
can use the Telegram host delivery callback. The SDK service does not implement
manual Telegram sending, which remains part of the OpenChamber channel.
Settings → Notifications → Telegram manages subscriptions, including old
sessions and current titles.

**Not yet release-ready:** exclusive sender cutover and rollback, permission,
form and page question catch-up parity, and isolated live host + Telegram
delivery tests need validation. Do not enable SDK owner on production.
