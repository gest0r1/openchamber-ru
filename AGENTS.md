# OpenChamber Agent Guide

## Purpose

OpenChamber provides shared web, desktop, VS Code, hosted-mobile, and native-mobile UI surfaces for OpenCode.

This file contains only always-on repository rules and routing. Detailed workflows belong to project skills and module documentation.

## Instruction Order

These steps are mandatory. Before editing, you **MUST**:

1. Follow this root guide.
2. Load every matching project skill and every task-required reference from
   those skills.
3. Read the nearest `DOCUMENTATION.md` and package `README.md` when present.
4. Follow local code and test precedent.

If these sources materially conflict, stop and resolve the conflict instead of silently choosing one.
Do not start editing when a matching skill or required reference has not been
read. Skill loading is a required part of the task, not optional guidance.

## Runtime Boundaries

- `packages/ui`: shared React UI, state, sync, and runtime contracts.
- `packages/web`: web surfaces, OpenChamber server, managed/external OpenCode lifecycle, and CLI.
- `packages/electron`: native desktop shell and privileged Electron boundary.
- `packages/vscode`: extension host, webview, and runtime bridge.
- `packages/mobile`: Capacitor iOS/Android shell; bundles the mobile web surface and connects to an existing OpenChamber server.
- `packages/docs`: product documentation; not a Bun workspace.

Shared UI calls official OpenCode APIs through `@opencode-ai/sdk/v2`. OpenChamber-owned capabilities use `RuntimeAPIs`, `runtimeFetch`, and shared browser/realtime transport helpers. Server-side upstream integrations may use their owning runtime modules.

Electron starts the OpenChamber backend in-process, never as a sidecar. Development may load loopback/HMR UI; packaged builds load staged assets through `openchamber-ui://` while the loopback server remains the API backend. Keep domain backends in web/runtime modules unless behavior is inherently native.

Shared contracts must define intentional behavior for every applicable runtime: web, desktop, VS Code, hosted mobile, and Capacitor mobile.

## Always-On Constraints

- Do not modify `../opencode`; it is a separate repository.
- Do not run git or GitHub commands unless the user explicitly asks.
- Do not add dependencies unless explicitly requested.
- Never add or log secrets, bearer tokens, pairing credentials, or sensitive user data.
- Keep changes minimal and preserve unrelated worktree changes.
- `CHANGELOG.md` and `packages/vscode/CHANGELOG.md` are the maintainer's release-time work: they get written once, as one story, when the maintainer asks to update the changelog. Until that request, treat both files as read-only — a fix, feature, or merged PR lands without a changelog line.
- Enforce security and correctness in core/runtime logic, not only UI visibility or prompts.
- Keep entrypoints and bridges thin; place domain logic in focused owning modules.
- Update owning documentation when module ownership, contracts, or invariants change.

## Correctness Invariants

- Prefer authoritative state over heuristics.
- Derive live activity from live channels, not persisted history.
- Scope temporary fallbacks narrowly and clear them when authoritative state arrives.
- Never let fetch failure masquerade as authoritative empty success.
- Make partial results, rollback, cleanup, and stale-data behavior explicit.
- One failed entity must not erase or block unrelated complete entities.
- Runtime-specific differences must be intentional and visible in code.

## Communication

You and the maintainer are two people solving a problem together — talk like a trusted colleague, not a report generator. Plain words, short sentences, mechanisms explained through what the user experiences. Warm and direct, never familiar. A reply is something read in minutes, not a separate reading task: put the conclusion first and stand behind it. Answer in the language the maintainer addressed you in; code, comments, and docs stay in English.

When writing or editing user-facing text — docs, UI copy, PR/issue comments, READMEs — load `.agents/skills/communication-style/SKILL.md` and apply its checklist.

## Documentation Discovery

Before changing a module, search for the nearest `DOCUMENTATION.md`; before package-level work, read its `README.md`. Discover docs dynamically under `packages/**/DOCUMENTATION.md` rather than relying on a static exhaustive map.

High-value anchors:

- Sync: `packages/ui/src/sync/DOCUMENTATION.md`
- Stores: `packages/ui/src/stores/DOCUMENTATION.md`
- CLI: `packages/web/bin/lib/DOCUMENTATION.md`
- Performance measurement tooling: `scripts/perf/DOCUMENTATION.md`
- VS Code runtime: `packages/vscode/src/DOCUMENTATION.md`
- Electron: `packages/electron/README.md`
- Mobile: `packages/mobile/README.md`

## Project Skills

Project skills live under `.agents/skills/*/SKILL.md`. You **MUST** load every
skill matching the character of the change before editing; multiple skills may
apply, including companion skills required by another skill. Read every
task-required reference named by those skills. Skills are canonical for their
detailed workflows and checklists. Treating this table as optional advice is a
process violation.


| Trigger | Required skill |
|---|---|
| Source/dependency changes, exports or package contracts, build/generated assets, or module ownership | `openchamber-change-discipline` |
| CLI commands, prompts, terminal output, non-TTY, `--quiet`, or `--json` behavior | `clack-cli-patterns` |
| Shared UI data access, OpenCode SDK or server routes, `RuntimeAPIs`, runtime auth/URLs, bridges, or runtime switching | `ui-api-decoupling` |
| Electron main/preload, IPC, native UI, updater, deep links, SSH/tunnels, packaging, or child processes | `desktop-shell` |
| Session sync, bootstrap/reconnect, reducers, polling, optimistic state, queues, live status, reconciliation, or directory-scoped caches | `sync-state-invariants` |
| Render/store/event hot paths, large lists, caches/indexes, or reported lag, freezes, CPU/memory, startup, or performance regressions | `performance-engineering` |
| WebSocket, SSE, streaming transport, runtime transport internals, or private relay | `relay-transport` |
| UI components, styling, colors, buttons, or icons | `theme-system` |
| User-facing or accessible UI text, labels, aria, toasts, dialogs, or navigation copy | `locale-ui-patterns` |
| Settings UI, settings dialogs, configuration surfaces, or settings search | `settings-ui-patterns` |
| Sortable or drag-to-reorder behavior, especially `@dnd-kit` and touch/wrapping layouts | `drag-to-reorder` |
| iOS Simulator build, launch, preview, gestures, or `serve-sim` control | `serve-sim` |
| The maintainer explicitly asks to update the changelog (main app or VS Code extension) — the only time either CHANGELOG is edited | `changelog-authoring` |
| Creating or editing skills, `AGENTS.md`, or docs reached through agent instructions/context pointers | `writing-for-agents` |
| Reviewing a single pull request or drafting a PR verdict/close/review comment | `pr-review` |
| Triaging, cleaning up, or batch-processing the open PR queue | `triage-prs` |
| Triaging, cleaning up, or batch-processing the issue backlog | `triage-issues` |

Pure code-reading or explanation does not require implementation skills unless needed to interpret a specialized subsystem.

### Skill Ownership

Keep each cross-cutting rule with one canonical owner; companion skills add only domain-specific consequences and a pointer to that owner.

| Concern | Canonical skill |
|---|---|
| Change scope, abstraction discipline, and validation risk | `openchamber-change-discipline` |
| State authority, reconciliation, optimistic state, and lifecycle correctness | `sync-state-invariants` |
| Measurement, hot-path cost, caching performance, and optimization evidence | `performance-engineering` |
| Shared UI API and runtime boundaries | `ui-api-decoupling` |
| WebSocket/SSE and private relay mechanics | `relay-transport` |
| Electron native ownership and privilege boundary | `desktop-shell` |
| UI tokens, primitives, icons, and animation styling | `theme-system` |
| Settings composition and search behavior | `settings-ui-patterns` |
| User-facing text and localization | `locale-ui-patterns` |
| Agent-facing document structure and context pointers | `writing-for-agents` |

Before adding guidance to a skill, identify its canonical owner. If another skill owns the rule, add a precise companion pointer and only the local consequence; do not copy the rule.

## Validation

- Use `package.json` scripts as the command source of truth.
- Prefer focused tests and package-scoped type-check/lint for executable source changes.
- Use workspace-wide checks for cross-workspace contracts, root tooling, dependencies, or shared generated assets.
- Run `bun run dead-code` when source files are added/deleted/renamed or exports, types, entrypoints, or import shape change; inspect its report because it is non-blocking.
- Run `bunx oxlint <changed-paths>` on TypeScript/JavaScript files you created or substantially rewrote. This runs the vendored `anti-slop` plugin, which rejects low-evidence typing: unjustified type assertions, `unknown`/`object`/`Record<string, unknown>` contracts, ad hoc `typeof` narrowing, and module mocking. Fix findings in code you authored. Pre-existing findings elsewhere are a known backlog: do not mass-fix them, and never silence a rule, weaken severity, or launder types to make the check pass.
- Do not assume TypeScript/lint covers server JS, CLI JS, Electron helpers, or native behavior; run focused tests, syntax checks, builds, or runtime validation for the touched surface.
- For docs-only or isolated config changes, run the narrowest relevant validation.
- Report exactly what was and was not validated. Static checks alone do not prove runtime, relay, performance, or platform correctness.

## Pull Request Handoff

Before creating or updating a pull request, read `CONTRIBUTING.md` and
`.github/PULL_REQUEST_TEMPLATE.md`. Complete the template with concrete,
current evidence for the final PR HEAD; do not make the reviewer reconstruct
intent, affected surfaces, applicable guidance, validation, visual behavior,
or failure and rollback considerations from the diff alone.

<!-- ===== Fork-specific sections (openchamber-ru) ===== -->

## Tool timeout policy

- `git rebase` / `git filter-branch` with >20 commits: **timeout 300000ms** (prefer `git reset --hard upstream/main` + `git rm` over filter-branch — tree-filter runs a shell per commit and times out on 80+ commits)
- `bun run build` / `bun run build:web`: **timeout 300000ms** (normal build takes 2–3min)
- Before any git operation, check `.git/index.lock` exists; if so, check for stale git process and kill before proceeding
- `systemctl --user <action> <unit>`: always run `daemon-reload` first if the unit file was changed

## Fork sync & deployment

### Fork update strategy (merge)

Обновление форка из upstream — **merge**, не reset --hard. Подход сохранён в памяти агента (`project.sync/openchamber`):

```bash
# 1. Забрать upstream
git fetch upstream main

# 2. Merge
git merge upstream/main

# 3. Разрешить конфликты: retain fork patches + merge upstream changes
#    - fork URLs (electron) → retain ours (gest0r1/openchamber-ru)
#    - workflows, удалённые форком → keep deleted (нет workflow scope)
#    - новые i18n ключи → enDict fallback или перевод
#    - AGENTS.md → merge both

# 4. Валидация: bun run type-check, bun run lint, i18n parity test, web build (~3 мин)

# 5. Commit merge. Push — только после отдельного подтверждения.
```

**Никогда:** force push, reset --hard, auto-fix на упавших тестах.

**Workflow файлы (situational):** если upstream добавил workflow файлы, которых нет в origin — push упадёт (токен без workflow scope). Решение: `git rm` новых файлов или восстановить версию из origin (`git checkout origin/main -- <file>`). Каждый случай согласовывать.

### systemd service

```bash
# После изменения юнит-файла (например, WorkingDirectory):
systemctl --user daemon-reload       # обязательно!
systemctl --user restart openchamber.service
systemctl --user status openchamber.service  # проверить, нет ли Error: ENOENT
```

Автостарт уже включён (`preset: enabled`), переключать не нужно.

Порт: `4099`, хост: `10.0.10.66`.

### Build

```bash
# Если не хватает зависимостей (cron-parser и т.п.):
~/.bun/bin/bun add <package>

# Сборка web
~/.bun/bin/bun run --cwd packages/web build
# timeout ~300s, нормально 2–3 минуты
```

## Fork configuration diff

Список всех изменений в форке относительно upstream (`upstream/main..origin/main`).

Актуальный sync: **upstream v1.22.0 (merge 2026-09-03)**. После sync форк находится на 20 собственных коммитов впереди upstream tag; дельта проверяется через `git diff v1.22.0..main`/GitHub compare, а не по строке версии пакета.

### Конфигурация

| Файл | Изменение | Причина |
|---|---|---|
| `package.json` | `cron-parser ^5.6.1` | Зависимость scheduled-tasks |
| `bun.lock` | `cron-parser`, `luxon`, `adm-zip` (GHSA-xcpc-8h2w-3j85) | Security-фикс + lockfile |
| `.github/workflows/label-merge-conflict.yml`, `opencode-smoke.yml` | Удалены | Нет `workflow` scope у GitHub-токена |
| `.github/workflows/release-desktop-win.yml` | Добавлен (форк) | Windows x64 release: build web assets, prepare/verify bundled OpenCode CLI, package NSIS, verify packaged CLI, publish release |
| `packages/electron/package.json` | `build.publish` → `gest0r1/openchamber-ru`; NSIS `oneClick: false` + ярлыки | electron-updater на форк; Windows-инсталлер |
| `packages/electron/main.mjs` | URL (CHANGELOG, bug/feature report) → `gest0r1/openchamber-ru` | runtime auto-updater feed на форк |
| `packages/electron/updater-feed.mjs` | `owner: gest0r1`, `repo: openchamber-ru` | PRODUCTION_UPDATER_FEED на форк |

### Русская локаль

- `packages/ui/src/lib/i18n/messages/ru.ts` — полный перевод UI (новые ключи апстрима покрыты `...enDict` fallback)
- `packages/ui/src/lib/i18n/messages/ru.settings.ts` — перевод Settings
- `packages/ui/src/lib/i18n/bootstrap.ts` — русские bootstrap-сообщения
- `packages/ui/src/lib/i18n/runtime.ts` — добавлен `ru` в `Locale`, `LOCALES`, `LOCALE_LABEL_KEYS`, `normalizeLocale`
- `packages/ui/src/lib/i18n/intl.ts` — `ru`→`ru-RU`
- `packages/ui/src/lib/i18n/store.ts` — динамический import русского словаря
- `packages/ui/src/lib/i18n/messages/en.ts` и остальные upstream-словари — добавлен `common.language.russian` для выбора русского языка

### OpenCode agent/runtime fixes

| Файл | Изменение |
|---|---|
| `packages/web/server/lib/opencode/agents.js`, `shared.js` | Fork-specific reconciliation/agent runtime fixes retained after upstream v1.22.0 sync |
| `packages/ui/src/stores/useAgentsStore.ts`, `messageQueueStore.test.ts` | UI/store compatibility for fork agent behavior |

### PWA/Mobile

| Файл | Изменение |
|---|---|
| `MobileApp.tsx` | Добавлены скрытые страницы Settings: `snippets`, `projects`, `remote-instances`, `agents`, `commands`, `plugins`, `skills.installed`, `skills.catalog`, `tunnel` |

### Документация

| Файл | Изменение |
|---|---|
| `AGENTS.md` | Tool timeout policy, fork sync & deployment guide, systemd service, build notes, fork configuration diff |

## Documentation rules

1. **После каждого изменения в fork — вносить изменения в документацию.** Обновить AGENTS.md или профильный .md файл.
2. **Перед каждым изменением — проверять непротиворечивость.** Прочитать существующую документацию, проверить, не противоречит ли новое изменение существующим записям.
3. **Документация должна отражать текущее состояние форка.** Все конфигурационные отличия от upstream должны быть описаны.
