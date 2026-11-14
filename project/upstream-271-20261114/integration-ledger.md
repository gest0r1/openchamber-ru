# OpenChamber v2.7.1 — промежуточная upstream-first интеграция

**Статус: WIP, не протестировано, не предназначено для выпуска или merge в main.**

## Фактические SHA
- Общий предок 2.6.1: `ce853f415704d1bfe8d076a5cfb2caabac00fffd`
- Fork main до интеграции: `1316bfe99a1de02746fefd1a00e556d0aac23b3c`
- Upstream 2.7.1: `f31748c92aaf1ddb8f177e915c1d92a2a418251f`
- Верифицированное промежуточное дерево: `dae79fb64220a74cb6d9a8c712911190d500d390`.

## Политика сборки WIP
- Только upstream изменил: **2181** файлов — применён upstream.
- Только fork изменил: **135** файлов — сохранён fork.
- Оба изменили: **109** файлов — временно сохранён fork-файл целиком; upstream изменения внутри этих файлов **ещё не адаптированы**.
- Остальные **6207** файлов: совпадают с обеими сторонами.
- Файлы, намеренно удалённые в fork, не восстановлены автоматически. Старый механизм Telegram пока остаётся единственным sender.

## Неприкосновенные функции до эквивалентности
Telegram subscription/recovery/delivery ledger; RU i18n и настройки; Markdown full export/per-tool timing; PR-watch; SHA-bound x64-only publishing и installer/rollback; model/credential/variant continuity; owner permissions.

## Пересечение: требуется diff3/ручная семантическая проверка

- [x] `.agents/skills/opencode-v2/SKILL.md` (base `37ba6c337960`, fork `f90cadbcb759`, upstream `99593e0fb30b`)
- [ ] `.github/workflows/build-macos-arm64-dmg.yml` (base `f8a0ed970215`, fork `∅`, upstream `14677cf2001c`)
- [ ] `.github/workflows/mobile-ci.yml` (base `167ac672a303`, fork `∅`, upstream `db1d46b420d9`)
- [ ] `.github/workflows/mobile-release.yml` (base `6ff263738be4`, fork `59cfe362138d`, upstream `b2d1521e2f63`)
- [ ] `.github/workflows/oc-review.yml` (base `99cdd4484e45`, fork `ed6c975a75b3`, upstream `6f8224d956bb`)
- [ ] `.github/workflows/pr-intake.yml` (base `70bd7f0487bf`, fork `∅`, upstream `956fd120a277`)
- [ ] `.github/workflows/pr-review.yml` (base `275d46f0fb2b`, fork `∅`, upstream `4578d6d2d7e7`)
- [ ] `.github/workflows/release-desktop-smoke.yml` (base `21efa0ef9fa3`, fork `∅`, upstream `7fac6390a4ce`)
- [ ] `.github/workflows/release.yml` (base `f1d5ebf374fe`, fork `5154974cd878`, upstream `feae336d3824`)
- [ ] `.github/workflows/sdk-preview.yml` (base `afeb8b9919d5`, fork `∅`, upstream `b16b9f1d3bf5`)
- [ ] `.github/workflows/stale.yml` (base `ac1b4b358bc1`, fork `∅`, upstream `1e82fc068342`)
- [ ] `.github/workflows/vscode-extension.yml` (base `8f51aade1a4d`, fork `∅`, upstream `fb23b34d0177`)
- [ ] `README.md` (base `911f1eb3d2fb`, fork `5ecca4a185d8`, upstream `183c364fa7b8`)
- [x] `package.json` (base `a705fd207702`, fork `5ddaf6bed8ae`, upstream `b21b3ed78704`)
- [x] `packages/electron/package.json` (base `4ee6ca77a2ca`, fork `228ac8c9e0d8`, upstream `425531bb116e`)
- [x] `packages/electron/updater-feed.mjs` (base `2f906fda5d2f`, fork `fd5c3c07fc21`, upstream `4eee6e79ee1f`)
- [x] `packages/electron/updater-feed.test.mjs` (base `fe6c975ac8a5`, fork `00ada6b5dbbe`, upstream `66fa2d772c97`)
- [ ] `packages/ui/src/components/chat/ChatContainer.tsx` (base `cd648023bf29`, fork `659732fa21ce`, upstream `02538157ff65`)
- [ ] `packages/ui/src/components/chat/ChatInput.tsx` (base `81f4ef4644c5`, fork `d50a7dac2e23`, upstream `bc18c7f77c8d`)
- [ ] `packages/ui/src/components/chat/message/parts/DOCUMENTATION.md` (base `2d7fc6501138`, fork `8f09137e98b2`, upstream `d42e33e2ac81`)
- [x] `packages/ui/src/components/chat/message/parts/HtmlRenderFrame.tsx` (base `c9cca4ad2b42`, fork `ad8b8fff5d7d`, upstream `a5d8c9b03fc6`)
- [x] `packages/ui/src/components/chat/message/parts/ToolPart.subagent-row.test.tsx` (base `5e9474e50c07`, fork `486ba6b693e2`, upstream `7ca2f0ec491a`)
- [ ] `packages/ui/src/components/chat/message/parts/ToolPart.tsx` (base `e850fda1ffe4`, fork `5a5e7032d8a8`, upstream `dbbbfe8fba8b`)
- [x] `packages/ui/src/components/chat/message/parts/UiPageFrame.tsx` (base `c6f4f6c21f0e`, fork `19ba370c6994`, upstream `f2081739eabc`)
- [ ] `packages/ui/src/components/chat/work-status/DOCUMENTATION.md` (base `7a25d516a8ab`, fork `f9f54f5ee8b7`, upstream `ab28d2e8ecbc`)
- [ ] `packages/ui/src/components/sections/extensions/ExtensionsPage.tsx` (base `c03c651221b5`, fork `abd59b2cd279`, upstream `f00b93d101bb`)
- [x] `packages/ui/src/components/sections/integrations/CatalogExtensionsSection.tsx` (base `d6bf3215588b`, fork `f573a8ba375c`, upstream `a330fb2ed636`)
- [x] `packages/ui/src/components/sections/openchamber/NotificationSettings.tsx` (base `bf9e8d9a2f19`, fork `b4c300b8e9ce`, upstream `c4451e668269`)
- [ ] `packages/ui/src/components/session/sidebar/sessions/SessionNodeItem.tsx` (base `76e4f798f242`, fork `91301e88ed72`, upstream `24ab9844e3ed`)
- [x] `packages/ui/src/lib/i18n/messages.test.ts` (base `f89bfa57a3e4`, fork `25787893a715`, upstream `e25f752dc538`)
- [x] `packages/ui/src/lib/i18n/messages/ar.settings.ts` (base `11d7b88afc8e`, fork `2d47ff55fbf6`, upstream `4dd480209c73`)
- [x] `packages/ui/src/lib/i18n/messages/ar.ts` (base `31c45fe978de`, fork `20074d0e8f31`, upstream `d248ff1dd795`)
- [x] `packages/ui/src/lib/i18n/messages/de.settings.ts` (base `f2a992b8f2f1`, fork `056f3ccaa4ff`, upstream `cc0aece8c620`)
- [x] `packages/ui/src/lib/i18n/messages/de.ts` (base `6191bd97c8b4`, fork `cd1fb10d1f68`, upstream `364cc7b22cb2`)
- [x] `packages/ui/src/lib/i18n/messages/en.settings.ts` (base `24ecae83e091`, fork `12b72e5f6a65`, upstream `c8a317ee143b`)
- [x] `packages/ui/src/lib/i18n/messages/en.ts` (base `97c22197f0ee`, fork `fadba4e8dc64`, upstream `171a18d91473`)
- [x] `packages/ui/src/lib/i18n/messages/es.settings.ts` (base `d7baa04ac918`, fork `0d5364d7bfa2`, upstream `8bbbdbb56659`)
- [x] `packages/ui/src/lib/i18n/messages/es.ts` (base `40b3a7c15b6d`, fork `818447ef4255`, upstream `7786d9b2616c`)
- [x] `packages/ui/src/lib/i18n/messages/extensions.settings.i18n.test.ts` (base `a2cf20f1d4ac`, fork `eb24ab688b0a`, upstream `169f38ac18f9`)
- [x] `packages/ui/src/lib/i18n/messages/extensions.settings.i18n.ts` (base `b12e1f0bbd12`, fork `cada5fe0fb83`, upstream `5d109df3eded`)
- [x] `packages/ui/src/lib/i18n/messages/file-artifacts.i18n.ts` (base `db07f8d4b8d4`, fork `218a3c8b513b`, upstream `78090d540e2e`)
- [x] `packages/ui/src/lib/i18n/messages/fr.settings.ts` (base `7a55ce25d109`, fork `3e53a133e9ff`, upstream `79148245073f`)
- [x] `packages/ui/src/lib/i18n/messages/fr.ts` (base `f176b2d791f8`, fork `9ce0d8d55294`, upstream `a223344b0576`)
- [x] `packages/ui/src/lib/i18n/messages/he.settings.ts` (base `c7dc8b9473b1`, fork `8251462372a7`, upstream `cae83a9d033a`)
- [x] `packages/ui/src/lib/i18n/messages/he.ts` (base `e9c192d80bd7`, fork `947740620607`, upstream `5089b14b85dc`)
- [x] `packages/ui/src/lib/i18n/messages/html-render.i18n.ts` (base `836b80dd2412`, fork `719a5b9a2664`, upstream `45d698892131`)
- [x] `packages/ui/src/lib/i18n/messages/ja.settings.ts` (base `b2d369144d4a`, fork `3a207e06a809`, upstream `ed2118a9bd93`)
- [x] `packages/ui/src/lib/i18n/messages/ja.ts` (base `84b5e85e802d`, fork `114a8a776220`, upstream `3dcd761ddeea`)
- [x] `packages/ui/src/lib/i18n/messages/ko.settings.ts` (base `d414956e0221`, fork `b6e042d002ac`, upstream `4ba023a8fa25`)
- [x] `packages/ui/src/lib/i18n/messages/ko.ts` (base `e55c01ddb0ed`, fork `c88ea5233601`, upstream `ce40796a5ad0`)
- [x] `packages/ui/src/lib/i18n/messages/mcp-grid.i18n.ts` (base `8a88b3d47a5c`, fork `51d1736f3d11`, upstream `4cef9ee42f01`)
- [x] `packages/ui/src/lib/i18n/messages/nl.settings.ts` (base `a7086a969364`, fork `9abf91a1257a`, upstream `cdc314b035af`)
- [x] `packages/ui/src/lib/i18n/messages/nl.ts` (base `c87d5a8a75ba`, fork `f4750a028bde`, upstream `392977ed2f53`)
- [x] `packages/ui/src/lib/i18n/messages/overview.i18n.ts` (base `0ac18fab288e`, fork `712b17ae94df`, upstream `47c8634ab41a`)
- [x] `packages/ui/src/lib/i18n/messages/pl.settings.ts` (base `101c85beb77d`, fork `e5bd23e9fffc`, upstream `930301f2ead8`)
- [x] `packages/ui/src/lib/i18n/messages/pl.ts` (base `b84a5f496586`, fork `1fde84df64db`, upstream `6c760711a89c`)
- [x] `packages/ui/src/lib/i18n/messages/plugin-panel.i18n.ts` (base `b840a7933b00`, fork `65747af7a2b6`, upstream `fb8c7c2c3328`)
- [x] `packages/ui/src/lib/i18n/messages/plugins-grid.i18n.ts` (base `8b6e6a998f93`, fork `2e122cd5aca2`, upstream `51fc00f97dd2`)
- [x] `packages/ui/src/lib/i18n/messages/project-knowledge.i18n.ts` (base `22f09dee7bcb`, fork `b14fb9287836`, upstream `93c8a232492b`)
- [x] `packages/ui/src/lib/i18n/messages/providers.i18n.ts` (base `8c07f6ded813`, fork `f64d6b9ecb0f`, upstream `bf6a9b35e499`)
- [x] `packages/ui/src/lib/i18n/messages/pt-BR.settings.ts` (base `924a03171791`, fork `66a0cb333266`, upstream `69d2e359dba0`)
- [x] `packages/ui/src/lib/i18n/messages/pt-BR.ts` (base `18efc2f04b27`, fork `34a0da2c141a`, upstream `e977d6517518`)
- [x] `packages/ui/src/lib/i18n/messages/routing.i18n.ts` (base `45158a30fd45`, fork `49b36bf340ae`, upstream `eaa6c7835ced`)
- [x] `packages/ui/src/lib/i18n/messages/session-menu-hints.i18n.ts` (base `8b956e5dd735`, fork `3dab685cc0f0`, upstream `c5b5985e7fc5`)
- [x] `packages/ui/src/lib/i18n/messages/session-notices.i18n.ts` (base `35afdeed7a2e`, fork `1386297a0e7e`, upstream `c872a4c8433b`)
- [x] `packages/ui/src/lib/i18n/messages/session-warming.i18n.ts` (base `a00c4efe8ad8`, fork `07f7b0b380ca`, upstream `6270d1b4d482`)
- [x] `packages/ui/src/lib/i18n/messages/sidebar-work.i18n.ts` (base `b3182a299276`, fork `fc717767e0f8`, upstream `c2269cc036e9`)
- [x] `packages/ui/src/lib/i18n/messages/source-board.i18n.ts` (base `f61a31e84e68`, fork `99885752697a`, upstream `7ccdd0bb85e0`)
- [x] `packages/ui/src/lib/i18n/messages/surface-panel.i18n.ts` (base `daac0f357c0c`, fork `800d33378fab`, upstream `4fc246e349cf`)
- [x] `packages/ui/src/lib/i18n/messages/tr.settings.ts` (base `543701b5b841`, fork `665ed396f252`, upstream `10f3c927c66a`)
- [x] `packages/ui/src/lib/i18n/messages/tr.ts` (base `6af799f25637`, fork `caa058584161`, upstream `93b0695747b8`)
- [x] `packages/ui/src/lib/i18n/messages/uk.settings.ts` (base `1d154647a95f`, fork `a5e1e82a5c95`, upstream `14ce8c0fab01`)
- [x] `packages/ui/src/lib/i18n/messages/uk.ts` (base `8842f1cf7a9d`, fork `ec7484e539a5`, upstream `a208f03533ee`)
- [x] `packages/ui/src/lib/i18n/messages/usage-stats.i18n.ts` (base `8435b09fb84a`, fork `ceee895fcf03`, upstream `a72c20559405`)
- [x] `packages/ui/src/lib/i18n/messages/websearch.i18n.ts` (base `9cff0a178b3f`, fork `aff48e512d6f`, upstream `8c556489c610`)
- [x] `packages/ui/src/lib/i18n/messages/workflows.i18n.ts` (base `f2cd445a6b16`, fork `bfbbc27be6c8`, upstream `4324148c7cb5`)
- [x] `packages/ui/src/lib/i18n/messages/worktree-archive.i18n.ts` (base `0859f89ef067`, fork `a21fabf71d03`, upstream `a59def58f01c`)
- [x] `packages/ui/src/lib/i18n/messages/zh-CN.settings.ts` (base `e4e1cc4671ba`, fork `8a1bd647fd7e`, upstream `a6c3147fe081`)
- [x] `packages/ui/src/lib/i18n/messages/zh-CN.ts` (base `2128c3ff5873`, fork `b2940be7bf37`, upstream `edd0aeef1c5d`)
- [x] `packages/ui/src/lib/i18n/messages/zh-TW.settings.ts` (base `df6136f8ff99`, fork `ca2557000b8b`, upstream `9698ec28a0bd`)
- [x] `packages/ui/src/lib/i18n/messages/zh-TW.ts` (base `62dfcec6f41e`, fork `92701464ff2e`, upstream `4a9da802b6ea`)
- [x] `packages/ui/src/lib/i18n/store.ts` (base `5b9e3670fd08`, fork `4dae7ae35ce3`, upstream `76e1aa97fb71`)
- [x] `packages/ui/src/lib/opencode/model.ts` (base `a3e139615ec5`, fork `b8d8a9827625`, upstream `fc28c5b75480`)
- [x] `packages/ui/src/lib/opencode/projection.test.ts` (base `d832c7705152`, fork `47ffa390233d`, upstream `5691a83588f3`)
- [x] `packages/ui/src/lib/opencode/projection.ts` (base `4d8ec297b011`, fork `5f61030f3e66`, upstream `0ac31848d9d3`)
- [x] `packages/ui/src/lib/renderPageAnswer.ts` (base `3ce7cbf7e6a0`, fork `a4413080f708`, upstream `eea3ac507e2f`)
- [x] `packages/ui/src/lib/settings/search.ts` (base `9953821e01dc`, fork `a9cdafa14982`, upstream `957b34dd91cd`)
- [x] `packages/ui/src/styles/typography.css` (base `c18f200ea0e1`, fork `85da81011148`, upstream `bb69a62721c9`)
- [ ] `packages/ui/src/sync/sync-context.tsx` (base `b52881a2c8d9`, fork `ae599805d0e3`, upstream `d75a03d1b671`)
- [ ] `packages/vscode/CHANGELOG.md` (base `aff6fe7f9cc1`, fork `d7f89fa175f3`, upstream `48b6c8a51f63`)
- [ ] `packages/web/bin/cli.test.js` (base `421c6fbf47de`, fork `920ce93cee5b`, upstream `b5c831f42a03`)
- [ ] `packages/web/bin/lib/DOCUMENTATION.md` (base `71f9cc3162d2`, fork `3954d82bbb4e`, upstream `645848442784`)
- [ ] `packages/web/bin/lib/cli-startup.js` (base `c13f42e65aca`, fork `9775b6debb73`, upstream `af1b51bd38d3`)
- [x] `packages/web/package.json` (base `636c1d91368c`, fork `2061c2b478f9`, upstream `8b2b1a1059e2`)
- [x] `packages/web/server/index.js` (base `d31d7cddd1a9`, fork `7695211dd5f2`, upstream `72f759be2640`)
- [ ] `packages/web/server/lib/agent-tool/DOCUMENTATION.md` (base `569fb28ad17f`, fork `5411966a396b`, upstream `652fe02db6c6`)
- [x] `packages/web/server/lib/agent-tool/runtime.js` (base `561d6ec565da`, fork `2a8df0714f87`, upstream `b30176342543`)
- [x] `packages/web/server/lib/agent-tool/runtime.test.js` (base `b0573e51f693`, fork `f0d646020114`, upstream `6721b408dc58`)
- [ ] `packages/web/server/lib/notifications/DOCUMENTATION.md` (base `c79b12382389`, fork `f1065b831ce0`, upstream `d3576ed3a687`)
- [x] `packages/web/server/lib/openchamber-control/actions.js` (base `3c01cb653404`, fork `2ded16f4a5eb`, upstream `f02eaf510def`)
- [x] `packages/web/server/lib/openchamber-control/render-page.js` (base `c079c7365cb2`, fork `e27b9daa1fc8`, upstream `42d3487ba45d`)
- [x] `packages/web/server/lib/openchamber-control/service.js` (base `254a8d954c0f`, fork `0c3c36940c34`, upstream `522d42420e03`)
- [ ] `packages/web/server/lib/opencode/DOCUMENTATION.md` (base `a2c9adf4cec5`, fork `01b6caaeeda6`, upstream `88e35cda0fd0`)
- [x] `packages/web/server/lib/opencode/session-activity.js` (base `b626dcc8db29`, fork `e935c091afed`, upstream `04ad7339537f`)
- [x] `packages/web/server/lib/opencode/session-activity.test.js` (base `ddf7c4b232e5`, fork `2e105734729f`, upstream `f9a0b000727a`)
- [x] `packages/web/server/lib/opencode/settings-helpers.js` (base `a597b01910b7`, fork `a8d6a10f3de2`, upstream `aa2c78a711a9`)
- [x] `packages/web/server/lib/opencode/shutdown-runtime.js` (base `5c9ce114c6b5`, fork `ae09ebba4feb`, upstream `83a763df9e30`)
- [ ] `packages/web/server/lib/terminal/DOCUMENTATION.md` (base `9e5da32bc801`, fork `b89dbeff04ea`, upstream `807ed1c28c76`)
- [x] `packages/web/server/lib/terminal/runtime.js` (base `6422ebf174e1`, fork `8685eb08405d`, upstream `e35bdabe9866`)

## Незавершённые проверки
- [ ] Разобрать каждый конфликт на уровне строк, а не оставлять fork-версию файла по умолчанию.
- [ ] Согласовать package.json/client/schema/CLI/lockfile с 2.2.7, и удалить лишние fork-обходы после сравнения контрактов.
- [ ] Сохранить bootstrap/runtime readiness, auth, Telegram и release policy.
- [ ] Bun 1.4.4 / Node 24 type-check, lint, tests, build: **NOT RUN**; CI только на принятом SHA, релиз/publish не запускались.
- [ ] Только после PASS и обзора всех конфликтов принимать merge-commit с upstream в истории; этот WIP-коммит одно-родительский и не подменяет подтверждённый merge.

## Подтверждённые решения после начального импорта (2026-11-14)

- **Реконсиляция manifest/CLI pin (3/109 конфликтов):** `package.json` — upstream зависимости/patches, сохранены fork `opencode:pins` и вызов в `type-check`; `packages/web/package.json` — upstream зависимости, сохранён lint server/index.js и увеличена минимальная совместимость до OpenCode 2.2.7; `packages/electron/package.json` — upstream версия/CLI 2.2.7, сохранены publish gest0r1/openchamber-ru и fork NSIS policy. Коммиты `0f6e1ca`, `e63e28a`, `d1b6563`.
- **Static cross-package pins PASS:** root/web/ui/vscode `@opencode/client` и `@opencode/schema` выровнены 2.2.7, Electron CLI 2.2.7, Docker CLI 2.2.7, `bun.lock` 2.2.7; версии всех пяти package.json: 2.7.1. Сопоставлено с правилами `scripts/check-opencode-pins.mjs`; сам скрипт **NOT RUN** (нет isolated checkout / Node 24 / Bun 1.4.4).
- **SDK v2.7.1 contract static review:** `contributes.sessionEvents` включает `turn-finished`, `question-asked`, `permission-asked`; `service.keepRunning` удерживает воркер; `sessionControl.answers` позволяет отвечать на форму/permission после разрешения. `provides: notifications` — штатный host channel, но его семантика **не доказывает** per-root Telegram, дедупликацию после crash/reconnect и учёт detached shells. Запросы service permissions advisory (не OS sandbox). В B требуется сравнение c `telegram-watch.js`, отдельный secure token/migration и shadow без доставок.
- **Оставшиеся пересечения:** 106 файлов (файловая классификация); это не 106 доказанных текстовых конфликтов. Выполнение CI/runtime тестов: **NOT RUN**.

## Закрыт подпакет A2-i18n (2026-11-14)

- **30/30 пересекающихся языковых файлов** `{ar,de,en,es,fr,he,ja,ko,nl,pl,pt-BR,tr,uk,zh-CN,zh-TW}{.ts,.settings.ts}` перенесены на точную структуру upstream 2.7.1, добавления форка интегрированы в проверенную уникальную соседнюю пару строк.
- **Static PASS:** в каждом файле языка ровно одна `common.language.russian`, сохранены upstream release-notes imports; в каждом файле settings 38 **уникальных** `settings.notifications.telegram.*`, сохранены upstream settings keys/imports. Выполнено чтением фактических файлов рабочей ветки после коммитов, без заявлений о typecheck/build.
- Последние коммиты серии `9dfadb1` (labels) и `c065b02` (Telegram settings). Полный audit — сравнение самих blobs и истории рабочей ветки. Функциональные Telegram/locale тесты: **NOT RUN**, включены в финальную матрицу.
- Осталось **76** overlapping file-level изменений; последующие удаления Telegram-строк возможны **только после** эквивалентного SDK cutover.

## Подблок A2-i18n SDK и модель (2026-11-14)

- **24 file-level overlaps resolved by semantic inclusion:** 20 shared i18n modules use the exact v2.7.1 module plus the existing Russian `ru: {...}` section (unique base anchors); `messages.test.ts` and `extensions.settings.i18n.test.ts` are upstream-current tests with RU registration; `store.ts` is upstream RTL-capable locale loader with RU import; `opencode/model.ts` is upstream model plus measured ToolPart timing. All are committed on feature branch.
- Added 5 explicit RU translations for the new v2.7.1 SDK quota capability/settings entries, preserving `{list}` placeholder. An obsolete `settings.page.extensions.description` assertion was removed by adopting upstream test instead of copying it.
- **RU fallback:** Russian `ru.ts` now spreads `enDict` first and overrides it with existing Russian strings, keeping previously untranslated new v2.7.1 keys available. This is a temporary **English fallback**, not complete RU translation; new strings need later localization if required. `ru.settings.ts` remains fork's Russian translations.
- **Static validations:** uniqueness of locale labels/settings from earlier subblock; new quota keys present in RU block; rebase inclusion of RTL and measured timings; upstream tests structurally updated. **Node/Bun/typecheck/test/build: NOT RUN.** Actual translations/screens are not certified until runtime tests.
- Checkpoint last code commit `c6fdfc3`. Marked 24 additional overlap rows. **52 file-level overlaps remain.**

## A2: updater + bounded UI compatibility (2026-11-14)

- **`packages/ui/src/lib/renderPageAnswer.ts` — adapt:** upstream 2.7.1 `declined` request accepted; keep fork directory scope in runtimeFetch, avoiding cross-project misrouting.
- **`packages/ui/src/components/sections/integrations/CatalogExtensionsSection.tsx` — reuse upstream:** fork delta relative to shared base consists solely of a comment rewrite; no production behavioral delta to preserve, obsolete text dropped.
- **`packages/electron/updater-feed.mjs` — adapt with security boundary:** upstream v2.7.1 introduces R2 CDN mirror of upstream's OpenChamber binaries. The fork Stable feed MUST point to `gest0r1/openchamber-ru`. Upstream R2 stable mirror is **not** a compatible source of fork builds. Its exported `STABLE_MIRROR_UPDATER_FEED` is therefore pinned to the fork's GitHub feed, and Canary mirror to the existing Canary GitHub feed; upstream channel/URL validation logic retained.
- **`packages/electron/updater-feed.test.mjs` — adapt tests:** upstream test suite kept, fork owner/repo restored, explicit regression test added for `source: mirror` on Stable channel.
- Code commits include `333f531`, `0f747c1`, `a55a51b`, `16eed0f`. **Static review only.** Node 24/Bun tests and integration smoke: **NOT RUN**.
- **48 overlaps pending.**

## A2-session runtime, native jobs + legacy Telegram (2026-11-14)

- `packages/web/server/index.js`: **rebase on upstream 2.7.1, selectively graft embedded Telegram** (config/approval/source/watch, one-time user confirmation for explicit Markdown/text, route registration, reconnect, event callbacks, tunnel origin, graceful shutdown). A static comparison against fork/main and common ancestor found **103 original fork-only content lines; all 103 preserved**. The old watcher remains the **only active Telegram sender**; SDK extension not installed/enabled, cutover has NOT happened. Upstream new features (session todos, hidden sessions, SDK service lifetime, memory dreaming, extension waits, native notifications) remain in rebased entry point.
- `session-activity.js`: preserve strict descendant depth (unknown after 8), pending form/permission and detached shell guard; add official 2.2.7 job.list path to track background subagent, shell and image jobs with 31-minute timeout. Unknown responses remain fail-closed. `session-activity.test.js`: retain upstream job.list regression and fork strict depth/shell tests, add form/permission cases.
- `shutdown-runtime.js`: retain stop of Telegram watcher, approval and reconnect subscription; adopt upstream session todos, extension waits and service lifetime cleanup.
- Static checks: one Telegram route, one embedded Telegram sender, one watcher start, one watcher event subscription; upstream lifecycle handlers and fork completion guards exist in exact branch blobs. **PASS (static)**; no Node/Bun runtime, endpoint contracts, typecheck, or CI executed: **NOT RUN**. Separate interactions with `openchamber-control/service.js`, `agent-tool/runtime.js`, UI forms and new OpenCode 2.2.7 require full integration tests before certifying this subblock.
- Code commits: `407c594`, `e336b74`, `596e5fd`, `206e538`. **44 unresolved file-level overlaps remain.**

## A2 control/agent-tool runtime + Telegram compatibility (2026-11-14)

- **5 overlap paths resolved statically:** `openchamber-control/actions.js`, `render-page.js`, `service.js`, `agent-tool/runtime.js`, `agent-tool/runtime.test.js`. Rebased on complete upstream v2.7.1, restored only existing fork `notify.telegram_send`, schema parameters and page `isWaiting` contract.
- Preserved upstream `releaseAnswerWaits` cleanup, `secretFields`, `stopSession`, `answerPermission`, `answerForm`, and `dismissOpenForms`. No second automatic Telegram sender introduced. Existing Telegram send still requires callback, actual session+checkout and incumbent confirmation runtime. No changes to persisted delivery keys.
- Extended upstream `openchamber-control/service.test.js` with session/path refusal (400), unavailable channel (503), forwarded payload/explicit approval and page wait lifecycle assertions; updated `agent-tool/runtime.test.js` to expect all eight notify params.
- **Static cross-file assertions: PASS (8/8)** including exact action, handler and service wiring in `server/index.js`. **Node/Bun runtime tests: NOT RUN**, so this is a static-resolution checkpoint, not an acceptance declaration.
- Commits: `cbab33b`, `e48fa0e`, `bd414b7`, `c58ebf5`, `1b5f0e4`, `c80b294`. **39 overlapping paths remain** (five fewer than previous checkpoint).

## A2 small nonoverlap merge — locale, terminal, projection, typography (2026-11-14)

- **5 overlapping paths reconciled via independent base→fork and base→v2.7.1 line hunks.** Every hunk set was checked for overlap before replaying both deltas; no ambiguous hunk. `settings-helpers.js`: preserve `ru` in UI locale enum while taking upstream settings. `terminal/runtime.js`: preserve injected-environment marker while taking upstream terminal behavior. `projection.ts` / `projection.test.ts`: keep persisted/fallback tool timings and test cases alongside upstream model projection; `typography.css`: preserve eight responsive 80rem width rules alongside upstream typography.
- Code commits `62ce886`, `eadd077`, `8f74206`, projection-test commit (see branch history), `dff437d`. **Static hunk nonoverlap PASS; Bun/Node24/type-check/layout tests NOT RUN**. Remaining overlap paths **34**.

## A2 UI page responses, Telegram settings and OpenCode guidance (2026-11-14)

- **6 overlapping paths closed statically:** `.agents/skills/opencode-v2/SKILL.md` carries fork cross-repo pin instruction on upstream 2.7.1; `ToolPart.subagent-row.test.tsx` retains agent color test on upstream subagent rendering; `NotificationSettings.tsx` retains legacy Telegram settings section until B migration; `settings/search.ts` retains one searchable Telegram settings entry.
- `UiPageFrame.tsx` and `HtmlRenderFrame.tsx`: upstream 2.7.1 decline UI, page actions, accessibility and state retained. Existing fork `useSessionDirectory` lookup now applies to both normal page answer and decline / parser-error submission; shared upstream `usePageDecline.ts` accepts optional directory and forwards it through `answerRenderedPage`. Prevents wrong project-directory routing on remote/multi-project OpenCode. No change to Telegram sender or stored settings.
- Commits `f9599b0`, `ac49b22`, `a6dcd70`, `4181024`, `f59c4a6`, `b238481`, `ff1a7ae`. Static 3-way hunk check PASS for 5/6 overlaps, explicit manual adaptation for `UiPageFrame` with upstream decline contract. **Bun/Node24/typecheck/tests/browser: NOT RUN**.
- **28 overlapping paths remain.** Need inspect `sync-context.tsx` hook export and `ToolPart.tsx`/ChatInput lifecycle during remaining A2; full runtime/CI gates remain open.
