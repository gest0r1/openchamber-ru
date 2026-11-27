# Independent owner approval

`build/bin/owner-approval.js` serves a fixed HTTPS origin through an administrator-controlled reverse proxy and a systemd-owned Unix socket. The verifier uses its own Linux UID and the broker's verifier socket. Express compares `Host` with the configured origin and compares `Origin` on every POST. WebAuthn requires user verification for enrollment and decisions. The broker owns enrollment tokens, the approved request and the one-time challenge.

The approval view renders the broker's frozen snapshot as text. The separate origin never hosts user extensions or the OpenChamber UI. Its reverse proxy must keep the original host, avoid logging enrollment secrets and route only to the protected Unix listener. The endpoint exposes `/healthz` for readiness.

The main OpenChamber runtime uses only the agent socket to read and claim approved continuations. It checks the original session, workspace and idle state, including requests, child sessions and background jobs. The exact synthetic record returned by OpenCode is required before acknowledging delivery. OpenCode 2.3.2 returns the same record for a repeated stable ID in the same session. A timeout leaves the outbox pending. The wake asks the agent to retry the paused transition, where the normal pipeline rechecks the broker and frozen inputs.
